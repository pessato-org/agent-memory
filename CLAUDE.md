# agent-memory

Educational site: the reference on agent memory layers. Vite + Three.js, static output,
deployed to GitHub Pages. Self-maintained nightly by a Claude GitHub Action.

## Architecture — the one rule that matters

**Content and code are strictly separated.**

- `src/content/*.json` — ALL prose, facts, examples, citations. This is the only layer
  the nightly maintenance bot may touch. Field names are a contract with the UI; never
  rename or restructure, only change values. `node scripts/validate-content.mjs`
  enforces the contract and runs in CI.
- `src/three/` — WebGL scenes. `lib.js` (shared helpers, palette, Timeline tween),
  `hero.js`, `explorer.js` (four store views: Files, SQLite, Vector, Graph — each is a
  class with `phase(name) → Timeline` and `update(dt, t)`).
- `src/ui/` — DOM rendering of content JSON (`sections.js`) and explorer controls
  (`explorer-ui.js`).
- `MAINTENANCE.md` — the nightly bot's instructions. Treat as production config; edits
  change what the bot is allowed to do.

## Conventions

- Palette/typography tokens live in `src/styles.css` (`:root`) and are mirrored in
  `src/three/lib.js` (`COL`). Change both together.
- Inspector code blocks in `stores.json` use `«hl»…«/hl»` markup (hl/q/m/dim/del),
  converted to spans in `explorer-ui.js` — not raw HTML.
- The Maya scenario (memories m1–m5), four stores, three phases, three depth levels
  are the site's pedagogical spine — stable by design.
- Commands: `npm run dev` / `npm run build` / `node scripts/validate-content.mjs`.
