# Search Intent Studio

**A local-first keyword and editorial planning workbench for SEO teams.**

Search Intent Studio turns a user-supplied keyword CSV into an editable plan: normalize and flag repeated phrases, assign a working search intent, organize topics into clusters, track writing status, and export a Markdown brief scaffold. It is designed to sit beside a technical audit tool, not replace one.

> Demo search volumes and difficulty values are synthetic placeholders. They are not live data, researched estimates, or findings about any real business.

## What it does

- Imports a CSV of keyword rows in the browser.
- Flags repeated phrases after Unicode compatibility normalization, case folding, punctuation removal, and whitespace cleanup.
- Tracks user-supplied volume and difficulty values without recalculating or pretending to verify them.
- Lets the user assign a primary working intent, topic cluster, primary keyword, and editorial workflow stage.
- Offers an optional lexical grouping suggestion for unassigned rows using transparent Jaccard token overlap at a fixed 0.35 threshold.
- Builds a Markdown content-brief scaffold from a selected cluster and primary keyword.
- Exports the edited plan as CSV and a selected brief as Markdown.
- Uses no backend, external service, API key, analytics, fonts, or model calls. Imported and edited data stays in browser memory until the user exports it. It is not saved between reloads.

## Try it

Open the project through a static server so the browser can load its example CSV. From the repository root:

```sh
python -m http.server 8000
```

Then open `http://localhost:8000`. The static app has no build step and can be hosted with GitHub Pages.

## Add your own data

Import a CSV with a header row. Recognized columns are case-sensitive:

| Field | Meaning |
| --- | --- |
| `id` | Optional stable row identifier |
| `keyword` | Search phrase; required |
| `volume` | Optional user-supplied non-negative number |
| `difficulty` | Optional user-supplied number from 0 to 100 |
| `intent` | Optional: `Informational`, `Commercial`, `Transactional`, `Navigational`, or `Unassigned` |
| `cluster` | Optional topic name; blank values start as `Unassigned` |
| `stage` | Optional: `Backlog`, `Brief ready`, `Writing`, or `Published` |
| `sourceNotes` | Optional note about the source or context for supplied numbers |
| `primary` | Optional `true` to mark the row as the primary term in its cluster |

Example:

```csv
id,keyword,volume,difficulty,intent,cluster,stage,sourceNotes,primary
k1,"best phone in Egypt",1200,42,Commercial,phones,Backlog,"Example from my keyword export",true
```

Blank or invalid volume and difficulty values stay blank. Importing a CSV changes only the current in-memory workspace; use **Export plan CSV** to save your edited rows.

## Clustering and intent notes

- Intent is a human planning label, not a classification output. A query can have mixed intent, and SERPs can change; record the decision and source in your workflow.
- Duplicate matching ignores case, punctuation, symbols, and repeated spacing after Unicode NFKC normalization. It keeps Arabic character distinctions such as Alef/Hamza forms. A flagged match is a review cue, not an automatic merge.
- The optional grouping suggestion compares sets of whitespace-separated tokens with Jaccard similarity and groups against the first phrase in each suggested group. It is a fast, shallow lexical heuristic. It does not understand synonyms, morphology, entities, or meaning. Review and rename groups before using them.
- A brief is a scaffold with prompts, not generated research or finished copy. Check facts, search intent, audience, competing pages, and business fit before publishing.

## Run the tests

Requires Node.js 20 or later. No dependencies to install.

```sh
node --test test.mjs
```

Tests cover normalization, CSV quoting, input validation, duplicate detection, lexical grouping, brief generation, and CSV export round-tripping.

## Project files

```text
index.html    Responsive dashboard and styles
app.mjs       Browser UI, import/export, editing and brief preview
core.mjs      Parsing, validation, duplicate checks, clustering, brief scaffold
demo.csv      Synthetic sample rows
package.json  Test command and Node version
test.mjs      Node built-in test suite
```
