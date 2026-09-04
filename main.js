const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const SheetsService   = require('./src/sheets');
const LocalDataService = require('./src/local-data');
const ConfigManager   = require('./src/config');
const CalendarService = require('./src/calendar');
const { waitForOAuthCode } = require('./src/oauth-server');

let mainWindow;
const config = new ConfigManager();

// ─── Migrate old separate credentials file → config ─────────────────────────
function migrateCredentialsFile() {
  const cfg = config.getAll();
  if (!cfg.credentialsFilePath) return;
  try {
    const creds = JSON.parse(fs.readFileSync(cfg.credentialsFilePath, 'utf8'));
    const patch = { credentialsFilePath: '' };
    if (creds.serviceAccount)       patch.serviceAccount       = creds.serviceAccount;
    if (creds.spreadsheetId)        patch.spreadsheetId        = creds.spreadsheetId;
    if (creds.calendarClientId)     patch.calendarClientId     = creds.calendarClientId;
    if (creds.calendarClientSecret) patch.calendarClientSecret = creds.calendarClientSecret;
    if (creds.calendarTokens)       patch.calendarTokens       = creds.calendarTokens;
    // If they already had Sheets configured, keep them in google mode
    if (creds.serviceAccount && creds.spreadsheetId) patch.storageMode = 'google';
    config.setAll(patch);
  } catch {
    config.setAll({ credentialsFilePath: '' });
  }
}

// ─── Data service factory ────────────────────────────────────────────────────
function getDataService() {
  const cfg = config.getAll();
  if (cfg.storageMode === 'google') {
    if (!cfg.serviceAccount || !cfg.spreadsheetId)
      throw new Error('Google Sheets not configured. Add your service account and Spreadsheet ID in Settings.');
    return new SheetsService(cfg.serviceAccount, cfg.spreadsheetId);
  }
  if (!cfg.dataFilePath)
    throw new Error('No save file configured. Go to Settings and choose a save file location.');
  return new LocalDataService(cfg.dataFilePath);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 800,
    minWidth: 1000,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    titleBarStyle: 'default',
    title: 'Work Tracker',
    icon: path.join(__dirname, 'assets', 'icon.icns'),
    show: false,
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());
}

app.whenReady().then(() => {
  migrateCredentialsFile();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ─── Background image helpers ────────────────────────────────────────────────

function getBgDir() {
  const dir = path.join(app.getPath('userData'), 'backgrounds');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function fileToDataUrl(filePath) {
  const ext  = path.extname(filePath).slice(1).toLowerCase();
  const mime = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' }[ext] || 'image/jpeg';
  return `data:${mime};base64,${fs.readFileSync(filePath).toString('base64')}`;
}

ipcMain.handle('background:add-images', async (_, slotId) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Background Images',
    filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp'] }],
    properties: ['openFile', 'multiSelections'],
  });
  if (result.canceled) return [];
  const dir = getBgDir();
  return result.filePaths.map(src => {
    const filename = `${Date.now()}_${Math.random().toString(36).slice(2)}${path.extname(src)}`;
    fs.copyFileSync(src, path.join(dir, filename));
    return filename;
  });
});

ipcMain.handle('background:remove-image', (_, filename) => {
  try { fs.unlinkSync(path.join(getBgDir(), filename)); } catch {}
  return { ok: true };
});

ipcMain.handle('background:get-data', (_, filename) => {
  try { return fileToDataUrl(path.join(getBgDir(), filename)); }
  catch { return null; }
});

ipcMain.handle('background:get-thumbs', (_, filenames) => {
  return filenames.map(f => {
    try { return fileToDataUrl(path.join(getBgDir(), f)); }
    catch { return null; }
  });
});

// ─── IPC: Config ─────────────────────────────────────────────────────────────

ipcMain.handle('config:get', () => config.getAll());

ipcMain.handle('config:save', (_, data) => {
  config.setAll(data);
  return { ok: true };
});

// ─── IPC: Service account import ─────────────────────────────────────────────

ipcMain.handle('credentials:pick-service-account', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Google Service Account JSON',
    filters: [{ name: 'JSON Files', extensions: ['json'] }],
    properties: ['openFile'],
  });
  if (result.canceled) return null;
  try {
    return { ok: true, data: JSON.parse(fs.readFileSync(result.filePaths[0], 'utf8')) };
  } catch (err) {
    return { ok: false, error: 'Failed to read file: ' + err.message };
  }
});

ipcMain.handle('shell:open-url', (_, url) => {
  if (/^https?:\/\//.test(url) || /^obsidian:\/\//.test(url)) shell.openExternal(url);
});

// ─── IPC: Storage / data file ─────────────────────────────────────────────────

ipcMain.handle('storage:pick-data-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Data File',
    filters: [{ name: 'JSON Files', extensions: ['json'] }],
    properties: ['openFile'],
  });
  if (result.canceled) return null;
  const filePath = result.filePaths[0];
  config.setAll({ dataFilePath: filePath });
  return filePath;
});

ipcMain.handle('storage:create-data-file', async () => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Create New Data File',
    defaultPath: 'work-tracker-data.json',
    filters: [{ name: 'JSON Files', extensions: ['json'] }],
  });
  if (result.canceled) return null;
  const filePath = result.filePath;
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify({ tasks: [], archived: [] }, null, 2), 'utf8');
  }
  config.setAll({ dataFilePath: filePath });
  return filePath;
});

ipcMain.handle('storage:detect-conflict', async () => {
  const cfg = config.getAll();

  let localHasData = false;
  if (cfg.dataFilePath && fs.existsSync(cfg.dataFilePath)) {
    try {
      const data = JSON.parse(fs.readFileSync(cfg.dataFilePath, 'utf8'));
      localHasData = (data.tasks?.length > 0) || (data.archived?.length > 0);
    } catch {}
  }

  let googleIsEmpty = true;
  try {
    const sheets = new SheetsService(cfg.serviceAccount, cfg.spreadsheetId);
    await sheets.ensureSheets();
    const [tasks, archived] = await Promise.all([sheets.getTasks(), sheets.getArchived()]);
    googleIsEmpty = tasks.length === 0 && archived.length === 0;
  } catch {}

  return { localHasData, googleIsEmpty };
});

ipcMain.handle('storage:upload-to-google', async () => {
  try {
    const cfg = config.getAll();
    const local = new LocalDataService(cfg.dataFilePath);
    const { tasks, archived } = local.exportAll();
    const sheets = new SheetsService(cfg.serviceAccount, cfg.spreadsheetId);
    await sheets.bulkImport({ tasks, archived });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('storage:conflict-dialog', async () => {
  const { response } = await dialog.showMessageBox(mainWindow, {
    type: 'question',
    title: 'Local Data Found',
    message: 'You have local data but Google Sheets is empty.',
    detail: 'What would you like to do?',
    buttons: ['Upload local data → Google', 'Start fresh from Google', 'Cancel'],
    defaultId: 0,
    cancelId: 2,
  });
  return response; // 0 = upload, 1 = fresh, 2 = cancel
});

// ─── IPC: Data (routes to local or Google based on storageMode) ──────────────

async function withData(fn) {
  try {
    const svc = getDataService();
    const result = await fn(svc);
    return { ok: true, data: result };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

ipcMain.handle('sheets:init', async () => {
  try {
    const cfg = config.getAll();
    if (cfg.storageMode === 'google') {
      const sheets = new SheetsService(cfg.serviceAccount, cfg.spreadsheetId);
      await sheets.ensureSheets();
    } else {
      if (!cfg.dataFilePath) throw new Error('No save file configured.');
      // Ensure the file exists
      if (!fs.existsSync(cfg.dataFilePath)) {
        fs.writeFileSync(cfg.dataFilePath, JSON.stringify({ tasks: [], archived: [] }, null, 2), 'utf8');
      }
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('sheets:test-connection', async () => {
  try {
    const cfg = config.getAll();
    const sheets = new SheetsService(cfg.serviceAccount, cfg.spreadsheetId);
    await sheets.ensureSheets();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('sheets:get-tasks',      async () => withData(s => s.getTasks()));
ipcMain.handle('sheets:get-archived',   async () => withData(s => s.getArchived()));
ipcMain.handle('sheets:add-task',       async (_, task) => withData(s => s.addTask(task)));
ipcMain.handle('sheets:update-task',    async (_, task) => withData(s => s.updateTask(task)));
ipcMain.handle('sheets:complete-task',  async (_, id)   => withData(s => s.completeTask(id)));
ipcMain.handle('sheets:delete-task',    async (_, id)   => withData(s => s.deleteTask(id)));
ipcMain.handle('sheets:delete-archived',async (_, id)   => withData(s => s.deleteArchived(id)));
ipcMain.handle('sheets:update-archived',async (_, task) => withData(s => s.updateArchived(task)));

// ─── IPC: Calendar ───────────────────────────────────────────────────────────

function getCalendar() {
  const cfg = config.getAll();
  if (!cfg.calendarClientId || !cfg.calendarClientSecret)
    throw new Error('Google Calendar not configured. Add OAuth credentials in Settings.');
  if (!cfg.calendarTokens)
    throw new Error('Google Calendar not authorized. Click "Connect" in Settings.');
  const cal = new CalendarService(cfg.calendarClientId, cfg.calendarClientSecret, cfg.calendarTokens);
  cal.onTokensRefresh = (newTokens) => {
    const current = config.getAll();
    config.setAll({ calendarTokens: { ...current.calendarTokens, ...newTokens } });
  };
  return cal;
}

ipcMain.handle('calendar:status', () => {
  const cfg = config.getAll();
  return { connected: !!(cfg.calendarTokens && cfg.calendarClientId && cfg.calendarClientSecret) };
});

ipcMain.handle('calendar:connect', async () => {
  try {
    const cfg = config.getAll();
    if (!cfg.calendarClientId || !cfg.calendarClientSecret)
      return { ok: false, error: 'Enter Client ID and Client Secret first, then save Settings.' };
    const cal = new CalendarService(cfg.calendarClientId, cfg.calendarClientSecret, null);
    const authUrl = cal.getAuthUrl();
    const codePromise = waitForOAuthCode();
    shell.openExternal(authUrl);
    const code = await codePromise;
    const tokens = await cal.getTokensFromCode(code);
    config.setAll({ calendarTokens: tokens });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('calendar:disconnect', () => {
  config.setAll({ calendarTokens: null });
  return { ok: true };
});

ipcMain.handle('calendar:get-events', async (_, { timeMin, timeMax }) => {
  try {
    const cal = getCalendar();
    const events = await cal.getEvents(new Date(timeMin), new Date(timeMax));
    return { ok: true, data: events };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('calendar:create-event', async (_, data) => {
  try {
    const cal = getCalendar();
    const result = await cal.createEvent(data);
    return { ok: true, data: result };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('calendar:delete-event', async (_, eventId) => {
  try {
    const cal = getCalendar();
    await cal.deleteEvent(eventId);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});
