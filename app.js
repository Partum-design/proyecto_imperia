const state = {
  data: null,
  tasks: [],
  filtered: [],
  activeTab: "dashboard",
  filters: {
    text: "",
    client: "",
    owner: "",
    status: "",
    priority: "",
  },
};

const els = {
  date: document.getElementById("current-date"),
  recordCount: document.getElementById("record-count"),
  kpiGrid: document.getElementById("kpi-grid"),
  searchInput: document.getElementById("search-input"),
  clientFilter: document.getElementById("client-filter"),
  ownerFilter: document.getElementById("owner-filter"),
  statusFilter: document.getElementById("status-filter"),
  priorityFilter: document.getElementById("priority-filter"),
  tabNav: document.getElementById("tab-nav"),
  views: {
    dashboard: document.getElementById("dashboard-view"),
    pipeline: document.getElementById("pipeline-view"),
    tasks: document.getElementById("tasks-view"),
    clients: document.getElementById("clients-view"),
    team: document.getElementById("team-view"),
    alerts: document.getElementById("alerts-view"),
  },
};

function fmtDate(iso) {
  if (!iso) return "Sin fecha";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "Sin fecha" : d.toLocaleDateString("es-MX");
}

function pct(v) {
  return `${Math.round((Number(v) || 0) * 100)}%`;
}

function chipClassByPriority(priority) {
  if (priority === "alta") return "danger";
  if (priority === "media") return "warn";
  return "info";
}

function chipClassByStatus(status) {
  if (status === "Completado") return "ok";
  if (status === "En progreso") return "info";
  return "warn";
}

function applyFilters() {
  const { text, client, owner, status, priority } = state.filters;
  const query = text.trim().toLowerCase();
  state.filtered = state.tasks.filter((t) => {
    const haystack = [t.id, t.client, t.owner, t.activity, t.email, t.department]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    if (query && !haystack.includes(query)) return false;
    if (client && t.client !== client) return false;
    if (owner && t.owner !== owner) return false;
    if (status && t.statusBucket !== status) return false;
    if (priority && t.priority !== priority) return false;
    return true;
  });
}

function populateFilters() {
  const uniq = (arr) => [...new Set(arr.filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));
  const clients = uniq(state.tasks.map((t) => t.client));
  const owners = uniq(state.tasks.map((t) => t.owner));
  const statuses = uniq(state.tasks.map((t) => t.statusBucket));
  const priorities = uniq(state.tasks.map((t) => t.priority));

  const fill = (select, values) => {
    values.forEach((v) => {
      const opt = document.createElement("option");
      opt.value = v;
      opt.textContent = v;
      select.appendChild(opt);
    });
  };

  fill(els.clientFilter, clients);
  fill(els.ownerFilter, owners);
  fill(els.statusFilter, statuses);
  fill(els.priorityFilter, priorities);
}

function renderKpis() {
  const total = state.filtered.length;
  const overdue = state.filtered.filter((t) => t.daysToDue !== null && t.daysToDue < 0 && t.statusBucket !== "Completado").length;
  const dueSoon = state.filtered.filter((t) => t.daysToDue !== null && t.daysToDue >= 0 && t.daysToDue <= 2 && t.statusBucket !== "Completado").length;
  const completed = state.filtered.filter((t) => t.statusBucket === "Completado").length;

  const cards = [
    { title: "Tareas activas", value: total, hint: "Con filtros aplicados" },
    { title: "Completadas", value: completed, hint: `${total ? Math.round((completed / total) * 100) : 0}% del total` },
    { title: "Por vencer (0-2 días)", value: dueSoon, hint: "Requieren seguimiento inmediato" },
    { title: "Vencidas", value: overdue, hint: "Riesgo operativo" },
  ];

  els.kpiGrid.innerHTML = cards
    .map(
      (c) => `
      <article class="kpi">
        <div class="kpi-title">${c.title}</div>
        <div class="kpi-value">${c.value}</div>
        <div class="kpi-hint">${c.hint}</div>
      </article>`
    )
    .join("");
}

function renderDashboard() {
  const byStatus = countBy(state.filtered, "statusBucket");
  const byDepartment = countBy(state.filtered, "department", "Sin departamento");

  const statusChips = Object.entries(byStatus)
    .map(([k, v]) => `<span class="chip ${chipClassByStatus(k)}">${k}: ${v}</span>`)
    .join("");

  const topDepartments = Object.entries(byDepartment)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);
  const maxValue = topDepartments[0]?.[1] || 1;

  const depBars = topDepartments
    .map(
      ([name, value]) => `
      <div class="bar-row">
        <span>${name}</span>
        <div class="bar-track"><div class="bar-fill" style="width:${(value / maxValue) * 100}%"></div></div>
        <strong>${value}</strong>
      </div>`
    )
    .join("");

  const risky = state.filtered
    .filter((t) => t.priority === "alta" && t.statusBucket !== "Completado")
    .sort((a, b) => (a.daysToDue ?? 999) - (b.daysToDue ?? 999))
    .slice(0, 6)
    .map(
      (t) => `
      <div class="task-mini">
        <div class="task-title">${t.activity || "Sin actividad"}</div>
        <div class="task-meta">${t.client || "Sin cliente"} · ${t.owner || "Sin responsable"}</div>
        <div class="chips">
          <span class="chip danger">${t.alert}</span>
          <span class="chip ${chipClassByStatus(t.statusBucket)}">${t.statusBucket}</span>
        </div>
      </div>`
    )
    .join("");

  els.views.dashboard.innerHTML = `
    <div class="grid-2">
      <article class="panel">
        <h3>Estado operativo</h3>
        <div class="chips">${statusChips || "<span class='muted'>Sin datos</span>"}</div>
      </article>
      <article class="panel">
        <h3>Recordatorio automático (JAVA.docx)</h3>
        <div class="muted">Reglas activas: crear evento por tarea pendiente y enviar aviso cuando vence hoy, en 2 días o ya venció.</div>
        <div class="chips">
          <span class="chip info">Calendario</span>
          <span class="chip warn">Correo</span>
          <span class="chip danger">Urgencia</span>
        </div>
      </article>
    </div>
    <div class="grid-2">
      <article class="panel">
        <h3>Carga por departamento</h3>
        <div class="bar-list">${depBars || "<div class='muted'>Sin datos</div>"}</div>
      </article>
      <article class="panel">
        <h3>Foco inmediato</h3>
        ${risky || "<div class='muted'>No hay tareas críticas con los filtros actuales.</div>"}
      </article>
    </div>
  `;
}

function renderPipeline() {
  const groups = {
    "Sin iniciar": [],
    "En progreso": [],
    "Completado": [],
  };

  state.filtered.forEach((t) => {
    const key = groups[t.statusBucket] ? t.statusBucket : "Sin iniciar";
    groups[key].push(t);
  });

  const col = (name, list) => {
    const sorted = [...list].sort((a, b) => (a.daysToDue ?? 999) - (b.daysToDue ?? 999));
    return `
      <article class="kanban-col">
        <h4>${name} (${sorted.length})</h4>
        ${
          sorted
            .slice(0, 30)
            .map(
              (t) => `
              <div class="task-mini">
                <div class="task-title">${t.activity || "Sin actividad"}</div>
                <div class="task-meta">${t.client || "Sin cliente"} · ${t.owner || "Sin responsable"}</div>
                <div class="progress"><span style="width:${Math.round((t.progress || 0) * 100)}%"></span></div>
                <div class="chips">
                  <span class="chip ${chipClassByPriority(t.priority)}">${t.alert}</span>
                  <span class="chip info">${pct(t.progress)}</span>
                </div>
              </div>`
            )
            .join("") || "<div class='muted'>Sin tareas.</div>"
        }
      </article>`;
  };

  els.views.pipeline.innerHTML = `<div class="kanban">${col("Sin iniciar", groups["Sin iniciar"])}${col("En progreso", groups["En progreso"])}${col("Completado", groups["Completado"])}</div>`;
}

function renderTasks() {
  const rows = state.filtered
    .slice()
    .sort((a, b) => (a.daysToDue ?? 999) - (b.daysToDue ?? 999))
    .map(
      (t) => `
      <tr>
        <td>${t.id}</td>
        <td>${t.client || "-"}</td>
        <td>${t.activity || "-"}</td>
        <td>${t.owner || "-"}</td>
        <td>${fmtDate(t.startDate)}</td>
        <td>${fmtDate(t.dueDate)}</td>
        <td><span class="chip ${chipClassByStatus(t.statusBucket)}">${t.statusBucket}</span></td>
        <td>${pct(t.progress)}</td>
        <td><span class="chip ${chipClassByPriority(t.priority)}">${t.alert}</span></td>
      </tr>`
    )
    .join("");

  els.views.tasks.innerHTML = `
    <article class="panel">
      <h3>Listado maestro de tareas</h3>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Cliente</th>
              <th>Actividad</th>
              <th>Responsable</th>
              <th>Inicio</th>
              <th>Entrega</th>
              <th>Estado</th>
              <th>Avance</th>
              <th>Alerta</th>
            </tr>
          </thead>
          <tbody>${rows || "<tr><td colspan='9'>Sin resultados.</td></tr>"}</tbody>
        </table>
      </div>
    </article>`;
}

function renderClients() {
  const byClient = new Map();
  state.filtered.forEach((t) => {
    const key = t.client || "Sin cliente";
    const rec = byClient.get(key) || { tasks: 0, completed: 0, overdue: 0, progressSum: 0 };
    rec.tasks += 1;
    rec.progressSum += t.progress || 0;
    if (t.statusBucket === "Completado") rec.completed += 1;
    if (t.daysToDue !== null && t.daysToDue < 0 && t.statusBucket !== "Completado") rec.overdue += 1;
    byClient.set(key, rec);
  });

  const cards = [...byClient.entries()]
    .sort((a, b) => b[1].tasks - a[1].tasks)
    .map(([client, s]) => {
      const avg = s.tasks ? Math.round((s.progressSum / s.tasks) * 100) : 0;
      return `
        <article class="client-card">
          <div class="card-title">${client}</div>
          <div class="muted">${s.tasks} tareas registradas</div>
          <div class="chips">
            <span class="chip ok">Completadas: ${s.completed}</span>
            <span class="chip warn">Avance prom.: ${avg}%</span>
            <span class="chip danger">Vencidas: ${s.overdue}</span>
          </div>
        </article>`;
    })
    .join("");

  els.views.clients.innerHTML = `
    <article class="panel">
      <h3>Vista por cliente</h3>
      <div class="client-grid">${cards || "<div class='muted'>Sin clientes para mostrar.</div>"}</div>
    </article>`;
}

function renderTeam() {
  const byOwner = new Map();
  state.filtered.forEach((t) => {
    const key = t.owner || "Sin asignar";
    const rec = byOwner.get(key) || { tasks: 0, completed: 0, overdue: 0, progressSum: 0, email: t.email || null };
    rec.tasks += 1;
    rec.progressSum += t.progress || 0;
    if (!rec.email && t.email) rec.email = t.email;
    if (t.statusBucket === "Completado") rec.completed += 1;
    if (t.daysToDue !== null && t.daysToDue < 0 && t.statusBucket !== "Completado") rec.overdue += 1;
    byOwner.set(key, rec);
  });

  const cards = [...byOwner.entries()]
    .sort((a, b) => b[1].tasks - a[1].tasks)
    .map(([owner, s]) => `
      <article class="team-card">
        <div class="card-title">${owner}</div>
        <div class="muted">${s.email || "Sin correo"}</div>
        <div class="chips">
          <span class="chip info">Tareas: ${s.tasks}</span>
          <span class="chip ok">Completadas: ${s.completed}</span>
          <span class="chip warn">Avance: ${Math.round((s.progressSum / s.tasks) * 100)}%</span>
          <span class="chip danger">Vencidas: ${s.overdue}</span>
        </div>
      </article>
    `)
    .join("");

  els.views.team.innerHTML = `
    <article class="panel">
      <h3>Desempeño por colaborador</h3>
      <div class="team-grid">${cards || "<div class='muted'>Sin datos del equipo.</div>"}</div>
    </article>`;
}

function renderAlerts() {
  const urgent = state.filtered
    .filter((t) => t.priority === "alta" && t.statusBucket !== "Completado")
    .sort((a, b) => (a.daysToDue ?? 999) - (b.daysToDue ?? 999));

  const cards = urgent
    .slice(0, 24)
    .map(
      (t) => `
      <article class="alert-card">
        <div class="card-title">${t.alert}</div>
        <div>${t.activity || "Sin actividad"}</div>
        <div class="muted">${t.client || "Sin cliente"} · ${t.owner || "Sin responsable"}</div>
        <div class="chips">
          <span class="chip ${chipClassByStatus(t.statusBucket)}">${t.statusBucket}</span>
          <span class="chip info">Entrega: ${fmtDate(t.dueDate)}</span>
        </div>
      </article>`
    )
    .join("");

  const scriptSnippet = (state.data?.automationLogic?.docSnippet || [])
    .slice(0, 8)
    .map((line) => `<div class="muted">${line.replace(/</g, "&lt;")}</div>`)
    .join("");

  els.views.alerts.innerHTML = `
    <div class="grid-2">
      <article class="panel">
        <h3>Bandeja de urgencia</h3>
        <div class="alert-grid">${cards || "<div class='muted'>No hay alertas urgentes con los filtros actuales.</div>"}</div>
      </article>
      <article class="panel">
        <h3>Lógica base (JAVA.docx)</h3>
        <div class="muted">Referencia del script de recordatorios y calendario tomado para este CRM:</div>
        ${scriptSnippet}
      </article>
    </div>`;
}

function countBy(arr, key, fallback = "Sin dato") {
  const m = {};
  arr.forEach((item) => {
    const k = item[key] || fallback;
    m[k] = (m[k] || 0) + 1;
  });
  return m;
}

function renderAll() {
  applyFilters();
  renderKpis();
  renderDashboard();
  renderPipeline();
  renderTasks();
  renderClients();
  renderTeam();
  renderAlerts();
  els.recordCount.textContent = `${state.filtered.length} tareas visibles`;
}

function wireEvents() {
  els.searchInput.addEventListener("input", (e) => {
    state.filters.text = e.target.value;
    renderAll();
  });

  els.clientFilter.addEventListener("change", (e) => {
    state.filters.client = e.target.value;
    renderAll();
  });

  els.ownerFilter.addEventListener("change", (e) => {
    state.filters.owner = e.target.value;
    renderAll();
  });

  els.statusFilter.addEventListener("change", (e) => {
    state.filters.status = e.target.value;
    renderAll();
  });

  els.priorityFilter.addEventListener("change", (e) => {
    state.filters.priority = e.target.value;
    renderAll();
  });

  els.tabNav.addEventListener("click", (e) => {
    const btn = e.target.closest(".tab");
    if (!btn) return;
    const tab = btn.dataset.tab;
    state.activeTab = tab;

    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t === btn));
    Object.entries(els.views).forEach(([k, view]) => view.classList.toggle("active", k === tab));
  });
}

async function init() {
  els.date.textContent = new Date().toLocaleDateString("es-MX", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  const res = await fetch("./data/data.json");
  state.data = await res.json();
  state.tasks = state.data.tasks || [];
  state.filtered = [...state.tasks];

  populateFilters();
  wireEvents();
  renderAll();
}

init().catch((error) => {
  console.error(error);
  document.body.innerHTML = `<main style="padding:24px;color:#fff;font-family:Manrope,sans-serif;">Error cargando Proyecto Imperia: ${error.message}</main>`;
});
