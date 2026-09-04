const fs = require('fs');

const BUILT_IN = new Set([
  'ID','Date','Items','Status','Tags','Priority','PIC','Remark','Deadline','CompletionDate','Pinned',
]);

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

class LocalDataService {
  constructor(filePath) {
    this.filePath = filePath;
  }

  _read() {
    try {
      const raw = fs.readFileSync(this.filePath, 'utf8');
      const data = JSON.parse(raw);
      return { tasks: data.tasks || [], archived: data.archived || [] };
    } catch {
      return { tasks: [], archived: [] };
    }
  }

  _write(data) {
    fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), 'utf8');
  }

  async getTasks()    { return this._read().tasks; }
  async getArchived() { return this._read().archived; }

  async addTask(task) {
    const data = this._read();
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
    // Preserve custom column values
    Object.keys(task).forEach(k => {
      if (!BUILT_IN.has(k) && k !== 'ID') newTask[k] = task[k];
    });
    data.tasks.push(newTask);
    this._write(data);
    return newTask;
  }

  async updateTask(task) {
    const data = this._read();
    const idx = data.tasks.findIndex(t => t.ID === task.ID);
    if (idx === -1) throw new Error(`Task ${task.ID} not found`);
    data.tasks[idx] = task;
    this._write(data);
  }

  async completeTask(id) {
    const data = this._read();
    const idx = data.tasks.findIndex(t => t.ID === id);
    if (idx === -1) throw new Error(`Task ${id} not found`);
    const task = { ...data.tasks[idx], Status: true, CompletionDate: today() };
    data.archived.push(task);
    data.tasks.splice(idx, 1);
    this._write(data);
  }

  async deleteTask(id) {
    const data = this._read();
    const idx = data.tasks.findIndex(t => t.ID === id);
    if (idx === -1) throw new Error(`Task ${id} not found`);
    data.tasks.splice(idx, 1);
    this._write(data);
  }

  async deleteArchived(id) {
    const data = this._read();
    const idx = data.archived.findIndex(t => t.ID === id);
    if (idx === -1) throw new Error(`Archived task ${id} not found`);
    data.archived.splice(idx, 1);
    this._write(data);
  }

  async updateArchived(task) {
    const data = this._read();
    const idx = data.archived.findIndex(t => t.ID === task.ID);
    if (idx === -1) throw new Error(`Archived task ${task.ID} not found`);
    data.archived[idx] = task;
    this._write(data);
  }

  exportAll() {
    return this._read();
  }
}

module.exports = LocalDataService;
