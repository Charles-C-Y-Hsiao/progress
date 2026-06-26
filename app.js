// 下載圖片 downloadUrl(pngUrl, `project-board-${formatDate(today)}.png`); 在captureBoardShell()
const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_DURATION_DAYS = 90;
const LAST3_TIMELINE_END_DAY = 24;
const MARKER_LAYOUT = {
  // 每一條次要進度條列高，數字越小，旗標/次要進度條彼此越靠近。
  rowHeight: 32,

  // 編輯區旗標列內部上方留白，只影響上方編輯面板。
  lanePaddingTop: 8,

  // 編輯區旗標列內部下方留白，只影響上方編輯面板。
  lanePaddingBottom: 14,

  // 編輯區從日期表頭頂部到旗標列開始的位置，數字越大，旗標列越往下。
  editLaneTop: 152,

  // 編輯區整個 timeline canvas 底部保留空間。
  editLaneBottom: 10,
};
const PROJECT_LAYOUT = {
  // 下方顯示區每個專案的主進度列高度。
  // mainRowHeight: 72,
  mainRowHeight: 45,

  // 主進度列與展開後次要進度條區塊之間的距離。
  mainToMarkerGap: 2,

  // 下方顯示區次要進度條區塊內，上方保留空白。
  markerLanePaddingTop: 0,

  
  markerLanePaddingBottom: 6, // 下方顯示區次要進度條區塊內，下方保留空白。
  rowPaddingBottom: 0, // 每個專案完整高度的額外底部緩衝，通常保持 0。
};

const boardHead = document.getElementById('boardHead');
const rowsEl = document.getElementById('projectRows');
const timelineScrollbar = document.getElementById('timelineScrollbar');
const boardShell = document.querySelector('.board-shell');
const editPanelHost = document.getElementById('editPanelHost');
const customerName = document.getElementById('customerName');
const addProjectBtn = document.getElementById('addProjectBtn');
const viewModeButtons = [...document.querySelectorAll('[data-view-mode]')];
const toggleSettingBtn = document.getElementById('toggleSettingBtn');
const captureBoardBtn = document.getElementById('captureBoardBtn');
const markerDialog = document.getElementById('markerDialog');
const markerForm = document.getElementById('markerForm');
const markerStartDate = document.getElementById('markerStartDate');
const markerEndDate = document.getElementById('markerEndDate');
const markerLabel = document.getElementById('markerLabel');
const cancelMarkerBtn = document.getElementById('cancelMarkerBtn');
const accountBtn = document.getElementById('accountBtn');
const accountLabel = document.getElementById('accountLabel');
const accountDialog = document.getElementById('accountDialog');
const accountForm = document.getElementById('accountForm');
const accountSelect = document.getElementById('accountSelect');
const accountInput = document.getElementById('accountInput');
const cancelAccountBtn = document.getElementById('cancelAccountBtn');

const DEFAULT_ACCOUNT_ID = '000666888';
const STATE_FILE_SUFFIX = 'progress-board.json';
const STATE_API_URL = '/api/progress-board';
const ACCOUNTS_API_URL = '/api/accounts';
const LAST_ACCOUNT_API_URL = '/api/last-account';
const LAST_ACCOUNT_STORAGE_KEY = 'progress-board-last-account';
const DEFAULT_NOW_MARKER = {
  label: 'Now',
  labelY: 58,
};

let activeAccountId = DEFAULT_ACCOUNT_ID;
let availableAccounts = [DEFAULT_ACCOUNT_ID];
let viewMode = 'full';
let settingHidden = false;
let editorFieldsHidden = false;
let editorFieldsEditable = false;
let activeMarkerProjectId = null;
let editingProjectId = null;
let activeConnectorId = null;
let pendingConnectorPort = null;
let boardMarkerFrame = null;
let nowMarker = { ...DEFAULT_NOW_MARKER };
let saveFileTimer = null;

const today = startOfDay(new Date());

let projects = getDefaultProjects();

function getDefaultProjects() {
  return [
    createProject('Retail Store Interior Design', 'Close', 90, 90, 0, [
    createMarker(22, 'Design approval', 90),
    createMarker(74, 'Acceptance', 90),
    ]),
    createProject('Entertainment Venue Fit-Out', 'Control', 72, 90, 14, [
    createMarker(36, 'Procurement', 90),
    ]),
    createProject('Classroom Renovation Plan', 'Start', 18, 90, 28, [
    createMarker(12, 'Draft', 90),
    ]),
    createProject('Medical Clinic Renovation', 'Execute', 54, 90, -10, [
    createMarker(30, 'Build', 90),
    ]),
    createProject('Retail Display Planning', 'Plan', 36, 90, 42, []),
    createProject('Cafe Interior Design', 'Close', 90, 90, 7, [
    createMarker(65, 'Opening', 90),
    ]),
  ];
}

function createProject(name, stage, progressDays, durationDays = DEFAULT_DURATION_DAYS, startOffsetDays = 0, markers = []) {
  const safeDuration = Math.max(1, Math.round(durationDays));
  return {
    id: crypto.randomUUID(),
    name,
    stage,
    startDate: formatDate(addDays(today, startOffsetDays)),
    durationDays: safeDuration,
    progressDays: clamp(Math.round(progressDays), 1, safeDuration),
    flagsExpanded: false,
    markers: markers.map((marker) => ({
      ...marker,
      day: clamp(marker.day, 1, safeDuration),
      startDay: clamp(marker.startDay || 1, 1, clamp(marker.day, 1, safeDuration)),
    })),
    markerLinks: [],
  };
}

function createMarker(day, label, durationDays = DEFAULT_DURATION_DAYS, startDay = 1) {
  const safeDay = clamp(Math.round(day), 1, durationDays);
  return {
    id: crypto.randomUUID(),
    startDay: clamp(Math.round(startDay), 1, safeDay),
    day: safeDay,
    label,
    boardHidden: false,
  };
}

function serializeState() {
  return {
    version: 1,
    accountId: activeAccountId,
    fileName: getStateFileName(),
    updatedAt: new Date().toISOString(),
    customerName: customerName.value,
    settingHidden,
    editorFieldsHidden,
    nowMarker: {
      label: nowMarker.label,
      labelY: nowMarker.labelY,
    },
    projects: projects.map((project) => ({
      id: project.id,
      name: project.name,
      stage: project.stage,
      startDate: project.startDate,
      durationDays: project.durationDays,
      progressDays: project.progressDays,
      flagsExpanded: project.flagsExpanded,
      markers: project.markers.map((marker) => ({
        id: marker.id,
        startDay: marker.startDay,
        day: marker.day,
        label: marker.label,
        boardHidden: marker.boardHidden,
      })),
      markerLinks: project.markerLinks.map((link) => ({
        id: link.id,
        fromMarkerId: link.fromMarkerId,
        fromPort: link.fromPort,
        toMarkerId: link.toMarkerId,
        toPort: link.toPort,
        offsetX: link.offsetX,
        offsetY: link.offsetY,
        elbowXRatio: link.elbowXRatio,
        elbowYRatio: link.elbowYRatio,
        elbowDate: link.elbowDate,
      })),
    })),
  };
}

function hydrateState(state) {
  if (!state || typeof state !== 'object') return;

  if (typeof state.customerName === 'string') {
    customerName.value = state.customerName;
  }
  if (typeof state.settingHidden === 'boolean') {
    settingHidden = state.settingHidden;
  }
  if (typeof state.editorFieldsHidden === 'boolean') {
    editorFieldsHidden = state.editorFieldsHidden;
  }
  if (state.nowMarker && typeof state.nowMarker === 'object') {
    nowMarker = {
      label: typeof state.nowMarker.label === 'string' && state.nowMarker.label.trim()
        ? state.nowMarker.label
        : DEFAULT_NOW_MARKER.label,
      labelY: Number.isFinite(Number(state.nowMarker.labelY))
        ? Number(state.nowMarker.labelY)
        : DEFAULT_NOW_MARKER.labelY,
    };
  }
  if (Array.isArray(state.projects)) {
    projects = state.projects.map((project) => ({
      id: project.id || crypto.randomUUID(),
      name: project.name || 'Untitled Project',
      stage: project.stage || 'Plan',
      startDate: project.startDate || formatDate(today),
      durationDays: Math.max(1, Math.round(Number(project.durationDays || DEFAULT_DURATION_DAYS))),
      progressDays: Math.max(1, Math.round(Number(project.progressDays || 1))),
      flagsExpanded: Boolean(project.flagsExpanded),
      markers: Array.isArray(project.markers)
        ? project.markers.map((marker) => ({
          id: marker.id || crypto.randomUUID(),
          startDay: Math.max(1, Math.round(Number(marker.startDay || 1))),
          day: Math.max(1, Math.round(Number(marker.day || 1))),
          label: marker.label || '',
          boardHidden: Boolean(marker.boardHidden),
        }))
        : [],
      markerLinks: Array.isArray(project.markerLinks)
        ? project.markerLinks.map((link) => ({
          id: link.id || crypto.randomUUID(),
          fromMarkerId: link.fromMarkerId || '',
          fromPort: link.fromPort || 'right',
          toMarkerId: link.toMarkerId || '',
          toPort: link.toPort || 'left',
          offsetX: Math.round(Number(link.offsetX || 0)),
          offsetY: Math.round(Number(link.offsetY || 0)),
          elbowXRatio: Number.isFinite(Number(link.elbowXRatio)) ? Number(link.elbowXRatio) : null,
          elbowYRatio: Number.isFinite(Number(link.elbowYRatio)) ? Number(link.elbowYRatio) : null,
          elbowDate: typeof link.elbowDate === 'string' ? link.elbowDate : '',
        }))
        : [],
    }));
  }
}

function resetStateToDefault() {
  customerName.value = 'Project Management';
  settingHidden = false;
  editorFieldsHidden = false;
  editorFieldsEditable = false;
  activeMarkerProjectId = null;
  editingProjectId = null;
  activeConnectorId = null;
  pendingConnectorPort = null;
  nowMarker = { ...DEFAULT_NOW_MARKER };
  projects = getDefaultProjects();
}

function getStateFileName(accountId = activeAccountId) {
  return `${accountId}-${STATE_FILE_SUFFIX}`;
}

function getStorageKey(accountId = activeAccountId) {
  return `${accountId}-progress-board-state`;
}

function getAccountIdFromFileName(fileName) {
  return String(fileName || '').split('-')[0] || DEFAULT_ACCOUNT_ID;
}

function normalizeAccountId(value) {
  return String(value || '').trim().replace(/[^a-zA-Z0-9_]/g, '');
}

function updateAccountControls() {
  accountLabel.textContent = `Hi, ${activeAccountId}`;
  accountSelect.innerHTML = availableAccounts
    .map((accountId) => `<option value="${escapeAttr(accountId)}" ${accountId === activeAccountId ? 'selected' : ''}>${escapeHtml(accountId)}</option>`)
    .join('');
}

function rememberActiveAccount() {
  try {
    localStorage.setItem(LAST_ACCOUNT_STORAGE_KEY, activeAccountId);
  } catch (error) {
    console.warn('Unable to remember account locally', error);
  }
  saveLastAccountFile(activeAccountId);
}

async function loadLastAccount() {
  try {
    const response = await fetch(LAST_ACCOUNT_API_URL, { cache: 'no-store' });
    if (response.ok) {
      const data = await response.json();
      const savedAccountId = normalizeAccountId(data.accountId);
      if (savedAccountId) {
        activeAccountId = savedAccountId;
        return;
      }
    }
  } catch (error) {
    console.warn('Unable to load last account file', error);
  }

  try {
    const savedAccountId = normalizeAccountId(localStorage.getItem(LAST_ACCOUNT_STORAGE_KEY));
    if (savedAccountId) activeAccountId = savedAccountId;
  } catch (error) {
    console.warn('Unable to load last account locally', error);
  }
}

async function saveLastAccountFile(accountId) {
  try {
    await fetch(LAST_ACCOUNT_API_URL, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ accountId }),
    });
  } catch (error) {
    console.warn('Unable to save last account file', error);
  }
}

function saveState() {
  const state = serializeState();
  try {
    localStorage.setItem(getStorageKey(), JSON.stringify(state));
  } catch (error) {
    console.warn('Unable to save project state', error);
  }
  scheduleStateFileSave(state);
}

async function loadState() {
  try {
    const fileState = await loadStateFile();
    if (fileState) {
      hydrateState(fileState);
      return;
    }

    const rawState = localStorage.getItem(getStorageKey());
    if (rawState) hydrateState(JSON.parse(rawState));
  } catch (error) {
    console.warn('Unable to load project state', error);
  }
}

async function loadStateFile() {
  try {
    const response = await fetch(`${STATE_API_URL}?account=${encodeURIComponent(activeAccountId)}`, { cache: 'no-store' });
    if (!response.ok) return null;
    const state = await response.json();
    if (state.fileName) activeAccountId = getAccountIdFromFileName(state.fileName);
    return state;
  } catch (error) {
    console.warn(`Unable to load ${getStateFileName()}`, error);
    return null;
  }
}

function scheduleStateFileSave(state) {
  window.clearTimeout(saveFileTimer);
  saveFileTimer = window.setTimeout(() => {
    saveStateFile(state);
  }, 400);
}

async function saveStateFile(state) {
  try {
    const response = await fetch(`${STATE_API_URL}?account=${encodeURIComponent(activeAccountId)}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(state),
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
  } catch (error) {
    console.warn(`Unable to save ${getStateFileName()}`, error);
  }
}

async function loadAccountList() {
  try {
    const response = await fetch(ACCOUNTS_API_URL, { cache: 'no-store' });
    if (!response.ok) return;
    const data = await response.json();
    if (Array.isArray(data.accounts) && data.accounts.length) {
      availableAccounts = [...new Set(data.accounts.map((item) => normalizeAccountId(item)).filter(Boolean))];
    }
  } catch (error) {
    console.warn('Unable to load account list', error);
  } finally {
    if (!availableAccounts.includes(activeAccountId)) availableAccounts.unshift(activeAccountId);
    updateAccountControls();
  }
}

async function switchAccount(nextAccountId, createIfMissing = false) {
  const normalizedAccountId = normalizeAccountId(nextAccountId);
  if (!normalizedAccountId) return;

  await saveStateFile(serializeState());
  activeAccountId = normalizedAccountId;
  rememberActiveAccount();
  if (!availableAccounts.includes(activeAccountId)) availableAccounts.push(activeAccountId);

  const fileState = await loadStateFile();
  if (fileState) {
    hydrateState(fileState);
  } else if (createIfMissing) {
    resetStateToDefault();
    await saveStateFile(serializeState());
  } else {
    const rawState = localStorage.getItem(getStorageKey());
    if (rawState) hydrateState(JSON.parse(rawState));
  }

  editingProjectId = null;
  activeConnectorId = null;
  fitCompanyInput();
  updateAccountControls();
  render();
}

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function parseDate(value) {
  return startOfDay(new Date(`${value}T00:00:00`));
}

function addDays(date, days) {
  return new Date(date.getTime() + days * DAY_MS);
}

function addMonths(date, months) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return startOfDay(next);
}

function dateFromProjectDay(project, day) {
  return addDays(parseDate(project.startDate), day - 1);
}

function dayFromDate(project, dateValue) {
  const selected = parseDate(dateValue);
  const start = parseDate(project.startDate);
  return clamp(Math.round((selected - start) / DAY_MS) + 1, 1, project.durationDays);
}

function projectEndDate(project) {
  return formatDate(addDays(parseDate(project.startDate), project.durationDays - 1));
}

function formatDate(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function monthLabel(date) {
  return date.toLocaleString('en-US', { month: 'long', year: 'numeric' });
}

function timelineMonthLabel(date) {
  const month = date.toLocaleString('en-US', { month: 'short' });
  const year = String(date.getFullYear()).slice(-2);
  return `${month}'${year}`;
}

function markerDateLabel(date) {
  const month = date.toLocaleString('en-US', { month: 'short' });
  const day = String(date.getDate()).padStart(2, '0');
  return `${month}/${day}`;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function progressPercent(project) {
  return Math.round((project.progressDays / project.durationDays) * 100);
}

function markerLabelWidth(label, dateLabel) {
  const textLength = Math.max(3, String(label || '').length);
  const dateLength = Math.max(5, String(dateLabel || '').length);
  // return clamp(72 + dateLength * 6 + textLength * 7, 140, 360);
  return clamp(28 + dateLength * 5 + textLength * 6, 80, 300);
}

function boardMarkers(project) {
  return project.markers.filter((marker) => !marker.boardHidden);
}

function markerLaneTop(extraTop = 0, baseTop = MARKER_LAYOUT.lanePaddingTop) {
  return baseTop + extraTop;
}

function markerLaneHeight(
  markerRows,
  extraTop = 0,
  baseTop = MARKER_LAYOUT.lanePaddingTop,
  baseBottom = MARKER_LAYOUT.lanePaddingBottom,
) {
  return markerLaneTop(extraTop, baseTop) + markerRows * MARKER_LAYOUT.rowHeight + baseBottom;
}

function projectRowLayout(project) {
  const markerRows = project.flagsExpanded ? boardMarkers(project).length : 0;
  const markerHeight = markerRows > 0
    ? markerLaneHeight(
      markerRows,
      PROJECT_LAYOUT.mainToMarkerGap,
      PROJECT_LAYOUT.markerLanePaddingTop,
      PROJECT_LAYOUT.markerLanePaddingBottom,
    )
    : 0;
  return {
    mainHeight: PROJECT_LAYOUT.mainRowHeight,
    mainBarTop: Math.round((PROJECT_LAYOUT.mainRowHeight - 18) / 2),
    markerHeight,
    totalHeight: PROJECT_LAYOUT.mainRowHeight + markerHeight + PROJECT_LAYOUT.rowPaddingBottom,
  };
}

function normalizeProject(project) {
  project.durationDays = Math.max(1, Math.round(project.durationDays));
  project.progressDays = clamp(Math.round(project.progressDays), 1, project.durationDays);
  project.startDate = project.startDate || formatDate(today);
  project.flagsExpanded = Boolean(project.flagsExpanded);
  project.markers.forEach((marker) => {
    marker.day = clamp(Math.round(marker.day), 1, project.durationDays);
    marker.startDay = clamp(Math.round(Number(marker.startDay || 1)), 1, marker.day);
  });
  project.markerLinks = Array.isArray(project.markerLinks) ? project.markerLinks.filter((link) => (
    project.markers.some((marker) => marker.id === link.fromMarkerId)
    && project.markers.some((marker) => marker.id === link.toMarkerId)
    && ['top', 'top-1', 'top-2', 'right', 'bottom', 'bottom-1', 'bottom-2', 'left'].includes(link.fromPort)
    && ['top', 'top-1', 'top-2', 'right', 'bottom', 'bottom-1', 'bottom-2', 'left'].includes(link.toPort)
  )).map((link) => ({
    ...link,
    elbowXRatio: Number.isFinite(Number(link.elbowXRatio)) ? clamp(Number(link.elbowXRatio), 0, 1) : null,
    elbowYRatio: Number.isFinite(Number(link.elbowYRatio)) ? clamp(Number(link.elbowYRatio), 0, 1) : null,
    elbowDate: typeof link.elbowDate === 'string' && !Number.isNaN(parseDate(link.elbowDate).getTime()) ? link.elbowDate : '',
  })) : [];
  if (activeConnectorId && !project.markerLinks.some((link) => link.id === activeConnectorId)) {
    activeConnectorId = null;
  }
}

function getTimelineRange() {
  const starts = projects.map((project) => parseDate(project.startDate).getTime());
  const ends = projects.map((project) => parseDate(projectEndDate(project)).getTime());
  const start = new Date(Math.min(...starts));

  if (viewMode === 'last3') {
    return {
      start,
      end: getLast3TimelineEndDate(start),
    };
  }

  return {
    start,
    end: new Date(Math.max(...ends)),
  };
}

function getLast3TimelineDayCount() {
  const starts = projects.map((project) => parseDate(project.startDate).getTime());
  const start = new Date(Math.min(...starts));
  const end = getLast3TimelineEndDate(start);
  return Math.round((end - start) / DAY_MS) + 1;
}

function getLast3TimelineEndDate(start) {
  const targetMonth = addMonths(start, 3);
  return startOfDay(new Date(targetMonth.getFullYear(), targetMonth.getMonth(), LAST3_TIMELINE_END_DAY));
}

function getTimelineDays() {
  const range = getTimelineRange();
  const totalDays = Math.round((range.end - range.start) / DAY_MS) + 1;
  return Array.from({ length: totalDays }, (_, index) => {
    const date = addDays(range.start, index);
    return { date, dateStr: formatDate(date) };
  });
}

function weekdayLabel(date) {
  const day = date.getDay();
  if (day === 1) return 'Mon';
  if (day === 5) return 'Fri';
  return '';
}

function scheduleWeekdayLabel(date) {
  if (!scheduleDateLabel(date)) return '';
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][date.getDay()];
}

function scheduleDateLabel(date) {
  return [1, 5, 10, 15, 20, 25].includes(date.getDate()) ? date.getDate() : '';
}

function timelineWeekdayLabel(day, index, days) {
  if (!timelineDateLabel(day, index, days)) return '';
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][day.date.getDay()];
}

function timelineDateLabel(day, index, days) {
  return scheduleDateLabel(day.date) || (index === days.length - 1 ? day.date.getDate() : '');
}

function render() {
  rowsEl.innerHTML = '';
  rowsEl.className = 'project-rows timeline-grid';
  timelineScrollbar.className = 'timeline-scrollbar';
  boardShell.classList.toggle('is-setting-hidden', settingHidden);
  updateSettingControls();
  projects.forEach(normalizeProject);
  saveState();
  renderEditPanel();
  renderHeader();

  const frag = document.createDocumentFragment();
  projects.forEach((project) => frag.appendChild(renderRow(project)));
  rowsEl.appendChild(frag);
  renderNowMarker();
  setupProjectTitleInteractions();
  setupResize();
  updateTimelineMetrics();
  updateNowMarkerPosition();
  updateTimelineScrollbar();
  syncProgressScroll();
  scheduleBoardMarkerDisplay();
}

function setViewMode(nextMode) {
  viewMode = nextMode;
  viewModeButtons.forEach((button) => {
    button.classList.toggle('is-active', button.dataset.viewMode === viewMode);
  });
}

function setSettingHidden(nextHidden) {
  settingHidden = nextHidden;
  updateSettingControls();
  saveState();
}

function updateSettingControls() {
  toggleSettingBtn.textContent = settingHidden ? 'Show Setting' : 'Hide Setting';
  toggleSettingBtn.classList.toggle('is-toggle-active', settingHidden);
  captureBoardBtn.disabled = !settingHidden;
  captureBoardBtn.title = settingHidden ? 'Capture board' : 'Hide Setting before capture';
}

function renderHeader() {
  boardHead.className = `table-head timeline-head is-${viewMode}`;
  boardHead.innerHTML = `
    <div class="name-head">Project Name</div>
    <div class="progress-scroll progress-header">${renderTimelineHeader()}</div>
    <div class="setting-head">Setting</div>
  `;
}

function renderTimelineHeader() {
  const days = getTimelineDays();
  return `
    <div class="timeline-canvas timeline-header-canvas is-${viewMode}" style="--timeline-days: ${days.length}">
      <div class="timeline-months">
        ${days.map((day, index) => {
          const showMonth = index === 0 || day.date.getDate() === 1;
          return `<span>${showMonth ? timelineMonthLabel(day.date) : ''}</span>`;
        }).join('')}
      </div>
      <div class="timeline-weekdays">
        ${days.map((day, index) => `<span>${timelineWeekdayLabel(day, index, days)}</span>`).join('')}
      </div>
      <div class="timeline-dates">
        ${days.map((day, index) => `<span>${timelineDateLabel(day, index, days)}</span>`).join('')}
      </div>
    </div>
  `;
}

function renderScheduleHeader(rangeStart, totalDays) {
  const start = parseDate(rangeStart);
  const days = Array.from({ length: totalDays }, (_, index) => {
    const date = addDays(start, index);
    return { date, dateStr: formatDate(date) };
  });

  return `
    <div class="edit-schedule-header">
      <div class="edit-schedule-header-scale" style="--timeline-days: ${totalDays}">
        <div class="timeline-months">
          ${days.map((day, index) => {
            const showMonth = index === 0 || day.date.getDate() === 1;
            return `<span>${showMonth ? timelineMonthLabel(day.date) : ''}</span>`;
          }).join('')}
        </div>
        <div class="timeline-weekdays">
          ${days.map((day, index) => `<span>${timelineWeekdayLabel(day, index, days)}</span>`).join('')}
        </div>
        <div class="timeline-dates">
          ${days.map((day, index) => `<span>${timelineDateLabel(day, index, days)}</span>`).join('')}
        </div>
      </div>
    </div>
  `;
}

function renderRow(project) {
  const isEditing = editingProjectId === project.id;
  const hasMarkers = project.markers.length > 0;
  const layout = projectRowLayout(project);
  const row = document.createElement('article');
  row.className = `project-row timeline-row ${isEditing ? 'is-selected' : ''} ${project.flagsExpanded ? 'is-flags-expanded' : ''}`;
  row.dataset.id = project.id;
  row.style.setProperty('--main-row-h', `${layout.mainHeight}px`);
  row.style.setProperty('--main-bar-top', `${layout.mainBarTop}px`);
  row.style.setProperty('--marker-lane-h', `${layout.markerHeight}px`);
  row.style.setProperty('--project-row-h', `${layout.totalHeight}px`);

  row.innerHTML = `
    <div class="row-summary timeline-summary">
      <div class="project-title" title="Double-click to edit; hold to reorder">
        <button class="flag-toggle" type="button" title="${project.flagsExpanded ? 'Collapse flags' : 'Expand flags'}" ${hasMarkers ? '' : 'disabled'}>
          <i class="fa-solid fa-chevron-${project.flagsExpanded ? 'down' : 'right'} flag-toggle-chevron"></i>
        </button>
        <span class="project-title-text">${escapeHtml(project.name)}</span>
        <span class="project-drag-icon" aria-hidden="true"><i class="fa-solid fa-grip-vertical"></i></span>
      </div>
      ${renderTimeline(project)}
      <div class="row-actions">
        <button class="small-button edit-project" type="button" title="${isEditing ? 'Close editor' : 'Edit project'}">
          <i class="fa-solid ${isEditing ? 'fa-check' : 'fa-gear'}"></i>
        </button>
      </div>
    </div>
    ${project.flagsExpanded && hasMarkers && boardMarkers(project).length ? renderBoardMarkerSummary(project) : ''}
  `;

  row.querySelector('.flag-toggle').addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    project.flagsExpanded = !project.flagsExpanded;
    saveState();
    render();
  });

  row.querySelector('.edit-project').addEventListener('click', () => {
    if (!isEditing) editorFieldsEditable = false;
    editingProjectId = isEditing ? null : project.id;
    render();
  });

  return row;
}

function renderEditPanel() {
  const project = projects.find((item) => item.id === editingProjectId);
  if (!project) {
    editPanelHost.innerHTML = '';
    editPanelHost.hidden = true;
    return;
  }

  editPanelHost.hidden = false;
  editPanelHost.innerHTML = `
    <div class="edit-block ${editorFieldsHidden ? 'is-fields-hidden' : ''} ${editorFieldsEditable ? 'is-fields-editable' : 'is-fields-locked'}">
      <div class="edit-progress-row">
        ${renderEditProgress(project)}
      </div>
      <div class="edit-fields-row">
        <div class="edit-unlock-cell">
          <button class="small-button toggle-editor-edit ${editorFieldsEditable ? 'is-active' : ''}" type="button" title="${editorFieldsEditable ? 'Lock project fields' : 'Edit project fields'}" aria-pressed="${editorFieldsEditable}">
            <i class="fa-regular fa-pen-to-square"></i>
          </button>
        </div>
        ${renderEditorFields(project)}
      </div>
      <div class="edit-actions-row">
        <button class="small-button toggle-editor-fields" type="button" title="${editorFieldsHidden ? 'Show project fields' : 'Hide project fields'}" aria-pressed="${editorFieldsHidden}">
          <i class="fa-solid ${editorFieldsHidden ? 'fa-eye' : 'fa-eye-slash'}"></i>
        </button>
        <button class="small-button add-marker" type="button" title="Add flag">
          <i class="fa-solid fa-flag"></i>
        </button>
        <button class="small-button delete-button delete-project" type="button" title="Delete project">
          <i class="fa-regular fa-trash-can"></i>
        </button>
        <button class="small-button cancel-editor" type="button" title="Cancel editing">
          <i class="fa-solid fa-xmark"></i>
        </button>
        <button class="small-button close-editor" type="button" title="Close editor">
          <i class="fa-solid fa-check"></i>
        </button>
      </div>
    </div>
  `;

  editPanelHost.querySelector('.close-editor').addEventListener('click', () => {
    editingProjectId = null;
    editorFieldsEditable = false;
    render();
  });
  editPanelHost.querySelector('.cancel-editor').addEventListener('click', () => {
    editingProjectId = null;
    editorFieldsEditable = false;
    render();
  });
  editPanelHost.querySelector('.toggle-editor-edit').addEventListener('click', () => {
    editorFieldsEditable = !editorFieldsEditable;
    render();
  });
  editPanelHost.querySelector('.toggle-editor-fields').addEventListener('click', () => {
    editorFieldsHidden = !editorFieldsHidden;
    if (!editorFieldsHidden) editorFieldsEditable = false;
    saveState();
    render();
  });
  bindEditor(editPanelHost, project);
}

function renderTimeline(project) {
  const days = getTimelineDays();
  const rangeStart = days[0].date;
  const rangeEnd = days[days.length - 1].date;
  const start = parseDate(project.startDate);
  const end = parseDate(projectEndDate(project));
  const visibleStart = start < rangeStart ? rangeStart : start;
  const visibleEnd = end > rangeEnd ? rangeEnd : end;
  const hasVisibleRange = visibleStart <= visibleEnd;
  const startIndex = hasVisibleRange ? Math.round((visibleStart - rangeStart) / DAY_MS) : 0;
  const spanDays = hasVisibleRange ? Math.round((visibleEnd - visibleStart) / DAY_MS) + 1 : 0;
  const left = `${(startIndex / days.length) * 100}%`;
  const width = `${(spanDays / days.length) * 100}%`;
  const progressEnd = addDays(start, project.progressDays - 1);
  const fillVisibleStart = start < rangeStart ? rangeStart : start;
  const fillVisibleEnd = progressEnd > rangeEnd ? rangeEnd : progressEnd;
  const hasVisibleProgress = hasVisibleRange && fillVisibleStart <= fillVisibleEnd;
  const fillOffsetDays = hasVisibleProgress ? Math.round((fillVisibleStart - visibleStart) / DAY_MS) : 0;
  const fillSpanDays = hasVisibleProgress ? Math.round((fillVisibleEnd - fillVisibleStart) / DAY_MS) + 1 : 0;
  const fillLeft = `${(fillOffsetDays / Math.max(1, spanDays)) * 100}%`;
  const fillWidth = `${(fillSpanDays / Math.max(1, spanDays)) * 100}%`;
  const extendsAfter = end > rangeEnd;
  const progressExtendsAfter = progressEnd > rangeEnd;
  const trackClasses = [
    'timeline-bar',
    'timeline-track',
    extendsAfter ? 'is-extends-after' : '',
    progressExtendsAfter ? 'is-progress-extends-after' : '',
  ].filter(Boolean).join(' ');

  return `
    <div class="progress-scroll">
      <div class="timeline-canvas row-timeline-canvas is-${viewMode}" style="--timeline-days: ${days.length}">
        ${hasVisibleRange ? `
          <div class="${trackClasses}" style="left: ${left}; width: ${width}">
            ${hasVisibleProgress ? `<span class="timeline-progress-fill" style="left: ${fillLeft}; width: ${fillWidth}"></span>` : ''}
            <span class="bar-percent start">${progressPercent(project)}%</span>
          </div>
        ` : ''}
      </div>
    </div>
  `;
}

function renderBoardMarkerSummary(project) {
  const days = getTimelineDays();
  const totalDays = days.length;
  const rangeStart = days[0].date;
  const visibleMarkers = boardMarkers(project);
  const markerRows = visibleMarkers.length;
  const laneTop = markerLaneTop(PROJECT_LAYOUT.mainToMarkerGap, PROJECT_LAYOUT.markerLanePaddingTop);
  const height = markerLaneHeight(
    markerRows,
    PROJECT_LAYOUT.mainToMarkerGap,
    PROJECT_LAYOUT.markerLanePaddingTop,
    PROJECT_LAYOUT.markerLanePaddingBottom,
  );

  return `
    <div class="row-marker-summary timeline-summary" style="--marker-lane-h: ${height}px; height: ${height}px">
      <div class="marker-summary-spacer"></div>
      <div class="progress-scroll">
        <div class="timeline-canvas row-timeline-canvas board-marker-canvas is-${viewMode}" style="--timeline-days: ${totalDays}; --marker-row-h: ${MARKER_LAYOUT.rowHeight}px; --marker-lane-pad-top: ${laneTop}px; height: ${height}px" data-project-id="${project.id}" data-range-start="${formatDate(rangeStart)}">
          <svg class="board-connector-layer" aria-hidden="true"></svg>
          <div class="board-marker-lanes" aria-label="Project flags">
            ${visibleMarkers.map((marker, index) => renderBoardMarker(marker, project, rangeStart, totalDays, index)).join('')}
          </div>
        </div>
      </div>
      <div class="marker-summary-actions"></div>
    </div>
  `;
}

function renderBoardMarker(marker, project, rangeStart, totalDays, index) {
  const startDay = clamp(Number(marker.startDay || 1), 1, marker.day);
  const startDate = dateFromProjectDay(project, startDay);
  const endDate = dateFromProjectDay(project, marker.day);
  const startIndex = clamp(Math.round((startDate - rangeStart) / DAY_MS), 0, totalDays - 1);
  const endIndex = clamp(Math.round((endDate - rangeStart) / DAY_MS), 0, totalDays - 1);
  const startPoint = startIndex + 0.5;
  const endPoint = endIndex + 0.5;
  const startLeft = `${(startPoint / Math.max(1, totalDays)) * 100}%`;
  const pointLeft = `${(endPoint / Math.max(1, totalDays)) * 100}%`;
  const topPortOneLeft = `${((startPoint + (endPoint - startPoint) / 3) / Math.max(1, totalDays)) * 100}%`;
  const topPortTwoLeft = `${((startPoint + (endPoint - startPoint) * 2 / 3) / Math.max(1, totalDays)) * 100}%`;
  const midLeft = `${(((startPoint + endPoint) / 2) / Math.max(1, totalDays)) * 100}%`;
  const trackWidth = `${((endPoint - startPoint) / Math.max(1, totalDays)) * 100}%`;
  const markerSpanDays = Math.max(1, marker.day - startDay + 1);
  const completeDays = clamp(project.progressDays - startDay + 1, 0, markerSpanDays);
  const fillWidth = `${(completeDays / markerSpanDays) * 100}%`;
  const displayDate = markerDateLabel(endDate);
  const labelWidth = markerLabelWidth(marker.label, displayDate);

  return `
    <div class="board-marker-row" style="--marker-row: ${index}; --marker-start-left: ${startLeft}; --marker-point-left: ${pointLeft}; --marker-mid-left: ${midLeft}; --marker-top-port-1: ${topPortOneLeft}; --marker-top-port-2: ${topPortTwoLeft}; --marker-track-left: ${startLeft}; --marker-track-width: ${trackWidth}; --marker-fill-width: ${fillWidth}; --marker-label-w: ${labelWidth}px" data-marker-id="${marker.id}">
      <span class="board-marker-track"><span class="board-marker-fill"></span></span>
      <span class="board-marker-port board-marker-port-top board-marker-port-top-1" data-marker-id="${marker.id}" data-port="top-1"></span>
      <span class="board-marker-port board-marker-port-top board-marker-port-top-2" data-marker-id="${marker.id}" data-port="top-2"></span>
      <span class="board-marker-port board-marker-port-right" data-marker-id="${marker.id}" data-port="right"></span>
      <span class="board-marker-port board-marker-port-bottom board-marker-port-bottom-1" data-marker-id="${marker.id}" data-port="bottom-1"></span>
      <span class="board-marker-port board-marker-port-bottom board-marker-port-bottom-2" data-marker-id="${marker.id}" data-port="bottom-2"></span>
      <span class="board-marker-port board-marker-port-left" data-marker-id="${marker.id}" data-port="left"></span>
      <span class="board-marker-label">
        <span class="board-marker-date">${displayDate}</span>
        <span class="board-marker-text">${escapeHtml(marker.label)}</span>
      </span>
    </div>
  `;
}

function renderEditProgress(project) {
  const padDays = Math.max(7, Math.round(project.durationDays * 0.15));
  const totalDays = project.durationDays + padDays * 2;
  const left = `${(padDays / totalDays) * 100}%`;
  const width = `${(project.durationDays / totalDays) * 100}%`;
  const rangeStart = formatDate(addDays(parseDate(project.startDate), -padDays));
  const progressLeft = `${progressPercent(project)}%`;
  const markerRows = Math.max(1, project.markers.length);
  const scheduleHeight = MARKER_LAYOUT.editLaneTop + markerLaneHeight(markerRows) + MARKER_LAYOUT.editLaneBottom;

  return `
    <div class="progress-cell">
      <div class="timeline-canvas row-timeline-canvas edit-schedule-canvas" style="--timeline-days: ${totalDays}; --marker-count: ${markerRows}; --marker-lanes-top: ${MARKER_LAYOUT.editLaneTop}px; --marker-row-h: ${MARKER_LAYOUT.rowHeight}px; --marker-lane-pad-top: ${MARKER_LAYOUT.lanePaddingTop}px; height: ${scheduleHeight}px" data-range-start="${rangeStart}" aria-label="Project schedule">
        ${renderScheduleHeader(rangeStart, totalDays)}
        <div class="edit-schedule-bar timeline-bar" style="left: ${left}; width: ${width}; --duration-days: ${project.durationDays}" data-project-id="${project.id}" data-duration="${project.durationDays}" data-start-offset="${padDays}">
          <span class="timeline-progress-fill schedule-fill" style="width: ${progressLeft}"></span>
          <span class="date-label start">${project.startDate}</span>
          <span class="date-label end">${projectEndDate(project)}</span>
          <button class="progress-knob" type="button" style="left: ${progressLeft}" data-progress-days="${project.progressDays}" title="Current progress ${progressPercent(project)}%">
            <span>${progressPercent(project)}%</span>
          </button>
          <span class="schedule-handle left"></span>
          <span class="schedule-handle right"></span>
        </div>
        <div class="marker-lanes" aria-label="Flags">
          <svg class="marker-connector-layer" aria-hidden="true"></svg>
          ${project.markers.length
            ? project.markers.map((marker, index) => renderMarker(marker, project, padDays, totalDays, index)).join('')
            : '<div class="marker-empty">No flags</div>'}
        </div>
      </div>
    </div>
  `;
}

function renderEditorFields(project) {
  const disabled = editorFieldsEditable ? '' : 'disabled';
  return `
      <label>
        <span>Project Name</span>
        <input class="name-input" type="text" value="${escapeAttr(project.name)}" ${disabled}>
      </label>
      <label>
        <span>Stage</span>
        <select class="stage-select" ${disabled}>
          ${['Plan', 'Start', 'Execute', 'Control', 'Close'].map((stage) => (
            `<option value="${stage}" ${stage === project.stage ? 'selected' : ''}>${stage}</option>`
          )).join('')}
        </select>
      </label>
      <label>
        <span>Start Date</span>
        <input class="start-input" type="date" value="${project.startDate}" ${disabled}>
      </label>
      <label>
        <span>Project Duration</span>
        <input class="duration-input" type="number" min="1" step="1" value="${project.durationDays}" ${disabled}>
      </label>
      <label>
        <span>End Date</span>
        <input class="end-input" type="date" value="${projectEndDate(project)}" readonly>
      </label>
  `;
}

function bindEditor(row, project) {
  row.querySelector('.name-input').addEventListener('input', (event) => {
    project.name = event.target.value;
    const title = row.querySelector('.project-title-text');
    if (title) title.textContent = project.name || 'Untitled Project';
    saveState();
  });

  row.querySelector('.stage-select').addEventListener('change', (event) => {
    project.stage = event.target.value;
  });

  row.querySelector('.start-input').addEventListener('change', (event) => {
    project.startDate = event.target.value || formatDate(today);
    render();
  });

  row.querySelector('.duration-input').addEventListener('change', (event) => {
    project.durationDays = Math.max(1, Math.round(Number(event.target.value || 1)));
    normalizeProject(project);
    render();
  });

  row.querySelector('.add-marker').addEventListener('click', () => {
    activeMarkerProjectId = project.id;
    const defaultDate = formatDate(dateFromProjectDay(project, project.progressDays));
    markerStartDate.value = defaultDate;
    markerEndDate.value = defaultDate;
    markerStartDate.min = project.startDate;
    markerStartDate.max = projectEndDate(project);
    markerEndDate.min = project.startDate;
    markerEndDate.max = projectEndDate(project);
    markerLabel.value = '';
    markerDialog.showModal();
  });

  row.querySelector('.delete-project').addEventListener('click', () => {
    const projectLabel = project.name ? `「${project.name}」` : '這個專案';
    if (!window.confirm(`確定要刪除${projectLabel}嗎？`)) return;

    projects = projects.filter((item) => item.id !== project.id);
    editingProjectId = null;
    editorFieldsEditable = false;
    render();
  });

  row.querySelectorAll('.delete-marker').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const marker = project.markers.find((item) => item.id === button.dataset.markerId);
      const markerLabelText = marker?.label ? `「${marker.label}」` : '這個旗標';
      if (!marker || !window.confirm(`確定要刪除${markerLabelText}嗎？`)) return;

      project.markers = project.markers.filter((item) => item.id !== button.dataset.markerId);
      project.markerLinks = project.markerLinks.filter((link) => (
        link.fromMarkerId !== button.dataset.markerId && link.toMarkerId !== button.dataset.markerId
      ));
      render();
    });
  });

  row.querySelectorAll('.toggle-marker-board').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const marker = project.markers.find((item) => item.id === button.dataset.markerId);
      if (!marker) return;
      marker.boardHidden = !marker.boardHidden;
      saveState();
      render();
    });
  });

  row.querySelectorAll('.marker-text').forEach((textarea) => {
    textarea.addEventListener('input', () => {
      const marker = project.markers.find((item) => item.id === textarea.dataset.markerId);
      if (!marker) return;
      marker.label = textarea.value.trim();
      const dateText = textarea.closest('.marker-label').querySelector('.marker-date-display').textContent;
      const label = textarea.closest('.marker-label');
      const actions = textarea.closest('.marker-task-row')?.querySelector('.marker-label-actions');
      const nextWidth = markerLabelWidth(marker.label, dateText);
      label.title = `${dateText} ${marker.label}`;
      label.style.setProperty('--marker-label-w', `${nextWidth}px`);
      actions?.style.setProperty('--marker-label-w', `${nextWidth}px`);
      saveState();
    });
    textarea.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        textarea.blur();
        render();
      }
    });
  });
}

function renderMarker(marker, project, padDays = 0, totalDays = project.durationDays, index = 0) {
  const startDay = clamp(Number(marker.startDay || 1), 1, marker.day);
  const startPoint = padDays + startDay - 0.5;
  const markerPoint = padDays + marker.day - 0.5;
  const pointLeft = `${(markerPoint / Math.max(1, totalDays)) * 100}%`;
  const startLeft = `${(startPoint / Math.max(1, totalDays)) * 100}%`;
  const topPortOneLeft = `${((startPoint + (markerPoint - startPoint) / 3) / Math.max(1, totalDays)) * 100}%`;
  const topPortTwoLeft = `${((startPoint + (markerPoint - startPoint) * 2 / 3) / Math.max(1, totalDays)) * 100}%`;
  const trackLeft = startLeft;
  const trackWidth = `${((markerPoint - startPoint) / Math.max(1, totalDays)) * 100}%`;
  const midLeft = `${(((startPoint + markerPoint) / 2) / Math.max(1, totalDays)) * 100}%`;
  const markerSpanDays = Math.max(1, marker.day - startDay + 1);
  const completeDays = clamp(project.progressDays - startDay + 1, 0, markerSpanDays);
  const fillWidth = `${(completeDays / markerSpanDays) * 100}%`;
  const markerStartDateObj = dateFromProjectDay(project, startDay);
  const markerDateObj = dateFromProjectDay(project, marker.day);
  const date = formatDate(markerDateObj);
  const startDisplayDate = markerDateLabel(markerStartDateObj);
  const displayDate = markerDateLabel(markerDateObj);
  const labelWidth = markerLabelWidth(marker.label, displayDate);
  return `
    <div class="marker marker-task-row ${marker.boardHidden ? 'is-board-hidden' : ''}" style="--marker-row: ${index}; --marker-start-left: ${startLeft}; --marker-point-left: ${pointLeft}; --marker-mid-left: ${midLeft}; --marker-top-port-1: ${topPortOneLeft}; --marker-top-port-2: ${topPortTwoLeft}; --marker-track-left: ${trackLeft}; --marker-track-width: ${trackWidth}; --marker-fill-width: ${fillWidth}" data-marker-id="${marker.id}">
      <div class="marker-task-track" aria-hidden="true">
        <span class="marker-task-fill"></span>
        <span class="marker-start-date-display">${startDisplayDate}</span>
      </div>
      <button class="marker-port marker-port-top marker-port-top-1" type="button" data-marker-id="${marker.id}" data-port="top-1" title="Connect from top"></button>
      <button class="marker-port marker-port-top marker-port-top-2" type="button" data-marker-id="${marker.id}" data-port="top-2" title="Connect from top"></button>
      <button class="marker-port marker-port-right" type="button" data-marker-id="${marker.id}" data-port="right" title="Connect from right"></button>
      <button class="marker-port marker-port-bottom marker-port-bottom-1" type="button" data-marker-id="${marker.id}" data-port="bottom-1" title="Connect from bottom"></button>
      <button class="marker-port marker-port-bottom marker-port-bottom-2" type="button" data-marker-id="${marker.id}" data-port="bottom-2" title="Connect from bottom"></button>
      <button class="marker-port marker-port-left" type="button" data-marker-id="${marker.id}" data-port="left" title="Connect from left"></button>
      <div class="marker-label" style="--marker-label-w: ${labelWidth}px" title="${date} ${escapeHtml(marker.label)}">
        <span class="marker-date-display">${displayDate}</span>
        <textarea class="marker-text" rows="2" maxlength="80" data-marker-id="${marker.id}" title="Edit flag text">${escapeHtml(marker.label)}</textarea>
      </div>
      <div class="marker-label-actions" style="--marker-label-w: ${labelWidth}px">
        <button class="toggle-marker-board" type="button" data-marker-id="${marker.id}" title="${marker.boardHidden ? 'Show in board' : 'Hide from board'}" aria-pressed="${marker.boardHidden}">
          <i class="fa-regular ${marker.boardHidden ? 'fa-eye-slash' : 'fa-eye'}"></i>
        </button>
        <button class="delete-marker" type="button" data-marker-id="${marker.id}" title="Delete flag">
          <i class="fa-regular fa-calendar-xmark"></i>
        </button>
      </div>
      <button class="marker-start-handle" type="button" data-marker-id="${marker.id}" data-edge="start" title="Drag flag start">
        <span class="marker-pin" aria-hidden="true"></span>
      </button>
      <button class="marker-drag-handle" type="button" data-marker-id="${marker.id}" data-edge="end" title="Drag flag date">
        <span class="marker-pin" aria-hidden="true"></span>
      </button>
    </div>
  `;
}

function setupResize() {
  interact('.fill').unset();
  interact('.fill.is-editable').resizable({
    edges: { right: '.resize-handle' },
    inertia: false,
    modifiers: [
      interact.modifiers.restrictEdges({ outer: 'parent' }),
      interact.modifiers.restrictSize({ min: { width: 1 } }),
    ],
    listeners: {
      move(event) {
        const fill = event.target;
        const timeline = fill.parentElement;
        const durationDays = Number(fill.dataset.duration || 1);
        const width = clamp(event.rect.width, timeline.clientWidth / durationDays, timeline.clientWidth);
        const rawDays = (width / timeline.clientWidth) * durationDays;
        const days = clamp(Math.round(rawDays), 1, durationDays);
        fill.style.width = `${(days / durationDays) * 100}%`;
        fill.dataset.days = String(days);
      },
      end(event) {
        const row = event.target.closest('.project-row');
        const project = projects.find((item) => item.id === row.dataset.id);
        if (!project) return;
        project.progressDays = Number(event.target.dataset.days || 1);
        render();
      },
    },
  });
  setupScheduleInteract();
  setupMarkerInteract();
  setupConnectorInteract();
}

function setupProjectTitleInteractions() {
  rowsEl.querySelectorAll('.project-title').forEach((title) => {
    const row = title.closest('.project-row');
    const project = projects.find((item) => item.id === row.dataset.id);
    if (!project) return;

    title.addEventListener('dblclick', (event) => {
      if (event.target.closest('.flag-toggle')) return;
      event.preventDefault();
      event.stopPropagation();
      editProjectTitle(title, project);
    });

    title.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || event.target.closest('.project-title-input, .flag-toggle')) return;

      const startY = event.clientY;
      let isDragging = false;
      const holdTimer = window.setTimeout(() => {
        isDragging = true;
        title.setPointerCapture(event.pointerId);
        title.classList.add('is-reorder-ready');
        row.classList.add('is-dragging-row');
        rowsEl.classList.add('is-reordering');
      }, 320);

      function onMove(moveEvent) {
        if (!isDragging && Math.abs(moveEvent.clientY - startY) > 5) {
          window.clearTimeout(holdTimer);
          cleanup();
          return;
        }
        if (!isDragging) return;

        moveEvent.preventDefault();
        const siblings = [...rowsEl.querySelectorAll('.project-row:not(.is-dragging-row)')];
        const nextRow = siblings.find((item) => {
          const rect = item.getBoundingClientRect();
          return moveEvent.clientY < rect.top + rect.height / 2;
        });
        rowsEl.insertBefore(row, nextRow || null);
      }

      function onUp() {
        window.clearTimeout(holdTimer);
        if (isDragging) {
          const order = [...rowsEl.querySelectorAll('.project-row')].map((item) => item.dataset.id);
          projects.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
          saveState();
          render();
        }
        cleanup();
      }

      function cleanup() {
        title.classList.remove('is-reorder-ready');
        row.classList.remove('is-dragging-row');
        rowsEl.classList.remove('is-reordering');
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      }

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    });
  });
}

function editProjectTitle(title, project) {
  const textarea = document.createElement('textarea');
  textarea.className = 'project-title-input';
  textarea.rows = 2;
  textarea.value = project.name;
  textarea.maxLength = 80;
  title.replaceChildren(textarea);
  title.classList.add('is-editing-title');
  textarea.focus();
  textarea.select();
  let canceled = false;

  function commit() {
    if (canceled) return;
    const nextName = textarea.value.replace(/\r\n/g, '\n');
    project.name = nextName.trim() ? nextName : 'Untitled Project';
    saveState();
    render();
  }

  textarea.addEventListener('blur', commit, { once: true });
  textarea.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      textarea.blur();
    }
    if (event.key === 'Escape') {
      canceled = true;
      render();
    }
  });
}

function setupScheduleInteract() {
  interact('.edit-schedule-bar').unset();
  const bar = document.querySelector('.edit-schedule-bar');
  if (!bar) return;

  bar.addEventListener('pointerdown', (event) => {
    const mode = event.target.classList.contains('left')
      ? 'resize-left'
      : event.target.classList.contains('right')
        ? 'resize-right'
        : event.target.closest('.progress-knob')
          ? 'progress'
        : 'drag';
    const project = projects.find((item) => item.id === bar.dataset.projectId);
    if (!project) return;

    const canvas = bar.parentElement;
    const totalDays = Number(getComputedStyle(canvas).getPropertyValue('--timeline-days')) || Number(canvas.style.getPropertyValue('--timeline-days')) || 1;
    const rangeStart = parseDate(canvas.dataset.rangeStart);
    const dayWidth = canvas.clientWidth / totalDays;
    const initialX = event.clientX;
    const initialStartDay = Number(bar.dataset.startOffset || Math.round((parseDate(project.startDate) - rangeStart) / DAY_MS));
    const initialDuration = project.durationDays;
    const initialProgressDays = project.progressDays;
    const progressKnob = bar.querySelector('.progress-knob');

    bar.setPointerCapture(event.pointerId);

    function previewProgress(nextProgressDays) {
      const progressDays = clamp(Math.round(nextProgressDays), 1, project.durationDays);
      const percent = Math.round((progressDays / project.durationDays) * 100);
      progressKnob.style.left = `${percent}%`;
      progressKnob.dataset.pendingProgressDays = String(progressDays);
      progressKnob.querySelector('span').textContent = `${percent}%`;
      progressKnob.title = `Current progress ${percent}%`;
      bar.querySelector('.schedule-fill').style.width = `${percent}%`;
    }

    function preview(nextStartDay, nextDuration) {
      const startDay = Math.max(0, Math.round(nextStartDay));
      const duration = Math.max(1, Math.round(nextDuration));
      const progressDays = clamp(project.progressDays, 1, duration);
      const progressPercentValue = Math.round((progressDays / duration) * 100);
      bar.style.left = `${startDay * dayWidth}px`;
      bar.style.width = `${duration * dayWidth}px`;
      bar.querySelector('.date-label.start').textContent = formatDate(addDays(rangeStart, startDay));
      bar.querySelector('.date-label.end').textContent = formatDate(addDays(rangeStart, startDay + duration - 1));
      bar.querySelector('.schedule-fill').style.width = `${progressPercentValue}%`;
      progressKnob.style.left = `${progressPercentValue}%`;
      progressKnob.querySelector('span').textContent = `${progressPercentValue}%`;
      progressKnob.title = `Current progress ${progressPercentValue}%`;
      bar.dataset.pendingStartDay = String(startDay);
      bar.dataset.pendingDuration = String(duration);
    }

    function onMove(moveEvent) {
      const deltaDays = Math.round((moveEvent.clientX - initialX) / dayWidth);
      if (mode === 'progress') {
        previewProgress(initialProgressDays + deltaDays);
      } else if (mode === 'drag') {
        preview(initialStartDay + deltaDays, initialDuration);
      } else if (mode === 'resize-left') {
        preview(initialStartDay + deltaDays, initialDuration - deltaDays);
      } else {
        preview(initialStartDay, initialDuration + deltaDays);
      }
    }

    function onUp() {
      if (mode === 'progress') {
        project.progressDays = Number(progressKnob.dataset.pendingProgressDays ?? initialProgressDays);
        normalizeProject(project);
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        render();
        return;
      }

      const startDay = Number(bar.dataset.pendingStartDay ?? initialStartDay);
      const duration = Number(bar.dataset.pendingDuration ?? initialDuration);
      project.startDate = formatDate(addDays(rangeStart, startDay));
      project.durationDays = Math.max(1, duration);
      normalizeProject(project);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      render();
    }

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  });
}

function setupMarkerInteract() {
  document.querySelectorAll('.marker').forEach((markerEl) => {
    markerEl.addEventListener('pointerdown', (event) => {
      const handle = event.target.closest('.marker-start-handle, .marker-drag-handle');
      if (!handle) return;
      event.preventDefault();
      event.stopPropagation();
      const markerId = handle.dataset.markerId;
      const edge = handle.dataset.edge || 'end';
      const project = projects.find((item) => item.id === editingProjectId);
      const marker = project?.markers.find((item) => item.id === markerId);
      if (!project || !marker) return;

      const canvas = markerEl.closest('.edit-schedule-canvas');
      const bar = canvas?.querySelector('.edit-schedule-bar');
      if (!canvas || !bar) return;

      const totalDays = Number(getComputedStyle(canvas).getPropertyValue('--timeline-days')) || Number(canvas.style.getPropertyValue('--timeline-days')) || 1;
      const padDays = Number(bar.dataset.startOffset || 0);
      const initialX = event.clientX;
      let moved = false;

      markerEl.setPointerCapture(event.pointerId);
      markerEl.classList.add('is-dragging');

      function preview(nextClientX) {
        const canvasRect = canvas.getBoundingClientRect();
        const dayWidth = canvas.clientWidth / totalDays;
        const rawCanvasDay = Math.floor((nextClientX - canvasRect.left) / dayWidth);
        const selectedProjectDay = clamp(rawCanvasDay - padDays + 1, 1, project.durationDays);
        const currentStartDay = Number(markerEl.dataset.pendingStartDay || marker.startDay || 1);
        const currentEndDay = Number(markerEl.dataset.pendingDay || marker.day);
        const startDay = edge === 'start'
          ? clamp(selectedProjectDay, 1, currentEndDay)
          : clamp(currentStartDay, 1, selectedProjectDay);
        const markerDay = edge === 'end'
          ? clamp(selectedProjectDay, startDay, project.durationDays)
          : currentEndDay;
        const startPoint = padDays + startDay - 0.5;
        const markerPoint = padDays + markerDay - 0.5;
        const startLeft = `${(startPoint / Math.max(1, totalDays)) * 100}%`;
        const pointLeft = `${(markerPoint / Math.max(1, totalDays)) * 100}%`;
        const trackWidth = `${((markerPoint - startPoint) / Math.max(1, totalDays)) * 100}%`;
        const markerSpanDays = Math.max(1, markerDay - startDay + 1);
        const completeDays = clamp(project.progressDays - startDay + 1, 0, markerSpanDays);
        const fillWidth = `${(completeDays / markerSpanDays) * 100}%`;
        const startDate = formatDate(dateFromProjectDay(project, startDay));
        const date = formatDate(dateFromProjectDay(project, markerDay));

        markerEl.style.setProperty('--marker-start-left', startLeft);
        markerEl.style.setProperty('--marker-point-left', pointLeft);
        markerEl.style.setProperty('--marker-track-left', startLeft);
        markerEl.style.setProperty('--marker-track-width', trackWidth);
        markerEl.style.setProperty('--marker-fill-width', fillWidth);
        markerEl.dataset.pendingStartDay = String(startDay);
        markerEl.dataset.pendingDay = String(markerDay);
        markerEl.querySelector('.marker-start-date-display').textContent = markerDateLabel(dateFromProjectDay(project, startDay));
        markerEl.querySelector('.marker-date-display').textContent = markerDateLabel(dateFromProjectDay(project, markerDay));
        markerEl.querySelector('.marker-label').title = `${startDate} - ${date} ${marker.label}`;
      }

      function onMove(moveEvent) {
        if (Math.abs(moveEvent.clientX - initialX) > 3) moved = true;
        preview(moveEvent.clientX);
      }

      function onUp() {
        if (moved) {
          marker.startDay = Number(markerEl.dataset.pendingStartDay || marker.startDay || 1);
          marker.day = Number(markerEl.dataset.pendingDay || marker.day);
          marker.startDay = clamp(marker.startDay, 1, marker.day);
          project.markers.sort((a, b) => a.day - b.day);
        }
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        markerEl.classList.remove('is-dragging');
        if (moved) render();
      }

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    });
  });
}

function setupConnectorInteract() {
  const lanes = document.querySelector('.marker-lanes');
  const project = projects.find((item) => item.id === editingProjectId);
  if (!lanes || !project) return;

  renderMarkerConnectors(lanes, project);
  setupConnectorPortDrag(lanes, project);
  setupConnectorAdjustDrag(lanes, project);
}

function setupConnectorPortDrag(lanes, project) {
  lanes.querySelectorAll('.marker-port').forEach((port) => {
    port.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const selected = {
        markerId: port.dataset.markerId,
        port: port.dataset.port,
      };

      if (!pendingConnectorPort) {
        pendingConnectorPort = selected;
        activeConnectorId = null;
        renderMarkerConnectors(lanes, project);
        setupConnectorAdjustDrag(lanes, project);
        return;
      }

      if (pendingConnectorPort.markerId === selected.markerId) {
        pendingConnectorPort = null;
        renderMarkerConnectors(lanes, project);
        setupConnectorAdjustDrag(lanes, project);
        return;
      }

      const start = getPortPoint(lanes, pendingConnectorPort.markerId, pendingConnectorPort.port);
      const end = getPortPoint(lanes, selected.markerId, selected.port);
      const rect = lanes.getBoundingClientRect();
      const context = getTimelineContext(lanes);
      if (start && end) {
        const elbow = defaultConnectorElbow(start, end);
        const nextLink = {
          id: crypto.randomUUID(),
          fromMarkerId: pendingConnectorPort.markerId,
          fromPort: pendingConnectorPort.port,
          toMarkerId: selected.markerId,
          toPort: selected.port,
          offsetX: 0,
          offsetY: 0,
          elbowXRatio: null,
          elbowYRatio: clamp(elbow.y / Math.max(1, rect.height), 0, 1),
          elbowDate: context ? xToElbowDate(elbow.x, rect, context) : '',
        };
        project.markerLinks.push(nextLink);
        activeConnectorId = nextLink.id;
        saveState();
      }
      pendingConnectorPort = null;
      render();
    });
  });
}

function setupConnectorAdjustDrag(lanes, project) {
  lanes.querySelectorAll('.marker-connector-grip').forEach((grip) => {
    grip.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const link = project.markerLinks.find((item) => item.id === grip.dataset.linkId);
      if (!link) return;

      const initialX = event.clientX;
      const initialY = event.clientY;
      const rect = lanes.getBoundingClientRect();
      const context = getTimelineContext(lanes);
      const start = getPortPoint(lanes, link.fromMarkerId, link.fromPort);
      const end = getPortPoint(lanes, link.toMarkerId, link.toPort);
      if (!start || !end) return;

      const initialElbow = getConnectorElbow(link, start, end, rect, context);
      grip.setPointerCapture(event.pointerId);

      function onMove(moveEvent) {
        const nextElbow = { ...initialElbow };
        if (grip.dataset.axis === 'x') {
          nextElbow.x = clamp(initialElbow.x + moveEvent.clientX - initialX, 0, rect.width);
        } else {
          nextElbow.y = clamp(initialElbow.y + moveEvent.clientY - initialY, 0, rect.height);
        }
        snapConnectorElbow(nextElbow, grip.dataset.axis, lanes, project, link, rect, context);
        storeConnectorElbow(link, nextElbow, rect, context);
        renderMarkerConnectors(lanes, project);
      }

      function onUp() {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        saveState();
        renderMarkerConnectors(lanes, project);
        setupConnectorAdjustDrag(lanes, project);
      }

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    });
  });
}

function renderMarkerConnectors(lanes, project) {
  const layer = lanes.querySelector('.marker-connector-layer');
  if (!layer) return;

  const rect = lanes.getBoundingClientRect();
  const context = getTimelineContext(lanes);
  layer.setAttribute('viewBox', `0 0 ${Math.max(1, rect.width)} ${Math.max(1, rect.height)}`);
  layer.innerHTML = `
    <defs>
      <marker id="markerConnectorArrow" viewBox="0 0 10 10" refX="8.2" refY="5" markerWidth="7" markerHeight="7" orient="auto" markerUnits="strokeWidth">
        <path d="M 2.5 2.4 L 8.2 5 L 2.5 7.6"></path>
      </marker>
    </defs>
  `;

  let migratedConnector = false;
  project.markerLinks.forEach((link) => {
    const start = getPortPoint(lanes, link.fromMarkerId, link.fromPort);
    const end = getPortPoint(lanes, link.toMarkerId, link.toPort);
    if (!start || !end) return;
    if (!link.elbowDate && context) {
      const legacyElbow = getConnectorElbow(link, start, end, rect, context);
      link.elbowDate = xToElbowDate(legacyElbow.x, rect, context);
      link.elbowXRatio = null;
      migratedConnector = true;
    }
    const elbow = getConnectorElbow(link, start, end, rect, context);

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.classList.add('marker-connector-path');
    if (link.id === activeConnectorId) path.classList.add('is-selected');
    path.dataset.linkId = link.id;
    path.setAttribute('d', connectorPath(start, end, elbow));
    path.setAttribute('marker-end', 'url(#markerConnectorArrow)');
    layer.appendChild(path);

    [
      { axis: 'x', x: elbow.x, y: (start.y + elbow.y) / 2 },
      { axis: 'y', x: (elbow.x + end.x) / 2, y: elbow.y },
    ].forEach((point) => {
      const grip = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      grip.classList.add('marker-connector-grip', `marker-connector-grip-${point.axis}`);
      if (link.id === activeConnectorId) grip.classList.add('is-selected');
      grip.dataset.linkId = link.id;
      grip.dataset.axis = point.axis;
      grip.setAttribute('cx', point.x);
      grip.setAttribute('cy', point.y);
      grip.setAttribute('r', 5);
      layer.appendChild(grip);
    });
  });
  if (migratedConnector) saveState();

  lanes.querySelectorAll('.marker-port').forEach((port) => {
    const isPending = pendingConnectorPort
      && pendingConnectorPort.markerId === port.dataset.markerId
      && pendingConnectorPort.port === port.dataset.port;
    port.classList.toggle('is-connector-pending', Boolean(isPending));
  });

  setupConnectorPathSelect(lanes, project);
}

function setupBoardMarkerDisplay() {
  document.querySelectorAll('.board-marker-canvas').forEach((canvas) => {
    const project = projects.find((item) => item.id === canvas.dataset.projectId);
    if (!project) return;
    renderBoardMarkerConnectors(canvas, project);
  });
}

function scheduleBoardMarkerDisplay() {
  if (boardMarkerFrame) cancelAnimationFrame(boardMarkerFrame);
  boardMarkerFrame = requestAnimationFrame(() => {
    boardMarkerFrame = requestAnimationFrame(() => {
      boardMarkerFrame = null;
      setupBoardMarkerDisplay();
    });
  });
}

function renderBoardMarkerConnectors(canvas, project) {
  const layer = canvas.querySelector('.board-connector-layer');
  if (!layer) return;

  const rect = canvas.getBoundingClientRect();
  const context = getTimelineContext(canvas);
  layer.setAttribute('viewBox', `0 0 ${Math.max(1, rect.width)} ${Math.max(1, rect.height)}`);
  layer.innerHTML = `
    <defs>
      <marker id="boardConnectorArrow-${project.id}" viewBox="0 0 10 10" refX="8.2" refY="5" markerWidth="7" markerHeight="7" orient="auto" markerUnits="strokeWidth">
        <path d="M 2.5 2.4 L 8.2 5 L 2.5 7.6"></path>
      </marker>
    </defs>
  `;

  project.markerLinks.forEach((link) => {
    const start = getBoardPortPoint(canvas, link.fromMarkerId, link.fromPort);
    const end = getBoardPortPoint(canvas, link.toMarkerId, link.toPort);
    if (!start || !end) return;
    const elbow = getBoardConnectorElbow(link, start, end, rect, context);

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.classList.add('board-connector-path');
    path.setAttribute('d', connectorPath(start, end, elbow));
    path.setAttribute('marker-end', `url(#boardConnectorArrow-${project.id})`);
    layer.appendChild(path);
  });
}

function getBoardConnectorElbow(link, start, end, rect, context) {
  const timelineElbow = getConnectorElbow(link, start, end, rect, context);
  return {
    x: timelineElbow.x,
    y: defaultConnectorElbow(start, end).y,
  };
}

function getBoardPortPoint(canvas, markerId, portName) {
  const normalizedPortName = portName === 'top' ? 'top-1' : portName === 'bottom' ? 'bottom-1' : portName;
  const port = canvas.querySelector(`.board-marker-port[data-marker-id="${CSS.escape(markerId)}"][data-port="${CSS.escape(normalizedPortName)}"]`);
  if (!port) return null;

  const portRect = port.getBoundingClientRect();
  const canvasRect = canvas.getBoundingClientRect();
  return {
    x: portRect.left + portRect.width / 2 - canvasRect.left,
    y: portRect.top + portRect.height / 2 - canvasRect.top,
  };
}

function setupConnectorPathSelect(lanes, project) {
  lanes.querySelectorAll('.marker-connector-path').forEach((path) => {
    path.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      event.stopPropagation();
      activeConnectorId = path.dataset.linkId;
      renderMarkerConnectors(lanes, project);
      setupConnectorAdjustDrag(lanes, project);
    });
  });
}

function getPortPoint(lanes, markerId, portName) {
  const normalizedPortName = portName === 'top' ? 'top-1' : portName === 'bottom' ? 'bottom-1' : portName;
  const port = lanes.querySelector(`.marker-port[data-marker-id="${CSS.escape(markerId)}"][data-port="${CSS.escape(normalizedPortName)}"]`);
  if (!port) return null;

  const portRect = port.getBoundingClientRect();
  const lanesRect = lanes.getBoundingClientRect();
  return {
    x: portRect.left + portRect.width / 2 - lanesRect.left,
    y: portRect.top + portRect.height / 2 - lanesRect.top,
  };
}

function defaultConnectorElbow(start, end) {
  return {
    x: start.x,
    y: end.y,
  };
}

function getConnectorElbow(link, start, end, rect, context) {
  const x = link.elbowDate && context
    ? dateToConnectorX(link.elbowDate, rect, context)
    : Number.isFinite(Number(link.elbowXRatio))
      ? clamp(Number(link.elbowXRatio) * rect.width, 0, rect.width)
      : clamp((start.x + end.x) / 2 + Number(link.offsetX || 0), 0, rect.width);
  const y = Number.isFinite(Number(link.elbowYRatio))
    ? clamp(Number(link.elbowYRatio) * rect.height, 0, rect.height)
    : clamp((start.y + end.y) / 2 + Number(link.offsetY || 0), 0, rect.height);

  return { x, y };
}

function storeConnectorElbow(link, elbow, rect, context) {
  link.elbowDate = context ? xToElbowDate(elbow.x, rect, context) : link.elbowDate || '';
  link.elbowXRatio = null;
  link.elbowYRatio = clamp(elbow.y / Math.max(1, rect.height), 0, 1);
  link.offsetX = 0;
  link.offsetY = 0;
}

function snapConnectorElbow(elbow, axis, lanes, project, activeLink, rect, context) {
  const snapDistance = 8;
  const candidates = [];

  project.markerLinks.forEach((link) => {
    if (link.id === activeLink.id) return;
    const start = getPortPoint(lanes, link.fromMarkerId, link.fromPort);
    const end = getPortPoint(lanes, link.toMarkerId, link.toPort);
    if (!start || !end) return;
    const linkElbow = getConnectorElbow(link, start, end, rect, context);
    candidates.push(axis === 'x' ? linkElbow.x : linkElbow.y);
  });

  lanes.querySelectorAll('.marker-port').forEach((port) => {
    const point = getPortPoint(lanes, port.dataset.markerId, port.dataset.port);
    if (point) candidates.push(axis === 'x' ? point.x : point.y);
  });

  if (axis === 'x') {
    if (context) {
      const dayWidth = rect.width / Math.max(1, context.totalDays);
      for (let x = dayWidth / 2; x <= rect.width; x += dayWidth) {
        candidates.push(x);
      }
    }
  }

  const value = axis === 'x' ? elbow.x : elbow.y;
  const closest = candidates.reduce((best, candidate) => {
    const distance = Math.abs(candidate - value);
    if (!best || distance < best.distance) return { value: candidate, distance };
    return best;
  }, null);

  if (closest && closest.distance <= snapDistance) {
    if (axis === 'x') elbow.x = closest.value;
    else elbow.y = closest.value;
  }
}

function getTimelineContext(element) {
  const canvas = element.closest('.timeline-canvas');
  if (!canvas) return null;
  const totalDays = Number(getComputedStyle(canvas).getPropertyValue('--timeline-days')) || Number(canvas.style.getPropertyValue('--timeline-days')) || 1;
  const rangeStart = canvas.dataset.rangeStart
    ? parseDate(canvas.dataset.rangeStart)
    : getTimelineDays()[0].date;
  if (Number.isNaN(rangeStart.getTime())) return null;
  return { rangeStart, totalDays };
}

function dateToConnectorX(dateValue, rect, context) {
  const date = parseDate(dateValue);
  if (Number.isNaN(date.getTime())) return 0;
  const offsetDays = Math.round((date - context.rangeStart) / DAY_MS);
  const dayPoint = clamp(offsetDays + .5, 0, context.totalDays);
  return clamp((dayPoint / Math.max(1, context.totalDays)) * rect.width, 0, rect.width);
}

function xToElbowDate(x, rect, context) {
  const rawDay = (x / Math.max(1, rect.width)) * context.totalDays - .5;
  const offsetDays = clamp(Math.round(rawDay), 0, context.totalDays - 1);
  return formatDate(addDays(context.rangeStart, offsetDays));
}

function connectorPath(start, end, elbow) {
  const resolvedElbow = {
    x: Math.abs(elbow.x - start.x) <= 6 ? start.x : elbow.x,
    y: Math.abs(elbow.y - end.y) <= 6 ? end.y : elbow.y,
  };

  return roundedOrthogonalPath(compactConnectorPoints([
    start,
    { x: resolvedElbow.x, y: start.y },
    { x: resolvedElbow.x, y: resolvedElbow.y },
    { x: end.x, y: resolvedElbow.y },
    end,
  ]), 8);
}

function compactConnectorPoints(points) {
  const threshold = 6;
  return points.filter((point, index) => {
    if (index === 0) return true;
    const prev = points[index - 1];
    return Math.abs(point.x - prev.x) > threshold || Math.abs(point.y - prev.y) > threshold;
  });
}

function roundedOrthogonalPath(points, radius) {
  const [first, ...rest] = points;
  let d = `M ${first.x} ${first.y}`;

  rest.forEach((point, index) => {
    const prev = points[index];
    const next = points[index + 2];
    if (!next) {
      d += ` L ${point.x} ${point.y}`;
      return;
    }

    const before = shortenPoint(point, prev, radius);
    const after = shortenPoint(point, next, radius);
    d += ` L ${before.x} ${before.y} Q ${point.x} ${point.y} ${after.x} ${after.y}`;
  });

  return d;
}

function shortenPoint(point, toward, radius) {
  const dx = toward.x - point.x;
  const dy = toward.y - point.y;
  const length = Math.max(1, Math.hypot(dx, dy));
  const amount = Math.min(radius, length / 2);
  return {
    x: point.x + (dx / length) * amount,
    y: point.y + (dy / length) * amount,
  };
}

function renderNowMarker() {
  const marker = document.createElement('div');
  marker.className = 'now-marker';
  marker.innerHTML = `
    <span class="now-marker-line" aria-hidden="true"></span>
    <span class="now-marker-label" contenteditable="true" spellcheck="false" title="Edit label; drag vertically">${escapeHtml(nowMarker.label)}</span>
  `;
  rowsEl.appendChild(marker);

  const label = marker.querySelector('.now-marker-label');
  label.addEventListener('input', () => {
    const nextLabel = label.textContent.trim();
    nowMarker.label = nextLabel || DEFAULT_NOW_MARKER.label;
    saveState();
  });

  label.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      label.blur();
    }
  });

  setupNowMarkerDrag(marker, label);
}

function setupNowMarkerDrag(marker, label) {
  label.addEventListener('pointerdown', (event) => {
    const initialY = event.clientY;
    const initialLabelY = nowMarker.labelY;
    let moved = false;

    label.setPointerCapture(event.pointerId);

    function onMove(moveEvent) {
      const deltaY = moveEvent.clientY - initialY;
      if (Math.abs(deltaY) > 3) moved = true;
      if (!moved) return;

      label.classList.add('is-dragging');
      const labelHeight = label.getBoundingClientRect().height || 60;
      const markerHeight = getVisibleTimelineHeight();
      const maxY = Math.max(0, markerHeight - labelHeight - 8);
      nowMarker.labelY = clamp(initialLabelY + deltaY, 8, maxY);
      marker.style.setProperty('--now-marker-label-y', `${nowMarker.labelY}px`);
    }

    function onUp(upEvent) {
      label.releasePointerCapture(upEvent.pointerId);
      label.removeEventListener('pointermove', onMove);
      label.removeEventListener('pointerup', onUp);
      label.classList.remove('is-dragging');
      if (moved) {
        upEvent.preventDefault();
        label.blur();
        saveState();
      }
    }

    label.addEventListener('pointermove', onMove);
    label.addEventListener('pointerup', onUp);
  });
}

function updateNowMarkerPosition() {
  const marker = rowsEl.querySelector('.now-marker');
  const firstCanvas = rowsEl.querySelector('.project-row .timeline-canvas');
  if (!marker || !firstCanvas) return;

  const days = getTimelineDays();
  const rangeStart = days[0]?.date;
  const rangeEnd = days[days.length - 1]?.date;
  if (!rangeStart || !rangeEnd || today < rangeStart || today > rangeEnd) {
    marker.hidden = true;
    return;
  }

  const rowsRect = rowsEl.getBoundingClientRect();
  const canvasRect = firstCanvas.getBoundingClientRect();
  const offsetDays = Math.round((today - rangeStart) / DAY_MS);
  const dayPoint = clamp(offsetDays + .5, 0, days.length);
  const left = canvasRect.left - rowsRect.left + (dayPoint / Math.max(1, days.length)) * canvasRect.width;
  const labelHeight = marker.querySelector('.now-marker-label')?.getBoundingClientRect().height || 60;
  const markerHeight = getVisibleTimelineHeight();
  const maxY = Math.max(0, markerHeight - labelHeight - 8);
  nowMarker.labelY = clamp(nowMarker.labelY, 8, maxY);

  marker.hidden = false;
  marker.style.setProperty('--now-marker-x', `${left}px`);
  marker.style.setProperty('--now-marker-h', `${markerHeight}px`);
  marker.style.setProperty('--now-marker-label-y', `${nowMarker.labelY}px`);
}

function getVisibleTimelineHeight(root = rowsEl) {
  const rows = [...root.querySelectorAll('.project-row')];
  if (!rows.length) return root.clientHeight;

  return rows.reduce((total, row) => total + row.getBoundingClientRect().height, 0);
}

function syncProgressScroll() {
  const scrollers = [...document.querySelectorAll('.progress-scroll'), timelineScrollbar];
  let locked = false;
  scrollers.forEach((scroller) => {
    scroller.addEventListener('scroll', () => {
      if (locked) return;
      locked = true;
      scrollers.forEach((item) => {
        if (item !== scroller) item.scrollLeft = scroller.scrollLeft;
      });
      updateNowMarkerPosition();
      locked = false;
    });
  });
}

function updateTimelineScrollbar() {
  const firstProgress = document.querySelector('.project-row .progress-scroll');
  const firstCanvas = document.querySelector('.project-row .timeline-canvas');
  const inner = timelineScrollbar.querySelector('.timeline-scrollbar-inner');
  if (!firstProgress || !firstCanvas || !inner) return;

  timelineScrollbar.style.setProperty('--name-w-current', `${firstProgress.getBoundingClientRect().left - rowsEl.getBoundingClientRect().left}px`);
  timelineScrollbar.style.setProperty('--setting-w-current', `${document.querySelector('.row-actions')?.getBoundingClientRect().width || 54}px`);
  inner.style.width = `${firstCanvas.scrollWidth}px`;

  const hasOverflow = firstCanvas.scrollWidth > firstProgress.clientWidth + 1;
  timelineScrollbar.classList.toggle('has-overflow', hasOverflow);
  timelineScrollbar.classList.toggle('is-hidden', !hasOverflow);
}

function updateTimelineMetrics() {
  const firstProgress = document.querySelector('.project-row .progress-scroll') || document.querySelector('.progress-header');
  if (!firstProgress) return;

  const dayCount = getLast3TimelineDayCount();
  const dayWidth = firstProgress.clientWidth / Math.max(1, dayCount);
  document.documentElement.style.setProperty('--full-day-w', `${dayWidth}px`);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function escapeAttr(value) {
  return escapeHtml(value);
}

async function captureBoardShell() {
  if (!settingHidden) return;

  captureBoardBtn.disabled = true;
  captureBoardBtn.classList.add('is-working');
  boardShell.classList.add('is-capturing');
  updateNowMarkerPosition();
  updateTimelineScrollbar();

  try {
    if (typeof window.html2canvas !== 'function') {
      throw new Error('html2canvas is not loaded');
    }

    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    const rect = boardShell.getBoundingClientRect();
    const captureHeight = getBoardCaptureHeight(boardShell);
    const canvas = await window.html2canvas(boardShell, {
      backgroundColor: getComputedStyle(boardShell).backgroundColor || '#ffffff',
      scale: Math.min(2, window.devicePixelRatio || 1),
      useCORS: true,
      allowTaint: false,
      logging: false,
      width: Math.ceil(rect.width),
      height: Math.ceil(captureHeight),
      windowWidth: document.documentElement.clientWidth,
      windowHeight: document.documentElement.clientHeight,
      onclone: (clonedDocument) => {
        const clonedShell = clonedDocument.querySelector('.board-shell');
        if (!clonedShell) return;

        clonedShell.classList.add('is-setting-hidden', 'is-capturing');
        clonedShell.querySelectorAll('.timeline-scrollbar').forEach((scrollbar) => {
          scrollbar.remove();
        });
        const clonedRows = clonedShell.querySelector('#projectRows');
        if (clonedRows) {
          clonedRows.style.height = `${getVisibleTimelineHeight(clonedRows)}px`;
          clonedRows.style.flex = '0 0 auto';
        }
        clonedShell.style.height = `${getBoardCaptureHeight(clonedShell)}px`;
        prepareCaptureNowMarker(clonedShell);
        prepareCaptureMarkerTracks(clonedShell);
        injectCaptureStripes(clonedShell);
      },
    });

    await copyCanvasToClipboard(canvas);
    // // Keep this available for later; current testing only copies the image for pasting.
    // const pngUrl = canvas.toDataURL('image/png');
    // downloadUrl(pngUrl, `project-board-${formatDate(today)}.png`);
  } catch (error) {
    console.warn('Unable to capture board', error);
  } finally {
    boardShell.classList.remove('is-capturing');
    captureBoardBtn.classList.remove('is-working');
    updateSettingControls();
    updateTimelineScrollbar();
  }
}

function prepareCaptureNowMarker(root) {
  const clonedRows = root.querySelector('#projectRows');
  const marker = clonedRows?.querySelector('.now-marker');
  if (!clonedRows || !marker || marker.hidden) return;

  marker.style.setProperty('--now-marker-h', `${getVisibleTimelineHeight(clonedRows)}px`);
  const label = marker.querySelector('.now-marker-label');
  if (label) {
    label.removeAttribute('contenteditable');
    const text = label.textContent.trim() || DEFAULT_NOW_MARKER.label;
    label.innerHTML = `<span>${escapeHtml(text)}</span>`;
    label.style.writingMode = 'horizontal-tb';
    label.style.textOrientation = 'mixed';
    label.style.display = 'inline-flex';
    label.style.alignItems = 'center';
    label.style.justifyContent = 'center';
    label.style.gap = '0';
    label.style.width = '28px';
    label.style.minWidth = '28px';
    label.style.height = `${Math.max(58, text.length * 10 + 18)}px`;
    label.style.minHeight = `${Math.max(58, text.length * 10 + 18)}px`;
    label.style.padding = '4px 3px';
    label.style.lineHeight = '1';
    label.querySelectorAll('span').forEach((word) => {
      word.style.display = 'block';
      word.style.whiteSpace = 'nowrap';
      word.style.lineHeight = '1';
      word.style.transform = 'rotate(90deg)';
      word.style.transformOrigin = 'center';
    });
  }
  const line = marker.querySelector('.now-marker-line');
  if (line) {
    line.style.width = '0';
    line.style.borderLeft = '3px dashed rgba(76, 82, 93, .62)';
    line.style.borderRadius = '0';
    line.style.background = 'transparent';
    line.style.boxShadow = 'none';
    line.style.filter = 'drop-shadow(0 1px 2px rgba(23, 32, 51, .18))';
  }
}

function prepareCaptureMarkerTracks(root) {
  root.querySelectorAll('.board-marker-row').forEach((row) => {
    const track = row.querySelector('.board-marker-track');
    const fill = row.querySelector('.board-marker-fill');
    if (!track || !fill) return;

    const fillWidth = getComputedStyle(row).getPropertyValue('--marker-fill-width').trim() || '0%';
    track.style.background = `linear-gradient(90deg, #58a9ff 0, #2f7ee6 ${fillWidth}, rgba(157, 166, 179, .56) ${fillWidth}, rgba(157, 166, 179, .56) 100%)`;
    track.style.overflow = 'hidden';
    track.style.borderRadius = '999px';
    fill.style.display = 'none';
  });
}

function getBoardCaptureHeight(root = boardShell) {
  const head = root.querySelector('#boardHead');
  const rows = root.querySelector('#projectRows');
  if (!head || !rows) return root.getBoundingClientRect().height;

  return head.getBoundingClientRect().height + getVisibleTimelineHeight(rows);
}

async function copyCanvasToClipboard(canvas) {
  if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
    console.warn('Clipboard image write is not supported in this browser');
    return false;
  }

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) {
    console.warn('Unable to create image blob for clipboard');
    return false;
  }

  try {
    await navigator.clipboard.write([
      new ClipboardItem({ 'image/png': blob }),
    ]);
    return true;
  } catch (error) {
    console.warn('Unable to copy board image to clipboard', error);
    return false;
  }
}

function injectCaptureStripes(root) {
  root.querySelectorAll('.row-timeline-canvas:not(.edit-schedule-canvas)').forEach((canvas) => {
    const totalDays = Number.parseInt(canvas.style.getPropertyValue('--timeline-days'), 10);
    if (!Number.isFinite(totalDays) || totalDays < 1) return;

    const stripes = document.createElement('div');
    stripes.className = 'capture-stripes';
    stripes.style.gridTemplateColumns = `repeat(${totalDays}, minmax(0, 1fr))`;
    stripes.setAttribute('aria-hidden', 'true');

    const fragment = document.createDocumentFragment();
    for (let index = 0; index < totalDays; index += 1) {
      fragment.appendChild(document.createElement('span'));
    }
    stripes.appendChild(fragment);
    canvas.insertBefore(stripes, canvas.firstChild);
  });
}

function downloadUrl(url, filename) {
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

addProjectBtn.addEventListener('click', () => {
  const project = createProject('New Project', 'Plan', 1, DEFAULT_DURATION_DAYS, 0, []);
  projects.unshift(project);
  editingProjectId = project.id;
  render();
});

viewModeButtons.forEach((button) => {
  button.addEventListener('click', () => {
    editingProjectId = null;
    setViewMode(button.dataset.viewMode);
    render();
  });
});

toggleSettingBtn.addEventListener('click', () => {
  setSettingHidden(!settingHidden);
  render();
});

captureBoardBtn.addEventListener('click', () => {
  captureBoardShell();
});

window.addEventListener('keydown', (event) => {
  if (!['Delete', 'Backspace'].includes(event.key) || !activeConnectorId) return;
  if (event.target.closest('input, textarea, select')) return;

  const project = projects.find((item) => item.id === editingProjectId);
  if (!project) return;

  const nextLinks = project.markerLinks.filter((link) => link.id !== activeConnectorId);
  if (nextLinks.length === project.markerLinks.length) return;

  event.preventDefault();
  project.markerLinks = nextLinks;
  activeConnectorId = null;
  saveState();
  render();
});

markerForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const project = projects.find((item) => item.id === activeMarkerProjectId);
  if (project) {
    const startDay = dayFromDate(project, markerStartDate.value);
    const endDay = dayFromDate(project, markerEndDate.value);
    const markerStartDay = Math.min(startDay, endDay);
    const markerEndDay = Math.max(startDay, endDay);
    project.markers.push(createMarker(markerEndDay, markerLabel.value.trim(), project.durationDays, markerStartDay));
    project.markers.sort((a, b) => a.day - b.day);
    render();
  }
  markerDialog.close();
});

cancelMarkerBtn.addEventListener('click', () => markerDialog.close());

markerStartDate.addEventListener('change', () => {
  if (!markerEndDate.value || markerEndDate.value < markerStartDate.value) {
    markerEndDate.value = markerStartDate.value;
  }
});

markerEndDate.addEventListener('change', () => {
  if (!markerStartDate.value || markerStartDate.value > markerEndDate.value) {
    markerStartDate.value = markerEndDate.value;
  }
});

accountBtn.addEventListener('click', () => {
  accountInput.value = '';
  updateAccountControls();
  accountDialog.showModal();
});

accountForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const nextAccountId = normalizeAccountId(accountInput.value) || accountSelect.value;
  const createIfMissing = Boolean(normalizeAccountId(accountInput.value));
  await switchAccount(nextAccountId, createIfMissing);
  accountDialog.close();
});

cancelAccountBtn.addEventListener('click', () => accountDialog.close());

function fitCompanyInput() {
  const length = Math.max(customerName.value.length, 8);
  customerName.style.width = `${length + 1}ch`;
}

customerName.addEventListener('input', () => {
  fitCompanyInput();
  saveState();
});
fitCompanyInput();

window.addEventListener('resize', () => {
  updateTimelineMetrics();
  updateNowMarkerPosition();
  updateTimelineScrollbar();
  scheduleBoardMarkerDisplay();
});

async function initializeApp() {
  await loadLastAccount();
  await loadAccountList();
  await loadState();
  rememberActiveAccount();
  fitCompanyInput();
  updateAccountControls();
  render();
}

initializeApp();
