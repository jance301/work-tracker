use crate::google::{client, now_millis, send, TOKEN_URL};
use crate::oauth_server::REDIRECT_URI;
use serde_json::{json, Map, Value};
use url::Url;

const SCOPE: &str = "https://www.googleapis.com/auth/calendar";
const EVENTS_URL: &str = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

// Google Calendar colorId → hex color
fn gcal_color(id: &str) -> Option<&'static str> {
    Some(match id {
        "1" => "#7986CB", "2" => "#33B679", "3" => "#8E24AA", "4" => "#E67C73",
        "5" => "#F6BF26", "6" => "#F4511E", "7" => "#039BE5", "8" => "#616161",
        "9" => "#3F51B5", "10" => "#0B8043", "11" => "#D50000",
        _ => return None,
    })
}

pub fn auth_url(client_id: &str) -> String {
    let mut u = Url::parse("https://accounts.google.com/o/oauth2/v2/auth").unwrap();
    u.query_pairs_mut()
        .append_pair("access_type", "offline")
        .append_pair("scope", SCOPE)
        .append_pair("prompt", "consent") // always returns refresh_token
        .append_pair("response_type", "code")
        .append_pair("client_id", client_id)
        .append_pair("redirect_uri", REDIRECT_URI);
    u.to_string()
}

/// Converts a token endpoint response into the stored format (expires_in → expiry_date).
fn to_stored_tokens(mut body: Value) -> Value {
    if let Some(obj) = body.as_object_mut() {
        if let Some(secs) = obj.remove("expires_in").and_then(|v| v.as_u64()) {
            obj.insert("expiry_date".into(), json!(now_millis() + secs * 1000));
        }
    }
    body
}

pub async fn exchange_code(client_id: &str, client_secret: &str, code: &str) -> Result<Value, String> {
    let body = send(client().post(TOKEN_URL).form(&[
        ("code", code),
        ("client_id", client_id),
        ("client_secret", client_secret),
        ("redirect_uri", REDIRECT_URI),
        ("grant_type", "authorization_code"),
    ]))
    .await?;
    Ok(to_stored_tokens(body))
}

/// Returns a usable access token, plus refreshed token fields to persist (if any).
pub async fn access_token(
    client_id: &str,
    client_secret: &str,
    tokens: &Value,
) -> Result<(String, Option<Map<String, Value>>), String> {
    let access = tokens["access_token"].as_str();
    // Refresh 5 minutes early, like googleapis did
    let expiring = tokens["expiry_date"].as_u64().map_or(false, |exp| exp <= now_millis() + 5 * 60 * 1000);
    if let (Some(access), false) = (access, expiring) {
        return Ok((access.to_string(), None));
    }
    let refresh = tokens["refresh_token"].as_str().ok_or("No refresh token is set.")?;
    let body = send(client().post(TOKEN_URL).form(&[
        ("refresh_token", refresh),
        ("client_id", client_id),
        ("client_secret", client_secret),
        ("grant_type", "refresh_token"),
    ]))
    .await?;
    let fresh = to_stored_tokens(body);
    let token = fresh["access_token"].as_str().ok_or("No access token returned")?.to_string();
    Ok((token, fresh.as_object().cloned()))
}

pub async fn get_events(token: &str, time_min: &str, time_max: &str) -> Result<Value, String> {
    let body = send(client().get(EVENTS_URL).bearer_auth(token).query(&[
        ("timeMin", time_min),
        ("timeMax", time_max),
        ("singleEvents", "true"),
        ("orderBy", "startTime"),
        ("maxResults", "250"),
    ]))
    .await?;
    let str_or = |v: &Value, d: &str| v.as_str().filter(|s| !s.is_empty()).unwrap_or(d).to_string();
    let events: Vec<Value> = body["items"]
        .as_array()
        .map(|items| {
            items.iter().map(|ev| {
                let start_date = ev["start"]["date"].as_str();
                json!({
                    "id":          ev["id"],
                    "title":       str_or(&ev["summary"], "(No title)"),
                    "description": str_or(&ev["description"], ""),
                    "location":    str_or(&ev["location"], ""),
                    "color":       ev["colorId"].as_str().and_then(gcal_color).unwrap_or("#6c8ef5"),
                    "allDay":      start_date.is_some(),
                    "start":       ev["start"]["dateTime"].as_str().or(start_date),
                    "end":         ev["end"]["dateTime"].as_str().or(ev["end"]["date"].as_str()),
                    "htmlLink":    str_or(&ev["htmlLink"], ""),
                })
            }).collect()
        })
        .unwrap_or_default();
    Ok(Value::Array(events))
}

pub async fn create_event(token: &str, data: &Value) -> Result<Value, String> {
    let text = |k: &str| data[k].as_str().unwrap_or_default();
    let mut body = json!({
        "summary":     data["title"],
        "description": text("description"),
        "location":    text("location"),
    });
    if data["allDay"].as_bool().unwrap_or(false) {
        let end = if text("endDate").is_empty() { text("startDate") } else { text("endDate") };
        body["start"] = json!({ "date": text("startDate") });
        body["end"] = json!({ "date": end });
    } else {
        body["start"] = json!({ "dateTime": text("startDateTime"), "timeZone": text("timeZone") });
        body["end"] = json!({ "dateTime": text("endDateTime"), "timeZone": text("timeZone") });
    }
    send(client().post(EVENTS_URL).bearer_auth(token).json(&body)).await
}

pub async fn delete_event(token: &str, event_id: &str) -> Result<(), String> {
    let mut u = Url::parse(EVENTS_URL).unwrap();
    u.path_segments_mut().unwrap().push(event_id);
    send(client().delete(u).bearer_auth(token)).await.map(|_| ())
}
