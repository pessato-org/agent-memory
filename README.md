# agent-memory - how agents remember

An interactive, full-screen 3D lab for **agent memory layers**. One persistent agent
system stays on screen while you switch its long-term memory between plain files,
SQLite, a vector store, and a knowledge graph. Trace write, recall, and maintenance
data flows while the interface keeps both the visual mechanics and implementation
detail close at hand.

Built with Vite + Three.js. No backend; static output.

## Interaction model

- **Memory substrate** changes only the highlighted long-term-memory chamber; the
  surrounding agent architecture stays fixed for direct comparison.
- **Write / Recall / Maintain** changes the active data route and running Maya story.
- Every operation runs as a deterministic loop: one user message produces one moving
  packet; when that packet reaches memory, the file, row, point, or edge visibly
  changes; the finished state pauses before resetting.
- A single **Overview / Full detail** control changes explanation depth without hiding
  the visual mechanics. Full detail shows store internals and literal
  file/SQL/vector/Cypher operations.
- **Field notes** keeps the broader taxonomy, production examples, decision table,
  and cited source library accessible without turning the main experience into a
  scrolling article.

## Develop

```bash
npm install
npm run dev      # local dev server
npm run build    # production build → dist/
node scripts/validate-content.mjs   # content contract check
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
| `sources.json` | every citation, with `lastVerified` dates |
