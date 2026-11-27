import test from "node:test";
import assert from "node:assert/strict";
import { auditKeywords, buildBrief, jaccardSimilarity, normalizeKeyword, parseCsv, prepareKeywords, stringifyCsv, suggestClusters } from "./core.mjs";

test("keyword normalization handles punctuation and spacing without changing Arabic letter forms", () => {
  assert.equal(normalizeKeyword("  iPhone-16  PRO! "), "iphone 16 pro");
  assert.equal(normalizeKeyword("أفضل شاشة"), "أفضل شاشة");
  assert.notEqual(normalizeKeyword("أفضل شاشة"), normalizeKeyword("افضل شاشة"));
  assert.equal(jaccardSimilarity("سعر موبايل سامسونج", "موبايل سامسونج بالتقسيط"), 0.5);
});

test("CSV parser accepts quoted commas, escaped quotes, and CRLF", () => {
  const rows = parseCsv('keyword,notes\r\n"cameras, lenses","say ""hello"""\r\n');
  assert.deepEqual(rows, [{ keyword: "cameras, lenses", notes: 'say "hello"' }]);
});

test("preparation validates enum and numeric fields and trims empty rows", () => {
  const rows = prepareKeywords([
    { keyword: "  Best phone ", volume: "1,200", difficulty: "44", intent: "Commercial", stage: "Writing", primary: "true" },
    { keyword: "   ", volume: "", difficulty: "101", intent: "made up" },
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].keyword, "Best phone");
  assert.equal(rows[0].volume, 1200);
  assert.equal(rows[0].difficulty, 44);
  assert.equal(rows[0].intent, "Commercial");
  assert.equal(rows[0].stage, "Writing");
  assert.equal(rows[0].primary, true);
});

test("audits duplicate normalized phrases and missing planning fields", () => {
  const rows = prepareKeywords([
    { id: "a", keyword: "phone case", intent: "Commercial", cluster: "accessories" },
    { id: "b", keyword: "PHONE-CASE", intent: "Unassigned" },
  ]);
  const audit = auditKeywords(rows);
  assert.equal(audit.count, 2);
  assert.equal(audit.duplicates.length, 1);
  assert.deepEqual(audit.duplicates[0].ids, ["a", "b"]);
  assert.equal(audit.missingIntent, 1);
  assert.equal(audit.missingCluster, 1);
});

test("lexical cluster suggestions group overlapping phrases but keep unrelated phrases apart", () => {
  const rows = prepareKeywords([
    { id: "1", keyword: "سعر موبايل سامسونج" },
    { id: "2", keyword: "موبايل سامسونج بالتقسيط" },
    { id: "3", keyword: "شراء سماعات بلوتوث" },
  ]);
  const result = suggestClusters(rows, 0.35);
  assert.equal(result.assignment.get("1"), result.assignment.get("2"));
  assert.notEqual(result.assignment.get("1"), result.assignment.get("3"));
  assert.throws(() => suggestClusters(rows, 0), /threshold/u);
});

test("brief generation labels itself as a scaffold and only includes the selected cluster", () => {
  const rows = prepareKeywords([
    { id: "1", keyword: "best phone Egypt", intent: "Commercial", cluster: "phones", volume: 1000 },
    { id: "2", keyword: "buy phone online", intent: "Transactional", cluster: "phones" },
    { id: "3", keyword: "best TV", intent: "Commercial", cluster: "televisions" },
  ]);
  const brief = buildBrief(rows, "1");
  assert.match(brief, /does not include live search results/u);
  assert.match(brief, /Intent\nCommercial/u);
  assert.match(brief, /buy phone online/u);
  assert.doesNotMatch(brief, /best TV/u);
  assert.throws(() => buildBrief(rows, "missing"), /Choose a primary/u);
});

test("CSV export round-trips quoted phrases", () => {
  const rows = prepareKeywords([{ id: "q1", keyword: 'phones, "best"', sourceNotes: "csv, import", intent: "Informational" }]);
  const parsed = prepareKeywords(parseCsv(stringifyCsv(rows)));
  assert.equal(parsed[0].keyword, 'phones, "best"');
  assert.equal(parsed[0].sourceNotes, "csv, import");
  assert.equal(parsed[0].intent, "Informational");
});


test("numeric import rejects non-finite, negative, and over-100 difficulty values", () => {
  const rows = prepareKeywords([
    { id: "a", keyword: "one", volume: "Infinity", difficulty: -1 },
    { id: "b", keyword: "two", volume: "-4", difficulty: 101 },
  ]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].volume, null);
  assert.equal(rows[0].difficulty, null);
  assert.equal(rows[1].volume, null);
  assert.equal(rows[1].difficulty, null);
});

test("cluster suggestions remain stable for equal-similarity candidates", () => {
  const rows = prepareKeywords([
    { id: "a", keyword: "red phone case" },
    { id: "b", keyword: "red phone cover" },
    { id: "c", keyword: "phone red cover" },
  ]);
  const first = suggestClusters(rows, 0.5);
  const again = suggestClusters(rows, 0.5);
  assert.deepEqual([...first.assignment], [...again.assignment]);
});

test("audit counts zero numeric inputs as present and blanks as missing", () => {
  const rows = prepareKeywords([
    { id: "zero", keyword: "zero values", volume: 0, difficulty: 0, intent: "Informational", cluster: "numbers" },
    { id: "blank", keyword: "blank values", volume: "", difficulty: "", intent: "Commercial", cluster: "numbers" },
  ]);
  const audit = auditKeywords(rows);
  assert.equal(audit.missingVolume, 1);
  assert.equal(audit.missingDifficulty, 1);
});
