const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_DURATION_DAYS = 90;

const boardHead = document.getElementById('boardHead');
const rowsEl = document.getElementById('projectRows');
const timelineScrollbar = document.getElementById('timelineScrollbar');
const addProjectBtn = document.getElementById('addProjectBtn');
const viewModeButtons = [...document.querySelectorAll('[data-view-mode]')];
const markerDialog = document.getElementById('markerDialog');
const markerForm = document.getElementById('markerForm');
const markerDate = document.getElementById('markerDate');
const markerLabel = document.getElementById('markerLabel');
const cancelMarkerBtn = document.getElementById('cancelMarkerBtn');

let viewMode = 'full';
let activeMarkerProjectId = null;
let editingProjectId = null;

const today = startOfDay(new Date());

let projects = [
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

function createProject(name, stage, progressDays, durationDays = DEFAULT_DURATION_DAYS, startOffsetDays = 0, markers = []) {
  const safeDuration = Math.max(1, Math.round(durationDays));
  return {
    id: crypto.randomUUID(),
    name,
    stage,
    startDate: formatDate(addDays(today, startOffsetDays)),
    durationDays: safeDuration,
    progressDays: clamp(Math.round(progressDays), 1, safeDuration),
    markers: markers.map((marker) => ({
      ...marker,
      day: clamp(marker.day, 1, safeDuration),
    })),
  };
}

function createMarker(day, label, durationDays = DEFAULT_DURATION_DAYS) {
  return {
    id: crypto.randomUUID(),
    day: clamp(Math.round(day), 1, durationDays),
    label,
  };
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

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function progressPercent(project) {
  return Math.round((project.progressDays / project.durationDays) * 100);
}

function normalizeProject(project) {
  project.durationDays = Math.max(1, Math.round(project.durationDays));
  project.progressDays = clamp(Math.round(project.progressDays), 1, project.durationDays);
  project.startDate = project.startDate || formatDate(today);
  project.markers.forEach((marker) => {
    marker.day = clamp(Math.round(marker.day), 1, project.durationDays);
  });
}

function getTimelineRange() {
  if (viewMode === 'month') {
    const start = startOfDay(new Date(today.getFullYear(), today.getMonth(), 1));
    const end = startOfDay(new Date(today.getFullYear(), today.getMonth() + 1, 0));
    return { start, end };
  }

  const starts = projects.map((project) => parseDate(project.startDate).getTime());
  const ends = projects.map((project) => parseDate(projectEndDate(project)).getTime());
  return {
    start: new Date(Math.min(...starts)),
    end: new Date(Math.max(...ends)),
  };
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

function render() {
  rowsEl.innerHTML = '';
  rowsEl.className = 'project-rows timeline-grid';
  timelineScrollbar.className = 'timeline-scrollbar';
  projects.forEach(normalizeProject);
  renderHeader();

  const frag = document.createDocumentFragment();
  projects.forEach((project) => frag.appendChild(renderRow(project)));
  rowsEl.appendChild(frag);
  setupResize();
  updateTimelineScrollbar();
  syncProgressScroll();
}

function setViewMode(nextMode) {
  viewMode = nextMode;
  viewModeButtons.forEach((button) => {
    button.classList.toggle('is-active', button.dataset.viewMode === viewMode);
  });
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
  const title = viewMode === 'month' ? monthLabel(today) : 'Full Project';
  return `
    <div class="timeline-canvas timeline-header-canvas is-${viewMode}" style="--timeline-days: ${days.length}">
      <div class="timeline-title">${title}</div>
      <div class="timeline-weekdays">
        ${days.map((day) => `<span>${weekdayLabel(day.date)}</span>`).join('')}
      </div>
      <div class="timeline-dates">
        ${days.map((day) => `<span>${day.date.getDate()}</span>`).join('')}
      </div>
    </div>
  `;
}

function renderRow(project) {
  const isEditing = editingProjectId === project.id;
  const row = document.createElement('article');
  row.className = `project-row timeline-row ${isEditing ? 'is-editing' : ''}`;
  row.dataset.id = project.id;

  if (isEditing) {
    row.innerHTML = `
      <div class="edit-block">
        <div class="edit-progress-row">
          ${renderEditProgress(project)}
        </div>
        <div class="edit-fields-row">
          ${renderEditorFields(project)}
        </div>
        <div class="edit-actions-row">
          <button class="small-button add-marker" type="button" title="Add flag">
            <i class="fa-solid fa-flag"></i>
          </button>
          <button class="small-button delete-button delete-project" type="button" title="Delete project">
            <i class="fa-regular fa-trash-can"></i>
          </button>
          <button class="small-button edit-project" type="button" title="Close editor">
            <i class="fa-solid fa-check"></i>
          </button>
        </div>
      </div>
    `;
    row.querySelector('.edit-project').addEventListener('click', () => {
      editingProjectId = null;
      render();
    });
    bindEditor(row, project);
    return row;
  }

  row.innerHTML = `
    <div class="row-summary timeline-summary">
      <div class="project-title">${escapeHtml(project.name)}</div>
      ${renderTimeline(project)}
      <div class="row-actions">
        <button class="small-button edit-project" type="button" title="${isEditing ? 'Close editor' : 'Edit project'}">
          <i class="fa-solid ${isEditing ? 'fa-check' : 'fa-gear'}"></i>
        </button>
      </div>
    </div>
  `;

  row.querySelector('.edit-project').addEventListener('click', () => {
    editingProjectId = isEditing ? null : project.id;
    if (!isEditing) setViewMode('full');
    render();
  });

  if (isEditing) bindEditor(row, project);

  return row;
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

  return `
    <div class="progress-scroll">
      <div class="timeline-canvas row-timeline-canvas is-${viewMode}" style="--timeline-days: ${days.length}">
        ${hasVisibleRange ? `<div class="timeline-bar" style="left: ${left}; width: ${width}"><span>${progressPercent(project)}%</span></div>` : ''}
      </div>
    </div>
  `;
}

function renderEditProgress(project) {
  const percent = progressPercent(project);
  const fillWidth = `${percent}%`;
  const dayWidth = `max(3px, calc(100% / ${project.durationDays}))`;

  return `
    <div class="progress-cell">
      <div class="timeline timeline-editing" style="--day-width: ${dayWidth}" aria-label="Progress">
        <div class="fill is-editable ${percent === 100 ? 'is-complete' : ''}" style="width: ${fillWidth}" data-days="${project.progressDays}" data-duration="${project.durationDays}">
          <span class="resize-handle"></span>
        </div>
        ${project.markers.map((marker) => renderMarker(marker, project)).join('')}
      </div>
    </div>
  `;
}

function renderEditorFields(project) {
  return `
      <label>
        <span>Project Name</span>
        <input class="name-input" type="text" value="${escapeAttr(project.name)}">
      </label>
      <label>
        <span>Stage</span>
        <select class="stage-select">
          ${['Plan', 'Start', 'Execute', 'Control', 'Close'].map((stage) => (
            `<option value="${stage}" ${stage === project.stage ? 'selected' : ''}>${stage}</option>`
          )).join('')}
        </select>
      </label>
      <label>
        <span>Start Date</span>
        <input class="start-input" type="date" value="${project.startDate}">
      </label>
      <label>
        <span>Project Duration</span>
        <input class="duration-input" type="number" min="1" step="1" value="${project.durationDays}">
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
    row.querySelector('.project-title').textContent = project.name || 'Untitled Project';
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
    markerDate.value = formatDate(dateFromProjectDay(project, project.progressDays));
    markerLabel.value = '';
    markerDialog.showModal();
  });

  row.querySelector('.delete-project').addEventListener('click', () => {
    projects = projects.filter((item) => item.id !== project.id);
    editingProjectId = null;
    render();
  });

  row.querySelectorAll('.delete-marker').forEach((button) => {
    button.addEventListener('click', () => {
      project.markers = project.markers.filter((marker) => marker.id !== button.dataset.markerId);
      render();
    });
  });
}

function renderMarker(marker, project) {
  const left = `${((marker.day - 1) / Math.max(1, project.durationDays - 1)) * 100}%`;
  const date = formatDate(dateFromProjectDay(project, marker.day));
  return `
    <div class="marker" style="left: ${left}">
      <button class="delete-marker" type="button" data-marker-id="${marker.id}" title="Delete flag">
        <i class="fa-solid fa-flag"></i>
      </button>
      <div class="marker-label">
        <span class="marker-date">${date}</span>
        ${escapeHtml(marker.label)}
      </div>
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

addProjectBtn.addEventListener('click', () => {
  const project = createProject('New Project', 'Plan', 1, DEFAULT_DURATION_DAYS, 0, []);
  projects.unshift(project);
  editingProjectId = project.id;
  setViewMode('full');
  render();
});

viewModeButtons.forEach((button) => {
  button.addEventListener('click', () => {
    editingProjectId = null;
    setViewMode(button.dataset.viewMode);
    render();
  });
});

markerForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const project = projects.find((item) => item.id === activeMarkerProjectId);
  if (project) {
    project.markers.push(createMarker(dayFromDate(project, markerDate.value), markerLabel.value.trim(), project.durationDays));
    project.markers.sort((a, b) => a.day - b.day);
    render();
  }
  markerDialog.close();
});

cancelMarkerBtn.addEventListener('click', () => markerDialog.close());

render();
