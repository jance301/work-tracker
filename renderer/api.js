// Exposes the same window.api surface the Electron preload did, backed by Tauri commands.
(() => {
  const { invoke, convertFileSrc } = window.__TAURI__.core;
  const assetUrl = p => (p ? convertFileSrc(p) : null);

  window.api = {
    // Config (UI prefs + credentials, all in one)
    getConfig:  ()     => invoke('config_get'),
    saveConfig: (data) => invoke('config_save', { data }),

    // Service account import (file picker only — data saved via saveConfig)
    pickServiceAccount: () => invoke('credentials_pick_service_account'),

    // Storage / data file
    pickDataFile:       () => invoke('storage_pick_data_file'),
    createDataFile:     () => invoke('storage_create_data_file'),
    detectConflict:     () => invoke('storage_detect_conflict'),
    uploadToGoogle:     () => invoke('storage_upload_to_google'),
    showConflictDialog: () => invoke('storage_conflict_dialog'),

    // Data operations (routes to local or Google internally)
    initSheets:     ()     => invoke('sheets_init'),
    testConnection: ()     => invoke('sheets_test_connection'),
    getTasks:       ()     => invoke('sheets_get_tasks'),
    getArchived:    ()     => invoke('sheets_get_archived'),
    addTask:        (task) => invoke('sheets_add_task', { task }),
    updateTask:     (task) => invoke('sheets_update_task', { task }),
    completeTask:   (id)   => invoke('sheets_complete_task', { id }),
    deleteTask:     (id)   => invoke('sheets_delete_task', { id }),
    deleteArchived: (id)   => invoke('sheets_delete_archived', { id }),
    updateArchived: (task) => invoke('sheets_update_archived', { task }),

    // Background images (served from disk via the asset protocol)
    bgAddImages:   ()          => invoke('background_add_images'),
    bgRemoveImage: (filename)  => invoke('background_remove_image', { filename }),
    bgGetData:     async (filename)  => assetUrl(await invoke('background_get_path', { filename })),
    bgGetThumbs:   async (filenames) => (await invoke('background_get_paths', { filenames })).map(assetUrl),

    // Shell
    openUrl: (url) => invoke('shell_open_url', { url }),

    // Dialogs
    confirm: (message) => invoke('dialog_confirm', { message }),

    // Calendar
    calendarStatus:     () => invoke('calendar_status'),
    calendarConnect:    () => invoke('calendar_connect'),
    calendarDisconnect: () => invoke('calendar_disconnect'),
    getCalendarEvents:  ({ timeMin, timeMax }) => invoke('calendar_get_events', {
      timeMin: new Date(timeMin).toISOString(),
      timeMax: new Date(timeMax).toISOString(),
    }),
    createCalendarEvent: (data) => invoke('calendar_create_event', {
      data: { ...data, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
    }),
    deleteCalendarEvent: (eventId) => invoke('calendar_delete_event', { eventId }),
  };

  // macOS WKWebView ignores window.alert, so route it to a native dialog.
  window.alert = (message) => { invoke('dialog_alert', { message: String(message) }); };
})();
