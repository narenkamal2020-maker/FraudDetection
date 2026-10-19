/* FraudGraph frontend. Keep API routes aligned with backend/server.js. */
const API_BASE = "https://frauddetection-6c4q.onrender.com/api";
const $ = id => document.getElementById(id);
const money = n => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(n || 0));
const riskClass = level => "risk-" + String(level || "low").toLowerCase();
const statusClass = status => "status-" + String(status || "open").toLowerCase();
let toastTimer;

function escapeHtml(value) { return String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
async function api(path, options = {}) {
  const normalized = String(path).startsWith("/") ? String(path) : "/" + path;
  const response = await fetch(API_BASE + normalized, { ...options, headers: { ...(options.body ? { "Content-Type": "application/json" } : {}), ...(options.headers || {}) } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || body.message || `Request failed (${response.status})`);
  return body;
}
function toast(message, error = false) {
  const el = $("toast"); el.textContent = message; el.classList.toggle("error", error); el.classList.add("show");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove("show"), 3200);
}
function setConnection(ok, message) {
  $("connection-copy").textContent = message;
  $("db-status").classList.toggle("connected", !!ok); $("db-status").classList.toggle("disconnected", !ok);
  const light = document.querySelector(".status-light"); if (light) light.style.background = ok ? "var(--green)" : "var(--red)";
}
function renderAlerts(alerts = []) {
  $("nav-alert-count").textContent = alerts.length; $("alert-pill").textContent = String(alerts.length).padStart(2, "0");
  $("alerts-body").innerHTML = alerts.map(a => `<tr>
    <td><span class="id-cell">#${escapeHtml(a.transactionId)}</span><span class="sub-cell">${escapeHtml(a.customer || "Customer")} · ${escapeHtml(a.location || "Unknown")}</span></td>
    <td><span class="risk-badge ${riskClass(a.riskLevel)}">${escapeHtml(a.riskLevel || "UNKNOWN")}</span><span class="sub-cell">${escapeHtml(a.alertType || "Alert")}</span></td>
    <td><strong>${money(a.amount)}</strong></td><td><span class="status-badge ${statusClass(a.status)}">${escapeHtml(String(a.status || "OPEN").replaceAll("_", " "))}</span></td>
    <td><button class="mini-action" data-investigate="${escapeHtml(a.alertId)}">Investigate ↗</button></td></tr>`).join("") || '<tr><td colspan="5" class="empty">No alerts found.</td></tr>';
  document.querySelectorAll("[data-investigate]").forEach(btn => btn.addEventListener("click", () => { $("alert-select").value = btn.dataset.investigate; runInvestigation(); $("investigate-section").scrollIntoView({ behavior: "smooth", block: "center" }); }));
  const select = $("alert-select"), previous = select.value;
  select.innerHTML = alerts.length ? alerts.map(a => `<option value="${escapeHtml(a.alertId)}">Alert #${escapeHtml(a.alertId)} · ${escapeHtml(a.alertType || "Fraud alert")}</option>`).join("") : '<option value="">No alerts available</option>';
  if (alerts.some(a => String(a.alertId) === previous)) select.value = previous;
}
function renderTransactions(rows = []) {
  $("transactions-body").innerHTML = rows.map(t => `<tr><td class="id-cell">#${escapeHtml(t.id)}</td><td>${escapeHtml(t.type || "—")}</td><td>${escapeHtml(t.location || "Unknown")}</td><td><strong>${money(t.amount)}</strong></td><td><span class="status-badge ${statusClass(t.status)}">${escapeHtml(t.status || "UNKNOWN")}</span></td><td>${escapeHtml(String(t.dateTime || "").replace("T", " ").slice(0, 16) || "—")}</td></tr>`).join("") || '<tr><td colspan="6" class="empty">No transactions found.</td></tr>';
}
function renderDistribution(items = []) {
  const palette = { CRITICAL: "var(--red)", HIGH: "var(--amber)", MEDIUM: "var(--blue)", LOW: "var(--green)" };
  const total = items.reduce((sum, item) => sum + Number(item.total || 0), 0); $("risk-total").textContent = String(total).padStart(2, "0");
  let start = 0; const stops = items.map(item => { const from = start; start += total ? Number(item.total || 0) / total * 100 : 0; return `${palette[item.riskLevel] || "#536779"} ${from}% ${start}%`; });
  $("risk-donut").style.background = stops.length ? `conic-gradient(${stops.join(",")})` : "conic-gradient(#263746 0 100%)";
  $("risk-legend").innerHTML = items.map(item => `<div class="legend-row"><i class="legend-swatch" style="background:${palette[item.riskLevel] || "#536779"}"></i><span>${escapeHtml(item.riskLevel || "UNKNOWN")}</span><strong>${Number(item.total || 0)}</strong></div>`).join("") || '<span class="muted">No alert distribution</span>';
}
async function loadDashboard(showMessage = false) {
  try {
    const health = await api("/health"); setConnection(!!health.ok, health.ok ? "Connected · Bolt" : "API reachable");
    const data = await api("/dashboard"), counts = data.counts || {}, alerts = data.alerts || [];
    $("kpi-customers").textContent = counts.customers ?? 0; $("kpi-transactions").textContent = counts.transactions ?? 0;
    $("kpi-alerts").textContent = counts.alerts ?? alerts.length;
    $("kpi-cases").textContent = alerts.filter(a => a.caseStatus && a.caseStatus !== "RESOLVED").length;
    renderAlerts(alerts); renderTransactions(data.transactions || []); renderDistribution(data.distribution || []);
    if (showMessage) toast("Dashboard refreshed.");
  } catch (error) {
    setConnection(false, "API unavailable");
    $("alerts-body").innerHTML = `<tr><td colspan="5" class="empty">Could not load alerts. ${escapeHtml(error.message)}</td></tr>`;
    $("transactions-body").innerHTML = '<tr><td colspan="6" class="empty">Waiting for database connection…</td></tr>';
    if (showMessage) toast("Dashboard refresh failed: " + error.message, true);
  }
}
async function runInvestigation() {
  const id = $("alert-select").value, out = $("investigation-result");
  if (!id) { out.innerHTML = "<p>No alerts are available to investigate.</p>"; return; }
  out.innerHTML = '<span class="placeholder-orbit">◎</span><p>Traversing connected nodes…</p>';
  try {
    const data = await api(`/investigate/${encodeURIComponent(id)}`), r = data.result;
    if (!r) { out.innerHTML = "<p>No connected investigation path found for this alert.</p>"; return; }
    const nodes = [["CUSTOMER", r.customer], ["ACCOUNT", `#${r.accountId}`], ["TRANSACTION", `#${r.transactionId}`], ["FRAUD ALERT", `${r.riskLevel || ""} · #${r.alertId}`], ["CASE", r.caseId ? `#${r.caseId}` : "No case"], ["INVESTIGATOR", r.investigator || "Unassigned"]];
    out.innerHTML = `<div class="path-flow">${nodes.map((n, i) => `${i ? '<span class="path-arrow">→</span>' : ""}<div class="path-node"><span>${escapeHtml(n[0])}</span><strong>${escapeHtml(n[1] || "—")}</strong></div>`).join("")}</div><div class="path-extra">${escapeHtml(r.alertType || "Alert")} · ${money(r.amount)} · ${escapeHtml(r.location || "Unknown")} · Alert status: ${escapeHtml(r.alertStatus || "Unknown")} · Case: ${escapeHtml(r.caseStatus || "Not opened")}</div>`;
    toast(`Graph traversal completed for alert #${id}`);
  } catch (error) { out.innerHTML = `<p>Investigation failed: ${escapeHtml(error.message)}</p>`; toast(error.message, true); }
}
async function sharedIndicators() {
  const out = $("shared-result"); out.innerHTML = '<span class="shared-placeholder">Searching connected accounts…</span>';
  try {
    const data = await api("/shared-indicators"), results = data.results || [];
    out.innerHTML = results.length ? results.map(r => `<div class="shared-card"><span class="shared-person">${escapeHtml(r.customer1)} · Account ${escapeHtml(r.account1)}</span><span class="shared-device">↔ ${escapeHtml(r.indicator)}<br>${escapeHtml(r.indicatorType)}</span><span class="shared-person">${escapeHtml(r.customer2)} · Account ${escapeHtml(r.account2)}</span><div class="shared-note">Synthetic teaching indicator. This is a lead for review, not proof of fraud.</div></div>`).join("") : '<span class="shared-placeholder">No shared indicators found. Confirm the sample seed has run.</span>';
    toast(`Found ${results.length} shared-indicator connection(s).`);
  } catch (error) { out.innerHTML = `<span class="shared-placeholder">${escapeHtml(error.message)}</span>`; toast(error.message, true); }
}
document.querySelectorAll("[data-view]").forEach(button => button.addEventListener("click", () => {
  const view = button.dataset.view; document.querySelectorAll(".nav-item").forEach(nav => nav.classList.toggle("active", nav === button));
  const names = { overview: "Overview", alerts: "Fraud alerts", investigate: "Investigations", network: "Graph network" };
  $("crumb-current").textContent = names[view] || "Overview";
  const targets = { overview: "#overview-heading", alerts: "#alerts-panel", investigate: "#investigate-section", network: "#network-section" };
  document.querySelector(targets[view] || "#overview-heading").scrollIntoView({ behavior: "smooth", block: "start" });
  if (view === "network") sharedIndicators();
}));
$("refresh-btn").addEventListener("click", () => loadDashboard(true));
$("investigate-btn").addEventListener("click", runInvestigation);
$("shared-btn").addEventListener("click", sharedIndicators);

const recordFields = {
  customer: [["customerId", "Customer ID", "number"], ["name", "Full name", "text"], ["email", "Email", "email"], ["city", "City", "text"]],
  account: [["accountId", "Account ID", "number"], ["accountType", "Account type", "select", "Savings,Current"], ["balance", "Balance (INR)", "number"], ["status", "Status", "select", "ACTIVE,BLOCKED"], ["customerId", "Owner customer ID", "number"]],
  transaction: [["transactionId", "Transaction ID", "number"], ["amount", "Amount (INR)", "number"], ["transactionType", "Transaction type", "select", "UPI,ONLINE,CARD,ATM"], ["dateTime", "Date and time", "datetime-local"], ["location", "Location", "text"], ["status", "Status", "select", "SUCCESS,SUSPICIOUS,FAILED"], ["accountId", "Account ID", "number"]],
  alert: [["alertId", "Alert ID", "number"], ["alertType", "Alert type", "text"], ["riskLevel", "Risk level", "select", "LOW,MEDIUM,HIGH,CRITICAL"], ["alertDate", "Alert date", "date"], ["status", "Status", "select", "OPEN,UNDER_REVIEW,RESOLVED,ESCALATED"], ["transactionId", "Transaction ID", "number"]],
  case: [["caseId", "Case ID", "number"], ["caseStatus", "Case status", "select", "OPEN,UNDER_INVESTIGATION,RESOLVED"], ["openDate", "Open date", "date"], ["closeDate", "Close date (optional)", "date"], ["alertId", "Alert ID", "number"], ["investigatorId", "Investigator ID", "number"]]
};
function updateImportHint() { const type = $("record-type").value; $("import-result").textContent = "CSV headers: " + recordFields[type].map(f => f[0]).join(", ") + ". Import parent records before linked records."; $("import-result").classList.remove("error"); }
function renderRecordForm() {
  const type = $("record-type").value, fields = recordFields[type];
  $("record-form-wrap").innerHTML = `<form id="record-form" class="record-form">${fields.map(([key, label, kind, options]) => `<label>${escapeHtml(label)}${kind === "select" ? `<select name="${key}" required>${options.split(",").map(o => `<option value="${o}">${o.replaceAll("_", " ")}</option>`).join("")}</select>` : `<input name="${key}" type="${kind}" ${key === "closeDate" ? "" : "required"} ${kind === "number" ? 'step="any"' : ""}>`}</label>`).join("")}<div class="form-actions"><button class="primary-button" type="submit">Save to Neo4j</button><button class="outline-button" type="button" id="cancel-record">Cancel</button></div></form>`;
  $("cancel-record").addEventListener("click", () => $("record-form-wrap").replaceChildren());
  $("record-form").addEventListener("submit", async event => {
    event.preventDefault(); const button = event.submitter; button.disabled = true; button.textContent = "Saving…";
    const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    for (const field of fields) if (field[2] === "number" && data[field[0]] !== "") data[field[0]] = Number(data[field[0]]);
    if (type === "transaction" && data.dateTime) data.dateTime = new Date(data.dateTime).toISOString();
    if (type === "case" && !data.closeDate) delete data.closeDate;
    try {
      const result = await api(`/records/${type}`, { method: "POST", body: JSON.stringify(data) });
      toast(`Record saved successfully${result.created?.id ? ` (ID ${result.created.id})` : ""}.`);
      $("record-form-wrap").replaceChildren(); $("import-result").textContent = "Saved successfully. Dashboard refreshed."; $("import-result").classList.remove("error"); await loadDashboard();
    } catch (error) { toast(error.message, true); $("import-result").textContent = "Could not save: " + error.message; $("import-result").classList.add("error"); }
    finally { button.disabled = false; button.textContent = "Save to Neo4j"; }
  });
}
function parseCSV(text) {
  const lines = text.replace(/^\uFEFF/, "").trim().split(/\r?\n/); if (lines.length < 2) throw new Error("CSV needs a header row and at least one data row.");
  const parseLine = line => { const out = []; let value = "", quoted = false; for (let i = 0; i < line.length; i++) { const c = line[i]; if (c === '"' && line[i + 1] === '"' && quoted) { value += '"'; i++; } else if (c === '"') quoted = !quoted; else if (c === "," && !quoted) { out.push(value.trim()); value = ""; } else value += c; } out.push(value.trim()); return out; };
  const headers = parseLine(lines[0]); return lines.slice(1).filter(l => l.trim()).map(line => { const vals = parseLine(line), row = {}; headers.forEach((h, i) => row[h] = vals[i] ?? ""); return row; });
}
async function importCSV(event) {
  const file = event.target.files[0]; if (!file) return;
  try {
    const rows = parseCSV(await file.text()), type = $("record-type").value, expected = recordFields[type].map(f => f[0]);
    const missing = expected.filter(k => !(k in rows[0]) && !(k === "closeDate" && type === "case")); if (missing.length) throw new Error("Missing CSV columns: " + missing.join(", "));
    const result = await api(`/import/${type}`, { method: "POST", body: JSON.stringify({ rows }) });
    $("import-result").textContent = `Import complete: ${result.created} created, ${result.failed} failed out of ${result.total}. ` + (result.results || []).filter(r => !r.ok).slice(0, 5).map(r => `Row ${r.row}: ${r.error}`).join(" | ");
    $("import-result").classList.toggle("error", Number(result.failed) > 0); toast(`CSV import: ${result.created} created, ${result.failed} failed.`, Number(result.failed) > 0); await loadDashboard();
  } catch (error) { $("import-result").textContent = "Import failed: " + error.message; $("import-result").classList.add("error"); toast(error.message, true); }
  finally { event.target.value = ""; }
}
$("show-record-form").addEventListener("click", renderRecordForm);
$("record-type").addEventListener("change", () => { $("record-form-wrap").replaceChildren(); updateImportHint(); });
$("csv-file").addEventListener("change", importCSV);
loadDashboard();
