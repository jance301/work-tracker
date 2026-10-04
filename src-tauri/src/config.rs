use serde_json::{json, Map, Value};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

/// Serialises read-modify-write cycles on config and the local data file.
pub static WRITE_LOCK: Mutex<()> = Mutex::new(());

fn default_columns() -> Value {
    json!([
        {
            "id": "tags",
            "name": "Tags",
            "type": "multiselect",
            "items": ["Documentation", "CR", "Deployment", "Meeting", "Bug Fix", "Testing"],
            "colors": {},
            "locked": true
        },
        {
            "id": "priority",
            "name": "Priority",
            "type": "dropdown",
            "items": ["Normal", "Low", "High"],
            "colors": {},
            "locked": false
        },
        {
            "id": "pic",
            "name": "PIC",
            "type": "dropdown",
            "items": ["Jance"],
            "colors": {},
            "locked": false
        }
    ])
}

fn defaults() -> Map<String, Value> {
    match json!({
        "storageMode": "local",
        "dataFilePath": "",
        // Google credentials (migrated from external credentials file)
        "serviceAccount": null,
        "spreadsheetId": "",
        "calendarClientId": "",
        "calendarClientSecret": "",
        "calendarTokens": null,
        "backgrounds": { "default": [], "periods": [] },
        "customColumns": default_columns()
    }) {
        Value::Object(m) => m,
        _ => unreachable!(),
    }
}

/// JavaScript truthiness, used to mirror the original `a || b` fallbacks.
pub fn truthy(v: Option<&Value>) -> bool {
    match v {
        None | Some(Value::Null) => false,
        Some(Value::Bool(b)) => *b,
        Some(Value::String(s)) => !s.is_empty(),
        Some(Value::Number(n)) => n.as_f64().map_or(false, |f| f != 0.0 && !f.is_nan()),
        Some(_) => true,
    }
}

pub fn write_json(path: &PathBuf, value: &Value) -> std::io::Result<()> {
    fs::write(path, serde_json::to_string_pretty(value).unwrap_or_default())
}

pub struct Config {
    pub dir: PathBuf,
    file: PathBuf,
}

impl Config {
    pub fn new(dir: PathBuf) -> Self {
        let _ = fs::create_dir_all(&dir);
        let file = dir.join("config.json");
        if !file.exists() {
            let _ = write_json(&file, &Value::Object(defaults()));
        }
        Self { dir, file }
    }

    pub fn get_all(&self) -> Map<String, Value> {
        let stored = fs::read_to_string(&self.file)
            .ok()
            .and_then(|s| serde_json::from_str::<Value>(&s).ok());
        let Some(Value::Object(mut stored)) = stored else {
            return defaults();
        };

        // Migrate old flat format → customColumns
        if !truthy(stored.get("customColumns")) {
            let pick = |key: &str, fallback: &Value| {
                if truthy(stored.get(key)) { stored[key].clone() } else { fallback.clone() }
            };
            let cols: Vec<Value> = default_columns()
                .as_array()
                .unwrap()
                .iter()
                .map(|col| {
                    let mut col = col.clone();
                    match col["id"].as_str() {
                        Some("tags") => {
                            col["items"] = pick("tags", &col["items"]);
                            col["colors"] = pick("tagColors", &json!({}));
                        }
                        Some("priority") => {
                            col["items"] = pick("priorities", &col["items"]);
                            col["colors"] = pick("priorityColors", &json!({}));
                        }
                        Some("pic") => {
                            col["items"] = pick("pics", &col["items"]);
                        }
                        _ => {}
                    }
                    col
                })
                .collect();
            stored.insert("customColumns".into(), Value::Array(cols));
        }

        let mut out = defaults();
        for (k, v) in stored {
            out.insert(k, v);
        }
        out
    }

    pub fn set_all(&self, data: Map<String, Value>) {
        let _guard = WRITE_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let mut merged = self.get_all();
        for (k, v) in data {
            merged.insert(k, v);
        }
        let _ = write_json(&self.file, &Value::Object(merged));
    }
}
