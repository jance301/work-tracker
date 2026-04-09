const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const SheetsService = require('./src/sheets');
const ConfigManager = require('./src/config');

let mainWindow;
const config = new ConfigManager();

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
    show: false,
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ─── IPC: Config ────────────────────────────────────────────────────────────

ipcMain.handle('config:get', () => config.getAll());

ipcMain.handle('config:save', (_, data) => {
  config.setAll(data);
  return { ok: true };
});

ipcMain.handle('config:pick-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Google Service Account Credentials JSON',
    filters: [{ name: 'JSON Files', extensions: ['json'] }],
    properties: ['openFile'],
  });
  if (result.canceled) return null;
  return result.filePaths[0];
});

ipcMain.handle('shell:open-url', (_, url) => {
  // Only allow http/https URLs
  if (/^https?:\/\//.test(url)) shell.openExternal(url);
});

// ─── IPC: Sheets ─────────────────────────────────────────────────────────────

function getSheets() {
  const cfg = config.getAll();
  if (!cfg.credentialsPath || !cfg.spreadsheetId) {
    throw new Error('Google Sheets not configured. Go to Settings first.');
  }
  return new SheetsService(cfg.credentialsPath, cfg.spreadsheetId);
}

async function ensureSheetsHandler() {
  try {
    const sheets = getSheets();
    await sheets.ensureSheets();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

ipcMain.handle('sheets:test-connection', ensureSheetsHandler);
ipcMain.handle('sheets:init', ensureSheetsHandler);

ipcMain.handle('sheets:get-tasks', async () => {
  try {
    const sheets = getSheets();
    const tasks = await sheets.getTasks();
    return { ok: true, data: tasks };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('sheets:get-archived', async () => {
  try {
    const sheets = getSheets();
    const tasks = await sheets.getArchived();
    return { ok: true, data: tasks };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('sheets:add-task', async (_, task) => {
  try {
    const sheets = getSheets();
    const result = await sheets.addTask(task);
    return { ok: true, data: result };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('sheets:update-task', async (_, task) => {
  try {
    const sheets = getSheets();
    await sheets.updateTask(task);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('sheets:complete-task', async (_, id) => {
  try {
    const sheets = getSheets();
    await sheets.completeTask(id);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('sheets:delete-task', async (_, id) => {
  try {
    const sheets = getSheets();
    await sheets.deleteTask(id);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('sheets:delete-archived', async (_, id) => {
  try {
    const sheets = getSheets();
    await sheets.deleteArchived(id);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('sheets:update-archived', async (_, task) => {
  try {
    const sheets = getSheets();
    await sheets.updateArchived(task);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});
