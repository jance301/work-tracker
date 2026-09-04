/* ── Colour helpers ─────────────────────────────────────────────────────── */

// Fallback palette bg colors for unknown types (auto-assigned by hash)
const TYPE_PALETTE_BG = [
  '#0d2b4a','#0d3320','#3a2000','#261440',
  '#3d1010','#092c28','#1a2f10','#3d1030',
  '#102040','#1a3030',
];

// Built-in fallback colors for well-known type names [bg, text]
const TYPE_NAMED_COLORS = {
  'documentation': ['#0d2b4a','#5aaaf0'],
  'cr':            ['#0d3320','#3daf70'],
  'deployment':    ['#3a2000','#f0922a'],
  'meeting':       ['#261440','#9c6ee8'],
  'bug fix':       ['#3d1010','#e86060'],
  'bug/issue':     ['#4a0d0d','#e87070'],
  'testing':       ['#092c28','#35b5a8'],
  'enhancement':   ['#0a1f4a','#5b8ef5'],
  'sync games':    ['#0a3318','#3daf60'],
  'urgent':        ['#4a1400','#f07030'],
  'others':        ['#1e1e2e','#8b90ab'],
};

// Built-in fallback for priority
const PRIORITY_NAMED_COLORS = {
  'high':   ['#3d1010','#e86060'],
  'urgent': ['#4a1400','#f07030'],
  'normal': ['#0a1f4a','#5b8ef5'],
  'low':    ['#1e2230','#7080a0'],
  'medium': ['#2a2000','#c0a030'],
};

function autoTextColor(hexBg) {
  const r = parseInt(hexBg.slice(1,3), 16);
  const g = parseInt(hexBg.slice(3,5), 16);
  const b = parseInt(hexBg.slice(5,7), 16);
  return (0.299*r + 0.587*g + 0.114*b) / 255 > 0.45 ? '#111827' : '#f0f2ff';
}

function getTagColors(tagName) {
  if (!tagName) return null;
  const userBg = config.tagColors && config.tagColors[tagName];
  if (userBg) return [userBg, autoTextColor(userBg)];
  const named = TYPE_NAMED_COLORS[tagName.toLowerCase()];
  if (named) return named;
  const key = tagName.toLowerCase();
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) & 0xffff;
  const bg = TYPE_PALETTE_BG[hash % TYPE_PALETTE_BG.length];
  return [bg, autoTextColor(bg)];
}

function getPriorityColors(value) {
  if (!value) return null;
  const userBg = config.priorityColors && config.priorityColors[value];
  if (userBg) return [userBg, autoTextColor(userBg)];
  return PRIORITY_NAMED_COLORS[value.toLowerCase()] || null;
}

function applyBadgeColor(sel, colorFn) {
  const colors = colorFn(sel.value);
  if (colors) {
    sel.style.background  = colors[0];
    sel.style.color       = colors[1];
    sel.style.fontWeight  = '600';
    sel.style.borderRadius = '4px';
    sel.style.padding     = '3px 6px';
  } else {
    sel.style.background = sel.style.color = sel.style.fontWeight = '';
  }
}

function applyAllBadgeColors(container) {
  container.querySelectorAll('.custom-col-select').forEach(sel => {
    const col = getCol(sel.dataset.colId);
    if (col) applyBadgeColor(sel, n => getColItemColors(col, n));
  });
}

function parseTags(str) {
  return (str || '').split(',').map(s => s.trim()).filter(Boolean);
}

function sortTagsBySettings(tags) {
  const order = config.tags || [];
  return [...tags].sort((a, b) => {
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    return (ia === -1 ? Infinity : ia) - (ib === -1 ? Infinity : ib);
  });
}

// Map a column definition to its task object field name
function taskFieldFor(col) {
  const MAP = { tags: 'Tags', priority: 'Priority', pic: 'PIC' };
  return MAP[col.id] || col.id;
}

// Generic color lookup for any column (uses stored colors, falls back to built-in palettes)
function getColItemColors(col, name) {
  if (!name || !col) return null;
  if (col.colors?.[name]) {
    const bg = col.colors[name];
    return [bg, autoTextColor(bg)];
  }
  if (col.id === 'tags')     return getTagColors(name);
  if (col.id === 'priority') return getPriorityColors(name);
  return null;
}

// Total column count for worklog and archived tables
function wlColCount() { return 6 + (config.customColumns || []).length; }
function arColCount() { return 6 + (config.customColumns || []).length; }

function tagsHtml(id, tagsStr, isArchived = false, col = null) {
  const colDef   = col || (config.customColumns || []).find(c => c.id === 'tags') || { id: 'tags', items: config.tags || [], colors: config.tagColors || {} };
  const order    = colDef.items || [];
  const taskTags = parseTags(tagsStr).sort((a, b) => {
    const ia = order.indexOf(a), ib = order.indexOf(b);
    return (ia === -1 ? Infinity : ia) - (ib === -1 ? Infinity : ib);
  });
  const extraItems = taskTags.filter(t => !order.includes(t));
  const allOptions = [...order, ...extraItems];
  const selectedSet = new Set(taskTags);
  const archAttr = isArchived ? 'data-archived="1"' : '';

  const viewHtml = taskTags.length
    ? taskTags.map(t => {
        const c = getColItemColors(colDef, t);
        const s = c ? `style="background:${c[0]};color:${c[1]}"` : '';
        return `<span class="tag-badge" ${s}>${esc(t)}</span>`;
      }).join('')
    : '<span class="remark-empty">—</span>';

  const optsHtml = allOptions.map(tag => {
    const c = getColItemColors(colDef, tag);
    const bs = c ? `style="background:${c[0]};color:${c[1]}"` : '';
    return `<label class="filter-item">
      <input type="checkbox" class="tag-cb" value="${esc(tag)}" ${selectedSet.has(tag) ? 'checked' : ''}>
      <span class="filter-badge" ${bs}>${esc(tag)}</span>
    </label>`;
  }).join('');

  return `<div class="tags-cell" data-id="${id}" data-col-id="${colDef.id}" ${archAttr}>
    <div class="tags-view">${viewHtml}</div>
    <div class="tags-dropdown hidden">
      <div class="tags-dropdown-body">${optsHtml}</div>
    </div>
  </div>`;
}

// Render a dropdown select for any dropdown-type custom column
function makeSelectForCol(id, col, value, isArchived = false) {
  const field    = taskFieldFor(col);
  const archAttr = isArchived ? 'data-archived="1"' : '';
  const colors   = getColItemColors(col, value);
  const style    = colors ? `style="background:${colors[0]};color:${colors[1]};font-weight:600;border-radius:4px;padding:3px 6px;"` : '';
  const opts     = (col.items || []).map(o =>
    `<option value="${esc(o)}" ${o === value ? 'selected' : ''}>${esc(o)}</option>`
  ).join('');
  return `<select class="editable-select custom-col-select" data-id="${id}" data-field="${field}" data-col-id="${col.id}" ${archAttr} ${style}>
    <option value="">— None —</option>${opts}
  </select>`;
}

// Render all custom column cells for a task row
function customCellsHtml(t, isArchived) {
  return (config.customColumns || []).map(col => {
    const field = taskFieldFor(col);
    if (col.type === 'multiselect') {
      return `<td class="col-tags">${tagsHtml(t.ID, t[field] || '', isArchived, col)}</td>`;
    }
    return `<td class="col-priority">${makeSelectForCol(t.ID, col, t[field] || '', isArchived)}</td>`;
  }).join('');
}

/* ── State ──────────────────────────────────────────────────────────────── */
let config = {};
let bgRotateTimer = null;
let tasks = [];
let archived = [];
let sortState  = { col: 'Date', dir: 'desc' };
let filterState = { wl: { text: '' }, ar: { text: '' } };
let groupState = {
  wl: { field: '', collapsed: new Set() },
  ar: { field: '', collapsed: new Set() },
};
let editingTask = null;
let editingArchived = false;
let pendingDelete = null;

/* ── Config helpers ─────────────────────────────────────────────────────── */
function deriveConfigShorthands(cfg) {
  const cols = cfg.customColumns || [];
  const find = id => cols.find(c => c.id === id) || {};
  cfg.tags           = find('tags').items      || [];
  cfg.tagColors      = find('tags').colors     || {};
  cfg.priorities     = find('priority').items  || [];
  cfg.priorityColors = find('priority').colors || {};
  cfg.pics           = find('pic').items       || [];
}

function getCol(id) {
  return (config.customColumns || []).find(c => c.id === id);
}

/* ── Resizable columns & Freeze panes ──────────────────────────────────────── */
const COL_WIDTHS_KEY = 'wt-col-widths';
const FREEZE_KEY     = 'wt-freeze';
const TABLE_IDS      = ['table-worklog', 'table-archived'];

function getFreezeSettings() {
  try { return { header: true, cols: 0, ...JSON.parse(localStorage.getItem(FREEZE_KEY) || '{}') }; }
  catch { return { header: true, cols: 0 }; }
}

function saveColWidths(tableId) {
  const all = JSON.parse(localStorage.getItem(COL_WIDTHS_KEY) || '{}');
  all[tableId] = [...document.querySelectorAll(`#${tableId} thead th`)].map(th => th.offsetWidth);
  localStorage.setItem(COL_WIDTHS_KEY, JSON.stringify(all));
}

function loadColWidths(tableId) {
  let all; try { all = JSON.parse(localStorage.getItem(COL_WIDTHS_KEY) || '{}'); } catch { return; }
  const ws = all[tableId];
  if (!ws) return;
  document.querySelectorAll(`#${tableId} thead th`).forEach((th, i) => {
    if (ws[i] > 0) { th.style.width = ws[i] + 'px'; th.style.minWidth = ws[i] + 'px'; }
  });
}

function setupResizableColumns() {
  TABLE_IDS.forEach(tableId => {
    const table = document.getElementById(tableId);
    if (!table) return;
    loadColWidths(tableId);

    table.querySelectorAll('thead th').forEach(th => {
      const handle = document.createElement('div');
      handle.className = 'col-resize-handle';
      handle.addEventListener('click', e => e.stopPropagation());
      handle.addEventListener('dragstart', e => e.preventDefault()); // don't start col-reorder drag from resize zone
      th.appendChild(handle);

      let x0, w0;
      handle.addEventListener('mousedown', e => {
        e.preventDefault(); e.stopPropagation();
        x0 = e.pageX; w0 = th.offsetWidth;
        handle.classList.add('dragging');
        const onMove = e => {
          const w = Math.max(36, w0 + e.pageX - x0);
          th.style.width = th.style.minWidth = w + 'px';
          updateStickyOffsets(table);
        };
        const onUp = () => {
          handle.classList.remove('dragging');
          saveColWidths(tableId);
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      });
    });
  });
}

function updateStickyOffsets(table) {
  const { header, cols } = getFreezeSettings();
  const ths = [...table.querySelectorAll('thead th')];

  // Compute cumulative left offsets from current rendered widths
  const lefts = []; let cum = 0;
  ths.forEach((th, i) => { lefts[i] = cum; cum += th.offsetWidth; });

  ths.forEach((th, i) => {
    const isFrozenCol = i < cols;
    th.style.position  = (isFrozenCol || header) ? 'sticky' : '';
    th.style.top       = header      ? '0'            : '';
    th.style.left      = isFrozenCol ? lefts[i]+'px'  : '';
    th.style.zIndex    = (isFrozenCol && header) ? '20' : (isFrozenCol || header) ? '10' : '';
    th.style.boxShadow = (isFrozenCol && i === cols - 1) ? '2px 0 6px rgba(0,0,0,0.4)' : '';
  });

  table.querySelectorAll('tbody tr').forEach(tr => {
    [...tr.children].forEach((td, i) => {
      if (i < cols) {
        td.classList.add('col-frozen');
        td.style.left      = lefts[i] + 'px';
        td.style.zIndex    = '2';
        td.style.boxShadow = (i === cols - 1) ? '2px 0 6px rgba(0,0,0,0.2)' : '';
      } else {
        td.classList.remove('col-frozen');
        td.style.left = td.style.zIndex = td.style.boxShadow = '';
      }
    });
  });
}

function applyFreezeSettings() {
  TABLE_IDS.forEach(id => { const t = document.getElementById(id); if (t) updateStickyOffsets(t); });
}

function setupFreezeSettings() {
  const hCb  = document.getElementById('s-freeze-header');
  const cSel = document.getElementById('s-freeze-cols');
  const { header, cols } = getFreezeSettings();
  if (hCb)  hCb.checked = header;
  if (cSel) cSel.value  = String(cols);

  const onChange = () => {
    localStorage.setItem(FREEZE_KEY, JSON.stringify({
      header: hCb?.checked ?? true,
      cols:   parseInt(cSel?.value ?? '0', 10),
    }));
    applyFreezeSettings();
  };
  hCb?.addEventListener('change', onChange);
  cSel?.addEventListener('change', onChange);
}

/* ── Init ───────────────────────────────────────────────────────────────── */
window.addEventListener('DOMContentLoaded', async () => {
  setupTabs();
  setupModal();
  setupConfirm();
  setupSearch();
  setupSort();
  setupFilters();
  setupGroupBy();
  setupResizableColumns();
  setupFreezeSettings();
  setupCalEventModal();

  config = await window.api.getConfig();
  deriveConfigShorthands(config);
  initFilterState();
  renderTableHeaders();
  renderFilterToolbars();
  renderModalCustomFields();
  await applyConfigToSettings();
  applyCalendarSettings();
  await setupBgSettings();

  await initStorage();

  // Render dashboard on start (it is the active tab)
  await renderDashboard();

  document.getElementById('btn-refresh').addEventListener('click', async () => {
    setSyncStatus('Refreshing…');
    await loadAll();
  });
});

/* ── Storage init ───────────────────────────────────────────────────────── */
async function initStorage() {
  const mode = config.storageMode || 'local';
  if (mode === 'local') {
    if (config.dataFilePath) {
      const r = await window.api.initSheets();
      if (r.ok) {
        setSyncStatus('Local · Ready', 'ok');
        await loadAll();
      } else {
        setSyncStatus('Error opening save file — check Settings', 'error');
        renderWorklog(); renderArchived();
      }
    } else {
      setSyncStatus('No save file — go to Settings', 'error');
      renderWorklog(); renderArchived();
    }
  } else {
    if (config.serviceAccount && config.spreadsheetId) {
      setSyncStatus('Connecting…');
      const r = await window.api.initSheets();
      if (r.ok) {
        setSyncStatus('Connected', 'ok');
        await loadAll();
      } else {
        setSyncStatus('Not connected — check Settings', 'error');
        renderWorklog(); renderArchived();
      }
    } else {
      setSyncStatus('Google Sheets not configured — go to Settings', 'error');
      renderWorklog(); renderArchived();
    }
  }
}

/* ── Data loading ───────────────────────────────────────────────────────── */
async function loadAll() {
  const [t, a] = await Promise.all([window.api.getTasks(), window.api.getArchived()]);
  if (t.ok)  tasks    = t.data;
  if (a.ok)  archived = a.data;
  populateFilterOptions();
  renderWorklog();
  renderArchived();
  setSyncStatus(`Synced ${fmtTime(new Date())}`, 'ok');
  // Refresh dashboard stats whenever task data reloads
  const activeTab = document.querySelector('.tab-btn.active')?.dataset?.tab;
  if (activeTab === 'dashboard') renderDashboard();
}

// Build filter configs dynamically from config.customColumns
function buildFilterConfigs() {
  const cfgs = [];
  for (const tab of ['wl', 'ar']) {
    (config.customColumns || []).forEach(col => {
      cfgs.push({
        tab,
        key:     col.id,
        btnId:   `fb-${tab}-${col.id}`,
        panelId: `fp-${tab}-${col.id}`,
        label:   col.name,
        colorFn: n => getColItemColors(col, n),
        andMode: col.type === 'multiselect',
        col,
      });
    });
  }
  return cfgs;
}

// (Re-)initialise filterState keys from current config.customColumns
function initFilterState() {
  for (const tab of ['wl', 'ar']) {
    const prev = filterState[tab] || {};
    const next = { text: prev.text || '' };
    (config.customColumns || []).forEach(col => {
      next[col.id] = prev[col.id] instanceof Set ? prev[col.id] : new Set();
    });
    filterState[tab] = next;
  }
}

function populateFilterOptions() {
  const all = [...tasks, ...archived];
  buildFilterConfigs().forEach(cfg => {
    const field = taskFieldFor(cfg.col);
    let values;
    if (cfg.col.type === 'multiselect') {
      values = [...new Set(all.flatMap(t => parseTags(t[field] || '')))].sort();
    } else {
      values = [...new Set(all.map(t => t[field]).filter(Boolean))].sort();
    }
    buildFilterPanel(cfg, values);
    updateFilterButton(cfg);
  });
}

function buildFilterPanel(cfg, values) {
  const panel = document.getElementById(cfg.panelId);
  if (!panel) return;
  const activeSet = filterState[cfg.tab][cfg.key];

  const itemsHtml = values.map(v => {
    const colors = cfg.colorFn ? cfg.colorFn(v) : null;
    const badgeStyle = colors ? `style="background:${colors[0]};color:${colors[1]}"` : '';
    const checked = activeSet.size === 0 || activeSet.has(v) ? 'checked' : '';
    return `
      <label class="filter-item">
        <input type="checkbox" class="filter-cb" value="${esc(v)}" ${checked}>
        <span class="filter-badge" ${badgeStyle}>${esc(v)}</span>
      </label>`;
  }).join('');

  const allChecked = activeSet.size === 0;
  panel.innerHTML = `
    <div class="filter-panel-head">
      <label class="filter-item filter-select-all-row">
        <input type="checkbox" id="fsa-${cfg.panelId}" class="filter-cb-all" ${allChecked ? 'checked' : ''}>
        <span>Select All</span>
      </label>
      <button class="filter-reset-btn">Reset</button>
    </div>
    <div class="filter-panel-body">${itemsHtml}</div>`;

  // Select All toggle
  const cbAll = panel.querySelector('.filter-cb-all');
  cbAll.addEventListener('change', () => {
    panel.querySelectorAll('.filter-cb').forEach(cb => cb.checked = cbAll.checked);
    commitFilterState(cfg, panel, values);
  });

  // Individual checkbox
  panel.querySelectorAll('.filter-cb').forEach(cb => {
    cb.addEventListener('change', () => {
      const cbs = [...panel.querySelectorAll('.filter-cb')];
      const allOn = cbs.every(c => c.checked);
      cbAll.checked = allOn;
      cbAll.indeterminate = !allOn && cbs.some(c => c.checked);
      commitFilterState(cfg, panel, values);
    });
  });

  // Reset button → clear filter (show all)
  panel.querySelector('.filter-reset-btn').addEventListener('click', () => {
    filterState[cfg.tab][cfg.key] = new Set();
    panel.querySelectorAll('.filter-cb').forEach(cb => cb.checked = true);
    cbAll.checked = true;
    cbAll.indeterminate = false;
    updateFilterButton(cfg);
    (cfg.tab === 'wl' ? renderWorklog : renderArchived)();
  });
}

function commitFilterState(cfg, panel, values) {
  const checked = [...panel.querySelectorAll('.filter-cb')].filter(c => c.checked).map(c => c.value);
  filterState[cfg.tab][cfg.key] = checked.length === values.length ? new Set() : new Set(checked);
  updateFilterButton(cfg);
  (cfg.tab === 'wl' ? renderWorklog : renderArchived)();
}

// Inject filter buttons into toolbar containers, then wire up listeners
function renderFilterToolbars() {
  for (const tab of ['wl', 'ar']) {
    const container = document.getElementById(`${tab}-filters`);
    if (!container) continue;
    container.innerHTML = (config.customColumns || []).map(col => `
      <div class="filter-dropdown">
        <button class="filter-btn" id="fb-${tab}-${col.id}">
          ${esc(col.name)} <span class="filter-count"></span><span class="filter-arrow">▾</span>
        </button>
        <div class="filter-panel hidden" id="fp-${tab}-${col.id}"></div>
      </div>`).join('');
    container.querySelectorAll('.filter-panel').forEach(p => {
      p.addEventListener('click', e => e.stopPropagation());
    });
  }
  setupFilterButtonListeners();
}

function setupFilterButtonListeners() {
  buildFilterConfigs().forEach(cfg => {
    const btn   = document.getElementById(cfg.btnId);
    const panel = document.getElementById(cfg.panelId);
    if (!btn || !panel) return;
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const isOpen = !panel.classList.contains('hidden');
      document.querySelectorAll('.filter-panel').forEach(p => p.classList.add('hidden'));
      if (!isOpen) panel.classList.remove('hidden');
    });
  });
}

// Rebuild both table <thead> rows from config.customColumns
function renderTableHeaders() {
  const cols = config.customColumns || [];
  const customHtml = cols.map(col => {
    const sortable = col.type === 'dropdown';
    const dataCol  = sortable ? `data-col="${esc(taskFieldFor(col))}"` : '';
    const arrow    = sortable ? ' <span class="sort-arrow"></span>' : '';
    return `<th class="col-custom${sortable ? ' sortable' : ''}" ${dataCol} data-custom-col-id="${esc(col.id)}" draggable="true">${esc(col.name)}${arrow}</th>`;
  }).join('');

  const wlTr = document.querySelector('#table-worklog thead tr');
  if (wlTr) wlTr.innerHTML = `
    <th class="col-status">Done</th>
    <th class="col-date sortable" data-col="Date">Date <span class="sort-arrow"></span></th>
    <th class="col-items sortable" data-col="Items">Task / Items <span class="sort-arrow"></span></th>
    ${customHtml}
    <th class="col-deadline sortable" data-col="Deadline">Deadline <span class="sort-arrow"></span></th>
    <th class="col-remark">Remark</th>
    <th class="col-actions">Actions</th>`;

  const arTr = document.querySelector('#table-archived thead tr');
  if (arTr) arTr.innerHTML = `
    <th class="col-date sortable" data-col="Date">Date <span class="sort-arrow"></span></th>
    <th class="col-items sortable" data-col="Items">Task / Items <span class="sort-arrow"></span></th>
    ${customHtml}
    <th class="col-deadline sortable" data-col="Deadline">Deadline <span class="sort-arrow"></span></th>
    <th class="col-completion sortable" data-col="CompletionDate">Completed <span class="sort-arrow"></span></th>
    <th class="col-remark">Remark</th>
    <th class="col-actions">Actions</th>`;

  setupSort();
  setupResizableColumns();
  setupHeaderDrag();
}

// Drag custom column headers left/right to reorder columns
function setupHeaderDrag() {
  let dragSrc = null;

  for (const tableId of ['table-worklog', 'table-archived']) {
    const thead = document.querySelector(`#${tableId} thead tr`);
    if (!thead) continue;

    thead.querySelectorAll('th[data-custom-col-id]').forEach(th => {
      th.addEventListener('dragstart', e => {
        dragSrc = th;
        e.dataTransfer.effectAllowed = 'move';
        setTimeout(() => th.classList.add('th-dragging'), 0);
      });

      th.addEventListener('dragend', () => {
        th.classList.remove('th-dragging');
        document.querySelectorAll('th[data-custom-col-id]').forEach(t => t.classList.remove('th-drag-over'));
        dragSrc = null;
      });

      th.addEventListener('dragover', e => {
        e.preventDefault();
        if (!dragSrc || dragSrc.dataset.customColId === th.dataset.customColId) return;
        document.querySelectorAll('th[data-custom-col-id]').forEach(t => t.classList.remove('th-drag-over'));
        th.classList.add('th-drag-over');
      });

      th.addEventListener('dragleave', () => th.classList.remove('th-drag-over'));

      th.addEventListener('drop', e => {
        e.preventDefault();
        document.querySelectorAll('th[data-custom-col-id]').forEach(t => t.classList.remove('th-drag-over'));
        if (!dragSrc) return;
        const srcId = dragSrc.dataset.customColId;
        const dstId = th.dataset.customColId;
        if (srcId === dstId) return;

        const cols   = [...(config.customColumns || [])];
        const srcIdx = cols.findIndex(c => c.id === srcId);
        const dstIdx = cols.findIndex(c => c.id === dstId);
        if (srcIdx === -1 || dstIdx === -1) return;

        const [moved] = cols.splice(srcIdx, 1);
        const rect = th.getBoundingClientRect();
        const insertAfter = e.clientX > rect.left + rect.width / 2;
        cols.splice(insertAfter ? Math.min(dstIdx, cols.length) : dstIdx, 0, moved);

        config.customColumns = cols;
        window.api.saveConfig({ customColumns: cols });

        renderTableHeaders();
        renderWorklog();
        renderArchived();
        renderColumnsManager(); // keep Settings in sync
      });
    });
  }
}

// Populate #modal-custom-fields with form rows for each custom column
function renderModalCustomFields() {
  const container = document.getElementById('modal-custom-fields');
  if (!container) return;
  container.innerHTML = (config.customColumns || []).map(col => {
    if (col.type === 'multiselect') {
      return `<div class="form-field span-2" data-col-id="${col.id}">
        <label>${esc(col.name)}</label>
        <div id="f-custom-${col.id}" class="modal-tags-panel"></div>
      </div>`;
    }
    return `<div class="form-field" data-col-id="${col.id}">
      <label>${esc(col.name)}</label>
      <select id="f-custom-${col.id}" class="form-input"></select>
    </div>`;
  }).join('');
}

function updateFilterButton(cfg) {
  const btn = document.getElementById(cfg.btnId);
  if (!btn) return;
  const active = filterState[cfg.tab][cfg.key];
  const countEl = btn.querySelector('.filter-count');
  if (active.size > 0) {
    btn.classList.add('filter-active');
    countEl.textContent = `(${active.size}) `;
  } else {
    btn.classList.remove('filter-active');
    countEl.textContent = '';
  }
}

/* ── Sync status ────────────────────────────────────────────────────────── */
function setSyncStatus(msg, cls) {
  const el = document.getElementById('sync-status');
  el.textContent = msg;
  el.className = 'sync-status' + (cls ? ` ${cls}` : '');
}
function fmtTime(d) {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/* ── Tabs ───────────────────────────────────────────────────────────────── */
function setupTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
      if (btn.dataset.tab === 'dashboard') renderDashboard();
      else stopBgRotation();
      if (btn.dataset.tab === 'calendar')  loadCalendarWeek();
    });
  });
}

/* ── Row HTML templates ─────────────────────────────────────────────────── */
function worklogRowHtml(t) {
  const isPinned = t.Pinned === 'true';
  return `
    <tr data-id="${t.ID}"${isPinned ? ' class="row-pinned"' : ''}>
      <td class="col-status">
        <input type="checkbox" class="status-check" data-id="${t.ID}" title="Mark complete" />
      </td>
      <td class="col-date">
        <input type="date" class="inline-date" value="${t.Date}" data-id="${t.ID}" data-field="Date" />
      </td>
      <td class="col-items">
        <span class="editable" contenteditable="true" data-id="${t.ID}" data-field="Items">${esc(t.Items)}</span>
      </td>
      ${customCellsHtml(t, false)}
      <td class="col-deadline">
        <input type="date" class="inline-date" value="${t.Deadline}" data-id="${t.ID}" data-field="Deadline" />
      </td>
      <td class="col-remark">
        <div class="remark-cell" data-id="${t.ID}">
          <div class="remark-view">${parseRemarkHtml(t.Remark)}</div>
          <textarea class="remark-edit" placeholder="Add remark… (paste URL or [label](url))" style="display:none">${esc(t.Remark)}</textarea>
        </div>
      </td>
      <td class="col-actions">
        <button class="action-btn pin-btn${isPinned ? ' pinned' : ''}" data-id="${t.ID}" title="${isPinned ? 'Unpin task' : 'Pin task'}">&#128204;</button>
        <button class="action-btn edit-btn" data-id="${t.ID}" title="Edit">&#9998;</button>
        <button class="action-btn delete btn delete-btn" data-id="${t.ID}" title="Delete">&#128465;</button>
      </td>
    </tr>`;
}

function archivedRowHtml(t) {
  return `
    <tr data-id="${t.ID}">
      <td class="col-date">
        <input type="date" class="inline-date" value="${t.Date}" data-id="${t.ID}" data-field="Date" data-archived="1" />
      </td>
      <td class="col-items">
        <span class="editable" contenteditable="true" data-id="${t.ID}" data-field="Items" data-archived="1">${esc(t.Items)}</span>
      </td>
      ${customCellsHtml(t, true)}
      <td class="col-deadline">
        <input type="date" class="inline-date" value="${t.Deadline}" data-id="${t.ID}" data-field="Deadline" data-archived="1" />
      </td>
      <td class="col-completion">
        <input type="date" class="inline-date" value="${t.CompletionDate}" data-id="${t.ID}" data-field="CompletionDate" data-archived="1" />
      </td>
      <td class="col-remark">
        <div class="remark-cell" data-id="${t.ID}" data-archived="1">
          <div class="remark-view">${parseRemarkHtml(t.Remark)}</div>
          <textarea class="remark-edit" placeholder="Add remark… (paste URL or [label](url))" style="display:none">${esc(t.Remark)}</textarea>
        </div>
      </td>
      <td class="col-actions">
        <button class="action-btn edit-btn" data-id="${t.ID}" data-archived="1" title="Edit">&#9998;</button>
        <button class="action-btn delete delete-btn" data-id="${t.ID}" data-archived="1" title="Delete">&#128465;</button>
      </td>
    </tr>`;
}

/* ── Group renderer ─────────────────────────────────────────────────────── */
function renderGrouped(rows, field, collapsed, rowFn, colCount) {
  // Preserve insertion-order grouping (already sorted by field before this call)
  const groups = new Map();
  rows.forEach(t => {
    const key = t[field] || '(Blank)';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(t);
  });

  const groupCol = (config.customColumns || []).find(c => taskFieldFor(c) === field);

  let html = '';
  groups.forEach((groupRows, key) => {
    const isCollapsed = collapsed.has(key);
    const colors = groupCol ? getColItemColors(groupCol, key) : null;
    const badgeStyle = colors ? `style="background:${colors[0]};color:${colors[1]}"` : '';
    html += `
      <tr class="group-header-row" data-group-key="${esc(key)}">
        <td colspan="${colCount}">
          <span class="group-toggle">${isCollapsed ? '▶' : '▼'}</span>
          <span class="group-label" ${badgeStyle}>${esc(key)}</span>
          <span class="group-count">${groupRows.length} item${groupRows.length !== 1 ? 's' : ''}</span>
        </td>
      </tr>`;
    if (!isCollapsed) html += groupRows.map(rowFn).join('');
  });
  return html;
}

/* ── Render Work Log ────────────────────────────────────────────────────── */
function renderWorklog() {
  const tbody = document.getElementById('tbody-worklog');
  let rows = applyFilters([...tasks], filterState.wl);
  const gs = groupState.wl;
  // When grouping, sort by the group field first, then by the sort column within each group
  if (gs.field) rows = sortRows(rows, gs.field, 'asc');
  rows = sortRows(rows, sortState.col, sortState.dir);
  // Re-sort by group field to ensure grouping order after secondary sort
  if (gs.field) rows = [...rows].sort((a, b) => (a[gs.field]||'').localeCompare(b[gs.field]||''));
  // Pinned tasks always float to top (stable sort preserves group & sort order within pinned/unpinned)
  rows = [...rows].sort((a, b) => (b.Pinned === 'true' ? 1 : 0) - (a.Pinned === 'true' ? 1 : 0));

  if (!rows.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="${wlColCount()}">No tasks. Click "+ New Task" to add one.</td></tr>`;
    return;
  }

  tbody.innerHTML = gs.field
    ? renderGrouped(rows, gs.field, gs.collapsed, worklogRowHtml, wlColCount())
    : rows.map(worklogRowHtml).join('');

  // Events
  tbody.querySelectorAll('.status-check').forEach(cb => {
    cb.addEventListener('change', onComplete);
  });
  tbody.querySelectorAll('.inline-date').forEach(inp => {
    inp.addEventListener('change', onInlineChange);
  });
  tbody.querySelectorAll('[contenteditable]').forEach(el => {
    el.addEventListener('blur', onInlineChange);
    el.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); el.blur(); } });
  });
  tbody.querySelectorAll('.editable-select').forEach(sel => {
    sel.addEventListener('change', onInlineChange);
  });
  tbody.querySelectorAll('.custom-col-select').forEach(sel => {
    sel.addEventListener('change', e => {
      const col = getCol(e.target.dataset.colId);
      if (col) applyBadgeColor(e.target, n => getColItemColors(col, n));
    });
  });
  setupTagsCells(tbody);
  tbody.querySelectorAll('.pin-btn').forEach(btn => {
    btn.addEventListener('click', onPinToggle);
  });
  tbody.querySelectorAll('.edit-btn').forEach(btn => {
    btn.addEventListener('click', () => openEditModal(btn.dataset.id, false));
  });
  tbody.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', () => confirmDelete(btn.dataset.id, 'task'));
  });

  tbody.querySelectorAll('.group-header-row').forEach(row => {
    row.addEventListener('click', () => {
      const key = row.dataset.groupKey;
      if (groupState.wl.collapsed.has(key)) groupState.wl.collapsed.delete(key);
      else groupState.wl.collapsed.add(key);
      renderWorklog();
    });
  });

  applyAllBadgeColors(tbody);
  highlightDeadlines(tbody);
  setupRemarkCells(tbody);
  updateStickyOffsets(document.getElementById('table-worklog'));
}

/* ── Render Archived ────────────────────────────────────────────────────── */
function renderArchived() {
  const tbody = document.getElementById('tbody-archived');
  let rows = applyFilters([...archived], filterState.ar);
  const gs = groupState.ar;
  if (gs.field) rows = sortRows(rows, gs.field, 'asc');
  rows = sortRows(rows, sortState.col, sortState.dir);
  if (gs.field) rows = [...rows].sort((a, b) => (a[gs.field]||'').localeCompare(b[gs.field]||''));

  if (!rows.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="${arColCount()}">No archived tasks yet.</td></tr>`;
    return;
  }

  tbody.innerHTML = gs.field
    ? renderGrouped(rows, gs.field, gs.collapsed, archivedRowHtml, arColCount())
    : rows.map(archivedRowHtml).join('');

  tbody.querySelectorAll('.inline-date').forEach(inp => inp.addEventListener('change', onInlineChange));
  tbody.querySelectorAll('[contenteditable]').forEach(el => {
    el.addEventListener('blur', onInlineChange);
    el.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); el.blur(); } });
  });
  tbody.querySelectorAll('.editable-select').forEach(sel => sel.addEventListener('change', onInlineChange));
  tbody.querySelectorAll('.custom-col-select').forEach(sel => {
    sel.addEventListener('change', e => {
      const col = getCol(e.target.dataset.colId);
      if (col) applyBadgeColor(e.target, n => getColItemColors(col, n));
    });
  });
  setupTagsCells(tbody);
  tbody.querySelectorAll('.edit-btn').forEach(btn => {
    btn.addEventListener('click', () => openEditModal(btn.dataset.id, true));
  });
  tbody.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', () => confirmDelete(btn.dataset.id, 'archived'));
  });
  tbody.querySelectorAll('.group-header-row').forEach(row => {
    row.addEventListener('click', () => {
      const key = row.dataset.groupKey;
      if (groupState.ar.collapsed.has(key)) groupState.ar.collapsed.delete(key);
      else groupState.ar.collapsed.add(key);
      renderArchived();
    });
  });

  applyAllBadgeColors(tbody);
  highlightDeadlines(tbody);
  setupRemarkCells(tbody);
  updateStickyOffsets(document.getElementById('table-archived'));
}

/* ── Inline editing ─────────────────────────────────────────────────────── */
async function onInlineChange(e) {
  const el = e.target;
  const id = el.dataset.id;
  const field = el.dataset.field;
  const isArchived = !!el.dataset.archived;
  const value = el.value !== undefined ? el.value : el.innerText.trim();

  const list = isArchived ? archived : tasks;
  const task = list.find(t => t.ID === id);
  if (!task) return;
  task[field] = value;

  const res = isArchived
    ? await window.api.updateArchived(task)
    : await window.api.updateTask(task);

  if (!res.ok) {
    setSyncStatus('Save failed: ' + res.error, 'error');
  } else {
    setSyncStatus(`Saved ${fmtTime(new Date())}`, 'ok');
  }
}

/* ── Pin task ───────────────────────────────────────────────────────────── */
async function onPinToggle(e) {
  const btn = e.currentTarget;
  const id = btn.dataset.id;
  const task = tasks.find(t => t.ID === id);
  if (!task) return;
  task.Pinned = task.Pinned === 'true' ? '' : 'true';
  const res = await window.api.updateTask(task);
  if (res.ok) {
    setSyncStatus(`Saved ${fmtTime(new Date())}`, 'ok');
    renderWorklog();
  } else {
    task.Pinned = task.Pinned === 'true' ? '' : 'true'; // revert on failure
    setSyncStatus('Save failed: ' + res.error, 'error');
  }
}

/* ── Complete task ──────────────────────────────────────────────────────── */
async function onComplete(e) {
  const id = e.target.dataset.id;
  setSyncStatus('Archiving…');
  const res = await window.api.completeTask(id);
  if (res.ok) {
    await loadAll();
  } else {
    setSyncStatus('Error: ' + res.error, 'error');
    e.target.checked = false;
  }
}

/* ── Helpers ────────────────────────────────────────────────────────────── */
function makeSelect(id, field, value, options = [], badge = false, isArchived = false) {
  const opts = options.map(o =>
    `<option value="${esc(o)}" ${o === value ? 'selected' : ''}>${o ? esc(o) : '— None —'}</option>`
  ).join('');
  const archAttr = isArchived ? 'data-archived="1"' : '';

  if (field === 'Priority') {
    const colors = getPriorityColors(value);
    const style = colors
      ? `style="background:${colors[0]};color:${colors[1]};font-weight:600;border-radius:4px;padding:3px 6px;"`
      : '';
    return `<select class="editable-select priority-select" data-id="${id}" data-field="${field}" ${archAttr} ${style}>${opts}</select>`;
  }

  return `<select class="editable-select" data-id="${id}" data-field="${field}" ${archAttr}>${opts}</select>`;
}

function esc(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ── Remark / link-chip helpers ─────────────────────────────────────────── */
function getDomain(url) {
  try {
    const u = new URL(url);
    if (u.protocol === 'obsidian:') {
      const file = u.searchParams.get('file');
      if (file) {
        const parts = decodeURIComponent(file).split('/');
        return parts[parts.length - 1];
      }
      return 'Obsidian';
    }
    return u.hostname.replace(/^www\./, '');
  } catch { return url.length > 28 ? url.slice(0, 28) + '…' : url; }
}

function parseRemarkHtml(text) {
  if (!text) return '<span class="remark-empty">—</span>';
  const regex = /\[([^\]]*)\]\(((?:https?|obsidian):\/\/[^)]+)\)|((?:https?|obsidian):\/\/\S+)/g;
  let html = '';
  let last = 0;
  let m;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) html += esc(text.slice(last, m.index)).replace(/\n/g, '<br>');
    if (m[1] !== undefined) {
      const cls = m[2].startsWith('obsidian://') ? ' obsidian-chip' : '';
      html += `<span class="link-chip${cls}" data-url="${esc(m[2])}" title="${esc(m[2])}">${esc(m[1])}</span>`;
    } else {
      const cls = m[3].startsWith('obsidian://') ? ' obsidian-chip' : '';
      html += `<span class="link-chip${cls}" data-url="${esc(m[3])}" title="${esc(m[3])}">${esc(getDomain(m[3]))}</span>`;
    }
    last = regex.lastIndex;
  }
  if (last < text.length) html += esc(text.slice(last)).replace(/\n/g, '<br>');
  return html || '<span class="remark-empty">—</span>';
}

function applyFilters(rows, fs) {
  (config.customColumns || []).forEach(col => {
    const active = fs[col.id];
    if (!active || active.size === 0) return;
    const field = taskFieldFor(col);
    if (col.type === 'multiselect') {
      rows = rows.filter(t => {
        const vals = new Set(parseTags(t[field] || ''));
        return [...active].every(v => vals.has(v));
      });
    } else {
      rows = rows.filter(t => active.has(t[field]));
    }
  });
  if (fs.text) {
    const q = fs.text.toLowerCase();
    const searchFields = ['Items', 'Remark', ...(config.customColumns || []).map(taskFieldFor)];
    rows = rows.filter(t => searchFields.some(f => (t[f] || '').toLowerCase().includes(q)));
  }
  return rows;
}

function sortRows(rows, col, dir) {
  return [...rows].sort((a, b) => {
    const va = (a[col] || '').toLowerCase();
    const vb = (b[col] || '').toLowerCase();
    return dir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
  });
}

function highlightDeadlines(tbody) {
  const today = new Date(); today.setHours(0,0,0,0);
  const soon  = new Date(today); soon.setDate(soon.getDate() + 3);

  tbody.querySelectorAll('[data-field="Deadline"]').forEach(inp => {
    if (!inp.value) return;
    const d = new Date(inp.value);
    const row = inp.closest('tr');
    if (d < today) {
      row.classList.add('row-overdue');
      inp.classList.add('deadline-overdue');
    } else if (d <= soon) {
      row.classList.add('row-approaching');
      inp.classList.add('deadline-approaching');
    }
  });
}

/* ── Sort ───────────────────────────────────────────────────────────────── */
function setupSort() {
  document.querySelectorAll('th.sortable').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.col;
      const tableEl = th.closest('table');
      const tableId = tableEl.id.replace('table-', '');

      if (sortState.col === col) {
        sortState.dir = sortState.dir === 'asc' ? 'desc' : 'asc';
      } else {
        sortState.col = col;
        sortState.dir = 'asc';
      }
      sortState.table = tableId;

      // Update arrows
      document.querySelectorAll('.sort-arrow').forEach(s => s.textContent = '');
      th.querySelector('.sort-arrow').textContent = sortState.dir === 'asc' ? ' ▲' : ' ▼';

      if (tableId === 'worklog') renderWorklog();
      else if (tableId === 'archived') renderArchived();
    });
  });
}

/* ── Search ─────────────────────────────────────────────────────────────── */
function setupSearch() {
  document.getElementById('search-worklog').addEventListener('input', e => {
    filterState.wl.text = e.target.value;
    renderWorklog();
  });
  document.getElementById('search-archived').addEventListener('input', e => {
    filterState.ar.text = e.target.value;
    renderArchived();
  });
}

/* ── Filters ─────────────────────────────────────────────────────────────── */
function setupFilters() {
  // Click anywhere outside closes all panels and tag dropdowns
  document.addEventListener('click', () => {
    document.querySelectorAll('.filter-panel').forEach(p => p.classList.add('hidden'));
    document.querySelectorAll('.tags-dropdown').forEach(d => d.classList.add('hidden'));
  });
}

/* ── Modal: Add / Edit ──────────────────────────────────────────────────── */
function setupModal() {
  document.getElementById('btn-add-task').addEventListener('click', () => openAddModal());
  document.getElementById('btn-modal-close').addEventListener('click', closeModal);
  document.getElementById('btn-modal-cancel').addEventListener('click', closeModal);
  document.getElementById('btn-modal-save').addEventListener('click', saveModal);
  document.getElementById('modal-overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('modal-overlay')) closeModal();
  });
}

function openAddModal() {
  editingTask = null;
  editingArchived = false;
  document.getElementById('modal-title').textContent = 'New Task';
  fillModalSelects({});
  document.getElementById('f-date').value = todayStr();
  document.getElementById('f-deadline').value = '';
  document.getElementById('f-items').value = '';
  document.getElementById('f-remark').value = '';
  document.getElementById('f-completion').value = '';
  document.getElementById('f-completion-row').style.display = 'none';
  document.getElementById('modal-overlay').classList.remove('hidden');
  document.getElementById('f-items').focus();
}

function openEditModal(id, isArchived) {
  editingArchived = isArchived;
  const list = isArchived ? archived : tasks;
  const task = list.find(t => t.ID === id);
  if (!task) return;
  editingTask = task;
  document.getElementById('modal-title').textContent = 'Edit Task';
  fillModalSelects(task);
  document.getElementById('f-date').value = task.Date || '';
  document.getElementById('f-deadline').value = task.Deadline || '';
  document.getElementById('f-items').value = task.Items || '';
  document.getElementById('f-remark').value = task.Remark || '';
  document.getElementById('f-completion').value = task.CompletionDate || '';
  document.getElementById('f-completion-row').style.display = '';
  document.getElementById('modal-overlay').classList.remove('hidden');
}

function fillModalSelects(task = {}) {
  (config.customColumns || []).forEach(col => {
    const field = taskFieldFor(col);
    const el    = document.getElementById(`f-custom-${col.id}`);
    if (!el) return;

    if (col.type === 'multiselect') {
      const selected = parseTags(task[field] || '');
      const selSet   = new Set(selected);
      const order    = col.items || [];
      const extras   = selected.filter(t => !order.includes(t));
      el.innerHTML = [...order, ...extras].map(item => {
        const c  = getColItemColors(col, item);
        const bs = c ? `style="background:${c[0]};color:${c[1]}"` : '';
        return `<label class="filter-item">
          <input type="checkbox" class="modal-custom-cb" data-col-id="${col.id}" value="${esc(item)}" ${selSet.has(item) ? 'checked' : ''}>
          <span class="filter-badge" ${bs}>${esc(item)}</span>
        </label>`;
      }).join('') || `<span style="color:var(--text-dim);font-size:12px">No items — add them in Settings.</span>`;
    } else {
      const val = task[field] || '';
      el.innerHTML = '<option value="">— None —</option>' +
        (col.items || []).map(o => `<option value="${esc(o)}" ${o === val ? 'selected' : ''}>${esc(o)}</option>`).join('');
    }
  });
}

function fillSelect(id, options) {
  const sel = document.getElementById(id);
  sel.innerHTML = '<option value="">—</option>' +
    options.map(o => `<option value="${esc(o)}">${esc(o)}</option>`).join('');
}

function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
  editingTask = null;
}

async function saveModal() {
  const items = document.getElementById('f-items').value.trim();
  if (!items) { document.getElementById('f-items').focus(); return; }

  const btn = document.getElementById('btn-modal-save');
  btn.disabled = true;
  btn.textContent = 'Saving…';

  const customData = {};
  (config.customColumns || []).forEach(col => {
    const field = taskFieldFor(col);
    if (col.type === 'multiselect') {
      const order   = col.items || [];
      const checked = [...document.querySelectorAll(`.modal-custom-cb[data-col-id="${col.id}"]:checked`)]
        .map(cb => cb.value)
        .sort((a, b) => {
          const ia = order.indexOf(a), ib = order.indexOf(b);
          return (ia === -1 ? Infinity : ia) - (ib === -1 ? Infinity : ib);
        });
      customData[field] = checked.join(',');
    } else {
      customData[field] = document.getElementById(`f-custom-${col.id}`)?.value || '';
    }
  });
  const data = {
    Date: document.getElementById('f-date').value,
    Items: items,
    ...customData,
    Remark: document.getElementById('f-remark').value,
    Deadline: document.getElementById('f-deadline').value,
    CompletionDate: document.getElementById('f-completion').value,
  };

  let res;
  if (editingTask) {
    const updated = { ...editingTask, ...data };
    res = editingArchived
      ? await window.api.updateArchived(updated)
      : await window.api.updateTask(updated);
    if (res.ok) {
      const list = editingArchived ? archived : tasks;
      const idx = list.findIndex(t => t.ID === editingTask.ID);
      if (idx !== -1) list[idx] = updated;
    }
  } else {
    res = await window.api.addTask(data);
    if (res.ok) tasks.push(res.data);
  }

  btn.disabled = false;
  btn.textContent = 'Save';

  if (res.ok) {
    closeModal();
    renderWorklog();
    renderArchived();
    setSyncStatus(`Saved ${fmtTime(new Date())}`, 'ok');
  } else {
    setSyncStatus('Save failed: ' + res.error, 'error');
  }
}

/* ── Confirm Delete ─────────────────────────────────────────────────────── */
function setupConfirm() {
  document.getElementById('btn-confirm-cancel').addEventListener('click', () => {
    document.getElementById('confirm-overlay').classList.add('hidden');
    pendingDelete = null;
  });
  document.getElementById('btn-confirm-ok').addEventListener('click', async () => {
    document.getElementById('confirm-overlay').classList.add('hidden');
    if (!pendingDelete) return;
    const { id, type } = pendingDelete;
    pendingDelete = null;

    const res = type === 'archived'
      ? await window.api.deleteArchived(id)
      : await window.api.deleteTask(id);

    if (res.ok) {
      if (type === 'archived') archived = archived.filter(t => t.ID !== id);
      else tasks = tasks.filter(t => t.ID !== id);
      renderWorklog();
      renderArchived();
      setSyncStatus(`Deleted ${fmtTime(new Date())}`, 'ok');
    } else {
      setSyncStatus('Delete failed: ' + res.error, 'error');
    }
  });
}

function confirmDelete(id, type) {
  pendingDelete = { id, type };
  document.getElementById('confirm-msg').textContent =
    'Are you sure you want to permanently delete this task?';
  document.getElementById('confirm-overlay').classList.remove('hidden');
}

/* ── Remark cells ───────────────────────────────────────────────────────── */
function setupRemarkCells(tbody) {
  // Chip clicks — delegated so they fire even after re-render.
  // Attach once per tbody; this runs on every render but the tbody element
  // persists, so re-attaching would stack duplicate listeners (one tab per render).
  if (!tbody.dataset.chipListener) {
    tbody.dataset.chipListener = '1';
    tbody.addEventListener('click', e => {
      const chip = e.target.closest('.link-chip');
      if (chip?.dataset.url) {
        e.stopPropagation();
        window.api.openUrl(chip.dataset.url);
      }
    });
  }

  tbody.querySelectorAll('.remark-cell').forEach(cell => {
    const id         = cell.dataset.id;
    const isArchived = !!cell.dataset.archived;
    const view       = cell.querySelector('.remark-view');
    const input      = cell.querySelector('.remark-edit');
    let cancelling   = false;

    function autoResize() {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 160) + 'px';
    }

    // Click on view → switch to edit mode (but not if a chip was clicked)
    view.addEventListener('click', e => {
      if (e.target.closest('.link-chip')) return;
      e.stopPropagation();
      view.style.display  = 'none';
      input.style.display = 'block';
      autoResize();
      input.focus();
      // Move cursor to end
      input.selectionStart = input.selectionEnd = input.value.length;
    });

    input.addEventListener('input', autoResize);

    // Save on blur (unless Escape was pressed)
    input.addEventListener('blur', async () => {
      if (cancelling) { cancelling = false; return; }
      const value = input.value;
      const list  = isArchived ? archived : tasks;
      const task  = list.find(t => t.ID === id);
      if (task && task.Remark !== value) {
        task.Remark = value;
        const res = isArchived
          ? await window.api.updateArchived(task)
          : await window.api.updateTask(task);
        if (!res.ok) setSyncStatus('Save failed: ' + res.error, 'error');
        else setSyncStatus(`Saved ${fmtTime(new Date())}`, 'ok');
      }
      view.innerHTML      = parseRemarkHtml(value);
      input.style.display = 'none';
      view.style.display  = '';
      input.style.height  = '';
    });

    // Enter = new line, Ctrl+Enter = save, Escape = cancel
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); input.blur(); }
      if (e.key === 'Escape') {
        cancelling = true;
        const list = isArchived ? archived : tasks;
        const task = list.find(t => t.ID === id);
        if (task) input.value = task.Remark || '';
        view.innerHTML      = parseRemarkHtml(task?.Remark || '');
        input.style.display = 'none';
        input.style.height  = '';
        view.style.display  = '';
        input.blur();
      }
    });
  });
}

/* ── Tags cells (click → dropdown with checkboxes) ─────────────────────── */
function setupTagsCells(tbody) {
  tbody.querySelectorAll('.tags-cell').forEach(cell => {
    const id         = cell.dataset.id;
    const isArchived = !!cell.dataset.archived;
    const view       = cell.querySelector('.tags-view');
    const dropdown   = cell.querySelector('.tags-dropdown');

    view.addEventListener('click', e => {
      e.stopPropagation();
      const isOpen = !dropdown.classList.contains('hidden');
      document.querySelectorAll('.tags-dropdown').forEach(d => d.classList.add('hidden'));
      if (!isOpen) dropdown.classList.remove('hidden');
    });

    dropdown.querySelectorAll('.tag-cb').forEach(cb => {
      cb.addEventListener('change', () => saveTagsFromCell(cell, id, isArchived, dropdown, view));
    });

    dropdown.addEventListener('click', e => e.stopPropagation());
  });
}

async function saveTagsFromCell(cell, id, isArchived, dropdown, view) {
  const colId  = cell.dataset.colId || 'tags';
  const col    = getCol(colId) || { id: 'tags', items: config.tags || [], colors: config.tagColors || {} };
  const order  = col.items || [];
  const field  = taskFieldFor(col);
  const checked = [...dropdown.querySelectorAll('.tag-cb:checked')]
    .map(cb => cb.value)
    .sort((a, b) => {
      const ia = order.indexOf(a), ib = order.indexOf(b);
      return (ia === -1 ? Infinity : ia) - (ib === -1 ? Infinity : ib);
    });
  const tagsStr = checked.join(',');
  const list    = isArchived ? archived : tasks;
  const task    = list.find(t => t.ID === id);
  if (!task) return;
  task[field] = tagsStr;

  const res = isArchived
    ? await window.api.updateArchived(task)
    : await window.api.updateTask(task);

  if (!res.ok) {
    setSyncStatus('Save failed: ' + res.error, 'error');
  } else {
    setSyncStatus(`Saved ${fmtTime(new Date())}`, 'ok');
    const taskTags = parseTags(tagsStr).sort((a, b) => {
      const ia = order.indexOf(a), ib = order.indexOf(b);
      return (ia === -1 ? Infinity : ia) - (ib === -1 ? Infinity : ib);
    });
    view.innerHTML = taskTags.length
      ? taskTags.map(t => {
          const c = getColItemColors(col, t);
          const s = c ? `style="background:${c[0]};color:${c[1]}"` : '';
          return `<span class="tag-badge" ${s}>${esc(t)}</span>`;
        }).join('')
      : '<span class="remark-empty">—</span>';
  }
}


/* ── Group By ───────────────────────────────────────────────────────────── */
function getGroupFields() {
  return [
    { value: '', label: 'None' },
    ...(config.customColumns || [])
      .filter(c => c.type === 'dropdown')
      .map(c => ({ value: taskFieldFor(c), label: c.name })),
  ];
}

function setupGroupBy() {
  [{ btnId: 'gb-btn-wl', panelId: 'gb-panel-wl', tab: 'wl' },
   { btnId: 'gb-btn-ar', panelId: 'gb-panel-ar', tab: 'ar' }
  ].forEach(cfg => {
    const btn   = document.getElementById(cfg.btnId);
    const panel = document.getElementById(cfg.panelId);
    if (!btn || !panel) return;

    btn.addEventListener('click', e => {
      e.stopPropagation();
      const groupFields = getGroupFields();
      panel.innerHTML = groupFields.map(f => `
        <label class="filter-item">
          <input type="radio" name="gb-${cfg.tab}" value="${f.value}"
            ${groupState[cfg.tab].field === f.value ? 'checked' : ''}>
          <span>${f.label}</span>
        </label>`).join('');

      panel.querySelectorAll('input[type="radio"]').forEach(rb => {
        rb.addEventListener('change', () => {
          groupState[cfg.tab].field     = rb.value;
          groupState[cfg.tab].collapsed = new Set();
          updateGroupBtn(cfg.btnId, cfg.tab);
          panel.classList.add('hidden');
          cfg.tab === 'wl' ? renderWorklog() : renderArchived();
        });
      });

      document.querySelectorAll('.filter-panel').forEach(p => { if (p !== panel) p.classList.add('hidden'); });
      panel.classList.toggle('hidden');
    });

    panel.addEventListener('click', e => e.stopPropagation());
  });
}

function updateGroupBtn(btnId, tab) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  const field = groupState[tab].field;
  const label = getGroupFields().find(f => f.value === field)?.label || 'None';
  btn.childNodes[0].textContent = `⊞ Group: ${label} `;
  if (field) btn.classList.add('filter-active');
  else       btn.classList.remove('filter-active');
}

/* ── Settings ───────────────────────────────────────────────────────────── */

function loadSettingsData() {
  // Storage mode
  const mode = config.storageMode || 'local';
  const localRadio  = document.getElementById('s-mode-local');
  const googleRadio = document.getElementById('s-mode-google');
  if (localRadio)  localRadio.checked  = mode === 'local';
  if (googleRadio) googleRadio.checked = mode === 'google';
  toggleGoogleSection(mode === 'google');

  document.getElementById('s-data-file-path').value = config.dataFilePath || '';

  // Google Sheets
  const saStatus = document.getElementById('s-sa-status');
  if (config.serviceAccount?.client_email) {
    saStatus.value = '✓ ' + config.serviceAccount.client_email;
  } else {
    saStatus.value = '';
    saStatus.placeholder = 'Not imported';
  }
  document.getElementById('s-sheet-id').value = config.spreadsheetId || '';

  // Calendar
  document.getElementById('s-cal-client-id').value     = config.calendarClientId     || '';
  document.getElementById('s-cal-client-secret').value = config.calendarClientSecret || '';

  renderColumnsManager();
}

function toggleGoogleSection(show) {
  const el = document.getElementById('s-google-section');
  if (el) el.style.display = show ? '' : 'none';
}

async function applyConfigToSettings() {
  loadSettingsData();

  // Storage mode toggle
  document.querySelectorAll('input[name="storage-mode"]').forEach(radio => {
    radio.addEventListener('change', () => toggleGoogleSection(radio.value === 'google'));
  });

  // Data file — browse existing
  document.getElementById('btn-pick-data-file').addEventListener('click', async () => {
    const p = await window.api.pickDataFile();
    if (p) {
      config.dataFilePath = p;
      document.getElementById('s-data-file-path').value = p;
    }
  });

  // Data file — create new
  document.getElementById('btn-new-data-file').addEventListener('click', async () => {
    const p = await window.api.createDataFile();
    if (p) {
      config.dataFilePath = p;
      document.getElementById('s-data-file-path').value = p;
    }
  });

  // Import service account JSON
  document.getElementById('btn-import-sa').addEventListener('click', async () => {
    const saStatus = document.getElementById('s-sa-status');
    const r = await window.api.pickServiceAccount();
    if (!r) return;
    if (!r.ok) { saStatus.value = '✗ ' + r.error; return; }
    // Save directly into config
    await window.api.saveConfig({ serviceAccount: r.data });
    config.serviceAccount = r.data;
    saStatus.value = r.data.client_email ? '✓ ' + r.data.client_email : '✓ Imported';
  });

  // Test Google connection
  document.getElementById('btn-test-conn').addEventListener('click', async () => {
    const statusEl = document.getElementById('conn-status');
    statusEl.textContent = 'Testing…';
    statusEl.className = 'conn-status';
    await saveSettings(false);
    const r = await window.api.testConnection();
    statusEl.textContent = r.ok ? '✓ Connected successfully' : '✗ ' + r.error;
    statusEl.className = 'conn-status' + (r.ok ? ' ok' : ' error');
  });

  // Save Settings
  document.getElementById('btn-save-settings').addEventListener('click', async () => {
    await saveSettings(true);
    config = await window.api.getConfig();
    deriveConfigShorthands(config);
    initFilterState();
    renderTableHeaders();
    renderFilterToolbars();
    renderModalCustomFields();
    await initStorage();
  });
}


async function saveSettings(showStatus) {
  const statusEl = document.getElementById('settings-status');

  const mode = document.querySelector('input[name="storage-mode"]:checked')?.value || 'local';

  const data = {
    storageMode:          mode,
    spreadsheetId:        document.getElementById('s-sheet-id').value.trim(),
    calendarClientId:     document.getElementById('s-cal-client-id').value.trim(),
    calendarClientSecret: document.getElementById('s-cal-client-secret').value.trim(),
    customColumns:        collectColumnsFromManager(),
  };

  await window.api.saveConfig(data);
  config = { ...config, ...data };
  deriveConfigShorthands(config);

  // Handle conflict when switching to Google mode
  if (mode === 'google' && showStatus) {
    await handleGoogleSyncConflict();
  }

  if (showStatus) {
    statusEl.textContent = '✓ Settings saved';
    statusEl.className = 'conn-status ok';
    setTimeout(() => { statusEl.textContent = ''; }, 3000);
  }
}

async function handleGoogleSyncConflict() {
  const conflict = await window.api.detectConflict();
  if (!conflict.localHasData || !conflict.googleIsEmpty) return;

  const choice = await window.api.showConflictDialog();
  if (choice === 0) {
    // Upload local → Google
    const statusEl = document.getElementById('settings-status');
    statusEl.textContent = 'Uploading local data to Google…';
    statusEl.className = 'conn-status';
    const r = await window.api.uploadToGoogle();
    if (!r.ok) {
      statusEl.textContent = '✗ Upload failed: ' + r.error;
      statusEl.className = 'conn-status error';
    }
  }
  // choice === 1 → start fresh from Google (do nothing, Google wins)
  // choice === 2 → cancelled (do nothing)
}

/* ── Settings: ordered item list (tags, priorities) ─────────────────────── */
/* ── Column Manager (Settings) ──────────────────────────────────────────── */
function renderColumnsManager() {
  const container = document.getElementById('col-manager-container');
  if (!container) return;
  container.innerHTML = '';

  (config.customColumns || []).forEach(col => container.appendChild(renderColumnCard(col)));

  const addRow = document.createElement('div');
  addRow.className = 'col-add-row';
  addRow.innerHTML = `
    <button class="btn btn-secondary btn-sm" id="btn-add-multi-col">+ Multiselect Column</button>
    <button class="btn btn-secondary btn-sm" id="btn-add-drop-col">+ Dropdown Column</button>`;
  container.appendChild(addRow);

  const addCol = type => {
    const col = { id: 'col_' + Date.now().toString(36), name: 'New Column', type, items: [], colors: {}, locked: false };
    const card = renderColumnCard(col);
    container.insertBefore(card, addRow);
    const inp = card.querySelector('.col-name-input');
    inp.focus(); inp.select();
  };
  document.getElementById('btn-add-multi-col').addEventListener('click', () => addCol('multiselect'));
  document.getElementById('btn-add-drop-col').addEventListener('click',  () => addCol('dropdown'));

  // Card-level drag-to-reorder
  setupCardDrag(container);
}

function renderColumnCard(col) {
  const card = document.createElement('div');
  card.className = 'col-card';
  card.dataset.colId = col.id;

  const typeLabel = col.type === 'multiselect' ? 'Multiselect' : 'Dropdown';
  const typeCls   = col.type === 'multiselect' ? 'col-type-multi' : 'col-type-drop';
  const rightEl   = col.locked
    ? `<span class="col-locked-tag">built-in</span>`
    : `<button class="col-delete-btn">Delete column</button>`;

  card.innerHTML = `
    <div class="col-card-header">
      <span class="col-card-drag" title="Drag to reorder column">⠿</span>
      <span class="col-type-badge ${typeCls}">${typeLabel}</span>
      <input class="col-name-input form-input" value="${esc(col.name)}" placeholder="Column name…" />
      ${rightEl}
    </div>
    <div class="col-card-body">
      <div class="item-list" id="col-items-${col.id}"></div>
      <button class="btn-add-item col-add-item-btn">+ Add another item</button>
    </div>`;

  const listEl = card.querySelector(`#col-items-${col.id}`);
  (col.items || []).forEach(name => {
    listEl.appendChild(makeListItem(name, defaultItemColor(col, name)));
  });
  setupListDrag(listEl);

  card.querySelector('.col-add-item-btn').addEventListener('click', () => {
    listEl.appendChild(makeListItem('', '#6c8ef5'));
    setupListDrag(listEl);
    listEl.querySelectorAll('.list-item-name').forEach((el, i, all) => { if (i === all.length - 1) el.focus(); });
  });

  if (!col.locked) {
    card.querySelector('.col-delete-btn').addEventListener('click', () => {
      if (window.confirm(`Delete the "${card.querySelector('.col-name-input').value || col.name}" column?\n\nExisting task data in this column will no longer display.`)) {
        card.remove();
      }
    });
  }

  return card;
}

function defaultItemColor(col, name) {
  if (col.colors && col.colors[name]) return col.colors[name];
  if (col.id === 'tags')     return getTagColors(name)?.[0]     || '#6c8ef5';
  if (col.id === 'priority') return getPriorityColors(name)?.[0] || '#6c8ef5';
  return '#6c8ef5';
}

function collectColumnsFromManager() {
  return [...document.querySelectorAll('#col-manager-container .col-card')].map(card => {
    const id       = card.dataset.colId;
    const existing = (config.customColumns || []).find(c => c.id === id) || {};
    const { names, colors } = collectItemList(`col-items-${id}`);
    return {
      ...existing,
      id,
      name:   (card.querySelector('.col-name-input').value || '').trim() || existing.name || id,
      items:  names,
      colors,
    };
  });
}

function setupCardDrag(container) {
  let dragSrc = null;
  container.querySelectorAll('.col-card').forEach(card => {
    card.addEventListener('dragstart', e => {
      dragSrc = card;
      e.dataTransfer.effectAllowed = 'move';
      setTimeout(() => card.classList.add('dragging'), 0);
    });
    card.addEventListener('dragend', () => {
      card.classList.remove('dragging');
      container.querySelectorAll('.col-card').forEach(c => c.classList.remove('drag-over'));
    });
    card.addEventListener('dragover', e => {
      e.preventDefault();
      container.querySelectorAll('.col-card').forEach(c => c.classList.remove('drag-over'));
      if (dragSrc !== card) card.classList.add('drag-over');
    });
    card.addEventListener('dragleave', () => card.classList.remove('drag-over'));
    card.addEventListener('drop', e => {
      e.stopPropagation();
      if (dragSrc && dragSrc !== card) {
        const rect = card.getBoundingClientRect();
        e.clientY < rect.top + rect.height / 2
          ? container.insertBefore(dragSrc, card)
          : card.after(dragSrc);
      }
      container.querySelectorAll('.col-card').forEach(c => c.classList.remove('drag-over'));
    });
  });
}

function makeListItem(name, color) {
  const item = document.createElement('div');
  item.className = 'item-list-row';
  item.draggable = true;
  item.innerHTML = `
    <span class="list-drag-handle" title="Drag to reorder">⠿</span>
    <input type="color" class="list-item-color" value="${color}" title="Pick color"/>
    <input type="text" class="list-item-name form-input" value="${esc(name)}" placeholder="Item name…"/>
    <button class="list-item-del" title="Remove">&#128465;</button>`;
  item.querySelector('.list-item-del').addEventListener('click', () => item.remove());
  item.querySelector('.list-item-color').addEventListener('input', e => {
    e.target.style.setProperty('--swatch', e.target.value);
  });
  return item;
}

function setupListDrag(container) {
  let dragSrc = null;
  container.querySelectorAll('.item-list-row').forEach(item => {
    item.addEventListener('dragstart', e => {
      dragSrc = item;
      e.dataTransfer.effectAllowed = 'move';
      setTimeout(() => item.classList.add('dragging'), 0);
    });
    item.addEventListener('dragend', () => {
      item.classList.remove('dragging');
      container.querySelectorAll('.item-list-row').forEach(i => i.classList.remove('drag-over'));
    });
    item.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      container.querySelectorAll('.item-list-row').forEach(i => i.classList.remove('drag-over'));
      if (dragSrc !== item) item.classList.add('drag-over');
    });
    item.addEventListener('dragleave', () => item.classList.remove('drag-over'));
    item.addEventListener('drop', e => {
      e.stopPropagation();
      if (dragSrc && dragSrc !== item) {
        const rect = item.getBoundingClientRect();
        if (e.clientY < rect.top + rect.height / 2) {
          container.insertBefore(dragSrc, item);
        } else {
          item.after(dragSrc);
        }
      }
      container.querySelectorAll('.item-list-row').forEach(i => i.classList.remove('drag-over'));
    });
  });
}

function collectItemList(listId) {
  const names = [], colors = {};
  document.querySelectorAll(`#${listId} .item-list-row`).forEach(row => {
    const name  = row.querySelector('.list-item-name').value.trim();
    const color = row.querySelector('.list-item-color').value;
    if (name) { names.push(name); colors[name] = color; }
  });
  return { names, colors };
}

function splitList(str) {
  return str.split(',').map(s => s.trim()).filter(Boolean);
}

/* ── Utility ────────────────────────────────────────────────────────────── */
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

/* ══════════════════════════════════════════════════════════════════════════
   BACKGROUND IMAGE
   ══════════════════════════════════════════════════════════════════════════ */

function getBgImagesForNow() {
  const bg = config.backgrounds || { default: [], periods: [] };
  const hour = new Date().getHours();
  for (const p of (bg.periods || [])) {
    if (hour >= p.start && hour < p.end && p.images && p.images.length) {
      return p.images;
    }
  }
  return bg.default || [];
}

async function applyHeroBg() {
  const hero = document.querySelector('.dash-hero');
  if (!hero) return;

  const images = getBgImagesForNow();
  if (!images.length) {
    hero.style.backgroundImage = '';
    hero.classList.remove('has-bg-image');
    return;
  }

  const filename = images[Math.floor(Math.random() * images.length)];
  const dataUrl = await window.api.bgGetData(filename);
  if (dataUrl) {
    hero.style.backgroundImage = `url("${dataUrl}")`;
    hero.classList.add('has-bg-image');
  }
}

function startBgRotation() {
  stopBgRotation();
  const images = getBgImagesForNow();
  if (images.length > 1) {
    bgRotateTimer = setInterval(applyHeroBg, 5 * 60 * 1000); // rotate every 5 min
  }
}

function stopBgRotation() {
  if (bgRotateTimer) { clearInterval(bgRotateTimer); bgRotateTimer = null; }
}

/* ══════════════════════════════════════════════════════════════════════════
   BACKGROUND SETTINGS
   ══════════════════════════════════════════════════════════════════════════ */

async function setupBgSettings() {
  await renderBgDefault();
  await renderBgPeriods();

  document.getElementById('btn-bg-add-default').addEventListener('click', async () => {
    const filenames = await window.api.bgAddImages();
    if (!filenames.length) return;
    const bg = config.backgrounds || { default: [], periods: [] };
    bg.default = [...(bg.default || []), ...filenames];
    config.backgrounds = bg;
    await window.api.saveConfig({ backgrounds: bg });
    await renderBgDefault();
    applyHeroBg();
  });

  document.getElementById('btn-bg-add-period').addEventListener('click', () => {
    const bg = config.backgrounds || { default: [], periods: [] };
    bg.periods = bg.periods || [];
    bg.periods.push({ id: genBgId(), start: 6, end: 12, images: [] });
    config.backgrounds = bg;
    renderBgPeriods();
  });
}

function genBgId() {
  return Math.random().toString(36).slice(2, 9);
}

async function renderBgDefault() {
  const bg = config.backgrounds || { default: [], periods: [] };
  const container = document.getElementById('bg-default-thumbs');
  await renderThumbRow(container, bg.default || [], async (filename) => {
    bg.default = bg.default.filter(f => f !== filename);
    config.backgrounds = bg;
    await window.api.saveConfig({ backgrounds: bg });
    await window.api.bgRemoveImage(filename);
    await renderBgDefault();
    applyHeroBg();
  });
}

async function renderBgPeriods() {
  const bg = config.backgrounds || { default: [], periods: [] };
  const container = document.getElementById('bg-periods-list');
  container.innerHTML = '';

  for (const period of (bg.periods || [])) {
    const row = document.createElement('div');
    row.className = 'bg-period-row';
    row.dataset.id = period.id;

    // Time range selectors
    const hourOptions = Array.from({ length: 24 }, (_, i) =>
      `<option value="${i}" ${i === period.start ? 'selected' : ''}>${String(i).padStart(2,'0')}:00</option>`
    ).join('');
    const hourOptionsEnd = Array.from({ length: 24 }, (_, i) =>
      `<option value="${i}" ${i === period.end ? 'selected' : ''}>${String(i).padStart(2,'0')}:00</option>`
    ).join('');

    row.innerHTML = `
      <div class="bg-period-top">
        <div class="bg-period-time">
          <select class="bg-sel-start">${hourOptions}</select>
          <span>–</span>
          <select class="bg-sel-end">${hourOptionsEnd}</select>
        </div>
        <div class="bg-period-actions">
          <button class="btn btn-secondary btn-sm bg-period-add-img">+ Images</button>
          <button class="btn btn-danger btn-sm bg-period-delete">Delete</button>
        </div>
      </div>
      <div class="bg-thumb-row bg-period-thumbs"></div>`;

    container.appendChild(row);

    // Render existing thumbnails
    await renderThumbRow(row.querySelector('.bg-period-thumbs'), period.images || [], async (filename) => {
      period.images = period.images.filter(f => f !== filename);
      await window.api.saveConfig({ backgrounds: bg });
      await window.api.bgRemoveImage(filename);
      await renderBgPeriods();
      applyHeroBg();
    });

    // Time change handlers
    row.querySelector('.bg-sel-start').addEventListener('change', async (e) => {
      period.start = parseInt(e.target.value);
      await window.api.saveConfig({ backgrounds: bg });
    });
    row.querySelector('.bg-sel-end').addEventListener('change', async (e) => {
      period.end = parseInt(e.target.value);
      await window.api.saveConfig({ backgrounds: bg });
    });

    // Add images to period
    row.querySelector('.bg-period-add-img').addEventListener('click', async () => {
      const filenames = await window.api.bgAddImages();
      if (!filenames.length) return;
      period.images = [...(period.images || []), ...filenames];
      await window.api.saveConfig({ backgrounds: bg });
      await renderBgPeriods();
      applyHeroBg();
    });

    // Delete period
    row.querySelector('.bg-period-delete').addEventListener('click', async () => {
      // Remove image files that aren't used elsewhere
      const allOtherImages = [
        ...(bg.default || []),
        ...bg.periods.filter(p => p.id !== period.id).flatMap(p => p.images || []),
      ];
      for (const f of (period.images || [])) {
        if (!allOtherImages.includes(f)) await window.api.bgRemoveImage(f);
      }
      bg.periods = bg.periods.filter(p => p.id !== period.id);
      config.backgrounds = bg;
      await window.api.saveConfig({ backgrounds: bg });
      await renderBgPeriods();
      applyHeroBg();
    });
  }
}

async function renderThumbRow(container, filenames, onRemove) {
  container.innerHTML = '';
  if (!filenames.length) return;
  const dataUrls = await window.api.bgGetThumbs(filenames);
  filenames.forEach((filename, i) => {
    if (!dataUrls[i]) return;
    const wrap = document.createElement('div');
    wrap.className = 'bg-thumb';

    const img = document.createElement('img');
    img.alt = 'background';
    img.src = dataUrls[i]; // set via property to handle large base64 safely

    const removeBtn = document.createElement('button');
    removeBtn.className = 'bg-thumb-remove';
    removeBtn.title = 'Remove';
    removeBtn.textContent = '×';
    removeBtn.addEventListener('click', () => onRemove(filename));

    wrap.appendChild(img);
    wrap.appendChild(removeBtn);
    container.appendChild(wrap);
  });
}

/* ══════════════════════════════════════════════════════════════════════════
   DASHBOARD
   ══════════════════════════════════════════════════════════════════════════ */

const DAY_NAMES  = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const MON_NAMES  = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const MON_SHORT  = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAY_SHORT  = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function fmtFullDate(d) {
  return `${DAY_NAMES[d.getDay()]}, ${MON_NAMES[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

function fmtEventTime(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function fmtShortDate(isoStr) {
  const d = new Date(isoStr + (isoStr.length === 10 ? 'T00:00:00' : ''));
  return `${MON_SHORT[d.getMonth()]} ${d.getDate()}`;
}

function dateStrFromIso(isoStr) {
  // Works for both "2026-04-30" and "2026-04-30T09:00:00+08:00"
  return isoStr.slice(0, 10);
}

async function renderDashboard() {
  const today = todayStr();
  const now   = new Date();

  // Background image
  await applyHeroBg();
  startBgRotation();

  // Greeting + date
  document.getElementById('dash-greeting').textContent = `${greeting()}!`;
  document.getElementById('dash-date').textContent = fmtFullDate(now);

  // Stat: tasks today
  const tasksToday = tasks.filter(t => t.Date === today);
  document.getElementById('stat-tasks-today').textContent = tasksToday.length;

  // Stat: overdue
  const overdue = tasks.filter(t => {
    if (!t.Deadline) return false;
    return new Date(t.Deadline) < new Date(today + 'T00:00:00');
  });
  document.getElementById('stat-overdue').textContent = overdue.length;

  // Stat: due this week
  const weekEnd = new Date(today + 'T00:00:00');
  weekEnd.setDate(weekEnd.getDate() + 7);
  const dueWeek = tasks.filter(t => {
    if (!t.Deadline) return false;
    const d = new Date(t.Deadline);
    return d >= new Date(today + 'T00:00:00') && d <= weekEnd;
  });
  document.getElementById('stat-due-week').textContent = dueWeek.length;

  // Calendar events
  const calStatus = await window.api.calendarStatus();
  const badge = document.getElementById('dash-cal-badge');
  if (calStatus.connected) {
    badge.textContent = 'Connected';
    badge.className = 'dash-conn-badge connected';

    const t7 = new Date(); t7.setDate(t7.getDate() + 7); t7.setHours(23, 59, 59, 999);
    const evRes = await window.api.getCalendarEvents({
      timeMin: new Date(today + 'T00:00:00').toISOString(),
      timeMax: t7.toISOString(),
    });

    if (evRes.ok) {
      const allEvents = evRes.data;
      document.getElementById('stat-events-today').textContent =
        allEvents.filter(e => dateStrFromIso(e.start) === today).length;

      renderDashEventList(
        allEvents.filter(e => dateStrFromIso(e.start) === today),
        'dash-events-today', false
      );
      renderDashEventList(
        allEvents.filter(e => dateStrFromIso(e.start) > today),
        'dash-events-upcoming', true
      );
    } else {
      document.getElementById('stat-events-today').textContent = '—';
      setDashPlaceholder('dash-events-today', 'Could not load events');
      setDashPlaceholder('dash-events-upcoming', 'Could not load events');
    }
  } else {
    badge.textContent = 'Not connected';
    badge.className = 'dash-conn-badge disconnected';
    document.getElementById('stat-events-today').textContent = '—';
    const cta = '<div class="dash-cal-cta">Connect Google Calendar in <a class="dash-settings-link">Settings</a> to see events.</div>';
    document.getElementById('dash-events-today').innerHTML = cta;
    document.getElementById('dash-events-upcoming').innerHTML = cta;
    document.querySelectorAll('.dash-settings-link').forEach(a => {
      a.addEventListener('click', () => {
        document.querySelector('[data-tab="settings"]').click();
      });
    });
  }

  // Tasks today
  renderDashTaskList(tasksToday, 'dash-tasks-today');

  // Upcoming deadlines (next 7 days, not overdue)
  renderDashDeadlineList(dueWeek, 'dash-deadlines-upcoming', today);

  // Dashboard quick actions
  document.getElementById('dash-btn-new-task').onclick = () => openAddModal();
  document.getElementById('dash-btn-new-event').onclick = () => openCalEventModal();
  document.getElementById('dash-btn-refresh').onclick = async () => {
    await loadAll();
    await renderDashboard();
  };
}

function setDashPlaceholder(id, msg) {
  document.getElementById(id).innerHTML = `<div class="dash-empty-state">${esc(msg)}</div>`;
}

function renderDashEventList(events, containerId, showDate) {
  const el = document.getElementById(containerId);
  if (!events.length) {
    el.innerHTML = '<div class="dash-empty-state">No events scheduled</div>';
    return;
  }
  el.innerHTML = events.slice(0, 8).map(ev => {
    const isAllDay = ev.allDay;
    const timeHtml = isAllDay
      ? `<span class="dash-ev-allday">All day</span>`
      : `<span class="dash-ev-time">${fmtEventTime(ev.start)}</span>`;
    const dateChip = showDate
      ? `<span class="dash-ev-date-chip">${fmtShortDate(ev.start)}</span>` : '';
    const sub = [
      isAllDay ? '' : `${fmtEventTime(ev.start)}–${fmtEventTime(ev.end)}`,
      ev.location,
    ].filter(Boolean).join(' · ');
    return `
      <div class="dash-ev-row" data-ev-id="${esc(ev.id)}">
        <div class="dash-ev-time-col">${timeHtml}</div>
        <div class="dash-ev-dot" style="background:${esc(ev.color)};color:${esc(ev.color)}"></div>
        <div class="dash-ev-body">
          <div class="dash-ev-title">${esc(ev.title)}</div>
          ${sub ? `<div class="dash-ev-sub">${esc(sub)}</div>` : ''}
        </div>
        ${dateChip}
      </div>`;
  }).join('');

  el.querySelectorAll('.dash-ev-row').forEach((row, i) => {
    const ev = events[i];
    if (ev) row.addEventListener('click', () => openCalViewModal(ev));
  });
}

function renderDashTaskList(taskList, containerId) {
  const el = document.getElementById(containerId);
  if (!taskList.length) {
    el.innerHTML = '<div class="dash-empty-state">No tasks for today</div>';
    return;
  }
  el.innerHTML = taskList.slice(0, 8).map(t => {
    const colors = getPriorityColors(t.Priority);
    const priStyle = colors ? `style="background:${colors[0]};color:${colors[1]}"` : `style="background:#1e2438;color:#5c6080"`;
    const priBadge = t.Priority
      ? `<span class="dash-task-pri" ${priStyle}>${esc(t.Priority)}</span>` : '';
    const firstTag = parseTags(t.Tags)[0];
    const tagColors = firstTag ? getTagColors(firstTag) : null;
    return `
      <div class="dash-task-row">
        <div class="dash-task-bullet" ${tagColors ? `style="background:${tagColors[0]}"` : ''}></div>
        <span class="dash-task-name">${esc(t.Items)}</span>
        ${priBadge}
      </div>`;
  }).join('');
}

function renderDashDeadlineList(taskList, containerId, today) {
  const el = document.getElementById(containerId);
  if (!taskList.length) {
    el.innerHTML = '<div class="dash-empty-state">No upcoming deadlines</div>';
    return;
  }
  const sorted = [...taskList].sort((a, b) => a.Deadline.localeCompare(b.Deadline));
  el.innerHTML = sorted.slice(0, 8).map(t => {
    const now = new Date(today + 'T00:00:00');
    const dl  = new Date(t.Deadline + 'T00:00:00');
    const diffDays = Math.round((dl - now) / 86400000);
    const isOverdue = diffDays < 0;
    const isSoon = diffDays <= 2 && !isOverdue;
    const badgeCls = isOverdue ? 'overdue' : isSoon ? 'soon' : 'normal';
    const badgeTxt = isOverdue ? 'Overdue' : diffDays === 0 ? 'Today' : `${diffDays}d`;
    return `
      <div class="dash-dl-row">
        <span class="dash-dl-badge ${badgeCls}">${badgeTxt}</span>
        <span class="dash-dl-name">${esc(t.Items)}</span>
        <span class="dash-dl-date">${fmtShortDate(t.Deadline)}</span>
      </div>`;
  }).join('');
}

/* ══════════════════════════════════════════════════════════════════════════
   CALENDAR WEEK VIEW
   ══════════════════════════════════════════════════════════════════════════ */

let calWeekStart = getWeekStart(new Date()); // Monday of current week
const CAL_START_HOUR = 7;   // 7 AM
const CAL_END_HOUR   = 22;  // 10 PM  (15 hours total)
const CAL_HOUR_PX    = 56;

function getWeekStart(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day; // shift to Monday
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function fmtWeekLabel(weekStart) {
  const weekEnd = addDays(weekStart, 6);
  const s = weekStart, e = weekEnd;
  if (s.getMonth() === e.getMonth()) {
    return `${MON_NAMES[s.getMonth()]} ${s.getDate()} – ${e.getDate()}, ${s.getFullYear()}`;
  }
  return `${MON_SHORT[s.getMonth()]} ${s.getDate()} – ${MON_SHORT[e.getMonth()]} ${e.getDate()}, ${e.getFullYear()}`;
}

async function loadCalendarWeek() {
  const weekView = document.getElementById('cal-week-view');
  const connNotice = document.getElementById('cal-conn-notice');
  document.getElementById('cal-week-label').textContent = fmtWeekLabel(calWeekStart);

  const calStatus = await window.api.calendarStatus();
  if (!calStatus.connected) {
    connNotice.innerHTML = 'Google Calendar not connected. <a id="cal-goto-settings">Go to Settings</a> to connect.';
    connNotice.classList.remove('hidden');
    document.getElementById('cal-goto-settings')?.addEventListener('click', () => {
      document.querySelector('[data-tab="settings"]').click();
    });
    weekView.innerHTML = '<div class="cal-loading">Connect Google Calendar to view events.</div>';
    return;
  }
  connNotice.classList.add('hidden');

  weekView.innerHTML = '<div class="cal-loading">Loading events…</div>';

  const timeMin = new Date(calWeekStart);
  const timeMax = addDays(calWeekStart, 7);
  timeMax.setHours(23, 59, 59, 999);

  const res = await window.api.getCalendarEvents({
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
  });

  if (!res.ok) {
    weekView.innerHTML = `<div class="cal-loading">Error: ${esc(res.error)}</div>`;
    return;
  }

  renderWeekGrid(res.data);
}

function renderWeekGrid(events) {
  const weekView = document.getElementById('cal-week-view');
  const today = todayStr();
  const days = Array.from({ length: 7 }, (_, i) => addDays(calWeekStart, i));

  // Separate all-day vs timed events
  const allDayEvs = events.filter(e => e.allDay);
  const timedEvs  = events.filter(e => !e.allDay);

  // ── Day headers ──
  const hdCells = days.map(d => {
    const ds = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const isToday = ds === today;
    return `
      <div class="cal-day-hd${isToday ? ' today' : ''}">
        <span class="cal-day-name">${DAY_SHORT[d.getDay()]}</span>
        <span class="cal-day-num">${d.getDate()}</span>
      </div>`;
  }).join('');

  // ── All-day row ──
  const allDayCells = days.map(d => {
    const ds = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const isToday = ds === today;
    const dayEvs = allDayEvs.filter(e => dateStrFromIso(e.start) <= ds && dateStrFromIso(e.end) > ds);
    const chips = dayEvs.map(e =>
      `<span class="cal-allday-chip" style="background:${esc(e.color)}" data-ev-id="${esc(e.id)}">${esc(e.title)}</span>`
    ).join('');
    return `<div class="cal-allday-cell${isToday ? ' today' : ''}">${chips}</div>`;
  }).join('');

  // ── Time labels ──
  const hours = Array.from({ length: CAL_END_HOUR - CAL_START_HOUR }, (_, i) => CAL_START_HOUR + i);
  const timeLabels = hours.map(h => {
    const label = h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h-12} PM`;
    return `<div class="cal-time-label">${label}</div>`;
  }).join('');

  // ── Day columns with timed events ──
  const dayCols = days.map(d => {
    const ds = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const isToday = ds === today;
    const dayEvs = timedEvs.filter(e => dateStrFromIso(e.start) === ds);

    // Half-hour guides
    const halfLines = hours.map((_, i) =>
      `<div class="cal-half-line" style="top:${i * CAL_HOUR_PX + CAL_HOUR_PX/2}px"></div>`
    ).join('');

    // Now indicator
    const nowLine = isToday ? (() => {
      const now = new Date();
      const mins = (now.getHours() - CAL_START_HOUR) * 60 + now.getMinutes();
      const top  = mins * (CAL_HOUR_PX / 60);
      if (top < 0 || top > (CAL_END_HOUR - CAL_START_HOUR) * CAL_HOUR_PX) return '';
      return `<div class="cal-now-line" style="top:${top}px"></div>`;
    })() : '';

    // Event blocks
    const blocks = dayEvs.map(e => {
      const st = new Date(e.start);
      const en = new Date(e.end);
      const startMins = (st.getHours() - CAL_START_HOUR) * 60 + st.getMinutes();
      const durMins   = (en - st) / 60000;
      const top    = Math.max(0, startMins * (CAL_HOUR_PX / 60));
      const height = Math.max(20, durMins * (CAL_HOUR_PX / 60));
      const timeTxt = `${fmtEventTime(e.start)} – ${fmtEventTime(e.end)}`;
      return `
        <div class="cal-event-block" data-ev-id="${esc(e.id)}"
             style="top:${top}px;height:${height}px;background:${esc(e.color)}">
          <div class="cal-event-block-title">${esc(e.title)}</div>
          ${height > 30 ? `<div class="cal-event-block-time">${esc(timeTxt)}</div>` : ''}
        </div>`;
    }).join('');

    return `
      <div class="cal-day-col${isToday ? ' today' : ''}" data-date="${esc(ds)}">
        ${halfLines}${nowLine}${blocks}
      </div>`;
  }).join('');

  weekView.innerHTML = `
    <div class="cal-day-headers">
      <div class="cal-time-gutter-hd"></div>
      ${hdCells}
    </div>
    <div class="cal-allday-row">
      <div class="cal-allday-gutter">All<br>day</div>
      ${allDayCells}
    </div>
    <div class="cal-body">
      <div class="cal-time-gutter">${timeLabels}</div>
      ${dayCols}
    </div>`;

  // Wire up event block clicks
  weekView.querySelectorAll('[data-ev-id]').forEach(el => {
    const evId = el.dataset.evId;
    const ev = events.find(e => e.id === evId);
    if (ev) el.addEventListener('click', (e) => { e.stopPropagation(); openCalViewModal(ev); });
  });

  // Click on empty day col area → new event on that day
  weekView.querySelectorAll('.cal-day-col').forEach(col => {
    col.addEventListener('click', (e) => {
      if (e.target !== col) return; // only bare column clicks
      openCalEventModal(col.dataset.date);
    });
  });

  // Scroll to current time (or 8am)
  const scrollTop = document.querySelector('.cal-scroll');
  if (scrollTop) {
    const now = new Date();
    const scrollHour = Math.max(CAL_START_HOUR, now.getHours() - 1);
    const offset = (scrollHour - CAL_START_HOUR) * CAL_HOUR_PX + 44 /* headers */;
    scrollTop.scrollTop = offset;
  }
}

/* ── Calendar navigation ─────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('cal-prev').addEventListener('click', () => {
    calWeekStart = addDays(calWeekStart, -7);
    loadCalendarWeek();
  });
  document.getElementById('cal-next').addEventListener('click', () => {
    calWeekStart = addDays(calWeekStart, 7);
    loadCalendarWeek();
  });
  document.getElementById('cal-today-btn').addEventListener('click', () => {
    calWeekStart = getWeekStart(new Date());
    loadCalendarWeek();
  });
  document.getElementById('cal-new-event').addEventListener('click', () => openCalEventModal());
});

/* ══════════════════════════════════════════════════════════════════════════
   CALENDAR EVENT MODALS
   ══════════════════════════════════════════════════════════════════════════ */

let viewingEvent = null;

function setupCalEventModal() {
  document.getElementById('btn-cal-event-close').addEventListener('click',  closeCalEventModal);
  document.getElementById('btn-cal-event-cancel').addEventListener('click', closeCalEventModal);
  document.getElementById('btn-cal-event-save').addEventListener('click',   saveCalEvent);
  document.getElementById('cal-event-modal-overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('cal-event-modal-overlay')) closeCalEventModal();
  });

  // All-day toggle
  document.getElementById('ce-allday').addEventListener('change', e => {
    const isAllDay = e.target.checked;
    document.getElementById('ce-start-row').style.display   = isAllDay ? 'none' : '';
    document.getElementById('ce-end-row').style.display     = isAllDay ? 'none' : '';
    document.getElementById('ce-enddate-row').style.display = isAllDay ? '' : 'none';
  });

  // View modal
  document.getElementById('btn-cal-view-close').addEventListener('click',  closeCalViewModal);
  document.getElementById('btn-cal-view-open').addEventListener('click', () => {
    if (viewingEvent?.htmlLink) window.api.openUrl(viewingEvent.htmlLink);
  });
  document.getElementById('btn-cal-view-delete').addEventListener('click', async () => {
    if (!viewingEvent) return;
    const btn = document.getElementById('btn-cal-view-delete');
    btn.disabled = true; btn.textContent = 'Deleting…';
    const res = await window.api.deleteCalendarEvent(viewingEvent.id);
    btn.disabled = false; btn.textContent = 'Delete';
    if (res.ok) {
      closeCalViewModal();
      loadCalendarWeek();
      renderDashboard();
    } else {
      alert('Delete failed: ' + res.error);
    }
  });
  document.getElementById('cal-view-modal-overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('cal-view-modal-overlay')) closeCalViewModal();
  });
}

function openCalEventModal(dateStr) {
  const d = dateStr || todayStr();
  document.getElementById('ce-title').value       = '';
  document.getElementById('ce-date').value        = d;
  document.getElementById('ce-enddate').value     = d;
  document.getElementById('ce-start').value       = '09:00';
  document.getElementById('ce-end').value         = '10:00';
  document.getElementById('ce-location').value    = '';
  document.getElementById('ce-description').value = '';
  document.getElementById('ce-allday').checked    = false;
  document.getElementById('ce-start-row').style.display   = '';
  document.getElementById('ce-end-row').style.display     = '';
  document.getElementById('ce-enddate-row').style.display = 'none';
  document.getElementById('cal-event-modal-overlay').classList.remove('hidden');
  document.getElementById('ce-title').focus();
}

function closeCalEventModal() {
  document.getElementById('cal-event-modal-overlay').classList.add('hidden');
}

async function saveCalEvent() {
  const title = document.getElementById('ce-title').value.trim();
  if (!title) { document.getElementById('ce-title').focus(); return; }

  const btn = document.getElementById('btn-cal-event-save');
  btn.disabled = true; btn.textContent = 'Creating…';

  const isAllDay = document.getElementById('ce-allday').checked;
  const date     = document.getElementById('ce-date').value;
  const endDate  = document.getElementById('ce-enddate').value || date;
  const startT   = document.getElementById('ce-start').value;
  const endT     = document.getElementById('ce-end').value;

  const data = {
    title,
    description: document.getElementById('ce-description').value,
    location:    document.getElementById('ce-location').value,
    allDay:      isAllDay,
    startDate:   date,
    endDate,
    startDateTime: isAllDay ? null : `${date}T${startT}:00`,
    endDateTime:   isAllDay ? null : `${date}T${endT}:00`,
  };

  const res = await window.api.createCalendarEvent(data);
  btn.disabled = false; btn.textContent = 'Create Event';

  if (res.ok) {
    closeCalEventModal();
    loadCalendarWeek();
    renderDashboard();
  } else {
    alert('Could not create event: ' + res.error);
  }
}

function openCalViewModal(ev) {
  viewingEvent = ev;
  document.getElementById('cal-view-title').textContent = ev.title;

  const isAllDay = ev.allDay;
  const timeLine = isAllDay
    ? 'All day'
    : `${fmtEventTime(ev.start)} – ${fmtEventTime(ev.end)}`;

  const dateLine = isAllDay
    ? fmtShortDate(ev.start)
    : `${fmtShortDate(ev.start)}`;

  let body = `<div style="margin-bottom:10px;display:flex;align-items:center;gap:8px">
    <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${esc(ev.color)};flex-shrink:0"></span>
    <strong>${esc(dateLine)}</strong> &nbsp;·&nbsp; ${esc(timeLine)}
  </div>`;
  if (ev.location)    body += `<div style="margin-bottom:6px;color:var(--text-muted)">📍 ${esc(ev.location)}</div>`;
  if (ev.description) body += `<div style="margin-top:10px;color:var(--text-muted);white-space:pre-wrap;font-size:12px">${esc(ev.description)}</div>`;

  document.getElementById('cal-view-body').innerHTML = body;
  document.getElementById('btn-cal-view-open').style.display = ev.htmlLink ? '' : 'none';
  document.getElementById('cal-view-modal-overlay').classList.remove('hidden');
}

function closeCalViewModal() {
  document.getElementById('cal-view-modal-overlay').classList.add('hidden');
  viewingEvent = null;
}

/* ══════════════════════════════════════════════════════════════════════════
   CALENDAR SETTINGS (in Settings tab)
   ══════════════════════════════════════════════════════════════════════════ */

function applyCalendarSettings() {
  refreshCalAuthStatus();

  document.getElementById('btn-cal-connect').addEventListener('click', async () => {
    // Save client ID / secret into config before connecting
    const credData = {
      calendarClientId:     document.getElementById('s-cal-client-id').value.trim(),
      calendarClientSecret: document.getElementById('s-cal-client-secret').value.trim(),
    };
    await window.api.saveConfig(credData);

    const statusEl = document.getElementById('cal-auth-status');
    statusEl.textContent = 'Opening browser for authorization…';
    statusEl.className = 'conn-status';

    const res = await window.api.calendarConnect();
    if (res.ok) {
      statusEl.textContent = '✓ Connected successfully';
      statusEl.className = 'conn-status ok';
    } else {
      statusEl.textContent = '✗ ' + res.error;
      statusEl.className = 'conn-status error';
    }
  });

  document.getElementById('btn-cal-disconnect').addEventListener('click', async () => {
    await window.api.calendarDisconnect();
    refreshCalAuthStatus();
  });
}

async function refreshCalAuthStatus() {
  const statusEl = document.getElementById('cal-auth-status');
  if (!statusEl) return;
  const s = await window.api.calendarStatus();
  if (s.connected) {
    statusEl.textContent = '✓ Calendar connected';
    statusEl.className = 'conn-status ok';
  } else {
    statusEl.textContent = 'Not connected';
    statusEl.className = 'conn-status';
  }
}
