const API_BASE = "https://frauddetection-6c4q.onrender.com/";
const $ = (id) => document.getElementById(id);
const money = (n) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(n || 0));
const riskClass = (level) => "risk-" + String(level || "low").toLowerCase();
const statusClass = (status) => "status-" + String(status || "open").toLowerCase();
let dashboardData = null;

async function api(path, options = {}) {
  const response = await fetch(API_BASE + path, { headers: { "Content-Type": "application/json" }, ...options });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || body.message || `Request failed (${response.status})`);
  return body;
}
function toast(message, error = false) {
  const el = $("toast"); el.textContent = message; el.classList.toggle("error", error); el.classList.add("show");
  clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.remove("show"), 3000);
}
function setConnection(ok, message) {
  $("connection-copy").textContent = message;
  document.querySelector(".pulse").style.background = ok ? "var(--green)" : "var(--red)";
}
function renderAlerts(alerts) {
  $("nav-alert-count").textContent = alerts.length;
  $("alert-pill").textContent = String(alerts.length).padStart(2, "0");
  $("alerts-body").innerHTML = alerts.map(a => `<tr>
    <td><span class="id-cell">#${a.transactionId}</span><span class="sub-cell">${a.customer || "Customer"} · ${a.location || "Unknown"}</span></td>
    <td><span class="risk-badge ${riskClass(a.riskLevel)}">${a.riskLevel}</span><span class="sub-cell">${a.alertType}</span></td>
    <td><strong>${money(a.amount)}</strong></td>
    <td><span class="status-badge ${statusClass(a.status)}">${(a.status || "OPEN").replaceAll("_", " ")}</span></td>
    <td><button class="mini-action" data-investigate="${a.alertId}">Investigate ↗</button></td></tr>`).join("") || `<tr><td colspan="5" class="empty">No alerts found.</td></tr>`;
  document.querySelectorAll("[data-investigate]").forEach(btn => btn.addEventListener("click", () => {
    $("alert-select").value = btn.dataset.investigate; runInvestigation(); $("investigate-section").scrollIntoView({ behavior: "smooth", block: "center" });
  }));
}
function renderTransactions(rows) {
  $("transactions-body").innerHTML = rows.map(t => `<tr><td class="id-cell">#${t.id}</td><td>${t.type}</td><td>${t.location || "Unknown"}</td><td><strong>${money(t.amount)}</strong></td><td><span class="status-badge ${t.status === "SUSPICIOUS" ? "status-open" : "status-resolved"}">${t.status}</span></td><td>${String(t.dateTime || "").replace("T", " ").slice(0, 16) || "—"}</td></tr>`).join("") || `<tr><td colspan="6" class="empty">No transactions found.</td></tr>`;
}
function renderDistribution(items) {
  const palette = { CRITICAL: "var(--red)", HIGH: "var(--amber)", MEDIUM: "var(--blue)", LOW: "var(--green)" };
  const total = items.reduce((s, x) => s + x.total, 0);
  $("risk-total").textContent = String(total).padStart(2, "0");
  let start = 0;
  const stops = items.map(x => { const from = start; start += total ? x.total / total * 100 : 0; return `${palette[x.riskLevel] || "#536779"} ${from}% ${start}%` });
  $("risk-donut").style.background = stops.length ? `conic-gradient(${stops.join(",")})` : "conic-gradient(#263746 0 100%)";
  $("risk-legend").innerHTML = items.map(x => `<div class="legend-row"><i class="legend-swatch" style="background:${palette[x.riskLevel] || "#536779"}"></i><span>${x.riskLevel}</span><strong>${x.total}</strong></div>`).join("");
}
async function loadDashboard() {
  try {
    const health = await api("/health");
    setConnection(health.ok, "Connected · Bolt");
    dashboardData = await api("/dashboard");
    const c = dashboardData.counts;
    $("kpi-customers").textContent = c.customers ?? 0;
    $("kpi-transactions").textContent = c.transactions ?? 0;
    $("kpi-alerts").textContent = c.alerts ?? 0;
    $("kpi-cases").textContent = dashboardData.alerts.filter(a => a.caseStatus && a.caseStatus !== "RESOLVED").length;
    renderAlerts(dashboardData.alerts); renderTransactions(dashboardData.transactions); renderDistribution(dashboardData.distribution);
  } catch (e) {
    setConnection(false, "API unavailable");
    $("alerts-body").innerHTML = `<tr><td colspan="5" class="empty">Could not connect to the API. Start Neo4j and the backend, then refresh.<br><br><small>${e.message}</small></td></tr>`;
    $("transactions-body").innerHTML = `<tr><td colspan="6" class="empty">Waiting for database connection…</td></tr>`;
    toast("Cannot reach Neo4j API. Check the README setup steps.", true);
  }
}
async function runInvestigation() {
  const id = $("alert-select").value; const out = $("investigation-result");
  out.innerHTML = '<span class="placeholder-orbit">…</span><p>Traversing connected nodes in Neo4j…</p>';
  try {
    const data = await api(`/investigate/${id}`); const r = data.result;
    if (!r) { out.innerHTML = "<p>No connected investigation path found for this alert.</p>"; return; }
    const nodes = [
      ["CUSTOMER", r.customer], ["ACCOUNT", `#${r.accountId}`], ["TRANSACTION", `#${r.transactionId}`],
      ["FRAUD ALERT", `${r.riskLevel} · #${r.alertId}`], ["CASE", r.caseId ? `#${r.caseId}` : "No case"], ["INVESTIGATOR", r.investigator || "Unassigned"]
    ];
    out.innerHTML = `<div class="path-flow">${nodes.map((n, i) => `${i ? '<span class="path-arrow">→</span>' : ""}<div class="path-node"><span>${n[0]}</span><strong>${n[1] || "—"}</strong></div>`).join("")}</div>
      <div class="path-extra">${r.alertType} · ${money(r.amount)} · ${r.location} · Alert status: ${r.alertStatus} · Case: ${r.caseStatus || "Not opened"}</div>`;
    toast("Graph traversal completed for alert #" + id);
  } catch (e) { out.innerHTML = `<p>Investigation failed: ${e.message}</p>`; toast(e.message, true); }
}
async function sharedIndicators() {
  const out = $("shared-result"); out.innerHTML = '<span class="shared-placeholder">Searching connected accounts…</span>';
  try {
    const data = await api("/shared-indicators");
    out.innerHTML = data.results.length ? data.results.map(r => `<div class="shared-card"><span class="shared-person">${r.customer1} · Account ${r.account1}</span><span class="shared-device">↔ ${r.indicator}<br>${r.indicatorType}</span><span class="shared-person">${r.customer2} · Account ${r.account2}</span><div class="shared-note">Synthetic teaching indicator. This is a lead for review, not proof of fraud.</div></div>`).join("") : `<span class="shared-placeholder">No shared indicators found. Confirm the sample seed has run.</span>`;
    toast(`Found ${data.results.length} shared-indicator connection(s).`);
  } catch (e) { out.innerHTML = `<span class="shared-placeholder">${e.message}</span>`; toast(e.message, true); }
}
document.querySelectorAll("[data-view]").forEach(btn => btn.addEventListener("click", () => {
  const view = btn.dataset.view;
  document.querySelectorAll(".nav-item").forEach(n => n.classList.toggle("active", n === btn));
  const names = { overview: "Overview", alerts: "Fraud alerts", investigate: "Investigations", network: "Graph network" };
  $("crumb-current").textContent = names[view] || "Overview";
  const targets = { overview: ".page-heading", alerts: "#alerts-panel", investigate: "#investigate-section", network: ".shared-panel" };
  document.querySelector(targets[view] || ".page-heading").scrollIntoView({ behavior: "smooth", block: "start" });
  if (view === "network") sharedIndicators();
}));
$("refresh-btn").addEventListener("click", () => loadDashboard().then(() => toast("Dashboard refreshed.")));
$("investigate-btn").addEventListener("click", runInvestigation);
$("shared-btn").addEventListener("click", sharedIndicators);
loadDashboard();


// Data entry + CSV import interface
const recordFields = {
  customer: [['customerId', 'Customer ID', 'number'], ['name', 'Full name', 'text'], ['email', 'Email', 'email'], ['city', 'City', 'text']],
  account: [['accountId', 'Account ID', 'number'], ['accountType', 'Account type', 'select', 'Savings,Current'], ['balance', 'Balance (INR)', 'number'], ['status', 'Status', 'select', 'ACTIVE,BLOCKED'], ['customerId', 'Owner customer ID', 'number']],
  transaction: [['transactionId', 'Transaction ID', 'number'], ['amount', 'Amount (INR)', 'number'], ['transactionType', 'Transaction type', 'select', 'UPI,ONLINE,CARD,ATM'], ['dateTime', 'Date and time', 'datetime-local'], ['location', 'Location', 'text'], ['status', 'Status', 'select', 'SUCCESS,SUSPICIOUS,FAILED'], ['accountId', 'Account ID', 'number']],
  alert: [['alertId', 'Alert ID', 'number'], ['alertType', 'Alert type', 'text'], ['riskLevel', 'Risk level', 'select', 'LOW,MEDIUM,HIGH,CRITICAL'], ['alertDate', 'Alert date', 'date'], ['status', 'Status', 'select', 'OPEN,UNDER_REVIEW,RESOLVED,ESCALATED'], ['transactionId', 'Transaction ID', 'number']],
  case: [['caseId', 'Case ID', 'number'], ['caseStatus', 'Case status', 'select', 'OPEN,UNDER_INVESTIGATION,RESOLVED'], ['openDate', 'Open date', 'date'], ['closeDate', 'Close date (optional)', 'date'], ['alertId', 'Alert ID', 'number'], ['investigatorId', 'Investigator ID', 'number']]
};
function ensureDataEntryUI() {
  if ($('data-entry-panel')) return;
  const panel = document.createElement('section'); panel.className = 'panel data-entry-panel'; panel.id = 'data-entry-panel';
  panel.innerHTML = `<div class="panel-header"><div><div class="section-kicker">DATA MANAGEMENT</div><h2>Add records or import CSV</h2><p class="panel-desc">Records are validated by the API and saved to Neo4j.</p></div></div><div class="entry-toolbar"><label for="record-type">RECORD TYPE</label><select id="record-type"><option value="customer">Customer</option><option value="account">Account</option><option value="transaction">Transaction</option><option value="alert">Fraud alert</option><option value="case">Fraud case</option></select><button class="primary-button" id="show-record-form">＋ Add record</button><label class="upload-button" for="csv-file">↑ Import CSV</label><input id="csv-file" type="file" accept=".csv,text/csv" hidden></div><div id="record-form-wrap"></div><div id="import-result" class="import-result" aria-live="polite">CSV headers must match the selected record type's field names. Import parent records first, then linked records.</div>`;
  document.querySelector('.transactions-panel').before(panel);
  $('show-record-form').addEventListener('click', renderRecordForm);
  $('record-type').addEventListener('change', () => { $('record-form-wrap').innerHTML = ''; $('import-result').textContent = 'CSV headers: ' + recordFields[$('record-type').value].map(f => f[0]).join(', ') });
  $('csv-file').addEventListener('change', importCSV);
}
function renderRecordForm() {
  const type = $('record-type').value, fields = recordFields[type];
  $('record-form-wrap').innerHTML = `<form id="record-form" class="record-form">${fields.map(([key, label, kind, options]) => `<label>${label}${kind === 'select' ? `<select name="${key}" required>${options.split(',').map(o => `<option>${o}</option>`).join('')}</select>` : `<input name="${key}" type="${kind}" ${key === 'closeDate' ? '' : 'required'} ${kind === 'number' ? 'step="any"' : ''} ${kind === 'datetime-local' ? '' : 'placeholder=""'}>`}</label>`).join('')}<div class="form-actions"><button class="primary-button" type="submit">Save to Neo4j</button><button class="outline-button" type="button" id="cancel-record">Cancel</button></div></form>`;
  $('cancel-record').addEventListener('click', () => $('record-form-wrap').innerHTML = '');
  $('record-form').addEventListener('submit', async e => { e.preventDefault(); const button = e.submitter; button.disabled = true; button.textContent = 'Saving…'; const data = Object.fromEntries(new FormData(e.currentTarget).entries()); for (const f of fields) { if (f[2] === 'number' && data[f[0]] !== '') data[f[0]] = Number(data[f[0]]); } if (type === 'transaction' && data.dateTime) data.dateTime = new Date(data.dateTime).toISOString(); try { const result = await api('/records/' + type, { method: 'POST', body: JSON.stringify(data) }); toast(`Record saved successfully (ID ${result.created.id}).`); $('record-form-wrap').innerHTML = ''; $('import-result').textContent = 'Saved successfully. Dashboard refreshed.'; await loadDashboard(); } catch (err) { toast(err.message, true); $('import-result').textContent = 'Could not save: ' + err.message; } finally { button.disabled = false; button.textContent = 'Save to Neo4j'; } });
}
function parseCSV(text) { const lines = text.replace(/^\uFEFF/, '').trim().split(/\r?\n/); if (lines.length < 2) throw new Error('CSV needs a header row and at least one data row.'); const parseLine = line => { const out = []; let v = '', quoted = false; for (let i = 0; i < line.length; i++) { const c = line[i]; if (c === '"' && line[i + 1] === '"' && quoted) { v += '"'; i++; } else if (c === '"') quoted = !quoted; else if (c === ',' && !quoted) { out.push(v.trim()); v = ''; } else v += c; } out.push(v.trim()); return out; }; const headers = parseLine(lines[0]); return lines.slice(1).filter(l => l.trim()).map(line => { const vals = parseLine(line), obj = {}; headers.forEach((h, i) => obj[h] = vals[i] ?? ''); return obj; }); }
async function importCSV(e) { const file = e.target.files[0]; if (!file) return; try { const rows = parseCSV(await file.text()); const type = $('record-type').value; const expected = recordFields[type].map(f => f[0]); const missing = expected.filter(k => !(k in rows[0]) && !(k === 'closeDate' && type === 'case')); if (missing.length) throw new Error('Missing CSV columns: ' + missing.join(', ')); const result = await api('/import/' + type, { method: 'POST', body: JSON.stringify({ rows }) }); $('import-result').textContent = `Import complete: ${result.created} created, ${result.failed} failed out of ${result.total}. ` + result.results.filter(r => !r.ok).slice(0, 5).map(r => `Row ${r.row}: ${r.error}`).join(' | '); toast(`CSV import: ${result.created} created, ${result.failed} failed.`, result.failed > 0); await loadDashboard(); } catch (err) { $('import-result').textContent = 'Import failed: ' + err.message; toast(err.message, true); } finally { e.target.value = ''; } }
ensureDataEntryUI();
