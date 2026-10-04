use crate::config::{truthy, write_json, WRITE_LOCK};
use serde_json::{json, Map, Value};
use std::collections::hash_map::RandomState;
use std::fs;
use std::hash::{BuildHasher, Hasher};
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

const BUILT_IN: [&str; 11] = [
    "ID", "Date", "Items", "Status", "Tags", "Priority", "PIC", "Remark", "Deadline",
    "CompletionDate", "Pinned",
];

fn to_base36(mut n: u64) -> String {
    const DIGITS: &[u8] = b"0123456789abcdefghijklmnopqrstuvwxyz";
    if n == 0 {
        return "0".into();
    }
    let mut out = Vec::new();
    while n > 0 {
        out.push(DIGITS[(n % 36) as usize]);
        n /= 36;
    }
    out.reverse();
    String::from_utf8(out).unwrap()
}

/// Same shape as the original JS: base36 timestamp + 5 random base36 chars.
pub fn gen_id() -> String {
    let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default();
    let mut h = RandomState::new().build_hasher();
    h.write_u128(now.as_nanos());
    let rand = to_base36(h.finish() % 36u64.pow(5));
    format!("{}{:0>5}", to_base36(now.as_millis() as u64), rand)
}

pub fn random_suffix() -> String {
    let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default();
    let mut h = RandomState::new().build_hasher();
    h.write_u128(now.as_nanos());
    to_base36(h.finish())
}

pub fn today() -> String {
    chrono::Local::now().format("%Y-%m-%d").to_string()
}

/// Builds a new task the same way the original addTask did.
pub fn new_task(task: &Map<String, Value>) -> Map<String, Value> {
    let or = |key: &str, fallback: Value| {
        if truthy(task.get(key)) { task[key].clone() } else { fallback }
    };
    match json!({
        "ID": gen_id(),
        "Date": or("Date", json!(today())),
        "Items": or("Items", json!("")),
        "Status": false,
        "Tags": or("Tags", json!("")),
        "Priority": or("Priority", json!("Normal")),
        "PIC": or("PIC", json!("")),
        "Remark": or("Remark", json!("")),
        "Deadline": or("Deadline", json!("")),
        "CompletionDate": "",
        "Pinned": ""
    }) {
        Value::Object(m) => m,
        _ => unreachable!(),
    }
}

pub struct LocalData {
    path: PathBuf,
}

impl LocalData {
    pub fn new(path: impl Into<PathBuf>) -> Self {
        Self { path: path.into() }
    }

    fn read(&self) -> (Vec<Value>, Vec<Value>) {
        let data = fs::read_to_string(&self.path)
            .ok()
            .and_then(|s| serde_json::from_str::<Value>(&s).ok())
            .unwrap_or(Value::Null);
        let list = |k: &str| data.get(k).and_then(|v| v.as_array()).cloned().unwrap_or_default();
        (list("tasks"), list("archived"))
    }

    fn write(&self, tasks: Vec<Value>, archived: Vec<Value>) -> Result<(), String> {
        write_json(&self.path, &json!({ "tasks": tasks, "archived": archived }))
            .map_err(|e| e.to_string())
    }

    fn index_of(list: &[Value], id: &str) -> Option<usize> {
        list.iter().position(|t| t.get("ID").and_then(|v| v.as_str()) == Some(id))
    }

    pub fn get_tasks(&self) -> Vec<Value> {
        self.read().0
    }

    pub fn get_archived(&self) -> Vec<Value> {
        self.read().1
    }

    pub fn export_all(&self) -> (Vec<Value>, Vec<Value>) {
        self.read()
    }

    pub fn add_task(&self, task: Map<String, Value>) -> Result<Value, String> {
        let _guard = WRITE_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let (mut tasks, archived) = self.read();
        let mut created = new_task(&task);
        // Preserve custom column values
        for (k, v) in task {
            if !BUILT_IN.contains(&k.as_str()) {
                created.insert(k, v);
            }
        }
        let created = Value::Object(created);
        tasks.push(created.clone());
        self.write(tasks, archived)?;
        Ok(created)
    }

    pub fn update_task(&self, task: Value) -> Result<(), String> {
        let _guard = WRITE_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let (mut tasks, archived) = self.read();
        let id = task["ID"].as_str().unwrap_or_default();
        let idx = Self::index_of(&tasks, id).ok_or(format!("Task {id} not found"))?;
        tasks[idx] = task;
        self.write(tasks, archived)
    }

    pub fn complete_task(&self, id: &str) -> Result<(), String> {
        let _guard = WRITE_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let (mut tasks, mut archived) = self.read();
        let idx = Self::index_of(&tasks, id).ok_or(format!("Task {id} not found"))?;
        let mut task = tasks.remove(idx);
        task["Status"] = json!(true);
        task["CompletionDate"] = json!(today());
        archived.push(task);
        self.write(tasks, archived)
    }

    pub fn delete_task(&self, id: &str) -> Result<(), String> {
        let _guard = WRITE_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let (mut tasks, archived) = self.read();
        let idx = Self::index_of(&tasks, id).ok_or(format!("Task {id} not found"))?;
        tasks.remove(idx);
        self.write(tasks, archived)
    }

    pub fn delete_archived(&self, id: &str) -> Result<(), String> {
        let _guard = WRITE_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let (tasks, mut archived) = self.read();
        let idx = Self::index_of(&archived, id).ok_or(format!("Archived task {id} not found"))?;
        archived.remove(idx);
        self.write(tasks, archived)
    }

    pub fn update_archived(&self, task: Value) -> Result<(), String> {
        let _guard = WRITE_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let (tasks, mut archived) = self.read();
        let id = task["ID"].as_str().unwrap_or_default();
        let idx = Self::index_of(&archived, id).ok_or(format!("Archived task {id} not found"))?;
        archived[idx] = task;
        self.write(tasks, archived)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn crud_round_trip() {
        let path = std::env::temp_dir().join(format!("tt-test-{}.json", gen_id()));
        let store = LocalData::new(&path);

        let input = json!({ "Items": "Write report", "Tags": "CR", "Sprint": "12" });
        let created = store.add_task(input.as_object().unwrap().clone()).unwrap();
        let id = created["ID"].as_str().unwrap().to_string();
        assert_eq!(created["Priority"], "Normal");
        assert_eq!(created["Sprint"], "12", "custom column kept");

        let mut edited = created.clone();
        edited["Remark"] = json!("done soon");
        store.update_task(edited).unwrap();
        assert_eq!(store.get_tasks()[0]["Remark"], "done soon");

        store.complete_task(&id).unwrap();
        assert!(store.get_tasks().is_empty());
        let archived = store.get_archived();
        assert_eq!(archived[0]["Status"], true);
        assert_eq!(archived[0]["CompletionDate"], today());

        store.delete_archived(&id).unwrap();
        assert!(store.get_archived().is_empty());
        assert!(store.delete_task(&id).is_err());
        let _ = fs::remove_file(path);
    }
}
