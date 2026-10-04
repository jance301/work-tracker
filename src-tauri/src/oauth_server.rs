use std::io::{ErrorKind, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::thread::sleep;
use std::time::{Duration, Instant};
use url::Url;

const PORT: u16 = 42813;
pub const REDIRECT_URI: &str = "http://localhost:42813";

const SUCCESS_HTML: &str = r#"<!DOCTYPE html><html><head><meta charset="utf-8">
<style>body{margin:0;display:flex;align-items:center;justify-content:center;height:100vh;
background:#0f1117;font-family:system-ui,sans-serif;color:#4caf82;}
.box{text-align:center}.icon{font-size:48px;margin-bottom:16px}
h2{font-size:22px;font-weight:600;margin:0 0 8px}p{color:#8b90ab;font-size:14px}</style>
</head><body><div class="box"><div class="icon">✓</div>
<h2>Authorization successful!</h2><p>You can close this tab and return to Task Tracker.</p>
</div></body></html>"#;

fn error_html(msg: &str) -> String {
    format!(
        r#"<!DOCTYPE html><html><head><meta charset="utf-8">
<style>body{{margin:0;display:flex;align-items:center;justify-content:center;height:100vh;
background:#0f1117;font-family:system-ui,sans-serif;color:#e05c5c;}}
.box{{text-align:center}}.icon{{font-size:48px;margin-bottom:16px}}
h2{{font-size:22px;font-weight:600;margin:0 0 8px}}p{{color:#8b90ab;font-size:14px}}</style>
</head><body><div class="box"><div class="icon">✗</div>
<h2>Authorization failed</h2><p>{msg}</p>
</div></body></html>"#
    )
}

fn respond(stream: &mut TcpStream, status: &str, body: &str) {
    let _ = write!(
        stream,
        "HTTP/1.1 {status}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    );
}

/// Handles one request. Returns Some(result) once a code or error arrives.
fn handle(mut stream: TcpStream) -> Option<Result<String, String>> {
    let _ = stream.set_nonblocking(false);
    let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
    let mut buf = [0u8; 8192];
    let n = stream.read(&mut buf).unwrap_or(0);
    let req = String::from_utf8_lossy(&buf[..n]);
    let path = req.split_whitespace().nth(1).unwrap_or("/");

    let Ok(url) = Url::parse(&format!("{REDIRECT_URI}{path}")) else {
        respond(&mut stream, "400 Bad Request", "");
        return None;
    };
    let param = |k: &str| url.query_pairs().find(|(n, _)| n == k).map(|(_, v)| v.into_owned());
    let (code, error) = (param("code"), param("error"));

    match (code, error) {
        (Some(code), _) => {
            respond(&mut stream, "200 OK", SUCCESS_HTML);
            Some(Ok(code))
        }
        (None, Some(error)) => {
            let msg = if error.is_empty() { "Unknown error".to_string() } else { error };
            respond(&mut stream, "200 OK", &error_html(&msg));
            Some(Err(format!("OAuth authorization denied: {msg}")))
        }
        (None, None) => {
            respond(&mut stream, "404 Not Found", "");
            None
        }
    }
}

/// Blocks until Google redirects back with an auth code (or 5 minutes pass).
pub fn wait_for_code() -> Result<String, String> {
    // Listen on both IPv4 and IPv6 loopback since "localhost" may resolve to either.
    let mut listeners = Vec::new();
    let mut last_err = None;
    for addr in [format!("127.0.0.1:{PORT}"), format!("[::1]:{PORT}")] {
        match TcpListener::bind(&addr) {
            Ok(l) => {
                let _ = l.set_nonblocking(true);
                listeners.push(l);
            }
            Err(e) => last_err = Some(e),
        }
    }
    if listeners.is_empty() {
        return Err(format!("OAuth server error: {}", last_err.map(|e| e.to_string()).unwrap_or_default()));
    }

    let deadline = Instant::now() + Duration::from_secs(5 * 60);
    while Instant::now() < deadline {
        for l in &listeners {
            match l.accept() {
                Ok((stream, _)) => {
                    if let Some(result) = handle(stream) {
                        return result;
                    }
                }
                Err(e) if e.kind() == ErrorKind::WouldBlock => {}
                Err(_) => {}
            }
        }
        sleep(Duration::from_millis(100));
    }
    Err("OAuth authorization timed out after 5 minutes.".into())
}
