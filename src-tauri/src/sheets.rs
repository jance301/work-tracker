use crate::google::{client, send, service_account_token};
use crate::local_data::{new_task, today};
use serde_json::{json, Map, Value};
use url::Url;

// Sheet names
const SHEET_TASKS: &str = "WorkLog";
const SHEET_ARCHIVED: &str = "Archived";

// Column order: ID | Date | Items | Status | Tags | Priority | PIC | Remark | Deadline | CompletionDate | Pinned | CustomData
const COLS: [&str; 12] = [
    "ID", "Date", "Items", "Status", "Tags", "Priority", "PIC", "Remark", "Deadline",
    "CompletionDate", "Pinned", "CustomData",
];

fn row_to_task(row: &[Value]) -> Value {
    let mut obj = Map::new();
    for (i, col) in COLS.iter().enumerate() {
        let v = row.get(i).filter(|v| !v.is_null()).cloned().unwrap_or(json!(""));
        obj.insert(col.to_string(), v);
    }
    // Parse CustomData JSON and merge user-added column values into the task object
    if let Some(Value::String(s)) = obj.get("CustomData").cloned() {
        if let Ok(Value::Object(extra)) = serde_json::from_str::<Value>(&s) {
            obj.extend(extra);
        }
    }
    obj.shift_remove("CustomData");
    Value::Object(obj)
}

fn task_to_row(task: &Value) -> Vec<Value> {
    // Collect any non-built-in fields into CustomData JSON
    let extra: Map<String, Value> = task
        .as_object()
        .map(|m| m.iter().filter(|(k, _)| !COLS.contains(&k.as_str())).map(|(k, v)| (k.clone(), v.clone())).collect())
        .unwrap_or_default();
    COLS.iter()
        .map(|col| {
            if *col == "CustomData" {
                if extra.is_empty() { json!("") } else { json!(Value::Object(extra.clone()).to_string()) }
            } else {
                task.get(*col).filter(|v| !v.is_null()).cloned().unwrap_or(json!(""))
            }
        })
        .collect()
}

pub struct Sheets {
    id: String,
    token: String,
}

impl Sheets {
    pub async fn new(service_account: &Value, spreadsheet_id: &str) -> Result<Self, String> {
        let token =
            service_account_token(service_account, "https://www.googleapis.com/auth/spreadsheets").await?;
        Ok(Self { id: spreadsheet_id.to_string(), token })
    }

    fn url(&self, id_suffix: &str, segments: &[&str]) -> Url {
        let mut u = Url::parse("https://sheets.googleapis.com/v4/spreadsheets").unwrap();
        {
            let mut p = u.path_segments_mut().unwrap();
            p.push(&format!("{}{}", self.id, id_suffix));
            for s in segments {
                p.push(s);
            }
        }
        u
    }

    async fn meta(&self) -> Result<Value, String> {
        send(client().get(self.url("", &[])).bearer_auth(&self.token)).await
    }

    async fn batch_update(&self, requests: Value) -> Result<Value, String> {
        send(client().post(self.url(":batchUpdate", &[])).bearer_auth(&self.token).json(&json!({ "requests": requests }))).await
    }

    async fn get_values(&self, range: &str) -> Result<Vec<Vec<Value>>, String> {
        let body = send(client().get(self.url("", &["values", range])).bearer_auth(&self.token)).await?;
        Ok(serde_json::from_value(body["values"].clone()).unwrap_or_default())
    }

    async fn update_values(&self, range: &str, values: Vec<Vec<Value>>) -> Result<(), String> {
        send(client()
            .put(self.url("", &["values", range]))
            .query(&[("valueInputOption", "RAW")])
            .bearer_auth(&self.token)
            .json(&json!({ "values": values })))
        .await
        .map(|_| ())
    }

    async fn append_values(&self, range: &str, values: Vec<Vec<Value>>) -> Result<(), String> {
        send(client()
            .post(self.url("", &["values", &format!("{range}:append")]))
            .query(&[("valueInputOption", "RAW"), ("insertDataOption", "INSERT_ROWS")])
            .bearer_auth(&self.token)
            .json(&json!({ "values": values })))
        .await
        .map(|_| ())
    }

    fn sheet_titles(meta: &Value) -> Vec<String> {
        meta["sheets"].as_array().map(|a| {
            a.iter().filter_map(|s| s["properties"]["title"].as_str().map(String::from)).collect()
        }).unwrap_or_default()
    }

    pub async fn ensure_sheets(&self) -> Result<(), String> {
        let meta = self.meta().await?;
        let existing = Self::sheet_titles(&meta);
        let to_create: Vec<&str> =
            [SHEET_TASKS, SHEET_ARCHIVED].into_iter().filter(|n| !existing.iter().any(|e| e == n)).collect();

        if !to_create.is_empty() {
            let requests: Vec<Value> =
                to_create.iter().map(|title| json!({ "addSheet": { "properties": { "title": title } } })).collect();
            self.batch_update(json!(requests)).await?;
        }

        // Ensure headers
        for sheet_name in [SHEET_TASKS, SHEET_ARCHIVED] {
            let range = format!("{sheet_name}!A1:L1");
            let values = self.get_values(&range).await?;
            let first = values.into_iter().next().unwrap_or_default();
            if first.first().and_then(|v| v.as_str()) != Some("ID") {
                // New sheet — write full header row
                self.update_values(&range, vec![COLS.iter().map(|c| json!(c)).collect()]).await?;
            } else if !first.iter().any(|v| v.as_str() == Some("CustomData")) {
                // Existing sheet missing the CustomData column — append it
                self.update_values(&format!("{sheet_name}!L1"), vec![vec![json!("CustomData")]]).await?;
            }
        }
        Ok(())
    }

    async fn get_rows(&self, sheet_name: &str) -> Result<Vec<Value>, String> {
        let rows = self.get_values(&format!("{sheet_name}!A2:L")).await?;
        Ok(rows
            .iter()
            .map(|r| row_to_task(r))
            .filter(|t| t["ID"].as_str().map_or(true, |s| !s.is_empty()))
            .collect())
    }

    async fn find_row(&self, sheet_name: &str, id: &str) -> Result<Option<usize>, String> {
        let rows = self.get_values(&format!("{sheet_name}!A2:A")).await?;
        // 1-indexed, offset by header row
        Ok(rows.iter().position(|r| r.first().and_then(|v| v.as_str()) == Some(id)).map(|i| i + 2))
    }

    pub async fn get_tasks(&self) -> Result<Vec<Value>, String> {
        self.get_rows(SHEET_TASKS).await
    }

    pub async fn get_archived(&self) -> Result<Vec<Value>, String> {
        self.get_rows(SHEET_ARCHIVED).await
    }

    pub async fn add_task(&self, task: Map<String, Value>) -> Result<Value, String> {
        let created = Value::Object(new_task(&task));
        self.append_values(&format!("{SHEET_TASKS}!A2"), vec![task_to_row(&created)]).await?;
        Ok(created)
    }

    pub async fn update_task(&self, task: Value) -> Result<(), String> {
        self.update_in(SHEET_TASKS, "Task", task).await
    }

    pub async fn update_archived(&self, task: Value) -> Result<(), String> {
        self.update_in(SHEET_ARCHIVED, "Archived task", task).await
    }

    async fn update_in(&self, sheet_name: &str, label: &str, task: Value) -> Result<(), String> {
        let id = task["ID"].as_str().unwrap_or_default();
        let row = self.find_row(sheet_name, id).await?.ok_or(format!("{label} {id} not found"))?;
        self.update_values(&format!("{sheet_name}!A{row}:L{row}"), vec![task_to_row(&task)]).await
    }

    pub async fn complete_task(&self, id: &str) -> Result<(), String> {
        let row = self.find_row(SHEET_TASKS, id).await?.ok_or(format!("Task {id} not found"))?;
        let values = self.get_values(&format!("{SHEET_TASKS}!A{row}:L{row}")).await?;
        let mut task = row_to_task(values.first().map(|r| r.as_slice()).unwrap_or_default());
        task["Status"] = json!(true);
        task["CompletionDate"] = json!(today());

        // Append to Archived
        self.append_values(&format!("{SHEET_ARCHIVED}!A2"), vec![task_to_row(&task)]).await?;
        // Delete from WorkLog
        self.delete_row(SHEET_TASKS, row).await
    }

    pub async fn delete_task(&self, id: &str) -> Result<(), String> {
        let row = self.find_row(SHEET_TASKS, id).await?.ok_or(format!("Task {id} not found"))?;
        self.delete_row(SHEET_TASKS, row).await
    }

    pub async fn delete_archived(&self, id: &str) -> Result<(), String> {
        let row = self.find_row(SHEET_ARCHIVED, id).await?.ok_or(format!("Archived task {id} not found"))?;
        self.delete_row(SHEET_ARCHIVED, row).await
    }

    pub async fn bulk_import(&self, tasks: &[Value], archived: &[Value]) -> Result<(), String> {
        self.ensure_sheets().await?;
        if !tasks.is_empty() {
            self.append_values(&format!("{SHEET_TASKS}!A2"), tasks.iter().map(task_to_row).collect()).await?;
        }
        if !archived.is_empty() {
            self.append_values(&format!("{SHEET_ARCHIVED}!A2"), archived.iter().map(task_to_row).collect()).await?;
        }
        Ok(())
    }

    async fn delete_row(&self, sheet_name: &str, row: usize) -> Result<(), String> {
        let meta = self.meta().await?;
        let sheet_id = meta["sheets"]
            .as_array()
            .and_then(|a| a.iter().find(|s| s["properties"]["title"].as_str() == Some(sheet_name)))
            .map(|s| s["properties"]["sheetId"].clone())
            .ok_or(format!("Sheet {sheet_name} not found"))?;
        self.batch_update(json!([{
            "deleteDimension": {
                "range": { "sheetId": sheet_id, "dimension": "ROWS", "startIndex": row - 1, "endIndex": row }
            }
        }]))
        .await
        .map(|_| ())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn row_round_trip_keeps_custom_columns() {
        let task = json!({ "ID": "abc", "Items": "Task", "Status": false, "Remark": null, "Sprint": "12" });
        let row = task_to_row(&task);
        assert_eq!(row.len(), 12);
        assert_eq!(row[7], "", "null becomes empty");
        assert_eq!(row[11], r#"{"Sprint":"12"}"#);

        let back = row_to_task(&row);
        assert_eq!(back["Sprint"], "12");
        assert!(back.get("CustomData").is_none());
    }
}
