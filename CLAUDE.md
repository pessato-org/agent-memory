# agent-memory

Educational site: the reference on agent memory layers. Vite + Three.js, static output,
deployed to GitHub Pages. Self-maintained nightly by a Claude GitHub Action.

## Architecture - the one rule that matters

**Content and code are strictly separated.**

- `src/content/*.json` - ALL prose, facts, examples, citations. This is the only layer
  the nightly maintenance bot may touch. Field names are a contract with the UI; never
  rename or restructure, only change values. `node scripts/validate-content.mjs`
  enforces the contract and runs in CI.
- `src/three/system-lab.js` - the active WebGL experience: one persistent agent
  topology, one highlighted memory chamber, four substrate views, three operations,
  and an impact-timed simulation loop. A single packet travels through the active
  route; each store's `update(t, progress)` mutates its visual state exactly when the
  packet reaches memory. `lib.js` contains shared Three.js helpers.
- `src/ui/lab-ui.js` - fixed-screen controls, progressive explanations, live story
  strip, the Overview / Full detail mode, and the field-notes dialog rendered from
  content.
- `src/three/hero.js`, `src/three/explorer.js`, `src/ui/sections.js`, and
  `src/ui/explorer-ui.js` are the preserved v0 scrolling implementation and are not
  imported by the current application.
- `MAINTENANCE.md` - the nightly bot's instructions. Treat as production config; edits
  change what the bot is allowed to do.

## Conventions

- Palette/typography tokens live in `src/styles.css` (`:root`) and are mirrored in
  `src/three/lib.js` (`COL`). Change both together.
- Inspector code blocks in `stores.json` use `«hl»…«/hl»` markup (hl/q/m/dim/del),
  retained as structured reference content even though the main lab no longer renders a
  second post-state inspector.
- The Maya scenario (memories m1–m5), four stores, three phases, three depth levels
  are the site's pedagogical spine - stable by design.
- Never use Unicode U+2014 (em dash) anywhere in source, UI copy, content,
  documentation, comments, or generated text. Use a period, comma, colon,
  parentheses, or a plain hyphen instead. Content validation enforces this rule.
- Commands: `npm run dev` / `npm run build` / `node scripts/validate-content.mjs`.
