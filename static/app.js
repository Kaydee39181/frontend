function qs(id){ return document.getElementById(id); }

const API_BASE =
  window.API_BASE ||
  "https://backend-oaaq.onrender.com";

async function uploadFile() {
  const fileInput = qs("fileInput");
  const status = qs("status");
  const files = Array.from(fileInput.files || []);

  if (files.length === 0) {
    status.textContent = "Pick a file first 😭";
    status.className = "status bad";
    return;
  }

  if (files.length > 5) {
    status.textContent = "Upload up to 5 files at once 🙏";
    status.className = "status bad";
    return;
  }

  const formData = new FormData();
  files.forEach((f) => formData.append("files", f));

  status.textContent = `Uploading ${files.length} file${files.length > 1 ? "s" : ""}... ⏳`;
  status.className = "status";

  // ✅ timeout protection (30s)
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 30000);

  try {
    const res = await fetch(`${API_BASE}/api/upload`, {
      method: "POST",
      body: formData,
      signal: controller.signal
    });

    clearTimeout(t);

    const text = await res.text(); // read raw
    let data = {};
    try { data = JSON.parse(text); } catch { data = { raw: text }; }

    if (!res.ok) {
      status.textContent = data.error || `Upload failed (${res.status})`;
      status.className = "status bad";
      console.error("Upload error:", data);
      return;
    }

    const uploadedCount = Number(data.uploaded_files || files.length);
    status.textContent = `Uploaded ${uploadedCount} file${uploadedCount > 1 ? "s" : ""} ✅ Redirecting...`;
    status.className = "status good";

    window.location.href = `dashboard.html?file_id=${encodeURIComponent(data.file_id)}`;
  } catch (err) {
    clearTimeout(t);
    console.error(err);
    status.textContent =
      err.name === "AbortError"
        ? "Upload timed out 😭 (backend not responding)"
        : `Upload crashed: ${err.message}`;
    status.className = "status bad";
  }
}


// ---------- Table ----------
function renderTable(rows) {
  const table = qs("dataTable");
  table.innerHTML = "";

  if (!rows || rows.length === 0) {
    table.innerHTML = "<tr><td class='empty'>No results found 🥲</td></tr>";
    return;
  }

  const columns = Object.keys(rows[0]);

  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");
  columns.forEach(col => {
    const th = document.createElement("th");
    th.textContent = col;
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  rows.forEach(r => {
    const tr = document.createElement("tr");
    columns.forEach(col => {
      const td = document.createElement("td");
      td.textContent = r[col] ?? "";
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
}

// ---------- Dashboard State ----------
const STATE = {
  page: 1,
  total_pages: 1,
  column: null,
  value: "",
  mode: "contains",
  start_date: "",
  end_date: "",
  page_size: 25,
};

function readControlsIntoState(){
  STATE.column = qs("columnSelect").value;
  STATE.value = qs("valueInput").value || "";
  STATE.mode = qs("modeSelect").value || "contains";
  STATE.start_date = qs("startDate").value || "";
  STATE.end_date = qs("endDate").value || "";
  STATE.page_size = parseInt(qs("pageSize").value, 10) || 25;
}

function writePagerUI(){
  qs("pageNow").textContent = String(STATE.page);
  qs("pageTotal").textContent = String(STATE.total_pages);
  qs("prevBtn").disabled = STATE.page <= 1;
  qs("nextBtn").disabled = STATE.page >= STATE.total_pages;
}

function buildExportUrl(format){
  const p = new URLSearchParams();
  p.set("format", format);
  p.set("column", STATE.column || "");
  p.set("value", STATE.value || "");
  p.set("mode", STATE.mode || "contains");
  if (STATE.start_date) p.set("start_date", STATE.start_date);
  if (STATE.end_date) p.set("end_date", STATE.end_date);
  return `${API_BASE}/api/export/${window.FILE_ID}?${p.toString()}`;
}

async function loadMetaAndBuildChips() {
  const res = await fetch(`${API_BASE}/api/meta/${window.FILE_ID}`);
  const data = await res.json();

  const sel = qs("columnSelect");
  sel.innerHTML = "";
  data.columns.forEach(c => {
    const opt = document.createElement("option");
    opt.value = c;
    opt.textContent = c;
    sel.appendChild(opt);
  });

  if (data.agent_col) sel.value = data.agent_col;

  STATE.column = sel.value;
  qs("dateCol").textContent = data.date_col || "—";

  const chips = qs("chips");
  chips.innerHTML = "";
  const seen = new Set();

  function addChip(name){
    if (!name || seen.has(name)) return;
    seen.add(name);
    const b = document.createElement("button");
    b.className = "chipbtn";
    b.textContent = name;
    b.addEventListener("click", () => {
      qs("columnSelect").value = name;
      STATE.page = 1;
      queryDashboard();
    });
    chips.appendChild(b);
  }

  addChip(data.agent_col);
  addChip(data.date_col);
  data.columns.slice(0, 12).forEach(addChip);
}

async function applyDateBounds(){
  const res = await fetch(`${API_BASE}/api/date-range/${window.FILE_ID}`);
  const data = await res.json();
  if (!data || !data.min || !data.max) return;

  const s = qs("startDate");
  const e = qs("endDate");

  s.min = data.min; s.max = data.max;
  e.min = data.min; e.max = data.max;

  // OPTIONAL default fill (uncomment if you want auto-fill)
  // if (!s.value) s.value = data.min;
  // if (!e.value) e.value = data.max;
}

async function queryDashboard() {
  readControlsIntoState();

  const res = await fetch(`${API_BASE}/api/query/${window.FILE_ID}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      column: STATE.column,
      value: STATE.value,
      mode: STATE.mode,
      start_date: STATE.start_date,
      end_date: STATE.end_date,
      page: STATE.page,
      page_size: STATE.page_size
    })
  });

  const data = await res.json();
  if (!res.ok) {
    alert(data.error || "Query failed");
    return;
  }

  qs("count").textContent = data.count;
  qs("dateCol").textContent = data.date_col || "—";

  STATE.total_pages = data.total_pages;
  STATE.page = data.page;

  writePagerUI();
  renderTable(data.rows);
}

function resetDashboard() {
  qs("valueInput").value = "";
  qs("startDate").value = "";
  qs("endDate").value = "";
  qs("modeSelect").value = "contains";
  qs("pageSize").value = "25";
  STATE.page = 1;
  queryDashboard();
}

// ---------- Agents page ----------
async function queryAgents() {
  const search = qs("agentSearch").value.trim();
  const start_date = qs("startDateAgents") ? (qs("startDateAgents").value || "") : "";
  const end_date = qs("endDateAgents") ? (qs("endDateAgents").value || "") : "";

  const res = await fetch(`${API_BASE}/api/agents/${window.FILE_ID}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ search, start_date, end_date })
  });

  const data = await res.json();
  const list = qs("agentList");
  list.innerHTML = "";

  if (!res.ok) {
    list.innerHTML = `<li class="empty">${data.error || "Error"}</li>`;
    qs("agentCount").textContent = "0";
    return;
  }

  qs("agentCount").textContent = data.count;
  const dc = document.getElementById("dateColAgents");
  if (dc) dc.textContent = data.date_col || "—";

  (data.agents || []).forEach(a => {
    const li = document.createElement("li");
    li.className = "agent-item";
    li.textContent = a;
    li.addEventListener("click", () => {
      const url = `dashboard.html?file_id=${encodeURIComponent(window.FILE_ID)}&agent=${encodeURIComponent(a)}`;
      window.location.href = url;
    });
    list.appendChild(li);
  });
}

function resetAgents() {
  if (qs("agentSearch")) qs("agentSearch").value = "";
  if (qs("startDateAgents")) qs("startDateAgents").value = "";
  if (qs("endDateAgents")) qs("endDateAgents").value = "";
  queryAgents();
}

// ---------- Agent Compare page ----------
function parseFilenameFromHeader(disposition) {
  if (!disposition) return null;
  const m = disposition.match(/filename\*?=(?:UTF-8''|")?([^\";]+)/i);
  if (!m || !m[1]) return null;
  return decodeURIComponent(m[1].replace(/"/g, "").trim());
}

const COMPARE_STATE = {
  reportId: null,
  activityReportId: null
};

function renderRowsInTable(tableId, rows, emptyMessage) {
  const table = qs(tableId);
  if (!table) return;

  table.innerHTML = "";
  if (!rows || rows.length === 0) {
    table.innerHTML = `<tr><td class='empty'>${emptyMessage}</td></tr>`;
    return;
  }

  const columns = Object.keys(rows[0]);
  if (columns.includes("S/N")) {
    columns.sort((a, b) => {
      if (a === "S/N") return -1;
      if (b === "S/N") return 1;
      return 0;
    });
  }

  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");
  columns.forEach(col => {
    const th = document.createElement("th");
    th.textContent = col;
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  rows.forEach(r => {
    const tr = document.createElement("tr");
    columns.forEach(col => {
      const td = document.createElement("td");
      td.textContent = r[col] ?? "";
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
}

function renderComparePreview(rows) {
  renderRowsInTable("comparePreviewTable", rows, "No inactive businesses found in this run.");
}

function renderActivityPreview(rows) {
  renderRowsInTable("activityPreviewTable", rows, "No businesses match this month/filter.");
}

function dateToYmd(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function syncActivityTimeframeControls() {
  const mode = (qs("activityTimeframeMode")?.value || "month").toLowerCase();
  const monthWrap = qs("activityMonthWrap");
  const customWrapStart = qs("activityCustomWrap");
  const customWrapEnd = qs("activityCustomWrapEnd");
  const monthInput = qs("activityMonth");
  const startInput = qs("activityStartDate");
  const endInput = qs("activityEndDate");

  if (monthWrap) monthWrap.hidden = mode !== "month";
  if (customWrapStart) customWrapStart.hidden = mode !== "custom";
  if (customWrapEnd) customWrapEnd.hidden = mode !== "custom";
  if (monthInput) monthInput.disabled = mode !== "month";
  if (startInput) startInput.disabled = mode !== "custom";
  if (endInput) endInput.disabled = mode !== "custom";

  if (mode === "month") {
    if (monthInput && !monthInput.value) {
      const now = new Date();
      monthInput.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    }
  } else {
    if (startInput && endInput && (!startInput.value || !endInput.value)) {
      const today = new Date();
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
      startInput.value = dateToYmd(firstDay);
      endInput.value = dateToYmd(today);
    }
  }
}

async function uploadAndCompareAgents() {
  const input = qs("compareFileInput");
  const status = qs("compareStatus");
  const summary = qs("compareSummary");
  const previewCard = qs("comparePreviewCard");
  const downloadBtn = qs("compareDownloadBtn");
  const activityCard = qs("monthlyActivityCard");
  const activitySummary = qs("activitySummary");
  const activityGenerateBtn = qs("activityGenerateBtn");
  const activityDownloadBtn = qs("activityDownloadBtn");
  const activityMonth = qs("activityMonth");
  const file = input && input.files ? input.files[0] : null;

  if (!file) {
    status.textContent = "Pick a compare file first 😭";
    status.className = "status bad";
    return;
  }

  const lower = file.name.toLowerCase();
  if (!(lower.endsWith(".xlsx") || lower.endsWith(".csv"))) {
    status.textContent = "Compare file must be .xlsx or .csv";
    status.className = "status bad";
    return;
  }

  const formData = new FormData();
  formData.append("file", file);

  status.textContent = "Uploading compare file... ⏳";
  status.className = "status";
  if (summary) summary.textContent = "";
  if (downloadBtn) downloadBtn.disabled = true;
  if (activitySummary) activitySummary.textContent = "";
  if (activityDownloadBtn) activityDownloadBtn.disabled = true;
  if (activityGenerateBtn) activityGenerateBtn.disabled = true;
  renderActivityPreview([]);
  COMPARE_STATE.reportId = null;
  COMPARE_STATE.activityReportId = null;

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 60000);

  try {
    const res = await fetch(`${API_BASE}/api/agent-compare/${window.FILE_ID}`, {
      method: "POST",
      body: formData,
      signal: controller.signal
    });
    clearTimeout(t);

    if (!res.ok) {
      const text = await res.text();
      let data = {};
      try { data = JSON.parse(text); } catch { data = { raw: text }; }
      status.textContent = data.error || `Compare failed (${res.status})`;
      status.className = "status bad";
      return;
    }

    const data = await res.json();
    COMPARE_STATE.reportId = data.report_id || null;
    if (downloadBtn) downloadBtn.disabled = !COMPARE_STATE.reportId;
    if (activityGenerateBtn) activityGenerateBtn.disabled = !COMPARE_STATE.reportId;
    if (activityDownloadBtn) activityDownloadBtn.disabled = true;
    COMPARE_STATE.activityReportId = null;

    if (previewCard) previewCard.hidden = false;
    if (activityCard) activityCard.hidden = false;
    if (activityMonth && !activityMonth.value) {
      const now = new Date();
      activityMonth.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    }
    syncActivityTimeframeControls();
    renderComparePreview(data.preview_rows || []);

    const compared = Number(data.compared_count || 0);
    const inactive = Number(data.inactive_count || 0);
    const previewShown = Math.min(Number(data.preview_limit || 0), Number(data.preview_total || 0));

    status.textContent = "Compare complete ✅ Preview generated below.";
    status.className = "status good";
    if (summary) {
      const previewText = data.preview_total > previewShown
        ? ` Showing first ${previewShown} row(s).`
        : "";
      summary.textContent = `Compared ${compared} businesses. Found ${inactive} inactive/not-seen businesses.${previewText}`;
    }
  } catch (err) {
    clearTimeout(t);
    status.textContent =
      err.name === "AbortError"
        ? "Compare timed out 😭 (backend not responding)"
        : `Compare crashed: ${err.message}`;
    status.className = "status bad";
  }
}

async function downloadCompareReport() {
  const status = qs("compareStatus");
  const reportId = COMPARE_STATE.reportId;
  if (!reportId) {
    status.textContent = "Run compare first to generate a downloadable report.";
    status.className = "status bad";
    return;
  }

  status.textContent = "Preparing download... ⏳";
  status.className = "status";

  try {
    const res = await fetch(`${API_BASE}/api/agent-compare-download/${window.FILE_ID}/${reportId}`);
    if (!res.ok) {
      const text = await res.text();
      let data = {};
      try { data = JSON.parse(text); } catch { data = { raw: text }; }
      status.textContent = data.error || `Download failed (${res.status})`;
      status.className = "status bad";
      return;
    }

    const blob = await res.blob();
    const disposition = res.headers.get("Content-Disposition") || "";
    const filename = parseFilenameFromHeader(disposition) || "inactive_businesses.xlsx";
    const url = window.URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => window.URL.revokeObjectURL(url), 2000);

    status.textContent = "Download started ✅";
    status.className = "status good";
  } catch (err) {
    status.textContent = `Download failed: ${err.message}`;
    status.className = "status bad";
  }
}

async function generateMonthlyActivityPreview() {
  const status = qs("compareStatus");
  const summary = qs("activitySummary");
  const modeInput = qs("activityTimeframeMode");
  const monthInput = qs("activityMonth");
  const startInput = qs("activityStartDate");
  const endInput = qs("activityEndDate");
  const typeInput = qs("activityType");
  const downloadBtn = qs("activityDownloadBtn");

  const reportId = COMPARE_STATE.reportId;
  if (!reportId) {
    status.textContent = "Run compare first before generating monthly activity.";
    status.className = "status bad";
    return;
  }

  const timeframe_mode = (modeInput ? (modeInput.value || "month") : "month").toLowerCase();
  const month = monthInput ? (monthInput.value || "") : "";
  const start_date = startInput ? (startInput.value || "") : "";
  const end_date = endInput ? (endInput.value || "") : "";
  const activity_type = typeInput ? (typeInput.value || "all") : "all";
  if (timeframe_mode === "month") {
    if (!month) {
      status.textContent = "Select a month first.";
      status.className = "status bad";
      return;
    }
  } else {
    if (!start_date || !end_date) {
      status.textContent = "Select both custom start and end dates.";
      status.className = "status bad";
      return;
    }
    if (start_date > end_date) {
      status.textContent = "Custom start date cannot be after end date.";
      status.className = "status bad";
      return;
    }
  }

  status.textContent = "Generating monthly activity preview... ⏳";
  status.className = "status";
  if (summary) summary.textContent = "";
  if (downloadBtn) downloadBtn.disabled = true;
  COMPARE_STATE.activityReportId = null;

  try {
    const res = await fetch(`${API_BASE}/api/agent-monthly/${window.FILE_ID}/${reportId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        timeframe_mode,
        month,
        start_date,
        end_date,
        activity_type
      })
    });

    const data = await res.json();
    if (!res.ok) {
      status.textContent = data.error || `Activity preview failed (${res.status})`;
      status.className = "status bad";
      renderActivityPreview([]);
      return;
    }

    COMPARE_STATE.activityReportId = data.activity_report_id || null;
    if (downloadBtn) downloadBtn.disabled = !COMPARE_STATE.activityReportId;
    renderActivityPreview(data.preview_rows || []);

    const shown = Math.min(Number(data.preview_limit || 0), Number(data.preview_total || 0));
    const extra = data.preview_total > shown ? ` Showing first ${shown} row(s).` : "";
    const typeLabel = (data.activity_type || activity_type).toUpperCase();
    const timeframeLabel = data.timeframe_label || month;
    status.textContent = "Monthly activity preview ready ✅";
    status.className = "status good";
    if (summary) {
      summary.textContent = `${timeframeLabel} | Type: ${typeLabel} | Rows: ${data.total_rows || 0}.${extra}`;
    }
  } catch (err) {
    status.textContent = `Activity preview failed: ${err.message}`;
    status.className = "status bad";
    renderActivityPreview([]);
  }
}

async function downloadMonthlyActivityReport() {
  const status = qs("compareStatus");
  const reportId = COMPARE_STATE.reportId;
  const activityReportId = COMPARE_STATE.activityReportId;
  if (!reportId || !activityReportId) {
    status.textContent = "Generate monthly activity preview first before downloading.";
    status.className = "status bad";
    return;
  }

  status.textContent = "Preparing monthly activity download... ⏳";
  status.className = "status";

  try {
    const res = await fetch(
      `${API_BASE}/api/agent-monthly-download/${window.FILE_ID}/${reportId}/${activityReportId}`
    );
    if (!res.ok) {
      const text = await res.text();
      let data = {};
      try { data = JSON.parse(text); } catch { data = { raw: text }; }
      status.textContent = data.error || `Download failed (${res.status})`;
      status.className = "status bad";
      return;
    }

    const blob = await res.blob();
    const disposition = res.headers.get("Content-Disposition") || "";
    const filename = parseFilenameFromHeader(disposition) || "agent_monthly_activity.xlsx";
    const url = window.URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => window.URL.revokeObjectURL(url), 2000);

    status.textContent = "Monthly activity download started ✅";
    status.className = "status good";
  } catch (err) {
    status.textContent = `Download failed: ${err.message}`;
    status.className = "status bad";
  }
}

// ---------- Boot ----------
document.addEventListener("DOMContentLoaded", async () => {
  // upload page
  const uploadBtn = document.getElementById("uploadBtn");
  if (uploadBtn) uploadBtn.addEventListener("click", uploadFile);

  // dashboard
  if (window.FILE_ID && window.PAGE === "dashboard") {
    await loadMetaAndBuildChips();
    await applyDateBounds();

    const params = new URLSearchParams(window.location.search);
    const agent = params.get("agent");
    if (agent) {
      qs("valueInput").value = agent;
      qs("modeSelect").value = "equals";
    }

    qs("filterBtn").addEventListener("click", () => { STATE.page = 1; queryDashboard(); });
    qs("resetBtn").addEventListener("click", resetDashboard);

    qs("prevBtn").addEventListener("click", () => {
      if (STATE.page > 1) { STATE.page--; queryDashboard(); }
    });
    qs("nextBtn").addEventListener("click", () => {
      if (STATE.page < STATE.total_pages) { STATE.page++; queryDashboard(); }
    });

    qs("pageSize").addEventListener("change", () => { STATE.page = 1; queryDashboard(); });

    qs("exportCsv").addEventListener("click", () => window.location.href = buildExportUrl("csv"));
    qs("exportXlsx").addEventListener("click", () => window.location.href = buildExportUrl("xlsx"));

    STATE.page = 1;
    queryDashboard();
  }

  // agents
  if (window.FILE_ID && window.PAGE === "agents") {
    const applyBtn = document.getElementById("agentsApplyBtn");
    const resetBtn = document.getElementById("agentsResetBtn");
    if (applyBtn) applyBtn.addEventListener("click", queryAgents);
    if (resetBtn) resetBtn.addEventListener("click", resetAgents);

    const agentSearch = document.getElementById("agentSearch");
    if (agentSearch) agentSearch.addEventListener("keydown", (e) => {
      if (e.key === "Enter") queryAgents();
    });

    queryAgents();
  }

  // agent compare
  if (window.FILE_ID && window.PAGE === "agent_compare") {
    const compareBtn = document.getElementById("compareUploadBtn");
    const downloadBtn = document.getElementById("compareDownloadBtn");
    const activityGenerateBtn = document.getElementById("activityGenerateBtn");
    const activityDownloadBtn = document.getElementById("activityDownloadBtn");
    const activityTimeframeMode = document.getElementById("activityTimeframeMode");
    if (compareBtn) compareBtn.addEventListener("click", uploadAndCompareAgents);
    if (downloadBtn) downloadBtn.addEventListener("click", downloadCompareReport);
    if (activityGenerateBtn) activityGenerateBtn.addEventListener("click", generateMonthlyActivityPreview);
    if (activityDownloadBtn) activityDownloadBtn.addEventListener("click", downloadMonthlyActivityReport);
    if (activityTimeframeMode) activityTimeframeMode.addEventListener("change", syncActivityTimeframeControls);
    syncActivityTimeframeControls();
  }
});
