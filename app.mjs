import { auditKeywords, buildBrief, parseCsv, prepareKeywords, stringifyCsv, suggestClusters } from "./core.mjs";

const $ = (selector) => document.querySelector(selector);
const state = { rows: [], filename: "Synthetic demo · 16 rows", briefCluster: "", primaryId: "" };
const escape = (value) => String(value ?? "").replace(/[&<>"']/gu, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
let toastTimer;

function toast(message) {
  const node = $("#toast");
  node.textContent = message;
  node.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { node.hidden = true; }, 3200);
}

function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function options(values, current) {
  return values.map((value) => `<option value="${escape(value)}" ${value === current ? "selected" : ""}>${escape(value)}</option>`).join("");
}

function renderSummary() {
  const audit = auditKeywords(state.rows);
  $("#count-keywords").textContent = String(audit.count);
  $("#count-duplicates").textContent = String(audit.duplicates.reduce((sum, item) => sum + item.ids.length, 0));
  $("#count-missing-intent").textContent = String(audit.missingIntent);
  $("#count-unclustered").textContent = String(audit.missingCluster);
  $("#dataset-name").textContent = state.filename;
  $("#summary-checks").innerHTML = [
    ["Missing intent", audit.missingIntent],
    ["Unassigned cluster", audit.missingCluster],
    ["No supplied volume", audit.missingVolume],
    ["No supplied difficulty", audit.missingDifficulty],
  ].map(([name, count]) => `<div class="check-row"><span>${escape(name)}</span><b class="${count ? "warn" : "ok"}">${count || "Clear"}</b></div>`).join("");
  const dup = audit.duplicates;
  $("#duplicate-list").innerHTML = dup.length ? dup.map((item) => `<div class="dup-row"><span>${escape(item.keyword)}</span><span>${item.ids.length} rows</span></div>`).join("") : `<div class="empty">No normalized duplicates found.</div>`;
}

function renderKeywords() {
  const query = $("#keyword-search").value.trim().toLocaleLowerCase("und");
  const intentFilter = $("#intent-filter").value;
  const stageFilter = $("#stage-filter").value;
  const rows = state.rows.filter((row) => {
    const matchesText = !query || [row.keyword, row.cluster, row.sourceNotes].some((value) => value.toLocaleLowerCase("und").includes(query));
    return matchesText && (intentFilter === "All intents" || row.intent === intentFilter) && (stageFilter === "All stages" || row.stage === stageFilter);
  });
  if (!rows.length) {
    $("#keyword-table").innerHTML = `<div class="empty">${state.rows.length ? "Nothing matches these filters." : "Import a CSV or add a keyword to get started."}</div>`;
    return;
  }
  const head = `<thead><tr><th scope="col">Keyword</th><th scope="col">Volume*</th><th scope="col">Difficulty*</th><th scope="col">Intent</th><th scope="col">Cluster</th><th scope="col">Workflow</th><th scope="col">Primary</th></tr></thead>`;
  const body = `<tbody>${rows.map((row) => `<tr data-row-id="${escape(row.id)}">
    <td class="keyword-cell" dir="auto">${escape(row.keyword)}<small>${escape(row.sourceNotes || "No source note")}</small></td>
    <td class="num">${row.volume ?? "—"}</td><td class="num">${row.difficulty === null ? "—" : `${row.difficulty}`}</td>
    <td><select data-field="intent" aria-label="Intent for ${escape(row.keyword)}">${options(["Unassigned", "Informational", "Commercial", "Transactional", "Navigational"], row.intent)}</select></td>
    <td><input class="cluster-input" data-field="cluster" aria-label="Cluster for ${escape(row.keyword)}" value="${escape(row.cluster)}"></td>
    <td><select data-field="stage" aria-label="Workflow stage for ${escape(row.keyword)}">${options(["Backlog", "Brief ready", "Writing", "Published"], row.stage)}</select></td>
    <td class="center"><input type="checkbox" data-field="primary" aria-label="Mark ${escape(row.keyword)} as primary" ${row.primary ? "checked" : ""}></td>
  </tr>`).join("")}</tbody>`;
  $("#keyword-table").innerHTML = `<table>${head}${body}</table>`;
}

function renderClusters() {
  const groups = new Map();
  for (const row of state.rows) {
    const key = row.cluster || "Unassigned";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  const cards = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([name, rows]) => {
    const intents = [...new Set(rows.map((row) => row.intent))].join(" · ");
    return `<article class="cluster-card"><div class="cluster-top"><div><span class="cluster-eyebrow">${rows.length} keyword${rows.length === 1 ? "" : "s"}</span><h3>${escape(name)}</h3></div><span class="intent-summary">${escape(intents)}</span></div><ul>${rows.map((row) => `<li dir="auto">${row.primary ? "★ " : ""}${escape(row.keyword)}<span>${row.volume ?? "—"}</span></li>`).join("")}</ul></article>`;
  });
  $("#cluster-grid").innerHTML = cards.length ? cards.join("") : `<div class="empty">No keyword clusters yet.</div>`;
}

function renderBrief() {
  const clusterNames = [...new Set(state.rows.map((row) => row.cluster || "Unassigned"))].sort((a, b) => a.localeCompare(b));
  if (!clusterNames.length) {
    $("#brief-cluster").innerHTML = "";
    $("#brief-primary").innerHTML = "";
    $("#brief-preview").textContent = "Import or add keywords to build a content brief scaffold.";
    return;
  }
  if (!clusterNames.includes(state.briefCluster)) state.briefCluster = clusterNames[0];
  $("#brief-cluster").innerHTML = options(clusterNames, state.briefCluster);
  const members = state.rows.filter((row) => row.cluster === state.briefCluster);
  if (!members.some((row) => row.id === state.primaryId)) state.primaryId = members.find((row) => row.primary)?.id ?? members[0]?.id ?? "";
  $("#brief-primary").innerHTML = members.map((row) => `<option value="${escape(row.id)}" ${row.id === state.primaryId ? "selected" : ""}>${escape(row.keyword)}</option>`).join("");
  const selected = members.find((row) => row.id === state.primaryId);
  if (!selected) {
    $("#brief-preview").textContent = "Choose a primary keyword.";
    return;
  }
  try {
    $("#brief-preview").textContent = buildBrief(state.rows, selected.id);
  } catch (error) {
    $("#brief-preview").textContent = error.message;
  }
}

function render() {
  renderSummary();
  renderKeywords();
  renderClusters();
  renderBrief();
}

$("#import-file").addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const prepared = prepareKeywords(parseCsv(await file.text()));
    if (!prepared.length) throw new Error("No non-empty keyword rows found. Check for a keyword column.");
    state.rows = prepared;
    state.filename = `${file.name} · ${prepared.length} rows`;
    $("#status").textContent = "Loaded locally.";
    render();
    toast(`Imported ${prepared.length} rows in this browser only.`);
  } catch (error) {
    $("#status").textContent = "Import failed.";
    toast(error.message);
  } finally {
    event.target.value = "";
  }
});

$("#new-keyword-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const input = $("#new-keyword");
  const keyword = input.value.trim();
  if (!keyword) return;
  const id = `manual-${Date.now()}`;
  state.rows.push({ id, keyword, volume: null, difficulty: null, intent: $("#new-intent").value, cluster: "Unassigned", stage: "Backlog", sourceNotes: "Added manually", primary: false });
  state.filename = `${state.rows.length} rows · in-memory workspace`;
  input.value = "";
  render();
  toast("Keyword added. Add a cluster and source data when ready.");
});

$("#keyword-table").addEventListener("change", (event) => {
  const field = event.target.dataset.field;
  const rowId = event.target.closest("[data-row-id]")?.dataset.rowId;
  const row = state.rows.find((item) => item.id === rowId);
  if (!row || !field) return;
  if (field === "primary") {
    row.primary = event.target.checked;
    if (row.primary) for (const other of state.rows) if (other !== row && other.cluster === row.cluster) other.primary = false;
  } else row[field] = event.target.value.trim();
  state.briefCluster = row.cluster;
  state.primaryId = row.primary ? row.id : state.primaryId;
  render();
});

$("#keyword-search").addEventListener("input", renderKeywords);
$("#intent-filter").addEventListener("change", renderKeywords);
$("#stage-filter").addEventListener("change", renderKeywords);
$("#suggest-clusters").addEventListener("click", () => {
  const unassigned = state.rows.filter((row) => row.cluster === "Unassigned");
  if (!unassigned.length) { toast("Every row already has a cluster. No values were changed."); return; }
  const result = suggestClusters(unassigned, 0.35);
  for (const row of unassigned) row.cluster = result.assignment.get(row.id) ?? "Unassigned";
  state.filename = `${state.rows.length} rows · lexical suggestions applied`;
  render();
  toast(`Suggested ${result.clusters.length} lexical groups. Review and rename them; suggestions are not semantic research.`);
});

$("#brief-cluster").addEventListener("change", (event) => { state.briefCluster = event.target.value; state.primaryId = ""; renderBrief(); });
$("#brief-primary").addEventListener("change", (event) => { state.primaryId = event.target.value; renderBrief(); });
$("#export-csv").addEventListener("click", () => download("search-intent-plan.csv", stringifyCsv(state.rows), "text/csv;charset=utf-8"));
$("#export-brief").addEventListener("click", () => {
  const selected = state.rows.find((row) => row.id === state.primaryId);
  if (!selected) { toast("Choose a primary keyword first."); return; }
  download("content-brief.md", buildBrief(state.rows, selected.id), "text/markdown;charset=utf-8");
});

for (const button of document.querySelectorAll(".nav-button")) {
  button.addEventListener("click", () => {
    const view = button.dataset.view;
    document.querySelectorAll(".nav-button").forEach((item) => item.removeAttribute("aria-current"));
    button.setAttribute("aria-current", "page");
    document.querySelectorAll(".view").forEach((panel) => { panel.hidden = panel.dataset.view !== view; });
  });
}

try {
  const response = await fetch("./demo.csv");
  if (!response.ok) throw new Error("Example CSV could not be loaded.");
  state.rows = prepareKeywords(parseCsv(await response.text()));
  render();
  $("#status").textContent = "Synthetic example loaded.";
} catch {
  state.rows = [];
  state.filename = "No dataset loaded";
  render();
  $("#status").textContent = "Import a CSV to begin.";
}
