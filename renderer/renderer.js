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

function getTypeColors(typeName) {
  if (!typeName) return null;
  // User-configured color takes priority
  const userBg = config.typeColors && config.typeColors[typeName];
  if (userBg) return [userBg, autoTextColor(userBg)];
  // Built-in named fallback
  const named = TYPE_NAMED_COLORS[typeName.toLowerCase()];
  if (named) return named;
  // Hash-based fallback
  const key = typeName.toLowerCase();
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
  container.querySelectorAll('.type-select').forEach(s => applyBadgeColor(s, getTypeColors));
  container.querySelectorAll('.priority-select').forEach(s => applyBadgeColor(s, getPriorityColors));
}

/* ── State ──────────────────────────────────────────────────────────────── */
let config = {};
let tasks = [];
let archived = [];
let sortState  = { col: 'Date', dir: 'desc' };
let filterState = {
  wl: { type: new Set(), priority: new Set(), pic: new Set(), project: new Set(), text: '' },
  ar: { type: new Set(), priority: new Set(), pic: new Set(), project: new Set(), text: '' },
};
let groupState = {
  wl: { field: '', collapsed: new Set() },
  ar: { field: '', collapsed: new Set() },
};
let editingTask = null;
let editingArchived = false;
let pendingDelete = null;

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

  config = await window.api.getConfig();
  applyConfigToSettings();

  if (config.credentialsPath && config.spreadsheetId) {
    setSyncStatus('Connecting…');
    const r = await window.api.initSheets();
    if (r.ok) {
      setSyncStatus('Connected', 'ok');
      await loadAll();
    } else {
      setSyncStatus('Not connected — check Settings', 'error');
      renderWorklog();
      renderArchived();
    }
  } else {
    setSyncStatus('Not configured — go to Settings', 'error');
    renderWorklog();
    renderArchived();
  }

  document.getElementById('btn-refresh').addEventListener('click', async () => {
    setSyncStatus('Refreshing…');
    await loadAll();
  });
});

/* ── Data loading ───────────────────────────────────────────────────────── */
async function loadAll() {
  const [t, a] = await Promise.all([window.api.getTasks(), window.api.getArchived()]);
  if (t.ok)  tasks    = t.data;
  if (a.ok)  archived = a.data;
  populateFilterOptions();
  renderWorklog();
  renderArchived();
  setSyncStatus(`Synced ${fmtTime(new Date())}`, 'ok');
}

// Describes each filter button/panel pair
const FILTER_CONFIGS = [
  { tab:'wl', key:'type',     btnId:'fb-wl-type',     panelId:'fp-wl-type',     label:'Type',     colorFn: n => getTypeColors(n)     },
  { tab:'wl', key:'priority', btnId:'fb-wl-priority', panelId:'fp-wl-priority', label:'Priority', colorFn: n => getPriorityColors(n) },
  { tab:'wl', key:'pic',      btnId:'fb-wl-pic',      panelId:'fp-wl-pic',      label:'PIC',      colorFn: null                      },
  { tab:'wl', key:'project',  btnId:'fb-wl-project',  panelId:'fp-wl-project',  label:'Project',  colorFn: null                      },
  { tab:'ar', key:'type',     btnId:'fb-ar-type',     panelId:'fp-ar-type',     label:'Type',     colorFn: n => getTypeColors(n)     },
  { tab:'ar', key:'priority', btnId:'fb-ar-priority', panelId:'fp-ar-priority', label:'Priority', colorFn: n => getPriorityColors(n) },
  { tab:'ar', key:'pic',      btnId:'fb-ar-pic',      panelId:'fp-ar-pic',      label:'PIC',      colorFn: null                      },
  { tab:'ar', key:'project',  btnId:'fb-ar-project',  panelId:'fp-ar-project',  label:'Project',  colorFn: null                      },
];

function populateFilterOptions() {
  const all = [...tasks, ...archived];
  const unique = key => [...new Set(all.map(t => t[key]).filter(Boolean))].sort();

  const values = { type: unique('Type'), priority: unique('Priority'), pic: unique('PIC'), project: unique('Project') };

  FILTER_CONFIGS.forEach(cfg => {
    buildFilterPanel(cfg, values[cfg.key]);
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
    });
  });
}

/* ── Row HTML templates ─────────────────────────────────────────────────── */
function worklogRowHtml(t) {
  return `
    <tr data-id="${t.ID}">
      <td class="col-status">
        <input type="checkbox" class="status-check" data-id="${t.ID}" title="Mark complete" />
      </td>
      <td class="col-date">
        <input type="date" class="inline-date" value="${t.Date}" data-id="${t.ID}" data-field="Date" />
      </td>
      <td class="col-items">
        <span class="editable" contenteditable="true" data-id="${t.ID}" data-field="Items">${esc(t.Items)}</span>
      </td>
      <td class="col-type">${makeSelect(t.ID, 'Type', t.Type, config.types, false)}</td>
      <td class="col-priority">${makeSelect(t.ID, 'Priority', t.Priority, config.priorities, true)}</td>
      <td class="col-pic">${makeSelect(t.ID, 'PIC', t.PIC, config.pics, false)}</td>
      <td class="col-deadline">
        <input type="date" class="inline-date" value="${t.Deadline}" data-id="${t.ID}" data-field="Deadline" />
      </td>
      <td class="col-project">
        ${t.Project ? `<span class="project-badge">${esc(t.Project)}</span>` : '<span class="remark-empty">—</span>'}
        <span class="editable project-editable" contenteditable="true" data-id="${t.ID}" data-field="Project" style="display:none">${esc(t.Project)}</span>
      </td>
      <td class="col-remark">
        <div class="remark-cell" data-id="${t.ID}">
          <div class="remark-view">${parseRemarkHtml(t.Remark)}</div>
          <textarea class="remark-edit" placeholder="Add remark… (paste URL or [label](url))" style="display:none">${esc(t.Remark)}</textarea>
        </div>
      </td>
      <td class="col-actions">
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
      <td class="col-type">${makeSelect(t.ID, 'Type', t.Type, config.types, false, true)}</td>
      <td class="col-priority">${makeSelect(t.ID, 'Priority', t.Priority, config.priorities, true, true)}</td>
      <td class="col-pic">${makeSelect(t.ID, 'PIC', t.PIC, config.pics, false, true)}</td>
      <td class="col-deadline">
        <input type="date" class="inline-date" value="${t.Deadline}" data-id="${t.ID}" data-field="Deadline" data-archived="1" />
      </td>
      <td class="col-completion">
        <input type="date" class="inline-date" value="${t.CompletionDate}" data-id="${t.ID}" data-field="CompletionDate" data-archived="1" />
      </td>
      <td class="col-project">
        ${t.Project ? `<span class="project-badge">${esc(t.Project)}</span>` : '<span class="remark-empty">—</span>'}
        <span class="editable project-editable" contenteditable="true" data-id="${t.ID}" data-field="Project" data-archived="1" style="display:none">${esc(t.Project)}</span>
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

  let html = '';
  groups.forEach((groupRows, key) => {
    const isCollapsed = collapsed.has(key);
    const colors = field === 'Type' ? getTypeColors(key)
                 : field === 'Priority' ? getPriorityColors(key) : null;
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

  if (!rows.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="10">No tasks. Click "+ New Task" to add one.</td></tr>';
    return;
  }

  tbody.innerHTML = gs.field
    ? renderGrouped(rows, gs.field, gs.collapsed, worklogRowHtml, 10)
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
  tbody.querySelectorAll('.type-select, .priority-select').forEach(sel => {
    const fn = sel.classList.contains('type-select') ? getTypeColors : getPriorityColors;
    sel.addEventListener('change', (e) => applyBadgeColor(e.target, fn));
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
  setupProjectCells(tbody);
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
    tbody.innerHTML = '<tr class="empty-row"><td colspan="10">No archived tasks yet.</td></tr>';
    return;
  }

  tbody.innerHTML = gs.field
    ? renderGrouped(rows, gs.field, gs.collapsed, archivedRowHtml, 10)
    : rows.map(archivedRowHtml).join('');

  tbody.querySelectorAll('.inline-date').forEach(inp => inp.addEventListener('change', onInlineChange));
  tbody.querySelectorAll('[contenteditable]').forEach(el => {
    el.addEventListener('blur', onInlineChange);
    el.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); el.blur(); } });
  });
  tbody.querySelectorAll('.editable-select').forEach(sel => sel.addEventListener('change', onInlineChange));
  tbody.querySelectorAll('.type-select, .priority-select').forEach(sel => {
    const fn = sel.classList.contains('type-select') ? getTypeColors : getPriorityColors;
    sel.addEventListener('change', (e) => applyBadgeColor(e.target, fn));
  });
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
  setupProjectCells(tbody);
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
    `<option value="${esc(o)}" ${o === value ? 'selected' : ''}>${esc(o)}</option>`
  ).join('');
  const archAttr = isArchived ? 'data-archived="1"' : '';

  if (field === 'Type') {
    const colors = getTypeColors(value);
    const style = colors
      ? `style="background:${colors[0]};color:${colors[1]};font-weight:600;border-radius:4px;padding:3px 6px;"`
      : '';
    return `<select class="editable-select type-select" data-id="${id}" data-field="${field}" ${archAttr} ${style}>${opts}</select>`;
  }

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
  try { return new URL(url).hostname.replace(/^www\./, ''); }
  catch { return url.length > 28 ? url.slice(0, 28) + '…' : url; }
}

function parseRemarkHtml(text) {
  if (!text) return '<span class="remark-empty">—</span>';
  const regex = /\[([^\]]*)\]\((https?:\/\/[^)]+)\)|(https?:\/\/\S+)/g;
  let html = '';
  let last = 0;
  let m;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) html += esc(text.slice(last, m.index)).replace(/\n/g, '<br>');
    if (m[1] !== undefined) {
      html += `<span class="link-chip" data-url="${esc(m[2])}" title="${esc(m[2])}">${esc(m[1])}</span>`;
    } else {
      html += `<span class="link-chip" data-url="${esc(m[3])}" title="${esc(m[3])}">${esc(getDomain(m[3]))}</span>`;
    }
    last = regex.lastIndex;
  }
  if (last < text.length) html += esc(text.slice(last)).replace(/\n/g, '<br>');
  return html || '<span class="remark-empty">—</span>';
}

function applyFilters(rows, fs) {
  if (fs.type.size > 0)     rows = rows.filter(t => fs.type.has(t.Type));
  if (fs.priority.size > 0) rows = rows.filter(t => fs.priority.has(t.Priority));
  if (fs.pic.size > 0)      rows = rows.filter(t => fs.pic.has(t.PIC));
  if (fs.project.size > 0)  rows = rows.filter(t => fs.project.has(t.Project));
  if (fs.text) {
    const q = fs.text.toLowerCase();
    rows = rows.filter(t =>
      [t.Items, t.Type, t.Priority, t.PIC, t.Remark, t.Project].some(v => (v||'').toLowerCase().includes(q))
    );
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
  // Toggle panels open/closed on button click
  FILTER_CONFIGS.forEach(cfg => {
    const btn = document.getElementById(cfg.btnId);
    const panel = document.getElementById(cfg.panelId);
    if (!btn || !panel) return;
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const isOpen = !panel.classList.contains('hidden');
      // Close all panels first
      document.querySelectorAll('.filter-panel').forEach(p => p.classList.add('hidden'));
      if (!isOpen) panel.classList.remove('hidden');
    });
  });

  // Click anywhere outside closes all panels
  document.addEventListener('click', () => {
    document.querySelectorAll('.filter-panel').forEach(p => p.classList.add('hidden'));
  });

  // Prevent clicks inside panel from bubbling to document
  document.querySelectorAll('.filter-panel').forEach(p => {
    p.addEventListener('click', e => e.stopPropagation());
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
  fillModalSelects();
  document.getElementById('f-date').value = todayStr();
  document.getElementById('f-deadline').value = '';
  document.getElementById('f-items').value = '';
  document.getElementById('f-remark').value = '';
  document.getElementById('f-project').value = '';
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
  fillModalSelects();
  document.getElementById('f-date').value = task.Date || '';
  document.getElementById('f-deadline').value = task.Deadline || '';
  document.getElementById('f-items').value = task.Items || '';
  document.getElementById('f-remark').value = task.Remark || '';
  document.getElementById('f-project').value = task.Project || '';
  document.getElementById('f-completion').value = task.CompletionDate || '';
  document.getElementById('f-type').value = task.Type || '';
  document.getElementById('f-priority').value = task.Priority || 'Normal';
  document.getElementById('f-pic').value = task.PIC || '';
  document.getElementById('f-completion-row').style.display = '';
  document.getElementById('modal-overlay').classList.remove('hidden');
}

function fillModalSelects() {
  fillSelect('f-type', config.types || []);
  fillSelect('f-priority', config.priorities || []);
  fillSelect('f-pic', config.pics || []);
  document.getElementById('f-priority').value = 'Normal';
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

  const data = {
    Date: document.getElementById('f-date').value,
    Items: items,
    Type: document.getElementById('f-type').value,
    Priority: document.getElementById('f-priority').value,
    PIC: document.getElementById('f-pic').value,
    Remark: document.getElementById('f-remark').value,
    Deadline: document.getElementById('f-deadline').value,
    CompletionDate: document.getElementById('f-completion').value,
    Project: document.getElementById('f-project').value.trim(),
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
  // Chip clicks — delegated so they fire even after re-render
  tbody.addEventListener('click', e => {
    const chip = e.target.closest('.link-chip');
    if (chip?.dataset.url) {
      e.stopPropagation();
      window.api.openUrl(chip.dataset.url);
    }
  });

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

/* ── Project cells (click badge → inline edit) ──────────────────────────── */
function setupProjectCells(tbody) {
  tbody.querySelectorAll('.col-project').forEach(cell => {
    const badge    = cell.querySelector('.project-badge, .remark-empty');
    const editable = cell.querySelector('.project-editable');
    if (!badge || !editable) return;

    badge.style.cursor = 'text';
    badge.addEventListener('click', () => {
      badge.style.display    = 'none';
      editable.style.display = 'inline-block';
      editable.focus();
      // Move cursor to end
      const range = document.createRange();
      range.selectNodeContents(editable);
      range.collapse(false);
      window.getSelection().removeAllRanges();
      window.getSelection().addRange(range);
    });

    editable.addEventListener('blur', async () => {
      const value = editable.innerText.trim();
      const id    = editable.dataset.id;
      const isAr  = !!editable.dataset.archived;
      const list  = isAr ? archived : tasks;
      const task  = list.find(t => t.ID === id);
      if (task && task.Project !== value) {
        task.Project = value;
        const res = isAr ? await window.api.updateArchived(task) : await window.api.updateTask(task);
        if (!res.ok) setSyncStatus('Save failed: ' + res.error, 'error');
        else setSyncStatus(`Saved ${fmtTime(new Date())}`, 'ok');
      }
      // Refresh badge display
      badge.outerHTML = value
        ? `<span class="project-badge" style="cursor:text">${esc(value)}</span>`
        : `<span class="remark-empty" style="cursor:text">—</span>`;
      editable.style.display = 'none';
      // Re-attach after DOM change by re-running setup on this cell
      setupProjectCells(tbody);
    });

    editable.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); editable.blur(); }
      if (e.key === 'Escape') {
        const task = (editable.dataset.archived ? archived : tasks).find(t => t.ID === editable.dataset.id);
        editable.innerText = task?.Project || '';
        editable.blur();
      }
    });
  });
}

/* ── Group By ───────────────────────────────────────────────────────────── */
const GROUP_FIELDS = [
  { value: '',         label: 'None' },
  { value: 'Type',     label: 'Type' },
  { value: 'Priority', label: 'Priority' },
  { value: 'PIC',      label: 'PIC' },
  { value: 'Project',  label: 'Project' },
];

function setupGroupBy() {
  [{ btnId: 'gb-btn-wl', panelId: 'gb-panel-wl', tab: 'wl' },
   { btnId: 'gb-btn-ar', panelId: 'gb-panel-ar', tab: 'ar' }
  ].forEach(cfg => {
    const btn   = document.getElementById(cfg.btnId);
    const panel = document.getElementById(cfg.panelId);
    if (!btn || !panel) return;

    btn.addEventListener('click', e => {
      e.stopPropagation();
      // Build radio list fresh each open so checked state is current
      panel.innerHTML = GROUP_FIELDS.map(f => `
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

      // Close all other panels, then toggle this one
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
  const label = GROUP_FIELDS.find(f => f.value === field)?.label || 'None';
  // Replace text node only (keep child spans)
  btn.childNodes[0].textContent = `⊞ Group: ${label} `;
  if (field) btn.classList.add('filter-active');
  else       btn.classList.remove('filter-active');
}

/* ── Settings ───────────────────────────────────────────────────────────── */
function renderColorGrid(containerId, items, colorsObj, fallbackFn) {
  const grid = document.getElementById(containerId);
  if (!grid) return;
  if (!items || !items.length) {
    grid.innerHTML = '<p style="color:var(--text-dim);font-size:12px;">No items configured yet.</p>';
    return;
  }
  grid.innerHTML = items.map(name => {
    const stored = colorsObj && colorsObj[name];
    const fallback = fallbackFn(name);
    const bg = stored || (fallback ? fallback[0] : '#1a1d27');
    return `
      <div class="color-row">
        <span class="color-row-label" style="background:${bg};color:${autoTextColor(bg)}">${esc(name)}</span>
        <input type="color" class="color-picker" data-name="${esc(name)}" value="${bg}" title="Pick color for ${esc(name)}" />
      </div>`;
  }).join('');
}

function applyConfigToSettings() {
  document.getElementById('s-cred-path').value   = config.credentialsPath || '';
  document.getElementById('s-sheet-id').value    = config.spreadsheetId || '';
  document.getElementById('s-types').value       = (config.types || []).join(', ');
  document.getElementById('s-priorities').value  = (config.priorities || []).join(', ');
  document.getElementById('s-pics').value        = (config.pics || []).join(', ');

  renderColorGrid('type-color-grid',     config.types || [],      config.typeColors || {},     getTypeColors);
  renderColorGrid('priority-color-grid', config.priorities || [], config.priorityColors || {}, getPriorityColors);

  // Live preview: update badge label color when picker changes
  document.getElementById('type-color-grid').addEventListener('input', e => {
    if (e.target.type !== 'color') return;
    const label = e.target.previousElementSibling;
    label.style.background = e.target.value;
    label.style.color = autoTextColor(e.target.value);
  });
  document.getElementById('priority-color-grid').addEventListener('input', e => {
    if (e.target.type !== 'color') return;
    const label = e.target.previousElementSibling;
    label.style.background = e.target.value;
    label.style.color = autoTextColor(e.target.value);
  });

  // Re-render color grids when type/priority lists change
  document.getElementById('s-types').addEventListener('change', () => {
    const types = splitList(document.getElementById('s-types').value);
    renderColorGrid('type-color-grid', types, config.typeColors || {}, getTypeColors);
  });
  document.getElementById('s-priorities').addEventListener('change', () => {
    const pris = splitList(document.getElementById('s-priorities').value);
    renderColorGrid('priority-color-grid', pris, config.priorityColors || {}, getPriorityColors);
  });

  document.getElementById('btn-browse-cred').addEventListener('click', async () => {
    const p = await window.api.pickFile();
    if (p) document.getElementById('s-cred-path').value = p;
  });

  document.getElementById('btn-test-conn').addEventListener('click', async () => {
    const statusEl = document.getElementById('conn-status');
    statusEl.textContent = 'Testing…';
    statusEl.className = 'conn-status';
    // Save current fields first
    await saveSettings(false);
    const r = await window.api.testConnection();
    if (r.ok) {
      statusEl.textContent = '✓ Connected successfully';
      statusEl.className = 'conn-status ok';
    } else {
      statusEl.textContent = '✗ ' + r.error;
      statusEl.className = 'conn-status error';
    }
  });

  document.getElementById('btn-save-settings').addEventListener('click', async () => {
    await saveSettings(true);
    config = await window.api.getConfig();
    renderColorGrid('type-color-grid',     config.types || [],      config.typeColors || {},     getTypeColors);
    renderColorGrid('priority-color-grid', config.priorities || [], config.priorityColors || {}, getPriorityColors);
    setSyncStatus('Reconnecting…');
    const r = await window.api.initSheets();
    if (r.ok) {
      setSyncStatus('Connected', 'ok');
      await loadAll();
    } else {
      setSyncStatus('Connection failed — check settings', 'error');
    }
  });
}

function collectColorMap(gridId) {
  const map = {};
  document.querySelectorAll(`#${gridId} .color-picker`).forEach(inp => {
    map[inp.dataset.name] = inp.value;
  });
  return map;
}

async function saveSettings(showStatus) {
  const statusEl = document.getElementById('settings-status');
  const data = {
    credentialsPath:  document.getElementById('s-cred-path').value.trim(),
    spreadsheetId:    document.getElementById('s-sheet-id').value.trim(),
    types:            splitList(document.getElementById('s-types').value),
    priorities:       splitList(document.getElementById('s-priorities').value),
    pics:             splitList(document.getElementById('s-pics').value),
    typeColors:       collectColorMap('type-color-grid'),
    priorityColors:   collectColorMap('priority-color-grid'),
  };
  await window.api.saveConfig(data);
  config = { ...config, ...data };
  if (showStatus) {
    statusEl.textContent = '✓ Settings saved';
    statusEl.className = 'conn-status ok';
    setTimeout(() => { statusEl.textContent = ''; }, 3000);
  }
}

function splitList(str) {
  return str.split(',').map(s => s.trim()).filter(Boolean);
}

/* ── Utility ────────────────────────────────────────────────────────────── */
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
