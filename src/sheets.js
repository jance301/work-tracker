const { google } = require('googleapis');

// Sheet names
const SHEET_TASKS    = 'WorkLog';
const SHEET_ARCHIVED = 'Archived';

// Column order: ID | Date | Items | Status | Tags | Priority | PIC | Remark | Deadline | CompletionDate | Pinned | CustomData
const COLS = ['ID', 'Date', 'Items', 'Status', 'Tags', 'Priority', 'PIC', 'Remark', 'Deadline', 'CompletionDate', 'Pinned', 'CustomData'];
const BUILT_IN_FIELDS = new Set(['ID','Date','Items','Status','Tags','Priority','PIC','Remark','Deadline','CompletionDate','Pinned','CustomData']);

function rowToTask(row) {
  const obj = {};
  COLS.forEach((col, i) => { obj[col] = row[i] ?? ''; });
  // Parse CustomData JSON and merge user-added column values into the task object
  if (obj.CustomData) {
    try { Object.assign(obj, JSON.parse(obj.CustomData)); } catch {}
  }
  delete obj.CustomData;
  return obj;
}

function taskToRow(task) {
  // Collect any non-built-in fields into CustomData JSON
  const extra = {};
  Object.keys(task).forEach(k => { if (!BUILT_IN_FIELDS.has(k)) extra[k] = task[k]; });
  return COLS.map(col => {
    if (col === 'CustomData') return Object.keys(extra).length ? JSON.stringify(extra) : '';
    return task[col] ?? '';
  });
}

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

class SheetsService {
  constructor(serviceAccountObj, spreadsheetId) {
    this.spreadsheetId = spreadsheetId;
    const auth = new google.auth.GoogleAuth({
      credentials: serviceAccountObj,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    this.sheets = google.sheets({ version: 'v4', auth });
  }

  async ensureSheets() {
    const meta = await this.sheets.spreadsheets.get({ spreadsheetId: this.spreadsheetId });
    const existing = meta.data.sheets.map(s => s.properties.title);

    const toCreate = [SHEET_TASKS, SHEET_ARCHIVED].filter(n => !existing.includes(n));

    if (toCreate.length > 0) {
      await this.sheets.spreadsheets.batchUpdate({
        spreadsheetId: this.spreadsheetId,
        requestBody: {
          requests: toCreate.map(title => ({
            addSheet: { properties: { title } }
          }))
        }
      });
    }

    // Ensure headers
    for (const sheetName of [SHEET_TASKS, SHEET_ARCHIVED]) {
      const range = `${sheetName}!A1:L1`;
      const res = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId, range
      });
      const first = res.data.values?.[0] ?? [];
      if (first[0] !== 'ID') {
        // New sheet — write full header row
        await this.sheets.spreadsheets.values.update({
          spreadsheetId: this.spreadsheetId,
          range,
          valueInputOption: 'RAW',
          requestBody: { values: [COLS] }
        });
      } else if (!first.includes('CustomData')) {
        // Existing sheet missing the CustomData column — append it
        await this.sheets.spreadsheets.values.update({
          spreadsheetId: this.spreadsheetId,
          range: `${sheetName}!L1`,
          valueInputOption: 'RAW',
          requestBody: { values: [['CustomData']] }
        });
      }
    }
  }

  async _getRows(sheetName) {
    const range = `${sheetName}!A2:L`;
    const res = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId, range
    });
    return (res.data.values ?? []).map(rowToTask).filter(t => t.ID);
  }

  async _findRow(sheetName, id) {
    const range = `${sheetName}!A2:A`;
    const res = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId, range
    });
    const rows = res.data.values ?? [];
    for (let i = 0; i < rows.length; i++) {
      if (rows[i][0] === id) return i + 2; // 1-indexed, offset by header row
    }
    return -1;
  }

  async getTasks()    { return this._getRows(SHEET_TASKS); }
  async getArchived() { return this._getRows(SHEET_ARCHIVED); }

  async addTask(task) {
    const newTask = {
      ID: genId(),
      Date: task.Date || today(),
      Items: task.Items || '',
      Status: false,
      Tags: task.Tags || '',
      Priority: task.Priority || 'Normal',
      PIC: task.PIC || '',
      Remark: task.Remark || '',
      Deadline: task.Deadline || '',
      CompletionDate: '',
      Pinned: '',
    };
    await this.sheets.spreadsheets.values.append({
      spreadsheetId: this.spreadsheetId,
      range: `${SHEET_TASKS}!A2`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [taskToRow(newTask)] }
    });
    return newTask;
  }

  async updateTask(task) {
    const rowNum = await this._findRow(SHEET_TASKS, task.ID);
    if (rowNum === -1) throw new Error(`Task ${task.ID} not found`);
    await this.sheets.spreadsheets.values.update({
      spreadsheetId: this.spreadsheetId,
      range: `${SHEET_TASKS}!A${rowNum}:L${rowNum}`,
      valueInputOption: 'RAW',
      requestBody: { values: [taskToRow(task)] }
    });
  }

  async completeTask(id) {
    const rowNum = await this._findRow(SHEET_TASKS, id);
    if (rowNum === -1) throw new Error(`Task ${id} not found`);

    const range = `${SHEET_TASKS}!A${rowNum}:L${rowNum}`;
    const res = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId, range
    });
    const task = rowToTask(res.data.values[0]);
    task.Status = true;
    task.CompletionDate = today();

    // Append to Archived
    await this.sheets.spreadsheets.values.append({
      spreadsheetId: this.spreadsheetId,
      range: `${SHEET_ARCHIVED}!A2`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [taskToRow(task)] }
    });

    // Delete from WorkLog
    await this._deleteRow(SHEET_TASKS, rowNum);
  }

  async deleteTask(id) {
    const rowNum = await this._findRow(SHEET_TASKS, id);
    if (rowNum === -1) throw new Error(`Task ${id} not found`);
    await this._deleteRow(SHEET_TASKS, rowNum);
  }

  async deleteArchived(id) {
    const rowNum = await this._findRow(SHEET_ARCHIVED, id);
    if (rowNum === -1) throw new Error(`Archived task ${id} not found`);
    await this._deleteRow(SHEET_ARCHIVED, rowNum);
  }

  async updateArchived(task) {
    const rowNum = await this._findRow(SHEET_ARCHIVED, task.ID);
    if (rowNum === -1) throw new Error(`Archived task ${task.ID} not found`);
    await this.sheets.spreadsheets.values.update({
      spreadsheetId: this.spreadsheetId,
      range: `${SHEET_ARCHIVED}!A${rowNum}:L${rowNum}`,
      valueInputOption: 'RAW',
      requestBody: { values: [taskToRow(task)] }
    });
  }

  async bulkImport({ tasks, archived }) {
    await this.ensureSheets();
    if (tasks.length > 0) {
      await this.sheets.spreadsheets.values.append({
        spreadsheetId: this.spreadsheetId,
        range: `${SHEET_TASKS}!A2`,
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values: tasks.map(taskToRow) },
      });
    }
    if (archived.length > 0) {
      await this.sheets.spreadsheets.values.append({
        spreadsheetId: this.spreadsheetId,
        range: `${SHEET_ARCHIVED}!A2`,
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values: archived.map(taskToRow) },
      });
    }
  }

  async _deleteRow(sheetName, rowNum) {
    const meta = await this.sheets.spreadsheets.get({ spreadsheetId: this.spreadsheetId });
    const sheet = meta.data.sheets.find(s => s.properties.title === sheetName);
    if (!sheet) throw new Error(`Sheet ${sheetName} not found`);
    const sheetId = sheet.properties.sheetId;

    await this.sheets.spreadsheets.batchUpdate({
      spreadsheetId: this.spreadsheetId,
      requestBody: {
        requests: [{
          deleteDimension: {
            range: {
              sheetId,
              dimension: 'ROWS',
              startIndex: rowNum - 1,
              endIndex: rowNum,
            }
          }
        }]
      }
    });
  }
}

module.exports = SheetsService;
