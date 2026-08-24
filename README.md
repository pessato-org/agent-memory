# agent-memory - how agents remember

An interactive, full-screen 3D lab for **agent memory layers**. One persistent agent
system stays on screen while you switch its long-term memory between plain files,
SQLite, a vector store, and a knowledge graph. Then open any substrate up and watch
the machinery inside it actually run.

Built with Vite + Three.js. No backend; static output.

## Two levels

**01 System view - where memory sits in an agent.** The agent topology stays fixed while
you swap the substrate underneath it, so the comparison is like for like.

- **Memory substrate** changes only the highlighted long-term-memory chamber.
- **Write / Recall / Maintain** changes the active data route and the running Maya story.
- Every operation runs as a deterministic loop: one user message produces one moving
  packet; when that packet reaches memory, the file, row, point, or edge visibly
  changes; the finished state pauses before resetting.
- **Overview / Full detail** changes explanation depth without hiding the visual
  mechanics.

**02 Inside the store - what the substrate is actually doing.** Each substrate opens into
an ordered set of chapters, each one a cutaway of a single mechanism, scrubbable frame by
frame:

| substrate | chapters |
| --- | --- |
| Plain files | bytes on disk · the two-tier index · lexical scan · the write path · history for free |
| SQLite | typed rows · pages · B-tree seek vs full scan · the query planner · transactions and the WAL · supersession chains |
| Vector store | embedding · normalising onto the sphere · cosine similarity · HNSW traversal · why near is not true · re-embedding |
| Knowledge graph | triple extraction · entity resolution · two clocks · invalidation · multi-hop traversal · communities |

Every chapter carries one honest failure mode as well as the happy path: the grep that
never matches, the lost concurrent write, the `SCAN` on a hot path, the true neighbour
HNSW walks past, the two entities wrongly merged.

- **Field notes** keeps the broader taxonomy, production examples, decision table,
  and cited source library accessible without turning the main experience into a
  scrolling article.
- Any state is linkable: `#sqlite/inside/btree`, `#graph/retrieve`. Left and right
  arrows step through chapters; space pauses.

## Develop

```bash
npm install
npm run dev       # local dev server
npm run build     # validate content, then production build → dist/
npm run validate  # content contract check on its own
```

## How it stays current - the self-maintenance loop

This site maintains itself:

1. **Nightly** (`.github/workflows/maintain.yml`), a Claude Code action runs with the
   strict instructions in [`MAINTENANCE.md`](MAINTENANCE.md): research the last two
   weeks of agent-memory developments, re-verify the oldest sources, and apply
   value-level edits to `src/content/*.json` only.
2. Guardrails: the action's tools are path-scoped to `src/content/`, capped by turns,
   and its edits must pass `scripts/validate-content.mjs` (structure contract) and the
   build before a PR opens. It cannot modify code, workflows, or its own instructions.
3. Every change ships as a PR with per-edit citations. Merging deploys to GitHub Pages
   (`.github/workflows/deploy.yml`).

### One-time setup

1. Push to GitHub, add repo secret `ANTHROPIC_API_KEY`.
2. Settings → Pages → Source: **GitHub Actions**.
3. Branch protection on `main`: require a PR and the **build** check.
4. Optional, for full autonomy: enable auto-merge in repo settings and uncomment the
   `automerge` job in `maintain.yml` - nightly PRs then merge themselves when green.

## Content model

All prose and facts live in `src/content/`:

| file | contents |
| --- | --- |
| `site.json` | section prose, the Maya scenario, footer meta |
| `stores.json` | 4 stores × 3 phases × 3 depth levels + inspector payloads |
| `taxonomy.json` | working / episodic / semantic / procedural |
| `systems.json` | real systems and *why* they chose their store |
| `choosing.json` | the decision table |
| `internals.json` | the "inside the store" chapters: 4 stores x 5-6 mechanisms |
| `sources.json` | every citation, with `lastVerified` dates |
