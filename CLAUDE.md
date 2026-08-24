# agent-memory

Educational site: the reference on agent memory layers. Vite + Three.js, static output,
deployed to GitHub Pages. Self-maintained nightly by a Claude GitHub Action.

## Architecture - the one rule that matters

**Content and code are strictly separated.**

- `src/content/*.json` - ALL prose, facts, examples, citations. This is the only layer
  the nightly maintenance bot may touch. Field names are a contract with the UI; never
  rename or restructure, only change values. `npm run validate` enforces the contract
  and runs as part of `npm run build` and in CI.
- **The lab has two levels.** `setMode('system' | 'internals')` on the scene API swaps
  between them, and both render into the same canvas and camera.
  - **System view** (`src/three/system-lab.js`) - where memory sits in an agent: one
    persistent agent topology, one highlighted memory chamber, four substrate views,
    three operations, and an impact-timed simulation loop. A single packet travels the
    active route; each store's `update(t, progress)` mutates its visual state exactly
    when the packet reaches memory. The embedded substrate views come from
    `explorer.js` (`MEMORY_VIEWS`).
  - **Internals view** (`src/three/internals.js`) - what the substrate is actually
    doing: 4 stores x 5-6 chapters, each a self-contained cutaway of one mechanism.
- `src/three/internals.js` - chapter scenes. A chapter is built once and then rendered
  as a **pure function of progress**: `render(p, t)` must derive every visual from `p`
  (0..1) and never accumulate state across frames. That is what makes the scrubber
  exact and seeking cheap. Chapter ids are a contract with `src/content/internals.json`
  and the validator reads the `CHAPTERS` arrays straight out of this file, so the two
  cannot drift.
- `src/three/lib.js` - shared Three.js helpers for both levels. Two rules worth knowing:
  never tint `material.color` on a label sprite that was drawn with a `bg` (it
  multiplies the whole texture, including the background - use `DynamicLabel` and
  re-render instead), and text primitives shrink to fit rather than clipping.
- `src/ui/lab-ui.js` - fixed-screen controls, progressive explanations, live story
  strip, chapter rail, hash deep links (`#store/phase`, `#store/inside/chapter`), and
  the field-notes dialog rendered from content. It also measures the chrome floating
  over the canvas and pushes that safe area into the scene, which is what the camera
  fits scenes to. Adding or moving a floating control means adding it to `overlays`.
- `src/three/hero.js`, `src/ui/sections.js`, and `src/ui/explorer-ui.js` are the
  preserved v0 scrolling implementation and are not imported by the current
  application. `src/three/explorer.js` still is: the lab imports `MEMORY_VIEWS` from it.
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
- Scene layout lives in world units on a shared grid: internals chapters are designed
  inside `STAGE` (10.8 x 9.0, origin centred) exported from `internals.js`; the system
  diagram inside `SYSTEM_STAGE` in `system-lab.js`. Keep content inside those bounds -
  the camera fits the box, so anything outside it is simply cut off.
- Commands: `npm run dev` / `npm run build` / `npm run validate`.
