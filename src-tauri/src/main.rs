#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod calendar;
mod config;
mod google;
mod local_data;
mod oauth_server;
mod sheets;

use config::Config;
use local_data::LocalData;
use serde_json::{json, Map, Value};
use sheets::Sheets;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{Manager, State, WebviewWindow};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind, MessageDialogResult};
use tauri_plugin_opener::OpenerExt;

fn ok(data: Value) -> Value {
    json!({ "ok": true, "data": data })
}

fn wrap<T: Into<Value>>(r: Result<T, String>) -> Value {
    match r {
        Ok(v) => ok(v.into()),
        Err(e) => json!({ "ok": false, "error": e }),
    }
}

fn wrap_unit(r: Result<(), String>) -> Value {
    match r {
        Ok(()) => json!({ "ok": true }),
        Err(e) => json!({ "ok": false, "error": e }),
    }
}

fn str_of<'a>(cfg: &'a Map<String, Value>, key: &str) -> &'a str {
    cfg.get(key).and_then(|v| v.as_str()).unwrap_or_default()
}

fn empty_data_file(path: &Path) -> std::io::Result<()> {
    fs::write(path, serde_json::to_string_pretty(&json!({ "tasks": [], "archived": [] })).unwrap())
}

// ─── Data service (local file or Google Sheets, based on storageMode) ────────

enum DataService {
    Local(LocalData),
    Google(Sheets),
}

async fn sheets_from(cfg: &Map<String, Value>) -> Result<Sheets, String> {
    Sheets::new(cfg.get("serviceAccount").unwrap_or(&Value::Null), str_of(cfg, "spreadsheetId")).await
}

async fn data_service(config: &Config) -> Result<DataService, String> {
    let cfg = config.get_all();
    if str_of(&cfg, "storageMode") == "google" {
        if !config::truthy(cfg.get("serviceAccount")) || str_of(&cfg, "spreadsheetId").is_empty() {
            return Err("Google Sheets not configured. Add your service account and Spreadsheet ID in Settings.".into());
        }
        return Ok(DataService::Google(sheets_from(&cfg).await?));
    }
    let path = str_of(&cfg, "dataFilePath");
    if path.is_empty() {
        return Err("No save file configured. Go to Settings and choose a save file location.".into());
    }
    Ok(DataService::Local(LocalData::new(path)))
}

// ─── Background images ────────────────────────────────────────────────────────

fn bg_dir(config: &Config) -> PathBuf {
    let dir = config.dir.join("backgrounds");
    let _ = fs::create_dir_all(&dir);
    dir
}

fn bg_path(config: &Config, filename: &str) -> Option<String> {
    // Only plain file names inside the backgrounds folder
    if filename.contains(['/', '\\']) || filename.starts_with('.') {
        return None;
    }
    let p = bg_dir(config).join(filename);
    p.is_file().then(|| p.to_string_lossy().into_owned())
}

#[tauri::command]
async fn background_add_images(app: tauri::AppHandle, window: WebviewWindow) -> Vec<String> {
    let config = app.state::<Config>();
    let Some(files) = app
        .dialog()
        .file()
        .set_title("Select Background Images")
        .add_filter("Images", &["jpg", "jpeg", "png", "webp"])
        .set_parent(&window)
        .blocking_pick_files()
    else {
        return vec![];
    };
    let dir = bg_dir(&config);
    files
        .into_iter()
        .filter_map(|f| f.into_path().ok())
        .filter_map(|src| {
            let ext = src.extension().map(|e| format!(".{}", e.to_string_lossy())).unwrap_or_default();
            let filename = format!("{}_{}{}", google::now_millis(), local_data::random_suffix(), ext);
            fs::copy(&src, dir.join(&filename)).ok().map(|_| filename)
        })
        .collect()
}

#[tauri::command]
fn background_remove_image(config: State<Config>, filename: String) -> Value {
    if let Some(p) = bg_path(&config, &filename) {
        let _ = fs::remove_file(p);
    }
    json!({ "ok": true })
}

#[tauri::command]
fn background_get_path(config: State<Config>, filename: String) -> Option<String> {
    bg_path(&config, &filename)
}

#[tauri::command]
fn background_get_paths(config: State<Config>, filenames: Vec<String>) -> Vec<Option<String>> {
    filenames.iter().map(|f| bg_path(&config, f)).collect()
}

// ─── Config ─────────────────────────────────────────────────────────────────

#[tauri::command]
fn config_get(config: State<Config>) -> Value {
    Value::Object(config.get_all())
}

#[tauri::command]
fn config_save(config: State<Config>, data: Map<String, Value>) -> Value {
    config.set_all(data);
    json!({ "ok": true })
}

// ─── Service account import / shell ──────────────────────────────────────────

#[tauri::command]
async fn credentials_pick_service_account(app: tauri::AppHandle, window: WebviewWindow) -> Value {
    let Some(file) = app
        .dialog()
        .file()
        .set_title("Select Google Service Account JSON")
        .add_filter("JSON Files", &["json"])
        .set_parent(&window)
        .blocking_pick_file()
    else {
        return Value::Null;
    };
    let read = file
        .into_path()
        .map_err(|e| e.to_string())
        .and_then(|p| fs::read_to_string(p).map_err(|e| e.to_string()))
        .and_then(|s| serde_json::from_str::<Value>(&s).map_err(|e| e.to_string()));
    match read {
        Ok(data) => json!({ "ok": true, "data": data }),
        Err(e) => json!({ "ok": false, "error": format!("Failed to read file: {e}") }),
    }
}

#[tauri::command]
fn shell_open_url(app: tauri::AppHandle, url: String) {
    if url.starts_with("http://") || url.starts_with("https://") || url.starts_with("obsidian://") {
        let _ = app.opener().open_url(url, None::<&str>);
    }
}

// ─── Native dialogs (WKWebView on macOS has no built-in alert/confirm) ──────────
// Commands that open blocking dialogs are async so they run off the main thread.

#[tauri::command]
async fn dialog_confirm(app: tauri::AppHandle, window: WebviewWindow, message: String) -> bool {
    app.dialog()
        .message(message)
        .kind(MessageDialogKind::Warning)
        .buttons(MessageDialogButtons::OkCancel)
        .parent(&window)
        .blocking_show()
}

#[tauri::command]
fn dialog_alert(app: tauri::AppHandle, window: WebviewWindow, message: String) {
    app.dialog().message(message).parent(&window).show(|_| {});
}

// ─── Storage / data file ─────────────────────────────────────────────────────

#[tauri::command]
async fn storage_pick_data_file(app: tauri::AppHandle, window: WebviewWindow) -> Option<String> {
    let config = app.state::<Config>();
    let path = app
        .dialog()
        .file()
        .set_title("Select Data File")
        .add_filter("JSON Files", &["json"])
        .set_parent(&window)
        .blocking_pick_file()?
        .into_path()
        .ok()?;
    let path = path.to_string_lossy().into_owned();
    config.set_all(Map::from_iter([("dataFilePath".into(), json!(path))]));
    Some(path)
}

#[tauri::command]
async fn storage_create_data_file(app: tauri::AppHandle, window: WebviewWindow) -> Option<String> {
    let config = app.state::<Config>();
    let path = app
        .dialog()
        .file()
        .set_title("Create New Data File")
        .set_file_name("work-tracker-data.json")
        .add_filter("JSON Files", &["json"])
        .set_parent(&window)
        .blocking_save_file()?
        .into_path()
        .ok()?;
    if !path.exists() {
        let _ = empty_data_file(&path);
    }
    let path = path.to_string_lossy().into_owned();
    config.set_all(Map::from_iter([("dataFilePath".into(), json!(path))]));
    Some(path)
}

#[tauri::command]
async fn storage_detect_conflict(config: State<'_, Config>) -> Result<Value, ()> {
    let cfg = config.get_all();

    let path = str_of(&cfg, "dataFilePath");
    let local_has_data = !path.is_empty() && {
        let (tasks, archived) = LocalData::new(path).export_all();
        !tasks.is_empty() || !archived.is_empty()
    };

    let mut google_is_empty = true;
    if let Ok(sheets) = sheets_from(&cfg).await {
        if sheets.ensure_sheets().await.is_ok() {
            if let (Ok(t), Ok(a)) = (sheets.get_tasks().await, sheets.get_archived().await) {
                google_is_empty = t.is_empty() && a.is_empty();
            }
        }
    }

    Ok(json!({ "localHasData": local_has_data, "googleIsEmpty": google_is_empty }))
}

#[tauri::command]
async fn storage_upload_to_google(config: State<'_, Config>) -> Result<Value, ()> {
    let cfg = config.get_all();
    let result = async {
        let (tasks, archived) = LocalData::new(str_of(&cfg, "dataFilePath")).export_all();
        sheets_from(&cfg).await?.bulk_import(&tasks, &archived).await
    }
    .await;
    Ok(wrap_unit(result))
}

#[tauri::command]
async fn storage_conflict_dialog(app: tauri::AppHandle, window: WebviewWindow) -> u8 {
    const UPLOAD: &str = "Upload local data → Google";
    const FRESH: &str = "Start fresh from Google";
    let result = app
        .dialog()
        .message("You have local data but Google Sheets is empty.\n\nWhat would you like to do?")
        .title("Local Data Found")
        .kind(MessageDialogKind::Info)
        .buttons(MessageDialogButtons::YesNoCancelCustom(UPLOAD.into(), FRESH.into(), "Cancel".into()))
        .parent(&window)
        .blocking_show_with_result();
    // 0 = upload, 1 = fresh, 2 = cancel
    match result {
        MessageDialogResult::Yes => 0,
        MessageDialogResult::No => 1,
        MessageDialogResult::Custom(s) if s == UPLOAD => 0,
        MessageDialogResult::Custom(s) if s == FRESH => 1,
        _ => 2,
    }
}

// ─── Data (routes to local or Google based on storageMode) ──────────────────

#[tauri::command]
async fn sheets_init(config: State<'_, Config>) -> Result<Value, ()> {
    let cfg = config.get_all();
    let result = async {
        if str_of(&cfg, "storageMode") == "google" {
            sheets_from(&cfg).await?.ensure_sheets().await
        } else {
            let path = str_of(&cfg, "dataFilePath");
            if path.is_empty() {
                return Err("No save file configured.".to_string());
            }
            // Ensure the file exists
            let path = Path::new(path);
            if !path.exists() {
                empty_data_file(path).map_err(|e| e.to_string())?;
            }
            Ok(())
        }
    }
    .await;
    Ok(wrap_unit(result))
}

#[tauri::command]
async fn sheets_test_connection(config: State<'_, Config>) -> Result<Value, ()> {
    let cfg = config.get_all();
    Ok(wrap_unit(async { sheets_from(&cfg).await?.ensure_sheets().await }.await))
}

#[tauri::command]
async fn sheets_get_tasks(config: State<'_, Config>) -> Result<Value, ()> {
    Ok(wrap(async {
        match data_service(&config).await? {
            DataService::Local(l) => Ok(l.get_tasks()),
            DataService::Google(s) => s.get_tasks().await,
        }
    }.await))
}

#[tauri::command]
async fn sheets_get_archived(config: State<'_, Config>) -> Result<Value, ()> {
    Ok(wrap(async {
        match data_service(&config).await? {
            DataService::Local(l) => Ok(l.get_archived()),
            DataService::Google(s) => s.get_archived().await,
        }
    }.await))
}

#[tauri::command]
async fn sheets_add_task(config: State<'_, Config>, task: Map<String, Value>) -> Result<Value, ()> {
    Ok(wrap(async {
        match data_service(&config).await? {
            DataService::Local(l) => l.add_task(task),
            DataService::Google(s) => s.add_task(task).await,
        }
    }.await))
}

#[tauri::command]
async fn sheets_update_task(config: State<'_, Config>, task: Value) -> Result<Value, ()> {
    Ok(wrap(async {
        match data_service(&config).await? {
            DataService::Local(l) => l.update_task(task),
            DataService::Google(s) => s.update_task(task).await,
        }
        .map(|_| Value::Null)
    }.await))
}

#[tauri::command]
async fn sheets_complete_task(config: State<'_, Config>, id: String) -> Result<Value, ()> {
    Ok(wrap(async {
        match data_service(&config).await? {
            DataService::Local(l) => l.complete_task(&id),
            DataService::Google(s) => s.complete_task(&id).await,
        }
        .map(|_| Value::Null)
    }.await))
}

#[tauri::command]
async fn sheets_delete_task(config: State<'_, Config>, id: String) -> Result<Value, ()> {
    Ok(wrap(async {
        match data_service(&config).await? {
            DataService::Local(l) => l.delete_task(&id),
            DataService::Google(s) => s.delete_task(&id).await,
        }
        .map(|_| Value::Null)
    }.await))
}

#[tauri::command]
async fn sheets_delete_archived(config: State<'_, Config>, id: String) -> Result<Value, ()> {
    Ok(wrap(async {
        match data_service(&config).await? {
            DataService::Local(l) => l.delete_archived(&id),
            DataService::Google(s) => s.delete_archived(&id).await,
        }
        .map(|_| Value::Null)
    }.await))
}

#[tauri::command]
async fn sheets_update_archived(config: State<'_, Config>, task: Value) -> Result<Value, ()> {
    Ok(wrap(async {
        match data_service(&config).await? {
            DataService::Local(l) => l.update_archived(task),
            DataService::Google(s) => s.update_archived(task).await,
        }
        .map(|_| Value::Null)
    }.await))
}

// ─── Calendar ───────────────────────────────────────────────────────────────

async fn calendar_token(config: &Config) -> Result<String, String> {
    let cfg = config.get_all();
    let (id, secret) = (str_of(&cfg, "calendarClientId"), str_of(&cfg, "calendarClientSecret"));
    if id.is_empty() || secret.is_empty() {
        return Err("Google Calendar not configured. Add OAuth credentials in Settings.".into());
    }
    let tokens = cfg.get("calendarTokens").cloned().unwrap_or(Value::Null);
    if !config::truthy(Some(&tokens)) {
        return Err("Google Calendar not authorized. Click \"Connect\" in Settings.".into());
    }
    let (token, refreshed) = calendar::access_token(id, secret, &tokens).await?;
    if let Some(fresh) = refreshed {
        let mut merged = tokens.as_object().cloned().unwrap_or_default();
        merged.extend(fresh);
        config.set_all(Map::from_iter([("calendarTokens".into(), Value::Object(merged))]));
    }
    Ok(token)
}

#[tauri::command]
fn calendar_status(config: State<Config>) -> Value {
    let cfg = config.get_all();
    let connected = config::truthy(cfg.get("calendarTokens"))
        && !str_of(&cfg, "calendarClientId").is_empty()
        && !str_of(&cfg, "calendarClientSecret").is_empty();
    json!({ "connected": connected })
}

#[tauri::command]
async fn calendar_connect(app: tauri::AppHandle, config: State<'_, Config>) -> Result<Value, ()> {
    let cfg = config.get_all();
    let (id, secret) = (str_of(&cfg, "calendarClientId"), str_of(&cfg, "calendarClientSecret"));
    if id.is_empty() || secret.is_empty() {
        return Ok(json!({ "ok": false, "error": "Enter Client ID and Client Secret first, then save Settings." }));
    }
    let result = async {
        let code_task = tauri::async_runtime::spawn_blocking(oauth_server::wait_for_code);
        app.opener().open_url(calendar::auth_url(id), None::<&str>).map_err(|e| e.to_string())?;
        let code = code_task.await.map_err(|e| e.to_string())??;
        let tokens = calendar::exchange_code(id, secret, &code).await?;
        config.set_all(Map::from_iter([("calendarTokens".into(), tokens)]));
        Ok(())
    }
    .await;
    Ok(wrap_unit(result))
}

#[tauri::command]
fn calendar_disconnect(config: State<Config>) -> Value {
    config.set_all(Map::from_iter([("calendarTokens".into(), Value::Null)]));
    json!({ "ok": true })
}

#[tauri::command]
async fn calendar_get_events(config: State<'_, Config>, time_min: String, time_max: String) -> Result<Value, ()> {
    Ok(wrap(async {
        let token = calendar_token(&config).await?;
        calendar::get_events(&token, &time_min, &time_max).await
    }.await))
}

#[tauri::command]
async fn calendar_create_event(config: State<'_, Config>, data: Value) -> Result<Value, ()> {
    Ok(wrap(async {
        let token = calendar_token(&config).await?;
        calendar::create_event(&token, &data).await
    }.await))
}

#[tauri::command]
async fn calendar_delete_event(config: State<'_, Config>, event_id: String) -> Result<Value, ()> {
    Ok(wrap_unit(async {
        let token = calendar_token(&config).await?;
        calendar::delete_event(&token, &event_id).await
    }.await))
}

// ─── App setup ──────────────────────────────────────────────────────────────

/// Reuses the Electron app's data folder so existing settings and backgrounds carry over.
fn config_dir(app: &tauri::App) -> PathBuf {
    let base = app.path().data_dir().expect("no data directory");
    let candidates = [base.join("work-tracker"), base.join("Task Tracker")];
    candidates
        .iter()
        .find(|d| d.join("config.json").exists())
        .unwrap_or(&candidates[0])
        .clone()
}

/// Copies the old Electron config's credentials file fields into config (one-time migration).
fn migrate_credentials_file(config: &Config) {
    let cfg = config.get_all();
    let path = str_of(&cfg, "credentialsFilePath");
    if path.is_empty() {
        return;
    }
    let mut patch = Map::from_iter([("credentialsFilePath".into(), json!(""))]);
    if let Some(creds) = fs::read_to_string(path).ok().and_then(|s| serde_json::from_str::<Value>(&s).ok()) {
        for key in ["serviceAccount", "spreadsheetId", "calendarClientId", "calendarClientSecret", "calendarTokens"] {
            if config::truthy(creds.get(key)) {
                patch.insert(key.into(), creds[key].clone());
            }
        }
        // If they already had Sheets configured, keep them in google mode
        if config::truthy(creds.get("serviceAccount")) && config::truthy(creds.get("spreadsheetId")) {
            patch.insert("storageMode".into(), json!("google"));
        }
    }
    config.set_all(patch);
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let config = Config::new(config_dir(app));
            migrate_credentials_file(&config);
            let _ = app.asset_protocol_scope().allow_directory(bg_dir(&config), false);
            app.manage(config);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            background_add_images,
            background_remove_image,
            background_get_path,
            background_get_paths,
            config_get,
            config_save,
            credentials_pick_service_account,
            shell_open_url,
            dialog_confirm,
            dialog_alert,
            storage_pick_data_file,
            storage_create_data_file,
            storage_detect_conflict,
            storage_upload_to_google,
            storage_conflict_dialog,
            sheets_init,
            sheets_test_connection,
            sheets_get_tasks,
            sheets_get_archived,
            sheets_add_task,
            sheets_update_task,
            sheets_complete_task,
            sheets_delete_task,
            sheets_delete_archived,
            sheets_update_archived,
            calendar_status,
            calendar_connect,
            calendar_disconnect,
            calendar_get_events,
            calendar_create_event,
            calendar_delete_event,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Task Tracker");
}
