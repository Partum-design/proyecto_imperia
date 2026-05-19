const STORAGE_KEY = "imperia_crm_v4";

const STATUS_OPTIONS = ["Sin iniciar", "En progreso", "En revision", "Completado", "Bloqueada"];
const PRIORITY_OPTIONS = ["baja", "media", "alta"];
const EVENT_TYPES = ["reunion", "entrega", "seguimiento", "interno", "otro"];

const state = {
  activeTab: "dashboard",
  store: null,
};

const views = {
  dashboard: document.getElementById("dashboard-view"),
  tasks: document.getElementById("tasks-view"),
  clients: document.getElementById("clients-view"),
  team: document.getElementById("team-view"),
  calendar: document.getElementById("calendar-view"),
  alerts: document.getElementById("alerts-view"),
};

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function fmtDate(dateLike) {
  if (!dateLike) return "Sin fecha";
  const d = new Date(dateLike);
  if (Number.isNaN(d.getTime())) return "Sin fecha";
  return d.toLocaleDateString("es-MX");
}

function todayYMD() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function getDaysDiffFromToday(dateString) {
  if (!dateString) return null;
  const due = new Date(dateString);
  if (Number.isNaN(due.getTime())) return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  return Math.round((due - now) / (1000 * 60 * 60 * 24));
}

function getAlertLabel(task) {
  const days = getDaysDiffFromToday(task.dueDate);
  if (days === null) return { text: "Sin fecha", tone: "info" };
  if (task.status === "Completado") return { text: "Completada", tone: "ok" };
  if (days < 0) return { text: `Vencida hace ${Math.abs(days)} dia(s)`, tone: "danger" };
  if (days === 0) return { text: "Vence hoy", tone: "danger" };
  if (days <= 2) return { text: `Vence en ${days} dia(s)`, tone: "warn" };
  return { text: `Vence en ${days} dia(s)`, tone: "info" };
}

function nextId(bucket) {
  const counterName = `${bucket}Seq`;
  const idPrefix = bucket[0].toUpperCase();
  state.store[counterName] = (state.store[counterName] || 0) + 1;
  return `${idPrefix}${String(state.store[counterName]).padStart(4, "0")}`;
}

function saveStore() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.store));
  const label = document.getElementById("sync-label");
  label.textContent = `Guardado local ${new Date().toLocaleTimeString("es-MX")}`;
}

function getClientName(clientId) {
  return state.store.clients.find((c) => c.id === clientId)?.name || "Sin cliente";
}

function getMemberName(memberId) {
  return state.store.members.find((m) => m.id === memberId)?.name || "Sin responsable";
}

function options(list, selected = "", placeholder = "Seleccionar") {
  const first = `<option value="">${esc(placeholder)}</option>`;
  const rest = list
    .map((x) => `<option value="${esc(x.id)}" ${x.id === selected ? "selected" : ""}>${esc(x.name)}</option>`)
    .join("");
  return first + rest;
}

function buildSeedStore(seed) {
  const clients = [];
  const members = [];
  const tasks = [];
  const events = [];
  const clientMap = new Map();
  const memberMap = new Map();

  (seed.clients || []).forEach((name) => {
    if (!name) return;
    const id = `C${String(clients.length + 1).padStart(4, "0")}`;
    clientMap.set(name, id);
    clients.push({ id, name, contactEmail: "", notes: "", createdAt: new Date().toISOString() });
  });

  (seed.employees || []).forEach((emp) => {
    if (!emp?.name) return;
    const id = `M${String(members.length + 1).padStart(4, "0")}`;
    memberMap.set(emp.name, id);
    members.push({
      id,
      name: emp.name,
      email: emp.email || "",
      department: emp.department || "",
      role: "",
      createdAt: new Date().toISOString(),
    });
  });

  (seed.tasks || []).forEach((t, i) => {
    const id = `T${String(i + 1).padStart(4, "0")}`;
    let clientId = clientMap.get(t.client || "");
    if (!clientId && t.client) {
      clientId = `C${String(clients.length + 1).padStart(4, "0")}`;
      clientMap.set(t.client, clientId);
      clients.push({ id: clientId, name: t.client, contactEmail: "", notes: "", createdAt: new Date().toISOString() });
    }

    let memberId = memberMap.get(t.owner || "");
    if (!memberId && t.owner) {
      memberId = `M${String(members.length + 1).padStart(4, "0")}`;
      memberMap.set(t.owner, memberId);
      members.push({
        id: memberId,
        name: t.owner,
        email: t.email || "",
        department: t.department || "",
        role: "",
        createdAt: new Date().toISOString(),
      });
    }

    const progress = Math.max(0, Math.min(100, Math.round((t.progress || 0) * 100)));
    const statusRaw = (t.statusBucket || t.status || "Sin iniciar").toLowerCase();
    let status = "Sin iniciar";
    if (statusRaw.includes("complet")) status = "Completado";
    else if (statusRaw.includes("progreso")) status = "En progreso";

    tasks.push({
      id,
      title: t.activity || `Actividad ${i + 1}`,
      description: t.notes || "",
      clientId: clientId || "",
      memberId: memberId || "",
      status,
      priority: t.priority || (progress >= 70 ? "media" : "alta"),
      progress,
      startDate: t.startDate ? String(t.startDate).slice(0, 10) : "",
      dueDate: t.dueDate ? String(t.dueDate).slice(0, 10) : "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    if (t.dueDate) {
      events.push({
        id: `E${String(events.length + 1).padStart(4, "0")}`,
        title: `Entrega: ${t.activity || `Tarea ${i + 1}`}`,
        date: String(t.dueDate).slice(0, 10),
        startTime: "10:00",
        endTime: "11:00",
        type: "entrega",
        taskId: id,
        clientId: clientId || "",
        memberId: memberId || "",
        notes: "Generado desde base inicial",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
  });

  return {
    version: 4,
    clients,
    members,
    tasks,
    events,
    settings: {
      alertRecipients: "",
      senderName: "Proyecto Imperia",
    },
    taskSeq: tasks.length,
    clientSeq: clients.length,
    memberSeq: members.length,
    eventSeq: events.length,
  };
}

async function loadStore() {
  const cached = localStorage.getItem(STORAGE_KEY);
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      if (parsed && parsed.version === 4) return parsed;
    } catch {
      // ignore
    }
  }

  const raw = await fetch("./data/data.json");
  const seed = await raw.json();
  return buildSeedStore(seed);
}

function renderKpis() {
  const tasks = state.store.tasks;
  const overdue = tasks.filter((t) => {
    const diff = getDaysDiffFromToday(t.dueDate);
    return diff !== null && diff < 0 && t.status !== "Completado";
  }).length;
  const dueSoon = tasks.filter((t) => {
    const diff = getDaysDiffFromToday(t.dueDate);
    return diff !== null && diff >= 0 && diff <= 2 && t.status !== "Completado";
  }).length;
  const completed = tasks.filter((t) => t.status === "Completado").length;
  const progressAvg = tasks.length ? Math.round(tasks.reduce((acc, t) => acc + (t.progress || 0), 0) / tasks.length) : 0;

  const list = [
    { t: "Tareas", v: tasks.length, h: "Total" },
    { t: "Clientes", v: state.store.clients.length, h: "Activos" },
    { t: "Equipo", v: state.store.members.length, h: "Miembros" },
    { t: "Completadas", v: completed, h: `${tasks.length ? Math.round((completed / tasks.length) * 100) : 0}%` },
    { t: "Alertas", v: overdue + dueSoon, h: `Avance prom. ${progressAvg}%` },
  ];

  document.getElementById("kpi-grid").innerHTML = list
    .map((k) => `<article class="kpi"><div class="title">${esc(k.t)}</div><div class="value">${esc(k.v)}</div><div class="hint">${esc(k.h)}</div></article>`)
    .join("");
}

function renderDashboard() {
  const upcomingTasks = [...state.store.tasks]
    .filter((t) => t.dueDate)
    .sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)))
    .slice(0, 8);
  const upcomingEvents = [...state.store.events]
    .sort((a, b) => `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`))
    .slice(0, 8);
  const overdueTasks = state.store.tasks.filter((t) => {
    const d = getDaysDiffFromToday(t.dueDate);
    return d !== null && d < 0 && t.status !== "Completado";
  });

  views.dashboard.innerHTML = `
    <div class="grid-2">
      <article class="panel">
        <h3>Proximas entregas</h3>
        <div class="list-cards">
          ${
            upcomingTasks
              .map((t) => {
                const alert = getAlertLabel(t);
                return `<div class="card"><div class="title">${esc(t.title)}</div><div class="muted">${esc(getClientName(t.clientId))} · ${esc(getMemberName(t.memberId))}</div><div class="chips"><span class="chip ${alert.tone}">${esc(alert.text)}</span><span class="chip info">${esc(t.status)}</span><span class="chip warn">${esc(t.progress)}%</span></div></div>`;
              })
              .join("") || "<div class='empty-state'>Sin tareas con fecha.</div>"
          }
        </div>
      </article>
      <article class="panel">
        <h3>Riesgo operativo</h3>
        <div class="chips">
          <span class="chip danger">Vencidas: ${overdueTasks.length}</span>
          <span class="chip warn">Por vencer: ${
            state.store.tasks.filter((t) => {
              const d = getDaysDiffFromToday(t.dueDate);
              return d !== null && d >= 0 && d <= 2 && t.status !== "Completado";
            }).length
          }</span>
          <span class="chip ok">Completadas: ${state.store.tasks.filter((t) => t.status === "Completado").length}</span>
        </div>
        <p class="muted">Puedes crear, modificar, borrar y reasignar sin tocar codigo.</p>
      </article>
    </div>
    <article class="panel">
      <h3>Agenda rapida</h3>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Fecha</th><th>Titulo</th><th>Tipo</th><th>Cliente</th><th>Responsable</th></tr></thead>
          <tbody>
            ${
              upcomingEvents
                .map((e) => `<tr><td>${esc(fmtDate(e.date))} ${esc(e.startTime || "")}</td><td>${esc(e.title)}</td><td>${esc(e.type)}</td><td>${esc(getClientName(e.clientId))}</td><td>${esc(getMemberName(e.memberId))}</td></tr>`)
                .join("") || "<tr><td colspan='5'>Sin eventos.</td></tr>"
            }
          </tbody>
        </table>
      </div>
    </article>
  `;
}

function taskFormHtml(task = null) {
  const t = task || {
    id: "",
    title: "",
    description: "",
    clientId: "",
    memberId: "",
    status: "Sin iniciar",
    priority: "media",
    progress: 0,
    startDate: "",
    dueDate: "",
  };

  return `
    <form id="task-form">
      <input type="hidden" name="id" value="${esc(t.id)}" />
      <input class="col-2" name="title" placeholder="Titulo de tarea" value="${esc(t.title)}" required />
      <select name="clientId">${options(state.store.clients, t.clientId, "Cliente")}</select>
      <select name="memberId">${options(state.store.members, t.memberId, "Responsable")}</select>
      <select name="status">${STATUS_OPTIONS.map((s) => `<option ${s === t.status ? "selected" : ""}>${esc(s)}</option>`).join("")}</select>
      <select name="priority">${PRIORITY_OPTIONS.map((p) => `<option value="${p}" ${p === t.priority ? "selected" : ""}>${esc(p.toUpperCase())}</option>`).join("")}</select>
      <input name="startDate" type="date" value="${esc(t.startDate || "")}" />
      <input name="dueDate" type="date" value="${esc(t.dueDate || "")}" />
      <input name="progress" type="number" min="0" max="100" value="${esc(t.progress ?? 0)}" placeholder="Avance %" />
      <textarea class="col-3" name="description" placeholder="Descripcion">${esc(t.description)}</textarea>
      <div class="col-3 action-row">
        <button class="btn primary" type="submit">${t.id ? "Guardar cambios" : "Crear tarea"}</button>
        ${t.id ? `<button class="btn ghost" type="button" data-action="task-cancel-edit">Cancelar edicion</button>` : ""}
      </div>
    </form>
  `;
}

function renderTasks(editTaskId = "") {
  const editTask = state.store.tasks.find((t) => t.id === editTaskId) || null;
  const rows = state.store.tasks
    .slice()
    .sort((a, b) => String(a.dueDate || "9999").localeCompare(String(b.dueDate || "9999")))
    .map((t) => {
      const alert = getAlertLabel(t);
      return `
        <tr>
          <td>${esc(t.id)}</td>
          <td>${esc(t.title)}</td>
          <td>${esc(getClientName(t.clientId))}</td>
          <td>${esc(getMemberName(t.memberId))}</td>
          <td><select data-action="task-status" data-id="${esc(t.id)}">${STATUS_OPTIONS.map((s) => `<option ${s === t.status ? "selected" : ""}>${esc(s)}</option>`).join("")}</select></td>
          <td><input data-action="task-progress" data-id="${esc(t.id)}" type="number" min="0" max="100" value="${esc(t.progress)}" /></td>
          <td>${esc(fmtDate(t.dueDate))}</td>
          <td><span class="chip ${alert.tone}">${esc(alert.text)}</span></td>
          <td><div class="action-row"><button class="btn ghost" data-action="task-edit" data-id="${esc(t.id)}" type="button">Editar</button><button class="btn warn" data-action="task-delete" data-id="${esc(t.id)}" type="button">Borrar</button></div></td>
        </tr>`;
    })
    .join("");

  views.tasks.innerHTML = `
    <article class="panel">
      <h3>${editTask ? `Editando ${esc(editTask.title)}` : "Nueva tarea"}</h3>
      ${taskFormHtml(editTask)}
    </article>
    <article class="panel">
      <h3>Tareas registradas</h3>
      <div class="table-wrap">
        <table>
          <thead><tr><th>ID</th><th>Titulo</th><th>Cliente</th><th>Responsable</th><th>Status</th><th>Avance %</th><th>Entrega</th><th>Alerta</th><th>Acciones</th></tr></thead>
          <tbody>${rows || "<tr><td colspan='9'>Sin tareas.</td></tr>"}</tbody>
        </table>
      </div>
    </article>
  `;
}

function renderClients(editId = "") {
  const edit = state.store.clients.find((c) => c.id === editId) || null;
  const form = `
    <form id="client-form">
      <input type="hidden" name="id" value="${esc(edit?.id || "")}" />
      <input name="name" placeholder="Nombre de cliente" value="${esc(edit?.name || "")}" required />
      <input name="contactEmail" placeholder="Correo de contacto" value="${esc(edit?.contactEmail || "")}" />
      <input class="col-2" name="notes" placeholder="Notas" value="${esc(edit?.notes || "")}" />
      <div class="action-row col-2">
        <button class="btn primary" type="submit">${edit ? "Guardar cambios" : "Crear cliente"}</button>
        ${edit ? `<button class="btn ghost" type="button" data-action="client-cancel-edit">Cancelar</button>` : ""}
      </div>
    </form>`;

  const cards = state.store.clients
    .map((c) => {
      const related = state.store.tasks.filter((t) => t.clientId === c.id);
      return `<div class="card"><div class="title">${esc(c.name)}</div><div class="muted">${esc(c.contactEmail || "Sin correo")}</div><div class="chips"><span class="chip info">Tareas: ${related.length}</span><span class="chip ok">Completadas: ${related.filter((t)=>t.status==="Completado").length}</span></div><div class="action-row"><button class="btn ghost" type="button" data-action="client-edit" data-id="${esc(c.id)}">Editar</button><button class="btn warn" type="button" data-action="client-delete" data-id="${esc(c.id)}">Borrar</button></div></div>`;
    })
    .join("");

  views.clients.innerHTML = `
    <article class="panel">
      <h3>${edit ? `Editando cliente: ${esc(edit.name)}` : "Nuevo cliente"}</h3>
      ${form}
    </article>
    <article class="panel">
      <h3>Clientes</h3>
      <div class="list-cards">${cards || "<div class='empty-state'>Sin clientes.</div>"}</div>
    </article>
  `;
}

function renderTeam(editId = "") {
  const edit = state.store.members.find((m) => m.id === editId) || null;
  const form = `
    <form id="member-form">
      <input type="hidden" name="id" value="${esc(edit?.id || "")}" />
      <input name="name" placeholder="Nombre del miembro" value="${esc(edit?.name || "")}" required />
      <input name="email" placeholder="Correo" value="${esc(edit?.email || "")}" />
      <input name="department" placeholder="Departamento" value="${esc(edit?.department || "")}" />
      <input name="role" placeholder="Rol" value="${esc(edit?.role || "")}" />
      <div class="action-row col-2">
        <button class="btn primary" type="submit">${edit ? "Guardar cambios" : "Agregar miembro"}</button>
        ${edit ? `<button class="btn ghost" type="button" data-action="member-cancel-edit">Cancelar</button>` : ""}
      </div>
    </form>`;

  const cards = state.store.members
    .map((m) => {
      const related = state.store.tasks.filter((t) => t.memberId === m.id);
      return `<div class="card"><div class="title">${esc(m.name)}</div><div class="muted">${esc(m.email || "Sin correo")}</div><div class="muted">${esc(m.department || "Sin departamento")} · ${esc(m.role || "Sin rol")}</div><div class="chips"><span class="chip info">Tareas: ${related.length}</span><span class="chip danger">Vencidas: ${related.filter((t)=>{const d=getDaysDiffFromToday(t.dueDate);return d!==null&&d<0&&t.status!=="Completado";}).length}</span></div><div class="action-row"><button class="btn ghost" data-action="member-edit" data-id="${esc(m.id)}" type="button">Editar</button><button class="btn warn" data-action="member-delete" data-id="${esc(m.id)}" type="button">Borrar</button></div></div>`;
    })
    .join("");

  views.team.innerHTML = `
    <article class="panel">
      <h3>${edit ? `Editando miembro: ${esc(edit.name)}` : "Nuevo miembro de equipo"}</h3>
      ${form}
    </article>
    <article class="panel">
      <h3>Equipo</h3>
      <div class="list-cards">${cards || "<div class='empty-state'>Sin miembros.</div>"}</div>
    </article>
  `;
}

function renderCalendar(editId = "") {
  const edit = state.store.events.find((e) => e.id === editId) || null;
  const e = edit || {
    id: "",
    title: "",
    date: todayYMD(),
    startTime: "09:00",
    endTime: "10:00",
    type: "seguimiento",
    clientId: "",
    memberId: "",
    taskId: "",
    notes: "",
  };

  const form = `
    <form id="event-form">
      <input type="hidden" name="id" value="${esc(e.id)}" />
      <input class="col-2" name="title" placeholder="Titulo del evento" value="${esc(e.title)}" required />
      <input name="date" type="date" value="${esc(e.date)}" required />
      <input name="startTime" type="time" value="${esc(e.startTime)}" />
      <input name="endTime" type="time" value="${esc(e.endTime)}" />
      <select name="type">${EVENT_TYPES.map((t) => `<option ${t === e.type ? "selected" : ""}>${esc(t)}</option>`).join("")}</select>
      <select name="clientId">${options(state.store.clients, e.clientId, "Cliente")}</select>
      <select name="memberId">${options(state.store.members, e.memberId, "Responsable")}</select>
      <select name="taskId"><option value="">Tarea relacionada</option>${state.store.tasks.map((t) => `<option value="${esc(t.id)}" ${t.id === e.taskId ? "selected" : ""}>${esc(t.id)} · ${esc(t.title)}</option>`).join("")}</select>
      <input class="col-3" name="notes" placeholder="Notas" value="${esc(e.notes || "")}" />
      <div class="col-3 action-row">
        <button class="btn primary" type="submit">${edit ? "Guardar evento" : "Crear evento"}</button>
        ${edit ? `<button type="button" class="btn ghost" data-action="event-cancel-edit">Cancelar</button>` : ""}
      </div>
    </form>`;

  const rows = state.store.events
    .slice()
    .sort((a, b) => `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`))
    .map((x) => `<tr><td>${esc(fmtDate(x.date))}</td><td>${esc(x.startTime || "")}</td><td>${esc(x.title)}</td><td>${esc(x.type)}</td><td>${esc(getClientName(x.clientId))}</td><td>${esc(getMemberName(x.memberId))}</td><td>${esc(x.taskId || "-")}</td><td><div class="action-row"><button class="btn ghost" type="button" data-action="event-edit" data-id="${esc(x.id)}">Editar</button><button class="btn warn" type="button" data-action="event-delete" data-id="${esc(x.id)}">Borrar</button></div></td></tr>`)
    .join("");

  views.calendar.innerHTML = `
    <article class="panel">
      <h3>${edit ? `Editando evento: ${esc(edit.title)}` : "Crear evento"}</h3>
      ${form}
    </article>
    <article class="panel">
      <h3>Calendario</h3>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Fecha</th><th>Hora</th><th>Titulo</th><th>Tipo</th><th>Cliente</th><th>Responsable</th><th>Tarea</th><th>Acciones</th></tr></thead>
          <tbody>${rows || "<tr><td colspan='8'>Sin eventos.</td></tr>"}</tbody>
        </table>
      </div>
    </article>
  `;
}

function renderAlerts() {
  const urgent = state.store.tasks
    .filter((t) => {
      const d = getDaysDiffFromToday(t.dueDate);
      return d !== null && d <= 2 && t.status !== "Completado";
    })
    .sort((a, b) => (getDaysDiffFromToday(a.dueDate) ?? 999) - (getDaysDiffFromToday(b.dueDate) ?? 999));

  const urgentCards = urgent
    .map((t) => {
      const alert = getAlertLabel(t);
      return `<div class="card"><div class="title">${esc(t.title)}</div><div class="muted">${esc(getClientName(t.clientId))} · ${esc(getMemberName(t.memberId))}</div><div class="chips"><span class="chip ${alert.tone}">${esc(alert.text)}</span><span class="chip info">${esc(t.status)}</span></div></div>`;
    })
    .join("");

  views.alerts.innerHTML = `
    <div class="grid-2">
      <article class="panel">
        <h3>Alertas proximas</h3>
        <div class="list-cards">${urgentCards || "<div class='empty-state'>No hay alertas urgentes.</div>"}</div>
      </article>
      <article class="panel">
        <h3>Prueba de envio de correo</h3>
        <p class="muted">Este formulario llama al endpoint <code>/api/send-test-email</code>. Si no hay SMTP configurado, devuelve modo demo.</p>
        <form id="alert-test-form">
          <input class="col-2" name="to" type="email" placeholder="correo@dominio.com" required />
          <input name="subject" placeholder="Asunto" value="Prueba de alertas Proyecto Imperia" />
          <input class="col-3" name="message" placeholder="Mensaje" value="Alerta de prueba: validacion de Proyecto Imperia." />
          <div class="col-3 action-row"><button class="btn primary" type="submit">Enviar prueba</button></div>
        </form>
        <div id="alert-test-result" class="muted"></div>
      </article>
    </div>
  `;
}

function renderAll() {
  renderKpis();
  renderDashboard();
  renderTasks();
  renderClients();
  renderTeam();
  renderCalendar();
  renderAlerts();
}

function resetFormRender(section) {
  if (section === "tasks") renderTasks();
  if (section === "clients") renderClients();
  if (section === "team") renderTeam();
  if (section === "calendar") renderCalendar();
  renderKpis();
  if (section !== "alerts") renderAlerts();
  if (section !== "dashboard") renderDashboard();
}

function switchTab(tab) {
  state.activeTab = tab;
  document.querySelectorAll(".tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  Object.entries(views).forEach(([k, el]) => el.classList.toggle("active", k === tab));
}

function bindEvents() {
  document.getElementById("tab-nav").addEventListener("click", (ev) => {
    const btn = ev.target.closest(".tab");
    if (!btn) return;
    switchTab(btn.dataset.tab);
  });

  document.addEventListener("submit", async (ev) => {
    const form = ev.target;
    if (!(form instanceof HTMLFormElement)) return;

    if (form.id === "task-form") {
      ev.preventDefault();
      const fd = new FormData(form);
      const id = (fd.get("id") || "").toString();
      const payload = {
        title: (fd.get("title") || "").toString().trim(),
        description: (fd.get("description") || "").toString().trim(),
        clientId: (fd.get("clientId") || "").toString(),
        memberId: (fd.get("memberId") || "").toString(),
        status: (fd.get("status") || "Sin iniciar").toString(),
        priority: (fd.get("priority") || "media").toString(),
        progress: Math.max(0, Math.min(100, Number(fd.get("progress") || 0))),
        startDate: (fd.get("startDate") || "").toString(),
        dueDate: (fd.get("dueDate") || "").toString(),
        updatedAt: new Date().toISOString(),
      };
      if (!payload.title) return;
      if (id) {
        const index = state.store.tasks.findIndex((t) => t.id === id);
        if (index >= 0) state.store.tasks[index] = { ...state.store.tasks[index], ...payload };
      } else {
        state.store.tasks.push({ id: nextId("task"), createdAt: new Date().toISOString(), ...payload });
      }
      saveStore();
      resetFormRender("tasks");
      return;
    }

    if (form.id === "client-form") {
      ev.preventDefault();
      const fd = new FormData(form);
      const id = (fd.get("id") || "").toString();
      const payload = {
        name: (fd.get("name") || "").toString().trim(),
        contactEmail: (fd.get("contactEmail") || "").toString().trim(),
        notes: (fd.get("notes") || "").toString().trim(),
      };
      if (!payload.name) return;
      if (id) {
        const i = state.store.clients.findIndex((c) => c.id === id);
        if (i >= 0) state.store.clients[i] = { ...state.store.clients[i], ...payload };
      } else {
        state.store.clients.push({ id: nextId("client"), createdAt: new Date().toISOString(), ...payload });
      }
      saveStore();
      resetFormRender("clients");
      return;
    }

    if (form.id === "member-form") {
      ev.preventDefault();
      const fd = new FormData(form);
      const id = (fd.get("id") || "").toString();
      const payload = {
        name: (fd.get("name") || "").toString().trim(),
        email: (fd.get("email") || "").toString().trim(),
        department: (fd.get("department") || "").toString().trim(),
        role: (fd.get("role") || "").toString().trim(),
      };
      if (!payload.name) return;
      if (id) {
        const i = state.store.members.findIndex((m) => m.id === id);
        if (i >= 0) state.store.members[i] = { ...state.store.members[i], ...payload };
      } else {
        state.store.members.push({ id: nextId("member"), createdAt: new Date().toISOString(), ...payload });
      }
      saveStore();
      resetFormRender("team");
      return;
    }

    if (form.id === "event-form") {
      ev.preventDefault();
      const fd = new FormData(form);
      const id = (fd.get("id") || "").toString();
      const payload = {
        title: (fd.get("title") || "").toString().trim(),
        date: (fd.get("date") || "").toString(),
        startTime: (fd.get("startTime") || "").toString(),
        endTime: (fd.get("endTime") || "").toString(),
        type: (fd.get("type") || "otro").toString(),
        clientId: (fd.get("clientId") || "").toString(),
        memberId: (fd.get("memberId") || "").toString(),
        taskId: (fd.get("taskId") || "").toString(),
        notes: (fd.get("notes") || "").toString().trim(),
        updatedAt: new Date().toISOString(),
      };
      if (!payload.title || !payload.date) return;
      if (id) {
        const i = state.store.events.findIndex((e) => e.id === id);
        if (i >= 0) state.store.events[i] = { ...state.store.events[i], ...payload };
      } else {
        state.store.events.push({ id: nextId("event"), createdAt: new Date().toISOString(), ...payload });
      }
      saveStore();
      resetFormRender("calendar");
      return;
    }

    if (form.id === "alert-test-form") {
      ev.preventDefault();
      const result = document.getElementById("alert-test-result");
      result.textContent = "Enviando prueba...";
      const fd = new FormData(form);
      const body = {
        to: (fd.get("to") || "").toString().trim(),
        subject: (fd.get("subject") || "Prueba de alertas Proyecto Imperia").toString().trim(),
        message: (fd.get("message") || "Prueba de correo").toString().trim(),
        urgentTasks: state.store.tasks
          .filter((t) => {
            const d = getDaysDiffFromToday(t.dueDate);
            return d !== null && d <= 2 && t.status !== "Completado";
          })
          .slice(0, 8)
          .map((t) => ({
            title: t.title,
            status: t.status,
            dueDate: t.dueDate,
            client: getClientName(t.clientId),
            owner: getMemberName(t.memberId),
            progress: t.progress,
          })),
      };

      try {
        const res = await fetch("/api/send-test-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "No se pudo enviar");
        result.textContent = data.message || "Correo enviado";
      } catch (err) {
        result.textContent = `Error: ${err.message}`;
      }
    }
  });

  document.addEventListener("click", (ev) => {
    const el = ev.target.closest("[data-action]");
    if (!el) return;
    const action = el.dataset.action;
    const id = el.dataset.id || "";

    if (action === "task-edit") return renderTasks(id);
    if (action === "task-cancel-edit") return renderTasks();
    if (action === "task-delete") {
      if (!confirm("Borrar esta tarea?")) return;
      state.store.tasks = state.store.tasks.filter((t) => t.id !== id);
      state.store.events = state.store.events.filter((e) => e.taskId !== id);
      saveStore();
      return resetFormRender("tasks");
    }

    if (action === "client-edit") return renderClients(id);
    if (action === "client-cancel-edit") return renderClients();
    if (action === "client-delete") {
      if (!confirm("Borrar cliente? Las tareas/eventos quedaran sin cliente.")) return;
      state.store.clients = state.store.clients.filter((c) => c.id !== id);
      state.store.tasks.forEach((t) => { if (t.clientId === id) t.clientId = ""; });
      state.store.events.forEach((e) => { if (e.clientId === id) e.clientId = ""; });
      saveStore();
      return resetFormRender("clients");
    }

    if (action === "member-edit") return renderTeam(id);
    if (action === "member-cancel-edit") return renderTeam();
    if (action === "member-delete") {
      if (!confirm("Borrar miembro? Las tareas/eventos quedaran sin responsable.")) return;
      state.store.members = state.store.members.filter((m) => m.id !== id);
      state.store.tasks.forEach((t) => { if (t.memberId === id) t.memberId = ""; });
      state.store.events.forEach((e) => { if (e.memberId === id) e.memberId = ""; });
      saveStore();
      return resetFormRender("team");
    }

    if (action === "event-edit") return renderCalendar(id);
    if (action === "event-cancel-edit") return renderCalendar();
    if (action === "event-delete") {
      if (!confirm("Borrar evento?")) return;
      state.store.events = state.store.events.filter((e) => e.id !== id);
      saveStore();
      return resetFormRender("calendar");
    }
  });

  document.addEventListener("change", (ev) => {
    const target = ev.target;
    if (!(target instanceof HTMLElement) || !target.dataset.action) return;
    const id = target.dataset.id;
    const task = state.store.tasks.find((t) => t.id === id);
    if (!task) return;

    if (target.dataset.action === "task-status") {
      task.status = target.value;
      task.updatedAt = new Date().toISOString();
      saveStore();
      renderKpis();
      renderDashboard();
      renderAlerts();
      return;
    }

    if (target.dataset.action === "task-progress") {
      const value = Math.max(0, Math.min(100, Number(target.value || 0)));
      task.progress = value;
      task.updatedAt = new Date().toISOString();
      if (value >= 100 && task.status !== "Completado") task.status = "Completado";
      saveStore();
      renderKpis();
      renderDashboard();
      renderAlerts();
    }
  });
}

async function init() {
  document.getElementById("today-label").textContent = new Date().toLocaleDateString("es-MX", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  state.store = await loadStore();
  saveStore();
  bindEvents();
  renderAll();
  switchTab("dashboard");
}

init().catch((err) => {
  document.body.innerHTML = `<main style="padding:24px;color:white;font-family:Manrope,sans-serif;">Error al iniciar Proyecto Imperia: ${esc(err.message)}</main>`;
});
