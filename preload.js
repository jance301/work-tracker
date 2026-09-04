const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Config (UI prefs + credentials, all in one)
  getConfig:  ()     => ipcRenderer.invoke('config:get'),
  saveConfig: (data) => ipcRenderer.invoke('config:save', data),

  // Service account import (file picker only — data saved via saveConfig)
  pickServiceAccount: () => ipcRenderer.invoke('credentials:pick-service-account'),

  // Storage / data file
  pickDataFile:      () => ipcRenderer.invoke('storage:pick-data-file'),
  createDataFile:    () => ipcRenderer.invoke('storage:create-data-file'),
  detectConflict:    () => ipcRenderer.invoke('storage:detect-conflict'),
  uploadToGoogle:    () => ipcRenderer.invoke('storage:upload-to-google'),
  showConflictDialog:() => ipcRenderer.invoke('storage:conflict-dialog'),

  // Data operations (routes to local or Google internally)
  initSheets:      ()       => ipcRenderer.invoke('sheets:init'),
  testConnection:  ()       => ipcRenderer.invoke('sheets:test-connection'),
  getTasks:        ()       => ipcRenderer.invoke('sheets:get-tasks'),
  getArchived:     ()       => ipcRenderer.invoke('sheets:get-archived'),
  addTask:         (task)   => ipcRenderer.invoke('sheets:add-task', task),
  updateTask:      (task)   => ipcRenderer.invoke('sheets:update-task', task),
  completeTask:    (id)     => ipcRenderer.invoke('sheets:complete-task', id),
  deleteTask:      (id)     => ipcRenderer.invoke('sheets:delete-task', id),
  deleteArchived:  (id)     => ipcRenderer.invoke('sheets:delete-archived', id),
  updateArchived:  (task)   => ipcRenderer.invoke('sheets:update-archived', task),

  // Background images
  bgAddImages:   ()          => ipcRenderer.invoke('background:add-images'),
  bgRemoveImage: (filename)  => ipcRenderer.invoke('background:remove-image', filename),
  bgGetData:     (filename)  => ipcRenderer.invoke('background:get-data', filename),
  bgGetThumbs:   (filenames) => ipcRenderer.invoke('background:get-thumbs', filenames),

  // Shell
  openUrl: (url) => ipcRenderer.invoke('shell:open-url', url),

  // Calendar
  calendarStatus:      ()        => ipcRenderer.invoke('calendar:status'),
  calendarConnect:     ()        => ipcRenderer.invoke('calendar:connect'),
  calendarDisconnect:  ()        => ipcRenderer.invoke('calendar:disconnect'),
  getCalendarEvents:   (range)   => ipcRenderer.invoke('calendar:get-events', range),
  createCalendarEvent: (data)    => ipcRenderer.invoke('calendar:create-event', data),
  deleteCalendarEvent: (eventId) => ipcRenderer.invoke('calendar:delete-event', eventId),
});
