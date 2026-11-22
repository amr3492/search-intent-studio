export const INTENTS = ["Informational", "Commercial", "Transactional", "Navigational", "Unassigned"];
export const STAGES = ["Backlog", "Brief ready", "Writing", "Published"];

export function normalizeKeyword(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase("und")
    .replace(/[\p{P}\p{S}]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

export function keywordTokens(value) {
  const normalized = normalizeKeyword(value);
  return normalized ? normalized.split(" ").filter(Boolean) : [];
}

export function jaccardSimilarity(left, right) {
  const a = new Set(keywordTokens(left));
  const b = new Set(keywordTokens(right));
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection += 1;
  return intersection / (a.size + b.size - intersection);
}

export function parseCsv(text) {
  const source = String(text ?? "").replace(/^\uFEFF/u, "");
  const matrix = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    const next = source[i + 1];
    if (ch === '"') {
      if (quoted && next === '"') { cell += '"'; i += 1; }
      else quoted = !quoted;
    } else if (ch === "," && !quoted) {
      row.push(cell); cell = "";
    } else if ((ch === "\n" || ch === "\r") && !quoted) {
      if (ch === "\r" && next === "\n") i += 1;
      row.push(cell);
      if (row.some((value) => value.trim())) matrix.push(row);
      row = []; cell = "";
    } else cell += ch;
  }
  if (quoted) throw new Error("CSV has an unclosed quoted cell.");
  row.push(cell);
  if (row.some((value) => value.trim())) matrix.push(row);
  if (matrix.length < 2) return [];
  const headers = matrix[0].map((header, index) => header.trim() || `column_${index + 1}`);
  return matrix.slice(1).map((values) => Object.fromEntries(headers.map((header, index) => [header, (values[index] ?? "").trim()])));
}

function optionalNumber(value, min = 0, max = Number.POSITIVE_INFINITY) {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const number = Number(raw.replace(/,/gu, ""));
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
}

export function prepareKeywords(rawRows) {
  if (!Array.isArray(rawRows)) throw new Error("Expected an array of keyword records.");
  return rawRows.map((row, index) => {
    const keyword = String(row?.keyword ?? "").trim();
    const requestedIntent = String(row?.intent ?? "Unassigned").trim().toLowerCase();
    const intent = INTENTS.find((item) => item.toLowerCase() === requestedIntent) ?? "Unassigned";
    const requestedStage = String(row?.stage ?? "Backlog").trim().toLowerCase();
    const stage = STAGES.find((item) => item.toLowerCase() === requestedStage) ?? "Backlog";
    return {
      id: String(row?.id ?? `kw-${index + 1}`).trim() || `kw-${index + 1}`,
      keyword,
      volume: optionalNumber(row?.volume),
      difficulty: optionalNumber(row?.difficulty, 0, 100),
      intent,
      cluster: String(row?.cluster ?? "").trim() || "Unassigned",
      stage,
      sourceNotes: String(row?.sourceNotes ?? "").trim(),
      primary: row?.primary === true || String(row?.primary ?? "").toLowerCase() === "true",
    };
  }).filter((row) => row.keyword);
}

export function auditKeywords(rows) {
  const duplicateMap = new Map();
  let missingIntent = 0;
  let missingCluster = 0;
  let missingVolume = 0;
  let missingDifficulty = 0;
  for (const row of rows) {
    const key = normalizeKeyword(row.keyword);
    if (!duplicateMap.has(key)) duplicateMap.set(key, []);
    duplicateMap.get(key).push(row.id);
    if (row.intent === "Unassigned") missingIntent += 1;
    if (row.cluster === "Unassigned") missingCluster += 1;
    if (row.volume === null) missingVolume += 1;
    if (row.difficulty === null) missingDifficulty += 1;
  }
  const duplicates = [...duplicateMap.entries()].filter(([, ids]) => ids.length > 1).map(([keyword, ids]) => ({ keyword, ids }));
  return { count: rows.length, duplicates, missingIntent, missingCluster, missingVolume, missingDifficulty };
}

export function suggestClusters(rows, threshold = 0.35) {
  if (!(threshold > 0 && threshold <= 1)) throw new Error("Similarity threshold must be greater than 0 and at most 1.");
  const clusters = [];
  for (const row of rows) {
    const normalized = normalizeKeyword(row.keyword);
    if (!normalized) continue;
    let best = null;
    let bestScore = 0;
    for (const cluster of clusters) {
      const similarity = jaccardSimilarity(row.keyword, cluster.representative);
      if (similarity >= threshold && similarity > bestScore) { best = cluster; bestScore = similarity; }
    }
    if (best) best.rows.push(row.id);
    else clusters.push({ id: `Suggested ${clusters.length + 1}`, representative: row.keyword, rows: [row.id] });
  }
  const assignment = new Map();
  for (const cluster of clusters) for (const id of cluster.rows) assignment.set(id, cluster.id);
  return { clusters, assignment, threshold };
}

export function buildBrief(rows, primaryId) {
  const clusterRows = rows.filter((row) => row.cluster === rows.find((item) => item.id === primaryId)?.cluster);
  const primary = clusterRows.find((row) => row.id === primaryId);
  if (!primary) throw new Error("Choose a primary keyword from a cluster first.");
  const related = clusterRows.filter((row) => row.id !== primary.id).map((row) => row.keyword);
  const intent = primary.intent === "Unassigned" ? "Not assigned yet" : primary.intent;
  return `# Content brief: ${primary.keyword}\n\n> Planning scaffold generated from your current keyword rows. It does not include live search results, search-engine guidance, or automatically written content. Verify the intent and facts before drafting.\n\n## Primary keyword\n${primary.keyword}\n\n## Intent\n${intent}\n\n## Related keywords\n${related.length ? related.map((item) => `- ${item}`).join("\n") : "- Add related keywords to this cluster."}\n\n## Audience and goal\n- Audience: [Describe who this page is for.]\n- Searcher need: [State the question or decision the page should help with.]\n- Page goal: [Choose a useful next step for the reader.]\n\n## Suggested outline to review\n- H1: [Answer the main need behind “${primary.keyword}”.]\n- H2: [Key explanation or comparison]\n- H2: [Practical steps, options, or details]\n- H2: [Common questions and caveats]\n- CTA: [A clear next step that fits the page and your business.]\n\n## Inputs\n- User-supplied volume: ${primary.volume ?? "not provided"}\n- User-supplied difficulty: ${primary.difficulty ?? "not provided"}\n- Source / notes: ${primary.sourceNotes || "not provided"}\n- Workflow stage: ${primary.stage}\n`;
}

export function stringifyCsv(rows) {
  const columns = ["id", "keyword", "volume", "difficulty", "intent", "cluster", "stage", "sourceNotes", "primary"];
  const quote = (value) => {
    const text = value === null || value === undefined ? "" : String(value);
    return /[",\r\n]/u.test(text) ? `"${text.replace(/"/gu, '""')}"` : text;
  };
  return [columns.join(","), ...rows.map((row) => columns.map((key) => quote(row[key])).join(","))].join("\r\n") + "\r\n";
      }
