const { app } = require('electron');
const path = require('path');
const fs = require('fs');

const DEFAULT_COLUMNS = [
  {
    id: 'tags',
    name: 'Tags',
    type: 'multiselect',
    items: ['Documentation', 'CR', 'Deployment', 'Meeting', 'Bug Fix', 'Testing'],
    colors: {},
    locked: true,
  },
  {
    id: 'priority',
    name: 'Priority',
    type: 'dropdown',
    items: ['Normal', 'Low', 'High'],
    colors: {},
    locked: false,
  },
  {
    id: 'pic',
    name: 'PIC',
    type: 'dropdown',
    items: ['Jance'],
    colors: {},
    locked: false,
  },
];

const DEFAULTS = {
  storageMode: 'local',
  dataFilePath: '',
  // Google credentials (migrated from external credentials file)
  serviceAccount:       null,
  spreadsheetId:        '',
  calendarClientId:     '',
  calendarClientSecret: '',
  calendarTokens:       null,
  backgrounds: { default: [], periods: [] },
  customColumns: DEFAULT_COLUMNS,
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
      const stored = JSON.parse(raw);

      // Migrate old flat format → customColumns
      if (!stored.customColumns) {
        stored.customColumns = DEFAULT_COLUMNS.map(col => {
          if (col.id === 'tags')     return { ...col, items: stored.tags     || col.items, colors: stored.tagColors      || {} };
          if (col.id === 'priority') return { ...col, items: stored.priorities|| col.items, colors: stored.priorityColors || {} };
          if (col.id === 'pic')      return { ...col, items: stored.pics      || col.items };
          return col;
        });
      }

      return { ...DEFAULTS, ...stored };
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
