const { app } = require('electron');
const path = require('path');
const fs = require('fs');

const DEFAULTS = {
  credentialsPath: '',
  spreadsheetId: '',
  types: ['Documentation', 'CR', 'Deployment', 'Meeting', 'Bug Fix', 'Testing'],
  priorities: ['Normal', 'Low', 'High'],
  pics: ['Jance'],
  typeColors: {},
  priorityColors: {},
};

class ConfigManager {
  constructor() {
    const userDataPath = app.getPath('userData');
    this.filePath = path.join(userDataPath, 'config.json');
    this._ensure();
  }

  _ensure() {
    if (!fs.existsSync(this.filePath)) {
      fs.writeFileSync(this.filePath, JSON.stringify(DEFAULTS, null, 2), 'utf8');
    }
  }

  getAll() {
    try {
      const raw = fs.readFileSync(this.filePath, 'utf8');
      return { ...DEFAULTS, ...JSON.parse(raw) };
    } catch {
      return { ...DEFAULTS };
    }
  }

  setAll(data) {
    const current = this.getAll();
    const merged = { ...current, ...data };
    fs.writeFileSync(this.filePath, JSON.stringify(merged, null, 2), 'utf8');
  }
}

module.exports = ConfigManager;
