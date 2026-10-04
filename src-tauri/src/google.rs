//! Minimal Google API plumbing: HTTP client, error extraction and
//! service-account access tokens (replaces the `googleapis` package).

use jsonwebtoken::{encode, Algorithm, EncodingKey, Header};
use serde::Serialize;
use serde_json::Value;
use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};

pub const TOKEN_URL: &str = "https://oauth2.googleapis.com/token";

pub fn client() -> &'static reqwest::Client {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT.get_or_init(reqwest::Client::new)
}

pub fn now_secs() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs()
}

pub fn now_millis() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis() as u64
}

/// Sends a request and returns the JSON body, or Google's error message.
pub async fn send(req: reqwest::RequestBuilder) -> Result<Value, String> {
    let resp = req.send().await.map_err(|e| e.to_string())?;
    let status = resp.status();
    let text = resp.text().await.map_err(|e| e.to_string())?;
    let body: Value = serde_json::from_str(&text).unwrap_or(Value::Null);
    if status.is_success() {
        return Ok(body);
    }
    let msg = body["error"]["message"]
        .as_str()
        .or_else(|| body["error_description"].as_str())
        .or_else(|| body["error"].as_str())
        .map(String::from)
        .unwrap_or_else(|| format!("Request failed with status {status}"));
    Err(msg)
}

#[derive(Serialize)]
struct Claims<'a> {
    iss: &'a str,
    scope: &'a str,
    aud: &'a str,
    iat: u64,
    exp: u64,
}

/// Returns a cached or freshly minted access token for a service account.
pub async fn service_account_token(sa: &Value, scope: &str) -> Result<String, String> {
    static CACHE: OnceLock<Mutex<HashMap<String, (String, u64)>>> = OnceLock::new();
    let cache = CACHE.get_or_init(Default::default);

    let email = sa["client_email"]
        .as_str()
        .ok_or("The incoming JSON object does not contain a client_email field")?;
    let key = sa["private_key"]
        .as_str()
        .ok_or("The incoming JSON object does not contain a private_key field")?;
    let cache_key = format!("{email}|{scope}");

    if let Some((token, exp)) = cache.lock().unwrap().get(&cache_key) {
        if *exp > now_secs() + 300 {
            return Ok(token.clone());
        }
    }

    let iat = now_secs();
    let claims = Claims { iss: email, scope, aud: TOKEN_URL, iat, exp: iat + 3600 };
    let mut header = Header::new(Algorithm::RS256);
    header.kid = sa["private_key_id"].as_str().map(String::from);
    let signing_key = EncodingKey::from_rsa_pem(key.as_bytes()).map_err(|e| e.to_string())?;
    let jwt = encode(&header, &claims, &signing_key).map_err(|e| e.to_string())?;

    let body = send(client().post(TOKEN_URL).form(&[
        ("grant_type", "urn:ietf:params:oauth:grant-type:jwt-bearer"),
        ("assertion", jwt.as_str()),
    ]))
    .await?;
    let token = body["access_token"].as_str().ok_or("No access token returned")?.to_string();
    let expires_in = body["expires_in"].as_u64().unwrap_or(3600);
    cache.lock().unwrap().insert(cache_key, (token.clone(), iat + expires_in));
    Ok(token)
}
