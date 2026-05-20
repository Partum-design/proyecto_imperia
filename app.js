const STORAGE_KEY = "imperia_crm_v5";

const STATUS_OPTIONS = ["Sin iniciar", "En progreso", "En revision", "Completado", "Bloqueada"];
const PRIORITY_OPTIONS = ["baja", "media", "alta"];
const EVENT_TYPES = ["reunion", "entrega", "seguimiento", "interno", "otro"];
const ACCESSIBILITY_KEY = "imperia_accessibility_v1";

const state = {
  store: null,
  accessibility: {
    contrast: false,
    motion: true,
    density: "comfortable",
  },
};

const views = {
  dashboard: document.getElementById("dashboard-view"),
  tasks: document.getElementById("tasks-view"),
  clients: document.getElementById("clients-view"),
  team: document.getElementById("team-view"),
  reports: document.getElementById("reports-view"),
  calendar: document.getElementById("calendar-view"),
  alerts: document.getElementById("alerts-view"),
};

const icon = (name) => `<span class="material-symbols-rounded" aria-hidden="true">${name}</span>`;
const esc = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const todayYMD = () => new Date().toISOString().slice(0, 10);
const currentMonth = () => todayYMD().slice(0, 7);
const currentYear = () => new Date().getFullYear();
const currentQuarter = () => Math.floor(new Date().getMonth() / 3) + 1;

function fmtDate(value) {
  if (!value) return "Sin fecha";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Sin fecha" : date.toLocaleDateString("es-MX");
}

function dayDiff(value) {
  if (!value) return null;
  const due = new Date(value);
  if (Number.isNaN(due.getTime())) return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  return Math.round((due - now) / 86400000);
}

function alertFor(task) {
  const days = dayDiff(task.dueDate);
  if (task.status === "Completado") return { label: "Completada", tone: "ok" };
  if (days === null) return { label: "Sin fecha", tone: "info" };
  if (days < 0) return { label: `Vencida ${Math.abs(days)}d`, tone: "danger" };
  if (days === 0) return { label: "Hoy", tone: "danger" };
  if (days <= 2) return { label: `${days}d`, tone: "warn" };
  return { label: `${days}d`, tone: "info" };
}

function nextId(type) {
  const key = `${type}Seq`;
  const prefix = type[0].toUpperCase();
  state.store[key] = (state.store[key] || 0) + 1;
  return `${prefix}${String(state.store[key]).padStart(4, "0")}`;
}

function loadAccessibility() {
  try {
    state.accessibility = { ...state.accessibility, ...JSON.parse(localStorage.getItem(ACCESSIBILITY_KEY) || "{}") };
  } catch {
    localStorage.removeItem(ACCESSIBILITY_KEY);
  }
  applyAccessibility();
}

function applyAccessibility() {
  document.documentElement.dataset.contrast = state.accessibility.contrast ? "high" : "normal";
  document.documentElement.dataset.motion = state.accessibility.motion ? "on" : "off";
  document.documentElement.dataset.density = state.accessibility.density;
  localStorage.setItem(ACCESSIBILITY_KEY, JSON.stringify(state.accessibility));
}

function saveStore() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.store));
  document.getElementById("sync-label").textContent = `Guardado ${new Date().toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}`;
}

function getClient(id) {
  return state.store.clients.find((item) => item.id === id);
}

function getMember(id) {
  return state.store.members.find((item) => item.id === id);
}

function clientName(id) {
  return getClient(id)?.name || "Sin cliente";
}

function memberName(id) {
  return getMember(id)?.name || "Sin responsable";
}

function selectOptions(items, selected, label) {
  return `<option value="">${esc(label)}</option>${items.map((item) => `<option value="${esc(item.id)}" ${item.id === selected ? "selected" : ""}>${esc(item.name)}</option>`).join("")}`;
}

function buildStore(seed) {
  const members = (seed.employees || []).map((item, index) => ({
    id: `M${String(index + 1).padStart(4, "0")}`,
    name: item.name || "",
    email: item.email || "",
    department: item.department || "",
    role: item.role || "",
    target: 100,
    createdAt: new Date().toISOString(),
  }));

  return {
    version: 5,
    members,
    clients: [],
    tasks: [],
    events: [],
    settings: {
      bonusTarget: 85,
      reportMonth: currentMonth(),
      reportQuarter: currentQuarter(),
      reportYear: currentYear(),
    },
    taskSeq: 0,
    clientSeq: 0,
    memberSeq: members.length,
    eventSeq: 0,
  };
}

function normalizeStore(store) {
  store.members ||= [];
  store.clients ||= [];
  store.tasks ||= [];
  store.events ||= [];
  store.settings = {
    bonusTarget: 85,
    reportMonth: currentMonth(),
    reportQuarter: currentQuarter(),
    reportYear: currentYear(),
    ...(store.settings || {}),
  };
  store.taskSeq ||= store.tasks.length;
  store.clientSeq ||= store.clients.length;
  store.memberSeq ||= store.members.length;
  store.eventSeq ||= store.events.length;
  return store;
}

async function loadStore() {
  const cached = localStorage.getItem(STORAGE_KEY);
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      if (parsed?.version === 5) return normalizeStore(parsed);
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }
  const response = await fetch("./data/data.json");
  return normalizeStore(buildStore(await response.json()));
}

function dateInMonth(value, month) {
  return Boolean(value && month && String(value).slice(0, 7) === month);
}

function dateInQuarter(value, quarter, year) {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return date.getFullYear() === Number(year) && Math.floor(date.getMonth() / 3) + 1 === Number(quarter);
}

function kpiScore(tasks) {
  if (!tasks.length) return 0;
  const completed = tasks.filter((task) => task.status === "Completado").length;
  const progress = tasks.reduce((sum, task) => sum + Number(task.progress || 0), 0) / tasks.length;
  const overduePenalty = tasks.filter((task) => dayDiff(task.dueDate) < 0 && task.status !== "Completado").length * 8;
  return Math.max(0, Math.min(100, Math.round(((completed / tasks.length) * 55) + (progress * 0.45) - overduePenalty)));
}

function filteredTasksByPeriod(period, options = {}) {
  if (period === "month") return state.store.tasks.filter((task) => dateInMonth(task.dueDate || task.startDate, options.month));
  if (period === "quarter") return state.store.tasks.filter((task) => dateInQuarter(task.dueDate || task.startDate, options.quarter, options.year));
  if (period === "semester") {
    const semester = Number(options.semester);
    return state.store.tasks.filter((task) => {
      const value = task.dueDate || task.startDate;
      if (!value) return false;
      const date = new Date(value);
      if (Number.isNaN(date.getTime()) || date.getFullYear() !== Number(options.year)) return false;
      return semester === 1 ? date.getMonth() <= 5 : date.getMonth() >= 6;
    });
  }
  return state.store.tasks;
}

function statsForMembers(tasks) {
  return state.store.members.map((member) => {
    const personTasks = tasks.filter((task) => task.memberId === member.id);
    return {
      ...member,
      tasks: personTasks.length,
      completed: personTasks.filter((task) => task.status === "Completado").length,
      overdue: personTasks.filter((task) => dayDiff(task.dueDate) < 0 && task.status !== "Completado").length,
      score: kpiScore(personTasks),
    };
  });
}

function statsForAreas(tasks) {
  const base = new Map();
  state.store.members.forEach((member) => {
    const area = member.department || "Sin area";
    if (!base.has(area)) base.set(area, { area, tasks: [], members: 0 });
    base.get(area).members += 1;
  });
  tasks.forEach((task) => {
    const area = getMember(task.memberId)?.department || "Sin area";
    if (!base.has(area)) base.set(area, { area, tasks: [], members: 0 });
    base.get(area).tasks.push(task);
  });
  return [...base.values()].map((item) => ({
    area: item.area,
    members: item.members,
    tasks: item.tasks.length,
    completed: item.tasks.filter((task) => task.status === "Completado").length,
    overdue: item.tasks.filter((task) => dayDiff(task.dueDate) < 0 && task.status !== "Completado").length,
    score: kpiScore(item.tasks),
  }));
}

function areaStats() {
  const stats = new Map();
  state.store.members.forEach((member) => {
    const area = member.department || "Sin area";
    if (!stats.has(area)) stats.set(area, { area, members: 0, clients: 0, tasks: 0, completed: 0, active: 0, overdue: 0, progress: 0 });
    stats.get(area).members += 1;
  });

  state.store.clients.forEach((client) => {
    const owner = getMember(client.ownerId);
    const area = owner?.department || "Sin area";
    if (!stats.has(area)) stats.set(area, { area, members: 0, clients: 0, tasks: 0, completed: 0, active: 0, overdue: 0, progress: 0 });
    stats.get(area).clients += 1;
  });

  state.store.tasks.forEach((task) => {
    const owner = getMember(task.memberId);
    const area = owner?.department || "Sin area";
    if (!stats.has(area)) stats.set(area, { area, members: 0, clients: 0, tasks: 0, completed: 0, active: 0, overdue: 0, progress: 0 });
    const stat = stats.get(area);
    stat.tasks += 1;
    stat.progress += Number(task.progress || 0);
    if (task.status === "Completado") stat.completed += 1;
    else stat.active += 1;
    if (dayDiff(task.dueDate) < 0 && task.status !== "Completado") stat.overdue += 1;
  });

  return [...stats.values()].map((stat) => ({
    ...stat,
    avgProgress: stat.tasks ? Math.round(stat.progress / stat.tasks) : 0,
    completion: stat.tasks ? Math.round((stat.completed / stat.tasks) * 100) : 0,
  }));
}

function memberStats() {
  return state.store.members.map((member) => {
    const tasks = state.store.tasks.filter((task) => task.memberId === member.id);
    const clients = state.store.clients.filter((client) => client.ownerId === member.id);
    const completed = tasks.filter((task) => task.status === "Completado").length;
    const overdue = tasks.filter((task) => dayDiff(task.dueDate) < 0 && task.status !== "Completado").length;
    const avgProgress = tasks.length ? Math.round(tasks.reduce((sum, task) => sum + Number(task.progress || 0), 0) / tasks.length) : 0;
    return { ...member, tasks: tasks.length, clients: clients.length, completed, overdue, avgProgress };
  });
}

function renderKpis() {
  const tasks = state.store.tasks;
  const members = state.store.members.length;
  const areas = new Set(state.store.members.map((member) => member.department || "Sin area")).size;
  const active = tasks.filter((task) => task.status !== "Completado").length;
  const completed = tasks.filter((task) => task.status === "Completado").length;
  const overdue = tasks.filter((task) => dayDiff(task.dueDate) < 0 && task.status !== "Completado").length;
  const cards = [
    ["groups", "Equipo", members, `${areas} areas`],
    ["domain", "Clientes", state.store.clients.length, "editables"],
    ["task_alt", "Tareas activas", active, `${completed} cerradas`],
    ["warning", "Riesgo", overdue, "vencidas"],
    ["monitoring", "Carga promedio", members ? Math.round(active / members) : 0, "por persona"],
  ];
  document.getElementById("kpi-grid").innerHTML = cards.map(([ic, title, value, hint]) => `
    <article class="kpi">
      <div class="kpi-icon">${icon(ic)}</div>
      <div><span>${esc(title)}</span><strong>${esc(value)}</strong><small>${esc(hint)}</small></div>
    </article>
  `).join("");
}

function renderDashboard() {
  const areas = areaStats();
  const people = memberStats();
  const maxTasks = Math.max(1, ...people.map((item) => item.tasks));

  views.dashboard.innerHTML = `
    <section class="dashboard-grid">
      <article class="panel span-2 intro-panel">
        <div>
          <p class="eyebrow">OPERACION</p>
          <h2>Vista ejecutiva por area y persona</h2>
        </div>
        <div class="quick-metrics">
          <span>${state.store.members.length} personas</span>
          <span>${state.store.clients.length} clientes</span>
          <span>${state.store.tasks.length} tareas</span>
        </div>
      </article>
      <article class="panel">
        <h3>Areas</h3>
        <div class="area-stack">${areas.map((item) => `
          <div class="area-row">
            <div>
              <strong>${esc(item.area)}</strong>
              <span>${item.members} pers. / ${item.clients} clientes / ${item.tasks} tareas</span>
            </div>
            <div class="ring" style="--value:${item.completion || 0}"><span>${item.completion}%</span></div>
          </div>
        `).join("")}</div>
      </article>
      <article class="panel span-2">
        <h3>Personal</h3>
        <div class="people-kpis">${people.map((person, index) => `
          <div class="person-kpi" style="--delay:${index * 60}ms">
            <div class="avatar">${esc(person.name.split(" ").map((part) => part[0]).join("").slice(0, 2))}</div>
            <div class="person-body">
              <div><strong>${esc(person.name)}</strong><span>${esc(person.role)} / ${esc(person.department)}</span></div>
              <div class="bar"><span style="width:${Math.max(5, (person.tasks / maxTasks) * 100)}%"></span></div>
              <div class="metric-line">
                <span>${person.clients} clientes</span>
                <span>${person.tasks} tareas</span>
                <span>${person.avgProgress}% avance</span>
                <span>${person.overdue} vencidas</span>
              </div>
            </div>
          </div>
        `).join("")}</div>
      </article>
      <article class="panel">
        <h3>Accesibilidad</h3>
        <div class="accessibility-grid">
          <button class="toggle ${state.accessibility.contrast ? "active" : ""}" data-action="toggle-contrast">${icon("contrast")}Contraste</button>
          <button class="toggle ${state.accessibility.motion ? "active" : ""}" data-action="toggle-motion">${icon("animation")}Motion</button>
          <button class="toggle ${state.accessibility.density === "compact" ? "active" : ""}" data-action="toggle-density">${icon("density_medium")}Compacto</button>
        </div>
      </article>
    </section>
  `;
}

function taskForm(task = null) {
  const item = task || { id: "", title: "", description: "", clientId: "", memberId: "", status: "Sin iniciar", priority: "media", progress: 0, startDate: "", dueDate: "" };
  return `
    <form id="task-form" class="editor-form">
      <input type="hidden" name="id" value="${esc(item.id)}">
      <label><span>Tarea</span><input name="title" value="${esc(item.title)}" required></label>
      <label><span>Cliente</span><select name="clientId">${selectOptions(state.store.clients, item.clientId, "Sin cliente")}</select></label>
      <label><span>Responsable</span><select name="memberId">${selectOptions(state.store.members, item.memberId, "Sin responsable")}</select></label>
      <label><span>Status</span><select name="status">${STATUS_OPTIONS.map((status) => `<option ${status === item.status ? "selected" : ""}>${esc(status)}</option>`).join("")}</select></label>
      <label><span>Prioridad</span><select name="priority">${PRIORITY_OPTIONS.map((priority) => `<option value="${priority}" ${priority === item.priority ? "selected" : ""}>${esc(priority)}</option>`).join("")}</select></label>
      <label><span>Inicio</span><input type="date" name="startDate" value="${esc(item.startDate)}"></label>
      <label><span>Entrega</span><input type="date" name="dueDate" value="${esc(item.dueDate)}"></label>
      <label><span>Avance</span><input type="number" min="0" max="100" name="progress" value="${esc(item.progress)}"></label>
      <label class="wide"><span>Notas</span><textarea name="description">${esc(item.description)}</textarea></label>
      <div class="form-actions"><button class="btn filled" type="submit">${icon("save")}Guardar</button>${item.id ? `<button class="btn tonal" type="button" data-action="task-cancel">${icon("close")}Cancelar</button>` : ""}</div>
    </form>`;
}

function renderTasks(editId = "") {
  const edit = state.store.tasks.find((task) => task.id === editId);
  const rows = state.store.tasks.map((task) => {
    const alert = alertFor(task);
    return `<tr>
      <td>${esc(task.title)}</td>
      <td>${esc(clientName(task.clientId))}</td>
      <td>${esc(memberName(task.memberId))}</td>
      <td><select data-action="task-status" data-id="${esc(task.id)}">${STATUS_OPTIONS.map((status) => `<option ${status === task.status ? "selected" : ""}>${esc(status)}</option>`).join("")}</select></td>
      <td><input class="inline-number" data-action="task-progress" data-id="${esc(task.id)}" type="number" min="0" max="100" value="${esc(task.progress)}"></td>
      <td>${esc(fmtDate(task.dueDate))}</td>
      <td><span class="chip ${alert.tone}">${esc(alert.label)}</span></td>
      <td><div class="icon-actions"><button title="Editar" data-action="task-edit" data-id="${esc(task.id)}">${icon("edit")}</button><button title="Borrar" data-action="task-delete" data-id="${esc(task.id)}">${icon("delete")}</button></div></td>
    </tr>`;
  }).join("");

  views.tasks.innerHTML = `<section class="workbench"><article class="panel">${taskForm(edit)}</article><article class="panel table-panel"><h3>Tareas</h3><div class="table-wrap"><table><thead><tr><th>Tarea</th><th>Cliente</th><th>Responsable</th><th>Status</th><th>%</th><th>Entrega</th><th>Alerta</th><th></th></tr></thead><tbody>${rows || "<tr><td colspan='8'>Sin tareas.</td></tr>"}</tbody></table></div></article></section>`;
}

function renderClients(editId = "") {
  const edit = state.store.clients.find((client) => client.id === editId) || { id: "", name: "", contactEmail: "", ownerId: "", notes: "" };
  const cards = state.store.clients.map((client) => {
    const tasks = state.store.tasks.filter((task) => task.clientId === client.id);
    return `<article class="entity-card"><strong>${esc(client.name)}</strong><span>${esc(client.contactEmail || "Sin correo")}</span><div class="chips"><span class="chip info">${tasks.length} tareas</span><span class="chip ok">${esc(memberName(client.ownerId))}</span></div><div class="icon-actions"><button title="Editar" data-action="client-edit" data-id="${esc(client.id)}">${icon("edit")}</button><button title="Borrar" data-action="client-delete" data-id="${esc(client.id)}">${icon("delete")}</button></div></article>`;
  }).join("");

  views.clients.innerHTML = `<section class="workbench"><article class="panel"><form id="client-form" class="editor-form"><input type="hidden" name="id" value="${esc(edit.id)}"><label><span>Cliente</span><input name="name" value="${esc(edit.name)}" required></label><label><span>Correo</span><input type="email" name="contactEmail" value="${esc(edit.contactEmail)}"></label><label><span>Owner</span><select name="ownerId">${selectOptions(state.store.members, edit.ownerId, "Sin owner")}</select></label><label class="wide"><span>Notas</span><textarea name="notes">${esc(edit.notes)}</textarea></label><div class="form-actions"><button class="btn filled" type="submit">${icon("save")}Guardar</button>${edit.id ? `<button class="btn tonal" type="button" data-action="client-cancel">${icon("close")}Cancelar</button>` : ""}</div></form></article><article class="panel"><h3>Clientes</h3><div class="entity-grid">${cards || "<div class='empty-state'>Sin clientes.</div>"}</div></article></section>`;
}

function renderTeam(editId = "") {
  const edit = state.store.members.find((member) => member.id === editId) || { id: "", name: "", email: "", department: "", role: "", target: 100 };
  const cards = memberStats().map((member) => `<article class="entity-card team-card"><div class="avatar">${esc(member.name.split(" ").map((part) => part[0]).join("").slice(0, 2))}</div><strong>${esc(member.name)}</strong><span>${esc(member.role)}</span><span>${esc(member.department)}</span><div class="chips"><span class="chip info">${member.clients} clientes</span><span class="chip warn">${member.tasks} tareas</span></div><div class="icon-actions"><button title="Editar" data-action="member-edit" data-id="${esc(member.id)}">${icon("edit")}</button><button title="Borrar" data-action="member-delete" data-id="${esc(member.id)}">${icon("delete")}</button></div></article>`).join("");

  views.team.innerHTML = `<section class="workbench"><article class="panel"><form id="member-form" class="editor-form"><input type="hidden" name="id" value="${esc(edit.id)}"><label><span>Nombre</span><input name="name" value="${esc(edit.name)}" required></label><label><span>Correo</span><input type="email" name="email" value="${esc(edit.email)}"></label><label><span>Area</span><input name="department" value="${esc(edit.department)}" required></label><label><span>Puesto</span><input name="role" value="${esc(edit.role)}" required></label><label><span>Meta</span><input type="number" min="0" max="100" name="target" value="${esc(edit.target || 100)}"></label><div class="form-actions"><button class="btn filled" type="submit">${icon("save")}Guardar</button>${edit.id ? `<button class="btn tonal" type="button" data-action="member-cancel">${icon("close")}Cancelar</button>` : ""}</div></form></article><article class="panel"><h3>Equipo</h3><div class="entity-grid">${cards}</div></article></section>`;
}

function renderCalendar(editId = "") {
  const edit = state.store.events.find((event) => event.id === editId) || { id: "", title: "", date: todayYMD(), startTime: "09:00", endTime: "10:00", type: "seguimiento", clientId: "", memberId: "", taskId: "", notes: "" };
  const rows = state.store.events.sort((a, b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`)).map((event) => `<tr><td>${esc(fmtDate(event.date))}</td><td>${esc(event.startTime)}</td><td>${esc(event.title)}</td><td>${esc(event.type)}</td><td>${esc(clientName(event.clientId))}</td><td>${esc(memberName(event.memberId))}</td><td><div class="icon-actions"><button title="Editar" data-action="event-edit" data-id="${esc(event.id)}">${icon("edit")}</button><button title="Borrar" data-action="event-delete" data-id="${esc(event.id)}">${icon("delete")}</button></div></td></tr>`).join("");

  views.calendar.innerHTML = `<section class="workbench"><article class="panel"><form id="event-form" class="editor-form"><input type="hidden" name="id" value="${esc(edit.id)}"><label><span>Evento</span><input name="title" value="${esc(edit.title)}" required></label><label><span>Fecha</span><input type="date" name="date" value="${esc(edit.date)}" required></label><label><span>Inicio</span><input type="time" name="startTime" value="${esc(edit.startTime)}"></label><label><span>Fin</span><input type="time" name="endTime" value="${esc(edit.endTime)}"></label><label><span>Tipo</span><select name="type">${EVENT_TYPES.map((type) => `<option ${type === edit.type ? "selected" : ""}>${esc(type)}</option>`).join("")}</select></label><label><span>Cliente</span><select name="clientId">${selectOptions(state.store.clients, edit.clientId, "Sin cliente")}</select></label><label><span>Responsable</span><select name="memberId">${selectOptions(state.store.members, edit.memberId, "Sin responsable")}</select></label><label><span>Tarea</span><select name="taskId"><option value="">Sin tarea</option>${state.store.tasks.map((task) => `<option value="${esc(task.id)}" ${task.id === edit.taskId ? "selected" : ""}>${esc(task.title)}</option>`).join("")}</select></label><label class="wide"><span>Notas</span><textarea name="notes">${esc(edit.notes)}</textarea></label><div class="form-actions"><button class="btn filled" type="submit">${icon("save")}Guardar</button>${edit.id ? `<button class="btn tonal" type="button" data-action="event-cancel">${icon("close")}Cancelar</button>` : ""}</div></form></article><article class="panel table-panel"><h3>Calendario</h3><div class="table-wrap"><table><thead><tr><th>Fecha</th><th>Hora</th><th>Evento</th><th>Tipo</th><th>Cliente</th><th>Responsable</th><th></th></tr></thead><tbody>${rows || "<tr><td colspan='7'>Sin eventos.</td></tr>"}</tbody></table></div></article></section>`;
}

function reportHtml() {
  const settings = state.store.settings;
  const monthTasks = filteredTasksByPeriod("month", { month: settings.reportMonth });
  const quarterTasks = filteredTasksByPeriod("quarter", { quarter: settings.reportQuarter, year: settings.reportYear });
  const semester = Number(settings.reportQuarter) <= 2 ? 1 : 2;
  const semesterTasks = filteredTasksByPeriod("semester", { semester, year: settings.reportYear });
  const areaRows = statsForAreas(monthTasks);
  const memberRows = statsForMembers(monthTasks);
  const semesterScore = kpiScore(semesterTasks);
  const bonusTarget = Number(settings.bonusTarget || 85);
  const bonusStatus = semesterScore >= bonusTarget ? "Cumple" : "No cumple";
  const planning = [
    ...quarterTasks.map((task) => ({ type: "Tarea", title: task.title, owner: memberName(task.memberId), date: task.dueDate || task.startDate, status: task.status })),
    ...state.store.events.filter((eventItem) => dateInQuarter(eventItem.date, settings.reportQuarter, settings.reportYear)).map((eventItem) => ({ type: "Evento", title: eventItem.title, owner: memberName(eventItem.memberId), date: eventItem.date, status: eventItem.type })),
  ].sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));

  return `
    <article class="report-document" id="generated-report">
      <header class="report-header">
        <div>
          <p class="eyebrow">REPORTE KPI</p>
          <h2>Proyecto Imperia</h2>
          <span>Mensual ${esc(settings.reportMonth)} / Q${esc(settings.reportQuarter)} ${esc(settings.reportYear)}</span>
        </div>
        <div class="bonus-card">
          <span>Bono semestral</span>
          <strong>${semesterScore}%</strong>
          <small>Meta ${bonusTarget}% / ${bonusStatus}</small>
        </div>
      </header>
      <section class="report-section">
        <h3>KPI mensual por area</h3>
        <div class="report-grid">${areaRows.map((row) => `
          <div class="report-tile">
            <strong>${esc(row.area)}</strong>
            <div class="ring" style="--value:${row.score}"><span>${row.score}%</span></div>
            <small>${row.tasks} tareas / ${row.completed} cerradas / ${row.overdue} vencidas</small>
          </div>
        `).join("")}</div>
      </section>
      <section class="report-section">
        <h3>KPI mensual por persona</h3>
        <div class="table-wrap"><table><thead><tr><th>Persona</th><th>Area</th><th>Rol</th><th>Tareas</th><th>Cerradas</th><th>Vencidas</th><th>KPI</th></tr></thead><tbody>${memberRows.map((row) => `<tr><td>${esc(row.name)}</td><td>${esc(row.department)}</td><td>${esc(row.role)}</td><td>${row.tasks}</td><td>${row.completed}</td><td>${row.overdue}</td><td><strong>${row.score}%</strong></td></tr>`).join("")}</tbody></table></div>
      </section>
      <section class="report-section">
        <h3>Planeacion trimestral</h3>
        <div class="table-wrap"><table><thead><tr><th>Tipo</th><th>Elemento</th><th>Responsable</th><th>Fecha</th><th>Status</th></tr></thead><tbody>${planning.map((item) => `<tr><td>${esc(item.type)}</td><td>${esc(item.title)}</td><td>${esc(item.owner)}</td><td>${esc(fmtDate(item.date))}</td><td>${esc(item.status)}</td></tr>`).join("") || "<tr><td colspan='5'>Sin planeacion trimestral registrada.</td></tr>"}</tbody></table></div>
      </section>
      <section class="report-section">
        <h3>Objetivo global</h3>
        <p>El objetivo general se calcula con tareas del semestre: cumplimiento de cierres, avance promedio y penalizacion por vencimientos. El bono semestral se habilita cuando el KPI global llega o supera la meta configurada.</p>
      </section>
    </article>`;
}

function renderReports() {
  const settings = state.store.settings;
  views.reports.innerHTML = `
    <section class="report-layout">
      <article class="panel">
        <h3>Configuracion de reporte</h3>
        <form id="report-settings-form" class="editor-form">
          <label><span>Mes KPI</span><input type="month" name="reportMonth" value="${esc(settings.reportMonth)}"></label>
          <label><span>Trimestre</span><select name="reportQuarter">${[1, 2, 3, 4].map((quarter) => `<option value="${quarter}" ${Number(settings.reportQuarter) === quarter ? "selected" : ""}>Q${quarter}</option>`).join("")}</select></label>
          <label><span>Año</span><input type="number" min="2020" max="2100" name="reportYear" value="${esc(settings.reportYear)}"></label>
          <label><span>Meta bono semestral %</span><input type="number" min="0" max="100" name="bonusTarget" value="${esc(settings.bonusTarget)}"></label>
          <div class="form-actions">
            <button class="btn filled" type="submit">${icon("save")}Actualizar</button>
            <button class="btn tonal" type="button" data-action="download-report">${icon("download")}Exportar</button>
            <button class="btn tonal" type="button" data-action="print-report">${icon("print")}Imprimir</button>
          </div>
        </form>
      </article>
      ${reportHtml()}
    </section>`;
}

function renderAlerts() {
  const urgent = state.store.tasks.filter((task) => {
    const diff = dayDiff(task.dueDate);
    return diff !== null && diff <= 2 && task.status !== "Completado";
  });
  const cards = urgent.map((task) => {
    const alert = alertFor(task);
    return `<article class="entity-card"><strong>${esc(task.title)}</strong><span>${esc(clientName(task.clientId))} / ${esc(memberName(task.memberId))}</span><span class="chip ${alert.tone}">${esc(alert.label)}</span></article>`;
  }).join("");

  views.alerts.innerHTML = `<section class="workbench"><article class="panel"><h3>Alertas</h3><div class="entity-grid">${cards || "<div class='empty-state'>Sin alertas.</div>"}</div></article><article class="panel"><h3>Correo de prueba</h3><form id="alert-test-form" class="editor-form"><label><span>Enviar a</span><input type="email" name="to" required></label><label><span>Asunto</span><input name="subject" value="Prueba de alertas Proyecto Imperia"></label><label class="wide"><span>Mensaje</span><textarea name="message">Prueba de alertas Proyecto Imperia.</textarea></label><div class="form-actions"><button class="btn filled" type="submit">${icon("send")}Enviar</button></div></form><div id="alert-test-result" class="result-line"></div></article></section>`;
}

function renderAll() {
  renderKpis();
  renderDashboard();
  renderTasks();
  renderClients();
  renderTeam();
  renderReports();
  renderCalendar();
  renderAlerts();
}

function refresh(section) {
  renderKpis();
  renderDashboard();
  renderReports();
  renderAlerts();
  if (section === "tasks") renderTasks();
  if (section === "clients") renderClients();
  if (section === "team") renderTeam();
  if (section === "reports") renderReports();
  if (section === "calendar") renderCalendar();
}

function switchTab(tab) {
  document.querySelectorAll(".tab").forEach((button) => button.classList.toggle("active", button.dataset.tab === tab));
  Object.entries(views).forEach(([key, view]) => view.classList.toggle("active", key === tab));
}

function removeById(list, id) {
  return list.filter((item) => item.id !== id);
}

function downloadReport() {
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Reporte KPI Proyecto Imperia</title><link rel="stylesheet" href="styles.css"></head><body><main class="app-shell">${reportHtml()}</main></body></html>`;
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `reporte-kpi-${state.store.settings.reportMonth}.html`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function printReport() {
  const report = document.getElementById("generated-report");
  if (!report) return;
  const printWindow = window.open("", "_blank", "width=1200,height=900");
  printWindow.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Reporte KPI Proyecto Imperia</title><link rel="stylesheet" href="styles.css"></head><body><main class="app-shell">${report.outerHTML}</main></body></html>`);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => printWindow.print(), 300);
}

function bindEvents() {
  document.getElementById("tab-nav").addEventListener("click", (event) => {
    const button = event.target.closest(".tab");
    if (button) switchTab(button.dataset.tab);
  });

  document.addEventListener("click", (event) => {
    const control = event.target.closest("[data-action]");
    if (!control) return;
    const { action, id } = control.dataset;

    if (action === "toggle-contrast") {
      state.accessibility.contrast = !state.accessibility.contrast;
      applyAccessibility();
      return renderDashboard();
    }
    if (action === "toggle-motion") {
      state.accessibility.motion = !state.accessibility.motion;
      applyAccessibility();
      return renderDashboard();
    }
    if (action === "toggle-density") {
      state.accessibility.density = state.accessibility.density === "compact" ? "comfortable" : "compact";
      applyAccessibility();
      return renderDashboard();
    }
    if (action === "download-report") return downloadReport();
    if (action === "print-report") return printReport();

    if (action === "task-edit") return renderTasks(id);
    if (action === "task-cancel") return renderTasks();
    if (action === "task-delete" && confirm("Borrar tarea?")) {
      state.store.tasks = removeById(state.store.tasks, id);
      state.store.events = state.store.events.filter((eventItem) => eventItem.taskId !== id);
      saveStore();
      return refresh("tasks");
    }

    if (action === "client-edit") return renderClients(id);
    if (action === "client-cancel") return renderClients();
    if (action === "client-delete" && confirm("Borrar cliente?")) {
      state.store.clients = removeById(state.store.clients, id);
      state.store.tasks.forEach((task) => { if (task.clientId === id) task.clientId = ""; });
      state.store.events.forEach((eventItem) => { if (eventItem.clientId === id) eventItem.clientId = ""; });
      saveStore();
      return refresh("clients");
    }

    if (action === "member-edit") return renderTeam(id);
    if (action === "member-cancel") return renderTeam();
    if (action === "member-delete" && confirm("Borrar miembro?")) {
      state.store.members = removeById(state.store.members, id);
      state.store.clients.forEach((client) => { if (client.ownerId === id) client.ownerId = ""; });
      state.store.tasks.forEach((task) => { if (task.memberId === id) task.memberId = ""; });
      state.store.events.forEach((eventItem) => { if (eventItem.memberId === id) eventItem.memberId = ""; });
      saveStore();
      return refresh("team");
    }

    if (action === "event-edit") return renderCalendar(id);
    if (action === "event-cancel") return renderCalendar();
    if (action === "event-delete" && confirm("Borrar evento?")) {
      state.store.events = removeById(state.store.events, id);
      saveStore();
      return refresh("calendar");
    }
  });

  document.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const { action, id } = target.dataset;
    const task = state.store.tasks.find((item) => item.id === id);
    if (!task) return;
    if (action === "task-status") task.status = target.value;
    if (action === "task-progress") task.progress = Math.max(0, Math.min(100, Number(target.value || 0)));
    if (task.progress >= 100) task.status = "Completado";
    saveStore();
    refresh("tasks");
  });

  document.addEventListener("submit", async (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form));

    if (form.id === "task-form") {
      const payload = { title: data.title.trim(), description: data.description || "", clientId: data.clientId || "", memberId: data.memberId || "", status: data.status || "Sin iniciar", priority: data.priority || "media", progress: Math.max(0, Math.min(100, Number(data.progress || 0))), startDate: data.startDate || "", dueDate: data.dueDate || "", updatedAt: new Date().toISOString() };
      if (!payload.title) return;
      if (data.id) state.store.tasks[state.store.tasks.findIndex((task) => task.id === data.id)] = { ...state.store.tasks.find((task) => task.id === data.id), ...payload };
      else state.store.tasks.push({ id: nextId("task"), createdAt: new Date().toISOString(), ...payload });
      saveStore();
      return refresh("tasks");
    }

    if (form.id === "client-form") {
      const payload = { name: data.name.trim(), contactEmail: data.contactEmail || "", ownerId: data.ownerId || "", notes: data.notes || "", updatedAt: new Date().toISOString() };
      if (!payload.name) return;
      if (data.id) state.store.clients[state.store.clients.findIndex((client) => client.id === data.id)] = { ...state.store.clients.find((client) => client.id === data.id), ...payload };
      else state.store.clients.push({ id: nextId("client"), createdAt: new Date().toISOString(), ...payload });
      saveStore();
      return refresh("clients");
    }

    if (form.id === "member-form") {
      const payload = { name: data.name.trim(), email: data.email || "", department: data.department || "", role: data.role || "", target: Number(data.target || 100), updatedAt: new Date().toISOString() };
      if (!payload.name) return;
      if (data.id) state.store.members[state.store.members.findIndex((member) => member.id === data.id)] = { ...state.store.members.find((member) => member.id === data.id), ...payload };
      else state.store.members.push({ id: nextId("member"), createdAt: new Date().toISOString(), ...payload });
      saveStore();
      return refresh("team");
    }

    if (form.id === "event-form") {
      const payload = { title: data.title.trim(), date: data.date || "", startTime: data.startTime || "", endTime: data.endTime || "", type: data.type || "otro", clientId: data.clientId || "", memberId: data.memberId || "", taskId: data.taskId || "", notes: data.notes || "", updatedAt: new Date().toISOString() };
      if (!payload.title || !payload.date) return;
      if (data.id) state.store.events[state.store.events.findIndex((eventItem) => eventItem.id === data.id)] = { ...state.store.events.find((eventItem) => eventItem.id === data.id), ...payload };
      else state.store.events.push({ id: nextId("event"), createdAt: new Date().toISOString(), ...payload });
      saveStore();
      return refresh("calendar");
    }

    if (form.id === "report-settings-form") {
      state.store.settings = {
        ...state.store.settings,
        reportMonth: data.reportMonth || currentMonth(),
        reportQuarter: Number(data.reportQuarter || currentQuarter()),
        reportYear: Number(data.reportYear || currentYear()),
        bonusTarget: Math.max(0, Math.min(100, Number(data.bonusTarget || 85))),
      };
      saveStore();
      return refresh("reports");
    }

    if (form.id === "alert-test-form") {
      const result = document.getElementById("alert-test-result");
      result.textContent = "Enviando...";
      const urgentTasks = state.store.tasks.filter((task) => {
        const diff = dayDiff(task.dueDate);
        return diff !== null && diff <= 2 && task.status !== "Completado";
      }).map((task) => ({ title: task.title, status: task.status, dueDate: task.dueDate, client: clientName(task.clientId), owner: memberName(task.memberId), progress: task.progress }));
      try {
        const response = await fetch("/api/send-test-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ to: data.to, subject: data.subject, message: data.message, urgentTasks }),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "No se pudo enviar");
        result.textContent = payload.message;
      } catch (error) {
        result.textContent = `Error: ${error.message}`;
      }
    }
  });
}

async function init() {
  loadAccessibility();
  document.getElementById("today-label").textContent = new Date().toLocaleDateString("es-MX", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
  state.store = await loadStore();
  saveStore();
  bindEvents();
  renderAll();
  switchTab("dashboard");
}

init().catch((error) => {
  document.body.innerHTML = `<main class="fatal">${esc(error.message)}</main>`;
});
