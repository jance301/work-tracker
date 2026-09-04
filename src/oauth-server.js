const http = require('http');

const PORT = 42813;
const REDIRECT_URI = `http://localhost:${PORT}`;

const SUCCESS_HTML = `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>body{margin:0;display:flex;align-items:center;justify-content:center;height:100vh;
background:#0f1117;font-family:system-ui,sans-serif;color:#4caf82;}
.box{text-align:center}.icon{font-size:48px;margin-bottom:16px}
h2{font-size:22px;font-weight:600;margin:0 0 8px}p{color:#8b90ab;font-size:14px}</style>
</head><body><div class="box"><div class="icon">✓</div>
<h2>Authorization successful!</h2><p>You can close this tab and return to Task Tracker.</p>
</div></body></html>`;

const ERROR_HTML = (msg) => `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>body{margin:0;display:flex;align-items:center;justify-content:center;height:100vh;
background:#0f1117;font-family:system-ui,sans-serif;color:#e05c5c;}
.box{text-align:center}.icon{font-size:48px;margin-bottom:16px}
h2{font-size:22px;font-weight:600;margin:0 0 8px}p{color:#8b90ab;font-size:14px}</style>
</head><body><div class="box"><div class="icon">✗</div>
<h2>Authorization failed</h2><p>${msg}</p>
</div></body></html>`;

function waitForOAuthCode() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      let urlObj;
      try { urlObj = new URL(req.url, `http://localhost:${PORT}`); }
      catch { res.writeHead(400); res.end(); return; }

      const code  = urlObj.searchParams.get('code');
      const error = urlObj.searchParams.get('error');

      if (!code && !error) { res.writeHead(404); res.end(); return; }

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(code ? SUCCESS_HTML : ERROR_HTML(error || 'Unknown error'));

      server.close();
      if (code) resolve(code);
      else reject(new Error('OAuth authorization denied: ' + error));
    });

    server.on('error', (err) => reject(new Error('OAuth server error: ' + err.message)));

    server.listen(PORT);

    setTimeout(() => {
      server.close();
      reject(new Error('OAuth authorization timed out after 5 minutes.'));
    }, 5 * 60 * 1000);
  });
}

module.exports = { waitForOAuthCode, REDIRECT_URI };
