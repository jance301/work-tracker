const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Config
  getConfig: () => ipcRenderer.invoke('config:get'),
  saveConfig: (data) => ipcRenderer.invoke('config:save', data),
  pickFile: () => ipcRenderer.invoke('config:pick-file'),

  // Sheets
  testConnection: () => ipcRenderer.invoke('sheets:test-connection'),
  initSheets: () => ipcRenderer.invoke('sheets:init'),
  getTasks: () => ipcRenderer.invoke('sheets:get-tasks'),
  getArchived: () => ipcRenderer.invoke('sheets:get-archived'),
  addTask: (task) => ipcRenderer.invoke('sheets:add-task', task),
  updateTask: (task) => ipcRenderer.invoke('sheets:update-task', task),
  completeTask: (id) => ipcRenderer.invoke('sheets:complete-task', id),
  deleteTask: (id) => ipcRenderer.invoke('sheets:delete-task', id),
  deleteArchived: (id) => ipcRenderer.invoke('sheets:delete-archived', id),
  updateArchived: (task) => ipcRenderer.invoke('sheets:update-archived', task),

  // Shell
  openUrl: (url) => ipcRenderer.invoke('shell:open-url', url),
});
