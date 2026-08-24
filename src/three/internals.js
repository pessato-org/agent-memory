import * as THREE from 'three'
import {
  COL,
  DynamicLabel,
  disposeGroup,
  ease,
  makeArrow,
  makeBar,
  makeCard,
  makeChip,
  makeDashedLine,
  makeLabel,
  makeLine,
  makeTextBlock,
  FONTS,
  paintCard,
  ramp,
  setLinePoints,
  window01,
} from './lib.js'

/* ============================================================
   Internals: the second level of the lab.

   The system view answers "where does memory sit in an agent".
   These views answer "what is the substrate actually doing".

   Each store exposes an ordered list of chapters. A chapter is a
   self-contained scene built once, then driven purely as a
   function of progress p (0..1) plus elapsed time t for idle
   motion. Nothing here mutates state across frames, which is what
   makes the scrubber exact: seeking to p renders p, always.
   ============================================================ */

/* Design extent of every chapter, in world units. The camera fits this box,
   so all four stores share one grid and one sense of scale. */
export const STAGE = { w: 10.8, h: 9.0, cx: 0, cy: 0, elevation: 0 }
const HALF_W = STAGE.w / 2
const HALF_H = STAGE.h / 2

export const INK = {
  text: '#202630',
  dim: '#535d6b',
  mute: '#858b92',
  faint: '#a8adb5',
  amber: '#d66f28',
  cyan: '#177a9b',
  violet: '#7254a3',
  red: '#c44955',
  green: '#4c8b5f',
  paper: '#fffdf8',
  paperAlt: '#f7f4ed',
}

const HEX = {
  amber: 0xd66f28,
  cyan: 0x177a9b,
  violet: 0x7254a3,
  red: 0xc44955,
  green: 0x4c8b5f,
  grey: 0x8a929f,
  line: 0xd8d2c6,
  paper: 0xfffdf8,
  paperAlt: 0xf7f4ed,
  wash: 0xefe9dd,
}

/* ---------- small shared builders ---------- */

/* Section heading inside the scene: a rule, a kicker, a value. */
function sceneLabel(text, x, y, { color = INK.mute, size = 0.26, bg = null } = {}) {
  const label = makeLabel(text, { color, size, bg })
  label.position.set(x, y, 0.4)
  return label
}

/* A titled surface: card plus a mono caption sitting on its top-left corner. */
function titledCard(width, height, title, { fill = HEX.paper, border = HEX.line, titleColor = INK.mute } = {}) {
  const group = new THREE.Group()
  const card = makeCard(width, height, { fill, border, borderOpacity: 0.8 })
  group.add(card)
  const label = makeLabel(title, { color: titleColor, size: 0.24, bg: INK.paper })
  label.position.set(-width / 2 + label.scale.x / 2 + 0.16, height / 2 + 0.02, 0.3)
  group.add(label)
  group.userData = { card, label, width, height }
  return group
}

/* A strip of individual bytes with their characters, so "it is just bytes"
   is something you can actually read rather than something you are told. */
function byteStrip(text, { cell = 0.34, rows = 1, ppu = 110 } = {}) {
  const chars = [...text]
  const perRow = Math.ceil(chars.length / rows)
  const width = perRow * cell
  const height = rows * cell
  const W = Math.round(width * ppu)
  const H = Math.round(height * ppu)
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const canvas = document.createElement('canvas')
  canvas.width = W * dpr
  canvas.height = H * dpr
  const ctx = canvas.getContext('2d')
  ctx.scale(dpr, dpr)
  const cellPx = cell * ppu
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  chars.forEach((char, i) => {
    const col = i % perRow
    const row = Math.floor(i / perRow)
    const x = col * cellPx
    const y = row * cellPx
    const newline = char === '\n'
    ctx.fillStyle = newline ? 'rgba(214,111,40,0.16)' : '#fffdf8'
    ctx.fillRect(x, y, cellPx, cellPx)
    ctx.strokeStyle = 'rgba(168,173,181,0.42)'
    ctx.lineWidth = 1
    ctx.strokeRect(x + 0.5, y + 0.5, cellPx - 1, cellPx - 1)
    ctx.font = `500 ${Math.round(cellPx * 0.46)}px "IBM Plex Mono", monospace`
    ctx.fillStyle = newline ? INK.amber : INK.dim
    ctx.fillText(newline ? '\\n' : char === ' ' ? '·' : char, x + cellPx / 2, y + cellPx / 2 + 1)
  })
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false })
  )
  mesh.userData = { width, height, cell, perRow, count: chars.length }
  return mesh
}

/* A left-anchored wipe that hides a mesh and retracts as progress grows. */
function revealMask(width, height, { color = HEX.wash, axis = 'y' } = {}) {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1, depthWrite: false })
  )
  mesh.position.z = 0.06
  mesh.userData = {
    width,
    height,
    set(value) {
      const hidden = 1 - Math.max(0, Math.min(1, value))
      if (axis === 'y') {
        // Retract downward, so a document reveals from its first line.
        mesh.scale.y = Math.max(0.0001, hidden)
        mesh.position.y = -height / 2 + (hidden * height) / 2
      } else {
        mesh.scale.x = Math.max(0.0001, hidden)
        mesh.position.x = width / 2 - (hidden * width) / 2
      }
      mesh.visible = hidden > 0.002
    },
  }
  return mesh
}

/* Pulsing focus ring used to say "look here". */
function focusRing(radius, color = HEX.amber) {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(radius * 0.92, radius, 48),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide })
  )
  ring.position.z = 0.25
  return ring
}

/* ---------- base class ---------- */

class InternalView {
  constructor(parent) {
    this.root = new THREE.Group()
    parent.add(this.root)
    this.cache = new Map()
    this.active = null
    this.activeId = null
  }

  setChapter(id) {
    if (!this.cache.has(id)) {
      const group = new THREE.Group()
      this.root.add(group)
      const builder = this[`chapter_${id}`]
      if (!builder) throw new Error(`internals: ${this.constructor.name} has no chapter "${id}"`)
      const render = builder.call(this, group)
      this.cache.set(id, { group, render })
    }
    for (const [key, chapter] of this.cache) chapter.group.visible = key === id
    this.activeId = id
    this.active = this.cache.get(id)
  }

  render(p, t) {
    if (this.active) this.active.render(p, t)
  }

  dispose() {
    if (this.root.parent) this.root.parent.remove(this.root)
    disposeGroup(this.root)
    this.cache.clear()
  }
}

/* ============================================================
   FILES - bytes, tiers, lexical scan, write path, history
   ============================================================ */

const MAYA_MD = [
  { text: '# Maya', color: INK.text, weight: 600 },
  { text: '' },
  { text: '## Preferences', color: INK.mute },
  { text: '- Allergic to peanuts (severe).', color: INK.dim },
  { text: '- Dinner around 19:00.', color: INK.dim },
  { text: '' },
  { text: '## People', color: INK.mute },
  { text: "- Sam - Maya's partner.", color: INK.dim },
  { text: '' },
  { text: '## History', color: INK.mute },
  { text: '- 08-04: Booked Luna (Italian).', color: INK.dim },
]

class FilesInternals extends InternalView {
  /* ---- 1. bytes on disk ---- */
  chapter_bytes(group) {
    const file = titledCard(6.2, 4.4, 'memory/maya.md', { fill: HEX.paper })
    file.position.set(-1.75, 1.9, 0)
    group.add(file)

    const block = makeTextBlock(MAYA_MD, { width: 5.8, lineHeight: 0.35, fontSize: 24, bg: null })
    block.position.set(0, 0.05, 0.05)
    file.add(block)

    const mask = revealMask(6.0, 4.2, { color: HEX.paper })
    file.add(mask)

    const window = titledCard(3.7, 4.4, 'WORKING CONTEXT', { fill: HEX.paperAlt })
    window.position.set(3.45, 1.9, 0)
    group.add(window)
    window.add(sceneLabel('read() then decode', 0, 1.5, { size: 0.28, color: INK.mute }))

    const bytesRead = new DynamicLabel({ color: INK.amber, size: 0.38, maxChars: 20 })
    bytesRead.position.set(0, 0.62, 0.2)
    window.add(bytesRead.sprite)
    const tokens = new DynamicLabel({ color: INK.dim, size: 0.32, maxChars: 20 })
    tokens.position.set(0, 0.08, 0.2)
    window.add(tokens.sprite)

    const budget = makeBar(3.0, 0.36, { fill: HEX.amber })
    budget.position.set(0, -0.72, 0.15)
    window.add(budget)
    const cost = new DynamicLabel({ color: INK.mute, size: 0.26, maxChars: 26 })
    cost.position.set(0, -1.28, 0.2)
    window.add(cost.sprite)

    group.add(sceneLabel('WHAT IS ACTUALLY ON DISK  ·  UTF-8 BYTES', 0, -0.75, { size: 0.28, color: INK.mute }))
    const strip = byteStrip('# Maya\n\n## Preferences\n- Allergic to peanuts', { cell: 0.4, rows: 2 })
    strip.position.set(0, -1.72, 0)
    group.add(strip)

    const stripW = strip.userData.width
    const head = new THREE.Mesh(
      new THREE.PlaneGeometry(0.07, strip.userData.height + 0.18),
      new THREE.MeshBasicMaterial({ color: HEX.amber, transparent: true, opacity: 0.9, depthWrite: false })
    )
    head.position.z = 0.12
    strip.add(head)
    const consumed = new THREE.Mesh(
      new THREE.PlaneGeometry(1, strip.userData.height),
      new THREE.MeshBasicMaterial({ color: HEX.amber, transparent: true, opacity: 0.13, depthWrite: false })
    )
    consumed.position.z = 0.06
    strip.add(consumed)

    const newlineNote = makeChip('\\n is a byte too  ·  lines are a reading convention', {
      color: INK.mute, fill: 'rgba(255,253,248,0.94)', border: INK.faint, size: 0.3,
    })
    newlineNote.position.set(0, -2.72, 0.4)
    group.add(newlineNote)

    const verdict = makeChip('no index  ·  no schema  ·  no query engine', {
      color: INK.amber, fill: 'rgba(214,111,40,0.10)', border: INK.amber, size: 0.34,
    })
    verdict.position.set(0, -3.72, 0.4)
    group.add(verdict)

    const TOTAL_BYTES = 412
    const TOTAL_TOKENS = 118

    return (p) => {
      const read = ramp(p, 0.08, 0.68, ease.linear)
      mask.userData.set(read)
      consumed.scale.x = Math.max(0.0001, read * stripW)
      consumed.position.x = -stripW / 2 + (read * stripW) / 2
      head.position.x = -stripW / 2 + read * stripW
      head.material.opacity = read > 0 && read < 1 ? 0.9 : 0
      budget.userData.set(read * 0.62)
      bytesRead.setText(`${Math.round(read * TOTAL_BYTES)} / ${TOTAL_BYTES} bytes`)
      tokens.setText(`${Math.round(read * TOTAL_TOKENS)} tokens spent`)
      const settled = ramp(p, 0.7, 0.86)
      cost.setText(settled > 0.4 ? 'cost is linear in size' : '')
      cost.opacity = settled
      newlineNote.material.opacity = ramp(p, 0.3, 0.44)
      verdict.material.opacity = ramp(p, 0.8, 0.96)
    }
  }

  /* ---- 2. the two-tier index ---- */
  chapter_tiers(group) {
    const index = titledCard(5.0, 2.9, 'MEMORY.md  ·  loaded every single run', {
      fill: HEX.paper, border: HEX.amber, titleColor: INK.amber,
    })
    index.position.set(-2.8, 2.55, 0)
    group.add(index)
    const indexBlock = makeTextBlock([
      { text: '- maya.md      prefs, allergy', color: INK.dim },
      { text: '- projects.md  active work', color: INK.dim },
      { text: '- tooling.md   shell habits', color: INK.dim },
      { text: '- people.md    team, contacts', color: INK.dim },
      { text: '- decisions.md why, not what', color: INK.dim },
    ], { width: 4.7, lineHeight: 0.36, fontSize: 22, bg: null })
    indexBlock.position.set(0, -0.02, 0.05)
    index.add(indexBlock)

    const pick = new THREE.Mesh(
      new THREE.PlaneGeometry(4.6, 0.34),
      new THREE.MeshBasicMaterial({ color: HEX.cyan, transparent: true, opacity: 0, depthWrite: false })
    )
    pick.position.set(0, indexBlock.userData.lineY(0), 0.08)
    index.add(pick)

    const budgetCard = titledCard(4.1, 2.9, 'CONTEXT BUDGET', { fill: HEX.paperAlt })
    budgetCard.position.set(3.1, 2.55, 0)
    group.add(budgetCard)
    const bars = [
      { label: 'always paid  ·  0.6k', color: HEX.amber, y: 0.76 },
      { label: 'on demand  ·  12k', color: HEX.cyan, y: -0.06 },
      { label: 'load everything  ·  51k', color: HEX.red, y: -0.88 },
    ].map((entry) => {
      const bar = makeBar(3.5, 0.3, { fill: entry.color })
      bar.position.set(0, entry.y, 0.12)
      budgetCard.add(bar)
      const label = sceneLabel(entry.label, 0, entry.y + 0.38, { size: 0.26, color: `#${entry.color.toString(16)}` })
      budgetCard.add(label)
      return { ...entry, bar, label }
    })

    const query = makeChip('“what should I book for Maya?”', {
      color: INK.cyan, fill: INK.paper, border: INK.cyan, size: 0.32,
    })
    query.position.set(0, 0.72, 0.5)
    group.add(query)

    group.add(sceneLabel('DETAIL FILES  ·  only opened when a line looks relevant', 0.55, -0.28, { size: 0.28 }))
    const detailNames = ['maya.md', 'projects.md', 'tooling.md', 'people.md', 'decisions.md']
    const detailSizes = ['12k', '9k', '6k', '14k', '10k']
    const detailCards = detailNames.map((name, i) => {
      const card = makeCard(1.92, 1.05, { fill: HEX.paperAlt, border: HEX.line, borderOpacity: 0.6 })
      card.position.set(-4.05 + i * 2.03, -1.25, 0)
      const label = makeLabel(name, { color: INK.mute, size: 0.28 })
      label.position.set(0, 0.17, 0.2)
      const size = makeLabel(`${detailSizes[i]} tok`, { color: INK.faint, size: 0.24 })
      size.position.set(0, -0.2, 0.2)
      card.add(label, size)
      group.add(card)
      return { card, label, size }
    })

    const flight = makeCard(1.92, 1.05, { fill: '#e2f0f5', border: HEX.cyan })
    flight.visible = false
    const flightLabel = makeLabel('maya.md', { color: INK.cyan, size: 0.28 })
    flightLabel.position.set(0, 0, 0.2)
    flight.add(flightLabel)
    group.add(flight)

    const arithmetic = makeChip('40 memories x 15 tokens = 600 tokens, every call, forever', {
      color: INK.dim, fill: 'rgba(255,253,248,0.94)', border: INK.faint, size: 0.3,
    })
    arithmetic.position.set(0, -2.5, 0.5)
    group.add(arithmetic)

    const verdict = makeChip('split what you always pay for from what you pay for on demand', {
      color: INK.amber, fill: 'rgba(214,111,40,0.10)', border: INK.amber, size: 0.34,
    })
    verdict.position.set(0, -3.5, 0.5)
    group.add(verdict)

    return (p, t) => {
      const indexIn = ramp(p, 0.02, 0.16)
      index.scale.setScalar(0.95 + indexIn * 0.05)
      bars[0].bar.userData.set(indexIn * 0.12)
      arithmetic.material.opacity = ramp(p, 0.12, 0.24)

      const asked = ramp(p, 0.28, 0.38)
      query.material.opacity = asked
      query.position.y = 0.72 + (1 - asked) * 0.3
      pick.material.opacity = asked * 0.2

      const fly = ramp(p, 0.42, 0.64, ease.inOut)
      flight.visible = fly > 0.015 && fly < 0.99
      flight.position.set(-4.05 + fly * 7.15, -1.25 + fly * 3.4 + Math.sin(fly * Math.PI) * 0.55, 0.4)
      flight.scale.setScalar(1 - fly * 0.2)
      detailCards[0].card.userData.plane.material.color.set(fly > 0.03 ? HEX.wash : HEX.paperAlt)

      bars[1].bar.userData.set(ramp(p, 0.54, 0.7) * 0.4)
      bars[2].bar.userData.set(ramp(p, 0.74, 0.88))
      verdict.material.opacity = ramp(p, 0.86, 0.98)

      detailCards.forEach((entry, i) => {
        entry.card.position.y = -1.25 + Math.sin(t * 0.7 + i * 0.9) * 0.016
      })
    }
  }

  /* ---- 3. lexical scan ---- */
  chapter_grep(group) {
    const pattern = makeChip('grep -ri "allerg" memory/', {
      color: INK.cyan, fill: INK.paper, border: INK.cyan, size: 0.36,
    })
    pattern.position.set(-2.5, 3.85, 0.5)
    group.add(pattern)

    const tally = new DynamicLabel({ color: INK.cyan, size: 0.34, maxChars: 20 })
    tally.position.set(3.1, 3.85, 0.5)
    group.add(tally.sprite)

    const CORPUS = [
      { file: 'maya.md:4', text: '- Allergic to peanuts (severe).', hit: true },
      { file: 'maya.md:5', text: '- Dinner around 19:00.', hit: false },
      { file: 'maya.md:8', text: "- Sam - Maya's partner.", hit: false },
      { file: 'notes.md:2', text: '- Ask about allergies first.', hit: true },
      { file: 'notes.md:9', text: '- She cannot eat anything with nuts.', hit: false, miss: true },
      { file: 'team.md:3', text: '- Priya is allergic to shellfish.', hit: true },
      { file: 'team.md:7', text: '- Standup moved to 09:30.', hit: false },
    ]

    const surface = titledCard(10.0, 4.5, 'memory/  ·  7 lines across 3 files', { fill: HEX.paper })
    surface.position.set(0, 1.1, 0)
    group.add(surface)

    const rowH = 0.56
    const firstY = 1.62
    const rows = CORPUS.map((entry, i) => {
      const y = firstY - i * rowH
      const highlight = new THREE.Mesh(
        new THREE.PlaneGeometry(9.6, rowH - 0.08),
        new THREE.MeshBasicMaterial({ color: HEX.cyan, transparent: true, opacity: 0, depthWrite: false })
      )
      highlight.position.set(0, y, 0.04)
      surface.add(highlight)
      const path = makeLabel(entry.file, { color: INK.faint, size: 0.28 })
      path.position.set(-4.1 + path.scale.x / 2, y, 0.14)
      const text = makeLabel(entry.text, { color: INK.dim, size: 0.3 })
      text.position.set(-2.45 + text.scale.x / 2, y, 0.14)
      surface.add(path, text)
      const verdict = new DynamicLabel({ color: INK.mute, size: 0.26, maxChars: 10 })
      verdict.position.set(4.15, y, 0.14)
      surface.add(verdict.sprite)
      return { ...entry, y, highlight, path, text, verdict }
    })

    const cursor = new THREE.Mesh(
      new THREE.PlaneGeometry(9.9, 0.07),
      new THREE.MeshBasicMaterial({ color: HEX.cyan, transparent: true, opacity: 0, depthWrite: false })
    )
    cursor.position.z = 0.22
    surface.add(cursor)

    const missRing = makeCard(9.6, rowH - 0.05, { fill: HEX.red, fillOpacity: 0, border: HEX.red, borderOpacity: 0 })
    missRing.position.set(0, rows[4].y, 0.18)
    surface.add(missRing)

    const orderNote = makeChip('file order, not relevance order', {
      color: INK.mute, fill: 'rgba(255,253,248,0.94)', border: INK.faint, size: 0.3,
    })
    orderNote.position.set(-2.9, -1.75, 0.5)
    group.add(orderNote)

    const missNote = makeChip('same fact, different letters  ·  never found', {
      color: INK.red, fill: 'rgba(196,73,85,0.10)', border: INK.red, size: 0.32,
    })
    missNote.position.set(2.5, -1.75, 0.5)
    group.add(missNote)

    const verdict = makeChip('a lexical miss is indistinguishable from an absence', {
      color: INK.cyan, fill: 'rgba(23,122,155,0.10)', border: INK.cyan, size: 0.34,
    })
    verdict.position.set(0, -3.1, 0.5)
    group.add(verdict)

    return (p) => {
      pattern.material.opacity = ramp(p, 0, 0.08)
      const scan = ramp(p, 0.1, 0.58, ease.linear)
      const top = firstY + 0.34
      const bottom = firstY - (CORPUS.length - 1) * rowH - 0.3
      cursor.position.y = top + scan * (bottom - top)
      cursor.material.opacity = scan > 0 && scan < 1 ? 0.5 : 0

      let hits = 0
      rows.forEach((row) => {
        const passed = scan > 0 && cursor.position.y <= row.y + 0.03
        if (row.hit && passed) hits += 1
        row.highlight.material.opacity = row.hit && passed ? 0.15 : 0
        row.text.material.color.set(row.hit && passed ? INK.cyan : INK.dim)
        row.verdict.setText(!passed ? '' : row.hit ? 'match' : '-', row.hit ? INK.cyan : INK.faint)
      })
      tally.setText(scan > 0.02 ? `${hits} matching lines` : '')
      tally.opacity = ramp(p, 0.12, 0.22)
      orderNote.material.opacity = ramp(p, 0.24, 0.36)

      const missFlash = window01(p, 0.62, 1.0, 0.05)
      paintCard(missRing, { borderOpacity: missFlash * 0.95, fillOpacity: missFlash * 0.07 })
      if (missFlash > 0.3) {
        rows[4].text.material.color.set(INK.red)
        rows[4].verdict.setText('no match', INK.red)
      }
      missNote.material.opacity = ramp(p, 0.66, 0.78)
      verdict.material.opacity = ramp(p, 0.84, 0.96)
    }
  }

  /* ---- 4. the write path ---- */
  chapter_edit(group) {
    const STAGES = [
      { title: '1 · READ', body: 'load the whole file', x: -3.55 },
      { title: '2 · SPLICE', body: 'model rewrites the section', x: 0 },
      { title: '3 · REPLACE', body: 'write temp, then rename', x: 3.55 },
    ]
    const stages = STAGES.map((stage) => {
      const card = titledCard(3.2, 2.9, stage.title, { fill: HEX.paper, titleColor: INK.amber })
      card.position.set(stage.x, 2.5, 0)
      group.add(card)
      const caption = makeLabel(stage.body, { color: INK.mute, size: 0.27 })
      caption.position.set(stage.x, 0.78, 0.4)
      group.add(caption)
      return { ...stage, card, caption }
    })

    const before = makeTextBlock([
      { text: '## People', color: INK.mute },
      { text: "- Sam - Maya's", color: INK.dim },
      { text: '  partner.', color: INK.dim },
      { text: '' },
      { text: '## History', color: INK.mute },
      { text: '- 08-04: Luna.', color: INK.dim },
    ], { width: 2.95, lineHeight: 0.34, fontSize: 20, bg: null })
    before.position.z = 0.06
    stages[0].card.add(before)

    const after = makeTextBlock([
      { text: '## People', color: INK.mute },
      { text: "- Sam - Maya's", color: INK.red, strike: true },
      { text: '  partner.', color: INK.red, strike: true },
      { text: '- Sam - ex (08-18).', color: INK.violet, bg: 'rgba(114,84,163,0.13)' },
      { text: '## History', color: INK.mute },
      { text: '- 08-04: Luna.', color: INK.dim },
    ], { width: 2.95, lineHeight: 0.34, fontSize: 20, bg: null })
    after.position.z = 0.06
    stages[1].card.add(after)

    const tmp = makeCard(2.6, 1.15, { fill: HEX.paperAlt, border: HEX.violet, borderOpacity: 0.85 })
    tmp.position.set(0, 0.62, 0.08)
    const tmpLabel = makeLabel('maya.md.tmp', { color: INK.violet, size: 0.28 })
    tmpLabel.position.z = 0.2
    tmp.add(tmpLabel)
    stages[2].card.add(tmp)
    const renameArrow = makeArrow([0, -0.12, 0.2], [0, -0.72, 0.2], HEX.violet, { head: 0.15 })
    stages[2].card.add(renameArrow)
    const renamed = makeCard(2.6, 0.7, { fill: HEX.paper, border: HEX.green, borderOpacity: 0.85 })
    renamed.position.set(0, -1.08, 0.08)
    const renamedLabel = makeLabel('rename() → maya.md', { color: INK.green, size: 0.26 })
    renamedLabel.position.z = 0.2
    renamed.add(renamedLabel)
    stages[2].card.add(renamed)

    const flow = [
      makeArrow([-1.85, 2.5, 0.3], [-1.3, 2.5, 0.3], HEX.grey, { head: 0.13 }),
      makeArrow([1.7, 2.5, 0.3], [2.25, 2.5, 0.3], HEX.grey, { head: 0.13 }),
    ]
    flow.forEach((arrow) => group.add(arrow))

    const atomicNote = makeChip('rename is atomic  ·  no half-written file, ever', {
      color: INK.green, fill: 'rgba(76,139,95,0.10)', border: INK.green, size: 0.3,
    })
    atomicNote.position.set(0, 0.16, 0.5)
    group.add(atomicNote)

    /* second half: two writers, one loser */
    const race = new THREE.Group()
    race.position.set(0, -1.85, 0)
    group.add(race)
    race.add(sceneLabel('BUT NOTHING COORDINATES TWO WRITERS', 0, 1.15, { size: 0.28, color: INK.red }))

    const agentA = makeCard(3.0, 0.8, { fill: HEX.paper, border: HEX.cyan })
    agentA.position.set(-3.3, 0.42, 0)
    const agentALabel = makeLabel('agent A: adds a lesson', { color: INK.cyan, size: 0.26 })
    agentALabel.position.z = 0.2
    agentA.add(agentALabel)
    const agentB = makeCard(3.0, 0.8, { fill: HEX.paper, border: HEX.red })
    agentB.position.set(-3.3, -0.62, 0)
    const agentBLabel = makeLabel('agent B: fixes a name', { color: INK.red, size: 0.26 })
    agentBLabel.position.z = 0.2
    agentB.add(agentBLabel)
    race.add(agentA, agentB)

    const target = makeCard(2.6, 1.15, { fill: HEX.paperAlt, border: HEX.line })
    target.position.set(3.1, -0.1, 0)
    const targetLabel = makeLabel('maya.md', { color: INK.dim, size: 0.3 })
    targetLabel.position.z = 0.2
    target.add(targetLabel)
    race.add(target)

    const pathA = makeLine([-1.75, 0.42, 0.1], [1.75, -0.1, 0.1], HEX.cyan, 0)
    const pathB = makeLine([-1.75, -0.62, 0.1], [1.75, -0.1, 0.1], HEX.red, 0)
    race.add(pathA, pathB)

    const overwritten = makeChip('lost, silently', { color: INK.faint, fill: INK.paperAlt, border: INK.faint, size: 0.26 })
    overwritten.position.set(-3.3, 0.42, 0.35)
    overwritten.material.opacity = 0
    race.add(overwritten)

    const lost = makeChip('agent A\'s edit is gone  ·  no error, no conflict, no trace', {
      color: INK.red, fill: 'rgba(196,73,85,0.10)', border: INK.red, size: 0.34,
    })
    lost.position.set(0, -3.75, 0.5)
    group.add(lost)

    return (p, t) => {
      stages.forEach((stage, i) => {
        const shown = ramp(p, 0.02 + i * 0.12, 0.13 + i * 0.12)
        stage.card.userData.card.userData.plane.material.opacity = 0.22 + shown * 0.78
        stage.card.userData.label.material.opacity = shown
        stage.caption.material.opacity = shown * 0.95
      })
      flow.forEach((arrow, i) => {
        const shown = ramp(p, 0.11 + i * 0.12, 0.19 + i * 0.12)
        arrow.userData.shaft.material.opacity = shown * 0.7
        arrow.userData.tip.material.opacity = shown * 0.7
      })
      before.material.opacity = ramp(p, 0.04, 0.14)
      after.material.opacity = ramp(p, 0.18, 0.3)
      const tmpIn = ramp(p, 0.3, 0.4)
      tmp.userData.plane.material.opacity = tmpIn
      tmp.userData.edges.material.opacity = tmpIn * 0.85
      tmpLabel.material.opacity = tmpIn
      const renameIn = ramp(p, 0.4, 0.52)
      renameArrow.userData.shaft.material.opacity = renameIn
      renameArrow.userData.tip.material.opacity = renameIn
      renamed.userData.plane.material.opacity = renameIn
      renamed.userData.edges.material.opacity = renameIn * 0.85
      renamedLabel.material.opacity = renameIn
      atomicNote.material.opacity = ramp(p, 0.46, 0.58)

      const raceIn = ramp(p, 0.6, 0.7)
      ;[agentA, agentB, target].forEach((card) => {
        card.userData.plane.material.opacity = raceIn * 0.98
        card.userData.edges.material.opacity = raceIn * 0.9
      })
      race.children[0].material.opacity = raceIn
      agentBLabel.material.opacity = raceIn
      targetLabel.material.opacity = raceIn

      pathA.material.opacity = window01(p, 0.72, 0.84, 0.02) * 0.8
      pathB.material.opacity = window01(p, 0.8, 0.94, 0.02) * 0.9
      const won = ramp(p, 0.86, 0.93)
      paintCard(target, { border: won > 0.5 ? HEX.red : HEX.line })
      targetLabel.material.color.set(won > 0.5 ? INK.red : INK.dim)
      // Agent A's card survives, but its content is replaced by the loss.
      agentALabel.material.opacity = raceIn * (1 - won)
      paintCard(agentA, { border: won > 0.5 ? HEX.line : HEX.cyan })
      overwritten.material.opacity = won
      lost.material.opacity = ramp(p, 0.88, 0.98)
      race.position.y = -1.85 + Math.sin(t * 0.8) * 0.012
    }
  }

  /* ---- 5. history for free ---- */
  chapter_git(group) {
    const COMMITS = [
      { hash: 'a3f19c', msg: 'record peanut allergy', date: '08-01' },
      { hash: '77b204', msg: 'log the Luna booking', date: '08-04' },
      { hash: 'c19d8e', msg: 'add menu-check lesson', date: '08-09' },
      { hash: '5e0a41', msg: 'Sam is now an ex-partner', date: '08-18' },
      { hash: '9bd6f2', msg: 'prefers early tables', date: '08-21' },
    ]
    group.add(sceneLabel('git log --oneline -- memory/', -3.35, 4.15, { size: 0.3, color: INK.mute }))
    const spine = makeLine([-4.5, 3.4, 0], [4.5, 3.4, 0], HEX.line, 0.9)
    group.add(spine)

    const nodes = COMMITS.map((commit, i) => {
      const x = -3.8 + i * 1.9
      const dot = new THREE.Mesh(
        new THREE.CircleGeometry(0.18, 24),
        new THREE.MeshBasicMaterial({ color: HEX.grey, transparent: true, opacity: 0, depthWrite: false })
      )
      dot.position.set(x, 3.4, 0.1)
      const ring = focusRing(0.36, HEX.violet)
      ring.position.set(x, 3.4, 0.12)
      const hash = makeLabel(commit.hash, { color: INK.faint, size: 0.26 })
      hash.position.set(x, 2.95, 0.2)
      const date = makeLabel(commit.date, { color: INK.mute, size: 0.26 })
      date.position.set(x, 3.85, 0.2)
      group.add(dot, ring, hash, date)
      return { ...commit, x, dot, ring, hash, date }
    })

    const message = new DynamicLabel({ color: INK.dim, size: 0.34, maxChars: 34 })
    message.position.set(0, 2.3, 0.4)
    group.add(message.sprite)

    const diff = titledCard(8.4, 3.0, 'git show 5e0a41  ·  memory/maya.md', {
      fill: HEX.paper, titleColor: INK.violet, border: HEX.violet,
    })
    diff.position.set(0, 0.35, 0)
    group.add(diff)
    const diffBlock = makeTextBlock([
      { text: '  ## People', color: INK.mute },
      { text: "- - Sam - Maya's partner.", color: INK.red, bg: 'rgba(196,73,85,0.11)' },
      { text: '+ - Sam - ex-partner (08-18).', color: INK.green, bg: 'rgba(76,139,95,0.11)' },
      { text: '  ## History', color: INK.mute },
      { text: '+ - 08-18: relationship ended.', color: INK.green, bg: 'rgba(76,139,95,0.11)' },
    ], { width: 8.0, lineHeight: 0.4, fontSize: 25, bg: null })
    diffBlock.position.z = 0.06
    diff.add(diffBlock)

    const powers = ['who changed it', 'when it changed', 'what it replaced', 'revert in one command']
    const powerChips = powers.map((text, i) => {
      const chip = makeChip(text, { color: INK.green, fill: 'rgba(76,139,95,0.09)', border: INK.green, size: 0.3 })
      chip.position.set(-3.6 + i * 2.4, -1.75, 0.4)
      group.add(chip)
      return chip
    })

    const verdict = makeChip('plain text inherits the entire toolchain built for plain text', {
      color: INK.amber, fill: 'rgba(214,111,40,0.10)', border: INK.amber, size: 0.34,
    })
    verdict.position.set(0, -3.1, 0.5)
    group.add(verdict)

    return (p, t) => {
      spine.material.opacity = ramp(p, 0.02, 0.12) * 0.9
      nodes.forEach((node, i) => {
        const appear = ramp(p, 0.03 + i * 0.07, 0.13 + i * 0.07)
        node.dot.material.opacity = appear
        node.dot.scale.setScalar(0.4 + appear * 0.6)
        node.hash.material.opacity = appear * 0.9
        node.date.material.opacity = appear * 0.9
        const focused = i === 3 ? window01(p, 0.46, 1.0, 0.04) : 0
        node.ring.material.opacity = focused * (0.5 + Math.sin(t * 3) * 0.2)
        node.dot.material.color.set(focused > 0.4 ? HEX.violet : HEX.grey)
      })

      const idx = Math.min(COMMITS.length - 1, Math.floor(ramp(p, 0.04, 0.44, ease.linear) * COMMITS.length))
      message.setText(p < 0.46 ? COMMITS[idx].msg : COMMITS[3].msg, p < 0.46 ? INK.dim : INK.violet)
      message.opacity = ramp(p, 0.05, 0.15)

      const diffIn = ramp(p, 0.48, 0.64)
      diff.userData.card.userData.plane.material.opacity = diffIn
      diff.userData.card.userData.edges.material.opacity = diffIn * 0.9
      diff.userData.label.material.opacity = diffIn
      diffBlock.material.opacity = diffIn
      diff.scale.setScalar(0.965 + diffIn * 0.035)

      powerChips.forEach((chip, i) => {
        chip.material.opacity = ramp(p, 0.66 + i * 0.055, 0.75 + i * 0.055)
      })
      verdict.material.opacity = ramp(p, 0.88, 0.98)
    }
  }
}
FilesInternals.CHAPTERS = ['bytes', 'tiers', 'grep', 'edit', 'git']


/* ============================================================
   SQLITE - schema, pages, b-tree, planner, transaction, history
   ============================================================ */

/* A table row drawn as a slab with left-aligned mono text. */
function tableRow(text, { width = 6.6, height = 0.52, fill = HEX.paperAlt, border = HEX.line, color = INK.dim, size = 0.28 } = {}) {
  const card = makeCard(width, height, { fill, border, borderOpacity: 0.7 })
  const label = makeLabel(text, { color, size })
  label.position.set(-width / 2 + label.scale.x / 2 + 0.2, 0, 0.2)
  card.add(label)
  card.userData.label = label
  return card
}

/* One 4 KiB page in the database file. */
function pageBlock(name, kind, { width = 1.5, height = 0.46 } = {}) {
  const tint = { root: 0xf2ddc7, interior: 0xe4ecf2, leaf: 0xfffdf8, free: 0xefebe1 }[kind] ?? HEX.paper
  const card = makeCard(width, height, { fill: tint, border: HEX.line, borderOpacity: 0.75 })
  const label = makeLabel(name, { color: INK.mute, size: 0.22 })
  label.position.z = 0.2
  card.add(label)
  card.userData.label = label
  card.userData.kind = kind
  return card
}

class SqliteInternals extends InternalView {
  /* ---- 1. the schema is the write policy ---- */
  chapter_schema(group) {
    const schema = titledCard(5.6, 5.4, 'schema.sql', { fill: HEX.paper })
    schema.position.set(-2.5, 1.4, 0)
    group.add(schema)
    const schemaBlock = makeTextBlock([
      { text: 'CREATE TABLE memories (', color: INK.text },
      { text: '  id            TEXT PRIMARY KEY,', color: INK.dim },
      { text: '  kind          TEXT NOT NULL', color: INK.dim },
      { text: "    CHECK (kind IN ('semantic',", color: INK.amber },
      { text: "      'episodic','procedural')),", color: INK.amber },
      { text: '  subject       TEXT NOT NULL,', color: INK.dim },
      { text: '  body          TEXT NOT NULL,', color: INK.dim },
      { text: '  created_at    INTEGER NOT NULL,', color: INK.dim },
      { text: '  superseded_by TEXT', color: INK.violet },
      { text: '    REFERENCES memories(id)', color: INK.violet },
      { text: ');', color: INK.text },
      { text: '' },
      { text: 'CREATE INDEX idx_subject', color: INK.cyan },
      { text: '  ON memories(subject, created_at);', color: INK.cyan },
    ], { width: 5.3, lineHeight: 0.35, fontSize: 21, bg: null })
    schemaBlock.position.z = 0.05
    schema.add(schemaBlock)

    const utterance = makeChip('“I can’t do the Thai place, peanut allergy”', {
      color: INK.dim, fill: INK.paper, border: INK.faint, size: 0.3,
    })
    utterance.position.set(2.6, 3.75, 0.5)
    group.add(utterance)

    const accepted = titledCard(4.6, 1.9, 'INSERT  ·  accepted', {
      fill: HEX.paper, border: HEX.green, titleColor: INK.green,
    })
    accepted.position.set(2.6, 2.15, 0)
    group.add(accepted)
    const acceptedBlock = makeTextBlock([
      { text: "id      'm1'", color: INK.dim },
      { text: "kind    'semantic'", color: INK.green },
      { text: "subject 'maya'", color: INK.dim },
      { text: "body    'allergic to peanuts'", color: INK.dim },
    ], { width: 4.3, lineHeight: 0.36, fontSize: 20, bg: null })
    acceptedBlock.position.z = 0.05
    accepted.add(acceptedBlock)

    const rejected = titledCard(4.6, 1.9, 'INSERT  ·  rejected', {
      fill: HEX.paper, border: HEX.red, titleColor: INK.red,
    })
    rejected.position.set(2.6, -0.35, 0)
    group.add(rejected)
    const rejectedBlock = makeTextBlock([
      { text: "id      'm9'", color: INK.dim },
      { text: "kind    'vibes'", color: INK.red, bg: 'rgba(196,73,85,0.12)' },
      { text: 'subject  NULL', color: INK.red, bg: 'rgba(196,73,85,0.12)' },
      { text: "body    'seems nice?'", color: INK.dim },
    ], { width: 4.3, lineHeight: 0.36, fontSize: 20, bg: null })
    rejectedBlock.position.z = 0.05
    rejected.add(rejectedBlock)

    const error = makeChip('CHECK constraint failed: kind', {
      color: INK.red, fill: 'rgba(196,73,85,0.10)', border: INK.red, size: 0.28,
    })
    error.position.set(2.6, -1.55, 0.5)
    group.add(error)

    const verdict = makeChip('constraints move correctness out of the prompt and into the engine', {
      color: INK.amber, fill: 'rgba(214,111,40,0.10)', border: INK.amber, size: 0.32,
    })
    verdict.position.set(0, -3.3, 0.5)
    group.add(verdict)

    return (p, t) => {
      schemaBlock.material.opacity = ramp(p, 0.02, 0.2)
      utterance.material.opacity = ramp(p, 0.2, 0.3)
      const acceptIn = ramp(p, 0.32, 0.46)
      accepted.scale.setScalar(0.95 + acceptIn * 0.05)
      acceptedBlock.material.opacity = acceptIn
      accepted.userData.card.userData.plane.material.opacity = 0.2 + acceptIn * 0.8
      accepted.userData.card.userData.edges.material.opacity = acceptIn * 0.9
      accepted.userData.label.material.opacity = acceptIn

      const rejectIn = ramp(p, 0.54, 0.68)
      rejectedBlock.material.opacity = rejectIn
      rejected.userData.card.userData.plane.material.opacity = 0.2 + rejectIn * 0.8
      rejected.userData.card.userData.edges.material.opacity = rejectIn * 0.9
      rejected.userData.label.material.opacity = rejectIn
      const shake = window01(p, 0.68, 0.76, 0.01)
      rejected.position.x = 2.6 + Math.sin(t * 34) * 0.05 * shake
      error.material.opacity = ramp(p, 0.7, 0.8)
      verdict.material.opacity = ramp(p, 0.84, 0.96)
    }
  }

  /* ---- 2. the file is a stack of pages ---- */
  chapter_pages(group) {
    group.add(sceneLabel('memory.db  ·  one file, 4 KiB pages', -3.25, 4.05, { size: 0.3, color: INK.mute }))
    const PAGES = [
      ['page 1', 'root'], ['page 2', 'interior'], ['page 3', 'leaf'], ['page 4', 'leaf'],
      ['page 5', 'interior'], ['page 6', 'leaf'], ['page 7', 'leaf'], ['page 8', 'leaf'],
      ['page 9', 'free'], ['page 10', 'leaf'], ['page 11', 'leaf'], ['page 12', 'free'],
    ]
    const stack = new THREE.Group()
    stack.position.set(-3.3, 0.6, 0)
    group.add(stack)
    const pages = PAGES.map(([name, kind], i) => {
      const block = pageBlock(name, kind, { width: 3.0, height: 0.52 })
      block.position.set(0, 2.95 - i * 0.58, 0)
      const tag = makeLabel(kind, { color: INK.faint, size: 0.2 })
      tag.position.set(1.05, 0, 0.2)
      block.add(tag)
      block.userData.tag = tag
      stack.add(block)
      return block
    })

    const treeGroup = new THREE.Group()
    treeGroup.position.set(2.4, 0.6, 0)
    group.add(treeGroup)
    treeGroup.add(sceneLabel('read as a B-tree', 0, 3.4, { size: 0.28, color: INK.cyan }))
    const treeNodes = [
      { id: 'root', label: 'page 1', pos: [0, 2.6], kind: 'root' },
      { id: 'i1', label: 'page 2', pos: [-1.35, 1.35], kind: 'interior' },
      { id: 'i2', label: 'page 5', pos: [1.35, 1.35], kind: 'interior' },
      { id: 'l1', label: 'page 3', pos: [-2.0, 0.1], kind: 'leaf' },
      { id: 'l2', label: 'page 4', pos: [-0.7, 0.1], kind: 'leaf' },
      { id: 'l3', label: 'page 6', pos: [0.7, 0.1], kind: 'leaf' },
      { id: 'l4', label: 'page 7', pos: [2.0, 0.1], kind: 'leaf' },
    ].map((node) => {
      const block = pageBlock(node.label, node.kind, { width: 1.16, height: 0.46 })
      block.position.set(node.pos[0], node.pos[1], 0.1)
      treeGroup.add(block)
      return { ...node, block }
    })
    const byId = Object.fromEntries(treeNodes.map((node) => [node.id, node]))
    const treeEdges = [['root', 'i1'], ['root', 'i2'], ['i1', 'l1'], ['i1', 'l2'], ['i2', 'l3'], ['i2', 'l4']]
      .map(([a, b]) => {
        const from = byId[a].pos
        const to = byId[b].pos
        const line = makeLine([from[0], from[1] - 0.23, 0.05], [to[0], to[1] + 0.23, 0.05], HEX.grey, 0)
        treeGroup.add(line)
        return line
      })

    const leaf = titledCard(4.6, 2.3, 'page 7  ·  a leaf holds the rows', {
      fill: HEX.paper, border: HEX.cyan, titleColor: INK.cyan,
    })
    leaf.position.set(2.4, -2.5, 0)
    group.add(leaf)
    const leafBlock = makeTextBlock([
      { text: 'm1  semantic   maya  peanut allergy', color: INK.dim },
      { text: 'm2  episodic   maya  booked Luna', color: INK.dim },
      { text: 'm3  semantic   maya  partner: Sam', color: INK.dim },
      { text: 'm4  procedural maya  check the menu', color: INK.dim },
    ], { width: 4.35, lineHeight: 0.4, fontSize: 19, bg: null })
    leafBlock.position.z = 0.05
    leaf.add(leafBlock)

    const link = makeDashedLine([-1.75, -2.5, 0.2], [0.05, -2.5, 0.2], HEX.cyan, { opacity: 0 })
    group.add(link)

    const verdict = makeChip('the unit of work is the page, not the row and not the file', {
      color: INK.amber, fill: 'rgba(214,111,40,0.10)', border: INK.amber, size: 0.32,
    })
    verdict.position.set(0, -3.95, 0.5)
    group.add(verdict)

    return (p, t) => {
      pages.forEach((page, i) => {
        const shown = ramp(p, 0.02 + i * 0.022, 0.1 + i * 0.022)
        page.userData.plane.material.opacity = shown
        page.userData.edges.material.opacity = shown * 0.75
        page.userData.label.material.opacity = shown
        page.userData.tag.material.opacity = shown * 0.85
      })
      treeNodes.forEach((node, i) => {
        const shown = ramp(p, 0.36 + i * 0.03, 0.46 + i * 0.03)
        node.block.userData.plane.material.opacity = shown
        node.block.userData.edges.material.opacity = shown * 0.8
        node.block.userData.label.material.opacity = shown
        node.block.scale.setScalar(0.85 + shown * 0.15)
      })
      treeEdges.forEach((edge, i) => {
        edge.material.opacity = ramp(p, 0.44 + i * 0.03, 0.54 + i * 0.03) * 0.75
      })
      const leafIn = ramp(p, 0.68, 0.82)
      leaf.userData.card.userData.plane.material.opacity = leafIn
      leaf.userData.card.userData.edges.material.opacity = leafIn * 0.9
      leaf.userData.label.material.opacity = leafIn
      leafBlock.material.opacity = leafIn
      link.material.opacity = leafIn * 0.6
      const focus = window01(p, 0.66, 1.0, 0.04)
      paintCard(byId.l4.block, { border: focus > 0.4 ? HEX.cyan : HEX.line })
      byId.l4.block.position.y = 0.1 + Math.sin(t * 2.4) * 0.02 * focus
      verdict.material.opacity = ramp(p, 0.86, 0.97)
    }
  }

  /* ---- 3. seek versus scan ---- */
  chapter_btree(group) {
    const query = makeChip("SELECT * FROM memories WHERE subject = 'maya'", {
      color: INK.cyan, fill: INK.paper, border: INK.cyan, size: 0.32,
    })
    query.position.set(0, 4.28, 0.5)
    group.add(query)

    /* --- the index seek --- */
    const seek = new THREE.Group()
    seek.position.set(-2.6, 1.35, 0)
    group.add(seek)
    seek.add(sceneLabel('WITH idx_subject  ·  SEEK', 0, 2.3, { size: 0.28, color: INK.cyan }))

    const LEVELS = [
      { label: 'root: a-h | i-p | q-z', y: 1.75, hit: 1, keys: 3 },
      { label: 'interior: ka | ma | ni', y: 0.55, hit: 1, keys: 3 },
      { label: 'leaf: maya -> rowid 41', y: -0.65, hit: 0, keys: 1 },
    ]
    const levels = LEVELS.map((level, i) => {
      const card = makeCard(4.3, 0.78, { fill: HEX.paper, border: HEX.line, borderOpacity: 0.75 })
      card.position.set(0, level.y, 0)
      const label = makeLabel(level.label, { color: INK.dim, size: 0.27 })
      label.position.z = 0.2
      card.add(label)
      seek.add(card)
      const step = makeLabel(`${i + 1}`, { color: INK.faint, size: 0.24 })
      step.position.set(-2.5, level.y, 0.2)
      seek.add(step)
      return { ...level, card, label, step }
    })
    const seekLinks = [
      makeLine([0, 1.36, 0.05], [0, 0.94, 0.05], HEX.cyan, 0),
      makeLine([0, 0.16, 0.05], [0, -0.26, 0.05], HEX.cyan, 0),
    ]
    seekLinks.forEach((line) => seek.add(line))
    const seekCount = new DynamicLabel({ color: INK.cyan, size: 0.34, maxChars: 18 })
    seekCount.position.set(0, -1.5, 0.4)
    seek.add(seekCount.sprite)

    /* --- the full scan --- */
    const scan = new THREE.Group()
    scan.position.set(2.7, 1.35, 0)
    group.add(scan)
    scan.add(sceneLabel('WITHOUT IT  ·  SCAN  ·  every page of the table', 0, 2.3, { size: 0.28, color: INK.red }))

    const COLS = 12
    const ROWS = 11
    const cellW = 0.33
    const cellH = 0.26
    const ticks = []
    for (let r = 0; r < ROWS; r += 1) {
      for (let c = 0; c < COLS; c += 1) {
        const tick = new THREE.Mesh(
          new THREE.PlaneGeometry(cellW * 0.82, cellH * 0.72),
          new THREE.MeshBasicMaterial({ color: HEX.line, transparent: true, opacity: 0.55, depthWrite: false })
        )
        tick.position.set((c - (COLS - 1) / 2) * cellW, 1.75 - r * cellH, 0)
        scan.add(tick)
        ticks.push(tick)
      }
    }
    const scanCount = new DynamicLabel({ color: INK.red, size: 0.34, maxChars: 18 })
    scanCount.position.set(0, -1.5, 0.4)
    scan.add(scanCount.sprite)

    const divider = makeDashedLine([0.05, 3.7, 0], [0.05, -0.55, 0], HEX.line, { opacity: 0.5 })
    group.add(divider)

    const compare = makeChip('3 page reads at a hundred rows, and still 3 at a million', {
      color: INK.cyan, fill: 'rgba(23,122,155,0.10)', border: INK.cyan, size: 0.32,
    })
    compare.position.set(0, -2.5, 0.5)
    group.add(compare)

    const verdict = makeChip('the index is what keeps recall cost flat as memory grows', {
      color: INK.amber, fill: 'rgba(214,111,40,0.10)', border: INK.amber, size: 0.32,
    })
    verdict.position.set(0, -3.6, 0.5)
    group.add(verdict)

    return (p, t) => {
      query.material.opacity = ramp(p, 0, 0.08)
      /* the seek finishes in the first third; the scan grinds on */
      const seekP = ramp(p, 0.1, 0.4, ease.linear)
      levels.forEach((level, i) => {
        const reached = seekP * 3 >= i
        const active = seekP * 3 >= i && seekP * 3 < i + 1.35
        paintCard(level.card, { border: reached ? HEX.cyan : HEX.line, fill: reached ? 0xe6f1f5 : HEX.paper })
        level.card.userData.plane.material.opacity = reached ? 1 : 0.35
        level.label.material.color.set(reached ? INK.cyan : INK.faint)
        level.step.material.opacity = reached ? 1 : 0.35
        level.card.scale.setScalar(1 + (active ? Math.sin(t * 5) * 0.008 : 0))
      })
      seekLinks.forEach((line, i) => {
        line.material.opacity = seekP * 3 >= i + 1 ? 0.8 : 0
      })
      seekCount.setText(`${Math.min(3, Math.ceil(seekP * 3))} pages read`)
      seekCount.opacity = ramp(p, 0.12, 0.2)

      const scanP = ramp(p, 0.1, 0.82, ease.linear)
      const visited = Math.round(scanP * ticks.length)
      ticks.forEach((tick, i) => {
        const done = i < visited
        tick.material.color.set(done ? HEX.red : HEX.line)
        tick.material.opacity = done ? 0.72 : 0.4
      })
      scanCount.setText(`${visited} pages read`)
      scanCount.opacity = ramp(p, 0.12, 0.2)

      compare.material.opacity = ramp(p, 0.84, 0.92)
      verdict.material.opacity = ramp(p, 0.9, 0.99)
      divider.material.opacity = ramp(p, 0.06, 0.16) * 0.5
    }
  }

  /* ---- 4. the query planner ---- */
  chapter_planner(group) {
    const sql = titledCard(7.6, 1.5, 'the query you wrote', { fill: HEX.paper })
    sql.position.set(0, 3.4, 0)
    group.add(sql)
    const sqlBlock = makeTextBlock([
      { text: 'SELECT body FROM memories', color: INK.text },
      { text: " WHERE subject = 'maya' AND superseded_by IS NULL", color: INK.text },
    ], { width: 7.3, lineHeight: 0.42, fontSize: 23, bg: null })
    sqlBlock.position.z = 0.05
    sql.add(sqlBlock)

    const arrow = makeArrow([0, 2.55, 0.3], [0, 2.18, 0.3], HEX.grey, { head: 0.13 })
    group.add(arrow)
    group.add(sceneLabel('the planner compares the options it has', 0, 1.98, { size: 0.28, color: INK.mute }))

    const PLANS = [
      {
        id: 'index', x: -2.6, color: HEX.cyan, ink: INK.cyan,
        title: 'SEARCH USING INDEX', cost: '3 pages', bar: 0.06,
        lines: ['idx_subject narrows to', 'the rows for maya, then', 'filters those few rows.'],
      },
      {
        id: 'scan', x: 2.6, color: HEX.red, ink: INK.red,
        title: 'SCAN memories', cost: '1,284 pages', bar: 1,
        lines: ['read every page, test', 'every row, discard', 'almost all of them.'],
      },
    ]
    const plans = PLANS.map((plan) => {
      const card = titledCard(4.7, 2.6, plan.title, { fill: HEX.paper, border: HEX.line, titleColor: plan.ink })
      card.position.set(plan.x, 0.35, 0)
      group.add(card)
      const block = makeTextBlock(plan.lines.map((text) => ({ text, color: INK.dim })), {
        width: 4.4, lineHeight: 0.36, fontSize: 20, bg: null,
      })
      block.position.set(0, 0.38, 0.05)
      card.add(block)
      const bar = makeBar(3.9, 0.3, { fill: plan.color })
      bar.position.set(0, -0.58, 0.1)
      card.add(bar)
      const cost = makeLabel(plan.cost, { color: plan.ink, size: 0.3 })
      cost.position.set(0, -1.0, 0.2)
      card.add(cost)
      const chosen = makeChip('chosen', { color: INK.green, fill: 'rgba(76,139,95,0.14)', border: INK.green, size: 0.26 })
      chosen.position.set(1.45, 0.98, 0.5)
      chosen.material.opacity = 0
      card.add(chosen)
      return { ...plan, card, block, bar, cost, chosen }
    })

    const explain = titledCard(7.6, 1.35, 'EXPLAIN QUERY PLAN', { fill: HEX.paperAlt, titleColor: INK.mute })
    explain.position.set(0, -2.45, 0)
    group.add(explain)
    const explainLabel = new DynamicLabel({ color: INK.cyan, size: 0.32, maxChars: 46, align: 'center' })
    explainLabel.position.set(0, 0, 0.2)
    explain.add(explainLabel.sprite)

    const dropped = makeChip('now drop the index', {
      color: INK.red, fill: 'rgba(196,73,85,0.10)', border: INK.red, size: 0.3,
    })
    dropped.position.set(-2.6, -1.32, 0.55)
    group.add(dropped)

    const verdict = makeChip('SCAN on a hot retrieval path is a missing index, every time', {
      color: INK.amber, fill: 'rgba(214,111,40,0.10)', border: INK.amber, size: 0.32,
    })
    verdict.position.set(0, -3.9, 0.5)
    group.add(verdict)

    return (p, t) => {
      sqlBlock.material.opacity = ramp(p, 0.02, 0.14)
      const arrowIn = ramp(p, 0.14, 0.22)
      arrow.userData.shaft.material.opacity = arrowIn * 0.7
      arrow.userData.tip.material.opacity = arrowIn * 0.7

      plans.forEach((plan, i) => {
        const shown = ramp(p, 0.22 + i * 0.1, 0.36 + i * 0.1)
        plan.card.userData.card.userData.plane.material.opacity = 0.2 + shown * 0.8
        plan.card.userData.card.userData.edges.material.opacity = shown * 0.85
        plan.card.userData.label.material.opacity = shown
        plan.block.material.opacity = shown
        plan.cost.material.opacity = shown
      })
      plans[0].bar.userData.set(ramp(p, 0.34, 0.46) * 0.06)
      plans[1].bar.userData.set(ramp(p, 0.44, 0.58) * 1)

      /* first half: the index wins. second half: it is gone. */
      const flipped = p > 0.66
      const pick = ramp(p, 0.56, 0.64)
      const flip = ramp(p, 0.68, 0.78)
      plans[0].chosen.material.opacity = pick * (1 - flip)
      plans[1].chosen.material.opacity = flip
      dropped.material.opacity = flip
      dropped.position.y = -1.32 - (1 - flip) * 0.18

      paintCard(plans[0].card.userData.card, {
        border: flipped ? HEX.line : (pick > 0.4 ? HEX.green : HEX.line),
        fillOpacity: flipped ? 0.35 : 1,
      })
      paintCard(plans[1].card.userData.card, { border: flipped ? HEX.green : HEX.line })
      plans[0].block.material.opacity = flipped ? 0.35 : 1
      plans[0].cost.material.opacity = flipped ? 0.35 : 1

      explainLabel.setText(
        p < 0.5 ? '' : flipped ? 'SCAN memories' : 'SEARCH memories USING INDEX idx_subject',
        flipped ? INK.red : INK.cyan
      )
      const explainIn = ramp(p, 0.48, 0.58)
      explain.userData.card.userData.plane.material.opacity = explainIn
      explain.userData.card.userData.edges.material.opacity = explainIn * 0.85
      explain.userData.label.material.opacity = explainIn
      explainLabel.opacity = explainIn
      verdict.material.opacity = ramp(p, 0.86, 0.97)
    }
  }

  /* ---- 5. one atomic moment ---- */
  chapter_txn(group) {
    const STEPS = [
      { label: 'BEGIN', x: -3.9, color: INK.mute },
      { label: 'UPDATE m3', x: -1.3, color: INK.violet },
      { label: 'INSERT m5', x: 1.3, color: INK.violet },
      { label: 'COMMIT', x: 3.9, color: INK.green },
    ]
    group.add(sceneLabel('THE WRITER', -3.85, 4.05, { size: 0.28, color: INK.mute }))
    const lane = makeLine([-4.9, 3.3, 0], [4.9, 3.3, 0], HEX.line, 0.8)
    group.add(lane)
    const steps = STEPS.map((step) => {
      const chip = makeChip(step.label, { color: step.color, fill: INK.paper, border: step.color, size: 0.3 })
      chip.position.set(step.x, 3.3, 0.4)
      group.add(chip)
      return { ...step, chip }
    })
    const playhead = new THREE.Mesh(
      new THREE.CircleGeometry(0.13, 20),
      new THREE.MeshBasicMaterial({ color: HEX.violet, transparent: true, opacity: 0.9, depthWrite: false })
    )
    playhead.position.set(-4.9, 3.3, 0.5)
    group.add(playhead)

    const wal = titledCard(9.8, 1.65, 'memory.db-wal  ·  changes are appended here first', {
      fill: HEX.paper, border: HEX.violet, titleColor: INK.violet,
    })
    wal.position.set(0, 1.5, 0)
    group.add(wal)
    const frames = ['frame: page 7 (m3 updated)', 'frame: page 7 (m5 inserted)', 'frame: COMMIT'].map((text, i) => {
      const card = makeCard(3.0, 0.62, { fill: HEX.paperAlt, border: HEX.violet, borderOpacity: 0.7 })
      card.position.set(-3.25 + i * 3.25, -0.1, 0.1)
      const label = makeLabel(text, { color: INK.violet, size: 0.23 })
      label.position.z = 0.2
      card.add(label)
      card.userData.label = label
      wal.add(card)
      return card
    })

    const db = titledCard(4.6, 1.9, 'memory.db  ·  untouched until commit', {
      fill: HEX.paper, border: HEX.line,
    })
    db.position.set(-2.7, -0.9, 0)
    group.add(db)
    const dbState = new DynamicLabel({ color: INK.dim, size: 0.3, maxChars: 28 })
    dbState.position.set(0, 0.18, 0.2)
    db.add(dbState.sprite)
    const dbNote = new DynamicLabel({ color: INK.mute, size: 0.25, maxChars: 26 })
    dbNote.position.set(0, -0.3, 0.2)
    db.add(dbNote.sprite)

    const reader = titledCard(4.6, 1.9, 'a concurrent reader', { fill: HEX.paper, border: HEX.cyan, titleColor: INK.cyan })
    reader.position.set(2.7, -0.9, 0)
    group.add(reader)
    const readerState = new DynamicLabel({ color: INK.cyan, size: 0.28, maxChars: 26 })
    readerState.position.set(0, 0.18, 0.2)
    reader.add(readerState.sprite)
    const readerNote = new DynamicLabel({ color: INK.mute, size: 0.25, maxChars: 28 })
    readerNote.position.set(0, -0.3, 0.2)
    reader.add(readerNote.sprite)

    const crash = makeChip('crash here', { color: INK.red, fill: 'rgba(196,73,85,0.12)', border: INK.red, size: 0.3 })
    crash.position.set(2.6, 2.72, 0.6)
    crash.material.opacity = 0
    group.add(crash)

    const outcome = new DynamicLabel({ color: INK.green, size: 0.3, maxChars: 66 })
    outcome.position.set(0, -2.6, 0.5)
    group.add(outcome.sprite)

    const verdict = makeChip('atomicity is what lets memory hold an invariant across two rows', {
      color: INK.amber, fill: 'rgba(214,111,40,0.10)', border: INK.amber, size: 0.32,
    })
    verdict.position.set(0, -3.7, 0.5)
    group.add(verdict)

    return (p, t) => {
      lane.material.opacity = ramp(p, 0.01, 0.08) * 0.8
      /* 0.0 - 0.55 the happy path, 0.6 - 1.0 the same story interrupted */
      const crashRun = p > 0.58
      const local = crashRun ? ramp(p, 0.6, 0.92, ease.linear) : ramp(p, 0.05, 0.52, ease.linear)
      const reached = local * 4
      const stopAt = crashRun ? 2.7 : 4

      steps.forEach((step, i) => {
        const active = Math.min(reached, stopAt) >= i + 0.5
        step.chip.material.opacity = active ? 1 : 0.3
      })
      const headT = Math.min(reached, stopAt) / 4
      playhead.position.x = -4.9 + headT * 9.8
      playhead.material.color.set(crashRun ? HEX.red : HEX.violet)

      frames.forEach((frame, i) => {
        const written = Math.min(reached, stopAt) >= i + 1.4
        frame.userData.plane.material.opacity = written ? 1 : 0.18
        frame.userData.edges.material.opacity = written ? 0.8 : 0.2
        frame.userData.label.material.opacity = written ? 1 : 0.2
        if (crashRun && i === 2) {
          frame.userData.label.material.opacity = 0.2
          frame.userData.plane.material.opacity = 0.18
        }
      })

      const committed = !crashRun && reached >= 3.6
      dbState.setText(committed ? 'm3 superseded, m5 present' : 'm3 current, no m5', committed ? INK.green : INK.dim)
      dbNote.setText(committed ? 'checkpointed from the WAL' : 'still the old snapshot')
      readerState.setText(committed ? 'sees both changes' : 'sees the old snapshot')
      readerNote.setText('never sees half a write')

      crash.material.opacity = crashRun ? ramp(p, 0.72, 0.8) : 0
      const crashDone = crashRun && p > 0.8
      outcome.setText(
        crashRun
          ? (crashDone ? 'no COMMIT frame: the WAL is discarded, the database is untouched' : '')
          : (committed ? 'both rows became visible in the same instant' : ''),
        crashRun ? INK.red : INK.green
      )
      outcome.opacity = crashRun ? ramp(p, 0.82, 0.9) : ramp(p, 0.44, 0.52)
      verdict.material.opacity = ramp(p, 0.9, 0.99)
      playhead.scale.setScalar(1 + Math.sin(t * 4) * 0.08)
    }
  }

  /* ---- 6. supersession is a pointer ---- */
  chapter_history(group) {
    const ROWS = [
      { id: 'm1', text: "m1  semantic  maya  allergic to peanuts", sup: null, y: 2.9 },
      { id: 'm2', text: 'm2  episodic  maya  booked Luna 08-04', sup: null, y: 2.16 },
      { id: 'm3', text: "m3  semantic  maya  partner: Sam", sup: 'm5', y: 1.42 },
      { id: 'm4', text: 'm4  procedural maya  check the menu', sup: null, y: 0.68 },
      { id: 'm5', text: 'm5  semantic  maya  ex-partner: Sam', sup: null, y: -0.06 },
    ]
    const table = titledCard(8.6, 3.9, 'memories  ·  nothing is ever deleted', { fill: HEX.paper })
    table.position.set(-0.4, 1.4, 0)
    group.add(table)

    const rows = ROWS.map((row) => {
      const card = tableRow(row.text, { width: 8.2, height: 0.6, fill: HEX.paperAlt, size: 0.28 })
      card.position.set(0, row.y - 1.4, 0.05)
      table.add(card)
      const sup = makeLabel(row.sup ? `superseded_by = ${row.sup}` : 'superseded_by = NULL', {
        color: INK.faint, size: 0.22,
      })
      sup.position.set(2.55, row.y - 1.4, 0.2)
      table.add(sup)
      return { ...row, card, sup }
    })
    const byId = Object.fromEntries(rows.map((row) => [row.id, row]))

    const chain = makeArrow([3.6, 0.02, 0.3], [3.6, -1.46, 0.3], HEX.violet, { head: 0.15 })
    group.add(chain)
    const chainLabel = makeLabel('the chain', { color: INK.violet, size: 0.24 })
    chainLabel.position.set(4.35, -0.72, 0.4)
    group.add(chainLabel)

    const filter = makeChip('WHERE superseded_by IS NULL', {
      color: INK.cyan, fill: INK.paper, border: INK.cyan, size: 0.32,
    })
    filter.position.set(-2.4, -1.35, 0.6)
    group.add(filter)

    const asOf = makeChip('or rewind: created_at <= 2026-08-10', {
      color: INK.violet, fill: INK.paper, border: INK.violet, size: 0.32,
    })
    asOf.position.set(2.1, -1.35, 0.6)
    group.add(asOf)

    const readout = new DynamicLabel({ color: INK.dim, size: 0.32, maxChars: 50 })
    readout.position.set(0, -2.4, 0.5)
    group.add(readout.sprite)

    const verdict = makeChip('one table answers both what is true now and what changed', {
      color: INK.amber, fill: 'rgba(214,111,40,0.10)', border: INK.amber, size: 0.32,
    })
    verdict.position.set(0, -3.5, 0.5)
    group.add(verdict)

    return (p, t) => {
      rows.forEach((row, i) => {
        const shown = ramp(p, 0.02 + i * 0.04, 0.12 + i * 0.04)
        row.card.userData.plane.material.opacity = shown
        row.card.userData.edges.material.opacity = shown * 0.7
        row.card.userData.label.material.opacity = shown
        row.sup.material.opacity = shown * 0.9
      })

      const chainIn = ramp(p, 0.26, 0.38)
      chain.userData.shaft.material.opacity = chainIn * 0.9
      chain.userData.tip.material.opacity = chainIn * 0.9
      chainLabel.material.opacity = chainIn
      byId.m3.sup.material.color.set(chainIn > 0.4 ? INK.violet : INK.faint)

      /* present view, then the rewind */
      const present = window01(p, 0.44, 0.72, 0.04)
      const past = ramp(p, 0.76, 0.86)
      filter.material.opacity = present
      asOf.material.opacity = past

      rows.forEach((row) => {
        let dim = 1
        if (present > 0.4 && row.sup) dim = 0.24
        if (past > 0.4) dim = row.id === 'm5' ? 0.24 : 1
        row.card.userData.plane.material.opacity = dim
        row.card.userData.label.material.opacity = dim
        row.sup.material.opacity = dim * 0.9
        const flagged = (present > 0.4 && row.sup) || (past > 0.4 && row.id === 'm5')
        paintCard(row.card, { border: flagged ? HEX.line : (present > 0.4 ? HEX.cyan : HEX.line) })
      })
      if (past > 0.4) {
        paintCard(byId.m3.card, { border: HEX.violet })
        byId.m3.card.userData.label.material.color.set(INK.violet)
      } else {
        byId.m3.card.userData.label.material.color.set(INK.dim)
      }

      readout.setText(
        past > 0.4 ? 'on 08-10 the agent believed Sam was her partner'
          : present > 0.4 ? '4 current memories, m3 filtered out'
            : '',
        past > 0.4 ? INK.violet : INK.cyan
      )
      readout.opacity = Math.max(present, past)
      verdict.material.opacity = ramp(p, 0.9, 0.99)
      chain.position.y = Math.sin(t * 0.9) * 0.012
    }
  }
}
SqliteInternals.CHAPTERS = ['schema', 'pages', 'btree', 'planner', 'txn', 'history']


/* ============================================================
   VECTOR - embedding, normalising, cosine, HNSW, limits, mutation
   ============================================================ */

/* Deterministic pseudo-random so every reload draws the same cloud. */
function noise(index) {
  const value = Math.sin(index * 127.1 + 311.7) * 43758.5453
  return value - Math.floor(value)
}

/* The vector itself, drawn as a strip of signed cells. Reading a real
   embedding is meaningless, and that is exactly the point being made. */
function vectorStrip(count, seed = 0, { cell = 0.17, height = 0.62, ppu = 150 } = {}) {
  const width = count * cell
  const W = Math.round(width * ppu)
  const H = Math.round(height * ppu)
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const canvas = document.createElement('canvas')
  canvas.width = W * dpr
  canvas.height = H * dpr
  const ctx = canvas.getContext('2d')
  ctx.scale(dpr, dpr)
  const cellPx = cell * ppu
  for (let i = 0; i < count; i += 1) {
    const v = noise(i + seed * 97) * 2 - 1
    const magnitude = Math.abs(v)
    const colour = v >= 0
      ? `rgba(23,122,155,${0.14 + magnitude * 0.72})`
      : `rgba(214,111,40,${0.14 + magnitude * 0.72})`
    ctx.fillStyle = colour
    const barH = (0.22 + magnitude * 0.78) * H
    ctx.fillRect(i * cellPx + 1, (H - barH) / 2, cellPx - 2, barH)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false })
  )
  mesh.userData = { width, height }
  return mesh
}

/* Flatten a point on a layer into an isometric position in the XY plane.
   Keeps every label upright while still reading as stacked planes. */
function iso(x, z, layerY) {
  return [x + z * 0.44, layerY + z * 0.27]
}

function isoPlane(halfX, halfZ, layerY, colour, opacity = 0.4) {
  const group = new THREE.Group()
  const corners = [
    iso(-halfX, -halfZ, layerY), iso(halfX, -halfZ, layerY),
    iso(halfX, halfZ, layerY), iso(-halfX, halfZ, layerY),
  ]
  const shape = new THREE.Shape()
  corners.forEach(([x, y], i) => (i === 0 ? shape.moveTo(x, y) : shape.lineTo(x, y)))
  shape.closePath()
  const fill = new THREE.Mesh(
    new THREE.ShapeGeometry(shape),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false })
  )
  fill.position.z = -0.08
  const points = [...corners, corners[0]].map(([x, y]) => new THREE.Vector3(x, y, -0.05))
  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineBasicMaterial({ color: colour, transparent: true, opacity })
  )
  group.add(fill, line)
  group.userData = { fill, line }
  return group
}

function dot(colour, radius = 0.09, opacity = 1) {
  return new THREE.Mesh(
    new THREE.CircleGeometry(radius, 20),
    new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity, depthWrite: false })
  )
}

class VectorInternals extends InternalView {
  /* ---- 1. text becomes coordinates ---- */
  chapter_embed(group) {
    const source = makeChip('“allergic to peanuts”', {
      color: INK.dim, fill: INK.paper, border: INK.faint, size: 0.34,
    })
    source.position.set(0, 4.0, 0.5)
    group.add(source)

    group.add(sceneLabel('1 · TOKENIZE', -4.2, 3.05, { size: 0.26, color: INK.mute }))
    const TOKENS = ['all', 'erg', 'ic', ' to', ' pe', 'an', 'uts']
    const tokens = TOKENS.map((text, i) => {
      const chip = makeChip(text, { color: INK.cyan, fill: '#eaf3f6', border: INK.cyan, size: 0.3 })
      chip.position.set(-2.6 + i * 0.92, 3.05, 0.4)
      group.add(chip)
      return chip
    })

    group.add(sceneLabel('2 · ENCODE', -4.2, 1.55, { size: 0.26, color: INK.mute }))
    const encoder = titledCard(6.6, 2.0, 'transformer encoder  ·  frozen weights', {
      fill: HEX.paperAlt, border: HEX.line,
    })
    encoder.position.set(0.4, 1.2, 0)
    group.add(encoder)
    const layers = [0, 1, 2, 3, 4, 5].map((i) => {
      const bar = new THREE.Mesh(
        new THREE.PlaneGeometry(6.0, 0.19),
        new THREE.MeshBasicMaterial({ color: HEX.violet, transparent: true, opacity: 0.18, depthWrite: false })
      )
      bar.position.set(0, 0.62 - i * 0.26, 0.1)
      encoder.add(bar)
      return bar
    })
    const pooled = makeLabel('mean pooling', { color: INK.violet, size: 0.24 })
    pooled.position.set(0, -0.98, 0.3)
    encoder.add(pooled)

    group.add(sceneLabel('3 · ONE FIXED-LENGTH VECTOR', -3.2, -0.65, { size: 0.26, color: INK.mute }))
    const strip = vectorStrip(56, 3, { cell: 0.16, height: 0.72 })
    strip.position.set(0, -1.35, 0)
    group.add(strip)
    const stripFrame = makeCard(strip.userData.width + 0.12, 0.86, {
      fill: HEX.paper, fillOpacity: 0, border: HEX.line, borderOpacity: 0.7,
    })
    stripFrame.position.set(0, -1.35, -0.02)
    group.add(stripFrame)

    const dims = new DynamicLabel({ color: INK.dim, size: 0.3, maxChars: 40 })
    dims.position.set(0, -2.2, 0.4)
    group.add(dims.sprite)

    const note = makeChip('no single dimension means anything you could name', {
      color: INK.mute, fill: 'rgba(255,253,248,0.94)', border: INK.faint, size: 0.3,
    })
    note.position.set(0, -2.95, 0.5)
    group.add(note)

    const verdict = makeChip('the vector is not the memory, it is a coordinate standing in for it', {
      color: INK.amber, fill: 'rgba(214,111,40,0.10)', border: INK.amber, size: 0.32,
    })
    verdict.position.set(0, -3.85, 0.5)
    group.add(verdict)

    return (p, t) => {
      source.material.opacity = ramp(p, 0, 0.08)
      tokens.forEach((chip, i) => {
        const shown = ramp(p, 0.1 + i * 0.028, 0.18 + i * 0.028)
        chip.material.opacity = shown
        chip.position.y = 3.05 + (1 - shown) * 0.28
      })
      const encodeIn = ramp(p, 0.32, 0.42)
      encoder.userData.card.userData.plane.material.opacity = encodeIn
      encoder.userData.card.userData.edges.material.opacity = encodeIn * 0.85
      encoder.userData.label.material.opacity = encodeIn
      layers.forEach((bar, i) => {
        const pulse = window01(p, 0.4 + i * 0.028, 0.46 + i * 0.028, 0.015)
        bar.material.opacity = encodeIn * (0.15 + pulse * 0.6)
      })
      pooled.material.opacity = ramp(p, 0.58, 0.66)

      const stripIn = ramp(p, 0.64, 0.78)
      strip.material.opacity = stripIn
      strip.scale.x = 0.3 + stripIn * 0.7
      stripFrame.userData.edges.material.opacity = stripIn * 0.7
      dims.setText(stripIn > 0.5 ? '1536 floats  ·  56 of them shown' : '')
      dims.opacity = ramp(p, 0.72, 0.82)
      note.material.opacity = ramp(p, 0.8, 0.9)
      verdict.material.opacity = ramp(p, 0.88, 0.98)
    }
  }

  /* ---- 2. everything is pushed onto a sphere ---- */
  chapter_normalize(group) {
    const globe = new THREE.Group()
    globe.position.set(-2.5, 0.7, 0)
    group.add(globe)

    const sphere = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.SphereGeometry(2.0, 16, 10)),
      new THREE.LineBasicMaterial({ color: HEX.cyan, transparent: true, opacity: 0.16 })
    )
    globe.add(sphere)
    const equator = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(
        Array.from({ length: 65 }, (_, i) => {
          const a = (i / 64) * Math.PI * 2
          return new THREE.Vector3(Math.cos(a) * 2.0, Math.sin(a) * 2.0, 0)
        })
      ),
      new THREE.LineBasicMaterial({ color: HEX.cyan, transparent: true, opacity: 0.4 })
    )
    globe.add(equator)
    const origin = dot(HEX.grey, 0.07, 0.8)
    globe.add(origin)

    const VECTORS = [
      { angle: 0.68, raw: 3.1, colour: HEX.amber, ink: INK.amber, name: 'm1' },
      { angle: 2.15, raw: 1.15, colour: HEX.cyan, ink: INK.cyan, name: 'm2' },
      { angle: 4.3, raw: 2.4, colour: HEX.violet, ink: INK.violet, name: 'm3' },
    ].map((entry) => {
      const line = makeLine([0, 0, 0.1], [0, 0, 0.1], entry.colour, 0.85)
      const head = dot(entry.colour, 0.11)
      head.position.z = 0.15
      const label = makeLabel(entry.name, { color: entry.ink, size: 0.26, bg: INK.paper })
      globe.add(line, head, label)
      return { ...entry, line, head, label }
    })

    const maths = titledCard(4.5, 3.4, 'what normalising buys', { fill: HEX.paper })
    maths.position.set(3.0, 0.9, 0)
    group.add(maths)
    const mathsBlock = makeTextBlock([
      { text: 'before', color: INK.mute },
      { text: '  ||v|| = 3.10, 1.15, 2.40', color: INK.dim },
      { text: '' },
      { text: 'after', color: INK.mute },
      { text: '  ||v|| = 1.00 for every one', color: INK.cyan },
      { text: '' },
      { text: 'so', color: INK.mute },
      { text: '  cos(a,b) = a . b', color: INK.violet },
    ], { width: 4.25, lineHeight: 0.36, fontSize: 21, bg: null })
    mathsBlock.position.z = 0.05
    maths.add(mathsBlock)

    const state = new DynamicLabel({ color: INK.cyan, size: 0.3, maxChars: 34 })
    state.position.set(-2.5, -2.05, 0.5)
    group.add(state.sprite)

    const note = makeChip('magnitude tracks length and emphasis, which is noise here', {
      color: INK.mute, fill: 'rgba(255,253,248,0.94)', border: INK.faint, size: 0.3,
    })
    note.position.set(0, -3.0, 0.5)
    group.add(note)

    const verdict = makeChip('discarding magnitude makes similarity comparable and cheap', {
      color: INK.amber, fill: 'rgba(214,111,40,0.10)', border: INK.amber, size: 0.32,
    })
    verdict.position.set(0, -3.9, 0.5)
    group.add(verdict)

    return (p, t) => {
      const shown = ramp(p, 0.02, 0.16)
      sphere.material.opacity = shown * 0.16
      equator.material.opacity = shown * 0.4
      const pull = ramp(p, 0.34, 0.72, ease.inOut)
      VECTORS.forEach((vector, i) => {
        const appear = ramp(p, 0.1 + i * 0.06, 0.22 + i * 0.06)
        const length = (vector.raw + (2.0 - vector.raw) * pull) * appear
        const angle = vector.angle + t * 0.06
        const x = Math.cos(angle) * length
        const y = Math.sin(angle) * length
        setLinePoints(vector.line, [0, 0, 0.1], [x, y, 0.1])
        vector.line.material.opacity = appear * 0.85
        vector.head.position.set(x, y, 0.15)
        vector.head.material.opacity = appear
        vector.label.position.set(x * 1.16, y * 1.16, 0.3)
        vector.label.material.opacity = appear
      })
      state.setText(pull > 0.92 ? 'every vector now has length 1' : pull > 0.05 ? 'scaling to unit length' : 'raw vectors, different lengths',
        pull > 0.92 ? INK.cyan : INK.mute)
      state.opacity = ramp(p, 0.12, 0.22)
      mathsBlock.material.opacity = ramp(p, 0.42, 0.58)
      note.material.opacity = ramp(p, 0.7, 0.82)
      verdict.material.opacity = ramp(p, 0.86, 0.97)
    }
  }

  /* ---- 3. similarity is an angle ---- */
  chapter_cosine(group) {
    const field = new THREE.Group()
    field.position.set(-2.4, 0.75, 0)
    group.add(field)
    const ring = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(
        Array.from({ length: 65 }, (_, i) => {
          const a = (i / 64) * Math.PI * 2
          return new THREE.Vector3(Math.cos(a) * 2.1, Math.sin(a) * 2.1, 0)
        })
      ),
      new THREE.LineBasicMaterial({ color: HEX.cyan, transparent: true, opacity: 0.32 })
    )
    field.add(ring)

    const QUERY_ANGLE = 0.9
    const query = {
      line: makeLine([0, 0, 0.1], [Math.cos(QUERY_ANGLE) * 2.1, Math.sin(QUERY_ANGLE) * 2.1, 0.1], HEX.cyan, 0.95),
      head: dot(HEX.cyan, 0.13),
      label: makeLabel('q: “dinner Friday”', { color: INK.cyan, size: 0.26, bg: INK.paper }),
    }
    query.head.position.set(Math.cos(QUERY_ANGLE) * 2.1, Math.sin(QUERY_ANGLE) * 2.1, 0.2)
    query.label.position.set(Math.cos(QUERY_ANGLE) * 2.72, Math.sin(QUERY_ANGLE) * 2.72 + 0.1, 0.3)
    field.add(query.line, query.head, query.label)

    const MEMS = [
      { id: 'm2', name: 'm2 booked Luna', angle: 1.24, score: 0.81 },
      { id: 'm4', name: 'm4 check the menu', angle: 0.36, score: 0.74 },
      { id: 'm1', name: 'm1 peanut allergy', angle: 1.95, score: 0.69 },
      { id: 'm3', name: 'm3 partner Sam', angle: 4.05, score: 0.21 },
    ].map((mem) => {
      const x = Math.cos(mem.angle) * 2.1
      const y = Math.sin(mem.angle) * 2.1
      const spoke = makeLine([0, 0, 0.05], [x, y, 0.05], HEX.grey, 0.3)
      const head = dot(HEX.grey, 0.1)
      head.position.set(x, y, 0.15)
      const arc = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(
          Array.from({ length: 33 }, (_, i) => {
            const a = QUERY_ANGLE + (mem.angle - QUERY_ANGLE) * (i / 32)
            return new THREE.Vector3(Math.cos(a) * 1.28, Math.sin(a) * 1.28, 0.05)
          })
        ),
        new THREE.LineBasicMaterial({ color: HEX.cyan, transparent: true, opacity: 0 })
      )
      const mid = (QUERY_ANGLE + mem.angle) / 2
      const scoreLabel = new DynamicLabel({ color: INK.cyan, size: 0.25, bg: INK.paper, maxChars: 5 })
      scoreLabel.setText(mem.score.toFixed(2))
      scoreLabel.position.set(Math.cos(mid) * 1.55, Math.sin(mid) * 1.55, 0.3)
      const idLabel = makeLabel(mem.id, { color: INK.mute, size: 0.24, bg: INK.paper })
      idLabel.position.set(Math.cos(mem.angle) * 2.48, Math.sin(mem.angle) * 2.48, 0.3)
      field.add(spoke, head, arc, scoreLabel.sprite, idLabel)
      return { ...mem, x, y, spoke, head, arc, scoreLabel, idLabel }
    })

    const ranked = titledCard(4.6, 3.1, 'top k = 3, ranked by cosine', { fill: HEX.paper })
    ranked.position.set(3.1, 1.0, 0)
    group.add(ranked)
    const order = [MEMS[0], MEMS[1], MEMS[2], MEMS[3]]
    const rows = order.map((mem, i) => {
      const card = makeCard(4.25, 0.6, { fill: HEX.paperAlt, border: HEX.line, borderOpacity: 0.6 })
      card.position.set(0, 1.05 - i * 0.72, 0.08)
      const name = makeLabel(mem.name, { color: INK.dim, size: 0.25 })
      name.position.set(-2.0 + name.scale.x / 2 + 0.12, 0, 0.2)
      const score = makeLabel(mem.score.toFixed(2), { color: INK.cyan, size: 0.26 })
      score.position.set(1.75, 0, 0.2)
      card.add(name, score)
      ranked.add(card)
      return { mem, card, name, score }
    })
    const cutoff = makeDashedLine([-2.15, -0.75, 0.3], [2.15, -0.75, 0.3], HEX.red, { opacity: 0 })
    ranked.add(cutoff)
    const cutoffLabel = makeLabel('similarity floor 0.55', { color: INK.red, size: 0.22, bg: INK.paper })
    cutoffLabel.position.set(0, -0.75, 0.4)
    ranked.add(cutoffLabel)

    const note = makeChip('every query returns neighbours, relevant or not', {
      color: INK.mute, fill: 'rgba(255,253,248,0.94)', border: INK.faint, size: 0.3,
    })
    note.position.set(0, -2.85, 0.5)
    group.add(note)

    const verdict = makeChip('there is no such thing as a failed lookup, only a bad one', {
      color: INK.amber, fill: 'rgba(214,111,40,0.10)', border: INK.amber, size: 0.32,
    })
    verdict.position.set(0, -3.8, 0.5)
    group.add(verdict)

    return (p, t) => {
      const shown = ramp(p, 0.02, 0.14)
      ring.material.opacity = shown * 0.32
      query.line.material.opacity = shown * 0.95
      query.head.material.opacity = shown
      query.label.material.opacity = shown

      MEMS.forEach((mem, i) => {
        const appear = ramp(p, 0.1 + i * 0.05, 0.2 + i * 0.05)
        mem.spoke.material.opacity = appear * 0.32
        mem.head.material.opacity = appear
        mem.idLabel.material.opacity = appear
        const measured = ramp(p, 0.34 + i * 0.09, 0.46 + i * 0.09)
        mem.arc.material.opacity = measured * 0.65
        mem.scoreLabel.opacity = measured
        const near = mem.score >= 0.55
        mem.head.material.color.set(measured > 0.5 ? (near ? HEX.cyan : HEX.grey) : HEX.grey)
        mem.head.scale.setScalar(1 + (measured > 0.5 && near ? Math.sin(t * 3 + i) * 0.08 : 0))
        mem.scoreLabel.setText(mem.score.toFixed(2), near ? INK.cyan : INK.faint)
      })

      rows.forEach((row, i) => {
        const shownRow = ramp(p, 0.5 + i * 0.06, 0.6 + i * 0.06)
        row.card.userData.plane.material.opacity = shownRow
        row.card.userData.edges.material.opacity = shownRow * 0.6
        row.name.material.opacity = shownRow
        row.score.material.opacity = shownRow
        const rejected = row.mem.score < 0.55 && p > 0.8
        row.name.material.color.set(rejected ? INK.faint : INK.dim)
        row.score.material.color.set(rejected ? INK.red : INK.cyan)
        paintCard(row.card, { border: rejected ? HEX.red : HEX.line })
      })
      const floor = ramp(p, 0.78, 0.86)
      cutoff.material.opacity = floor * 0.8
      cutoffLabel.material.opacity = floor
      note.material.opacity = ramp(p, 0.72, 0.82)
      verdict.material.opacity = ramp(p, 0.88, 0.98)
    }
  }

  /* ---- 4. HNSW ---- */
  chapter_hnsw(group) {
    const LAYERS = [
      { name: 'layer 2  ·  sparse, long edges', y: 2.9, count: 7, seed: 11, half: 2.6 },
      { name: 'layer 1  ·  denser, shorter', y: 0.55, count: 15, seed: 29, half: 2.6 },
      { name: 'layer 0  ·  every vector lives here', y: -1.8, count: 46, seed: 47, half: 2.6 },
    ]
    const stack = new THREE.Group()
    stack.position.set(-0.9, 0.35, 0)
    group.add(stack)

    const layers = LAYERS.map((layer, li) => {
      const plane = isoPlane(layer.half, 1.05, layer.y, HEX.grey, 0.5)
      stack.add(plane)
      const label = makeLabel(layer.name, { color: INK.mute, size: 0.24 })
      label.position.set(-layer.half - 1.0 + label.scale.x / 2, layer.y + 0.62, 0.3)
      stack.add(label)
      const nodes = Array.from({ length: layer.count }, (_, i) => {
        const nx = (noise(i + layer.seed) - 0.5) * layer.half * 1.9
        const nz = (noise(i + layer.seed + 500) - 0.5) * 1.9
        const [x, y] = iso(nx, nz, layer.y)
        const node = dot(HEX.grey, li === 2 ? 0.075 : 0.095, 0.75)
        node.position.set(x, y, 0.1)
        stack.add(node)
        return { node, x, y, nx, nz }
      })
      return { ...layer, plane, label, nodes }
    })

    /* The greedy walk: a few hops per layer, then a drop to the next. */
    const PATH = [
      { layer: 0, node: 0 }, { layer: 0, node: 3 },
      { layer: 1, node: 4 }, { layer: 1, node: 9 }, { layer: 1, node: 12 },
      { layer: 2, node: 7 }, { layer: 2, node: 19 }, { layer: 2, node: 31 },
    ]
    const hops = PATH.slice(0, -1).map((step, i) => {
      const from = layers[step.layer].nodes[step.node]
      const next = PATH[i + 1]
      const to = layers[next.layer].nodes[next.node]
      const descending = next.layer !== step.layer
      const line = descending
        ? makeDashedLine([from.x, from.y, 0.2], [to.x, to.y, 0.2], HEX.violet, { opacity: 0, dash: 0.12, gap: 0.1 })
        : makeLine([from.x, from.y, 0.2], [to.x, to.y, 0.2], HEX.cyan, 0)
      stack.add(line)
      return { line, from, to, descending }
    })

    const entry = makeChip('entry point', { color: INK.violet, fill: INK.paper, border: INK.violet, size: 0.26 })
    const entryNode = layers[0].nodes[0]
    entry.position.set(entryNode.x, entryNode.y + 0.42, 0.5)
    stack.add(entry)

    const target = layers[2].nodes[31]
    const targetRing = focusRing(0.26, HEX.cyan)
    targetRing.position.set(target.x, target.y, 0.3)
    stack.add(targetRing)

    const missed = layers[2].nodes[22]
    const missRing = focusRing(0.26, HEX.red)
    missRing.position.set(missed.x, missed.y, 0.3)
    stack.add(missRing)
    const missLabel = makeLabel('a true neighbour, not visited', { color: INK.red, size: 0.24, bg: INK.paper })
    missLabel.position.set(missed.x, missed.y - 0.48, 0.5)
    missLabel.material.opacity = 0
    stack.add(missLabel)

    const counter = new DynamicLabel({ color: INK.cyan, size: 0.32, maxChars: 34 })
    counter.position.set(3.5, 3.2, 0.5)
    group.add(counter.sprite)
    const efLabel = new DynamicLabel({ color: INK.violet, size: 0.28, maxChars: 30 })
    efLabel.position.set(3.5, 2.7, 0.5)
    group.add(efLabel.sprite)

    const verdict = makeChip('vector search is a tunable bet: speed against the odds of a miss', {
      color: INK.amber, fill: 'rgba(214,111,40,0.10)', border: INK.amber, size: 0.32,
    })
    verdict.position.set(0, -4.05, 0.5)
    group.add(verdict)

    return (p, t) => {
      layers.forEach((layer, li) => {
        const shown = ramp(p, 0.02 + li * 0.06, 0.14 + li * 0.06)
        layer.plane.userData.line.material.opacity = shown * 0.5
        layer.plane.userData.fill.material.opacity = shown * 0.55
        layer.label.material.opacity = shown
        layer.nodes.forEach((entryNode) => {
          entryNode.node.material.opacity = shown * 0.7
        })
      })
      entry.material.opacity = ramp(p, 0.18, 0.26)

      const walk = ramp(p, 0.24, 0.72, ease.linear) * hops.length
      hops.forEach((hop, i) => {
        const done = walk >= i + 1
        const active = walk > i && walk < i + 1
        hop.line.material.opacity = done ? (hop.descending ? 0.8 : 0.9) : (active ? (walk - i) * 0.9 : 0)
        if (done || active) {
          hop.from.node.material.color.set(HEX.cyan)
          hop.from.node.material.opacity = 1
          hop.from.node.scale.setScalar(1.35)
        }
        if (done) {
          hop.to.node.material.color.set(HEX.cyan)
          hop.to.node.material.opacity = 1
          hop.to.node.scale.setScalar(1.35)
        }
      })

      const visited = Math.round(ramp(p, 0.24, 0.72, ease.linear) * 214)
      counter.setText(`${visited} of 100,000 vectors visited`)
      counter.opacity = ramp(p, 0.26, 0.36)

      const found = ramp(p, 0.68, 0.78)
      targetRing.material.opacity = found * (0.65 + Math.sin(t * 3) * 0.2)

      /* the approximation: one true neighbour was never on the path */
      const missShown = ramp(p, 0.78, 0.86)
      missRing.material.opacity = missShown * (0.6 + Math.sin(t * 3.6) * 0.2)
      missLabel.material.opacity = missShown
      missed.node.material.color.set(missShown > 0.4 ? HEX.red : HEX.grey)
      efLabel.setText(missShown > 0.4 ? 'raise ef to widen the search' : '')
      efLabel.opacity = missShown
      verdict.material.opacity = ramp(p, 0.88, 0.98)
    }
  }

  /* ---- 5. near is not true ---- */
  chapter_limits(group) {
    const field = titledCard(6.0, 4.2, 'one neighbourhood of embedding space', { fill: HEX.paper })
    field.position.set(-2.5, 1.5, 0)
    group.add(field)

    const POINTS = [
      { name: 'allergic to peanuts', x: -0.95, y: 0.9, colour: HEX.amber, ink: INK.amber, score: 0.94 },
      { name: 'loves peanut sauce', x: 1.05, y: 0.52, colour: HEX.red, ink: INK.red, score: 0.91 },
      { name: 'peanut butter recipe', x: -1.35, y: -0.95, colour: HEX.grey, ink: INK.mute, score: 0.88 },
      { name: 'nut-free bakery', x: 1.5, y: -1.1, colour: HEX.grey, ink: INK.mute, score: 0.79 },
    ].map((point) => {
      const head = dot(point.colour, 0.12)
      head.position.set(point.x, point.y, 0.2)
      const label = makeLabel(point.name, { color: point.ink, size: 0.25, bg: INK.paper })
      label.position.set(point.x, point.y + 0.36, 0.3)
      field.add(head, label)
      return { ...point, head, label }
    })

    const query = dot(HEX.cyan, 0.14)
    query.position.set(0.15, 0.0, 0.25)
    const queryLabel = makeLabel('q: “peanuts”', { color: INK.cyan, size: 0.26, bg: INK.paper })
    queryLabel.position.set(0.15, -0.36, 0.35)
    field.add(query, queryLabel)
    const halo = new THREE.Mesh(
      new THREE.RingGeometry(1.28, 1.34, 48),
      new THREE.MeshBasicMaterial({ color: HEX.cyan, transparent: true, opacity: 0, depthWrite: false })
    )
    halo.position.set(0.15, 0.0, 0.1)
    field.add(halo)

    const results = titledCard(4.4, 3.0, 'what similarity returns', { fill: HEX.paper, border: HEX.red, titleColor: INK.red })
    results.position.set(3.2, 1.9, 0)
    group.add(results)
    const rows = POINTS.slice(0, 3).map((point, i) => {
      const card = makeCard(4.05, 0.68, { fill: HEX.paperAlt, border: HEX.line, borderOpacity: 0.6 })
      card.position.set(0, 0.82 - i * 0.8, 0.08)
      const name = makeLabel(point.name, { color: point.ink, size: 0.24 })
      name.position.set(-1.9 + name.scale.x / 2 + 0.1, 0, 0.2)
      const score = makeLabel(point.score.toFixed(2), { color: INK.dim, size: 0.25 })
      score.position.set(1.65, 0, 0.2)
      card.add(name, score)
      results.add(card)
      return { point, card, name, score }
    })

    const contradiction = makeChip('0.91 similar, and the opposite of true', {
      color: INK.red, fill: 'rgba(196,73,85,0.10)', border: INK.red, size: 0.3,
    })
    contradiction.position.set(3.2, -0.05, 0.6)
    group.add(contradiction)

    group.add(sceneLabel('SO NOTHING RELIES ON SIMILARITY ALONE', 0, -1.55, { size: 0.28, color: INK.mute }))
    const REPAIRS = ['keyword index', 'metadata filter', 'reranker', 'a judgement step']
    const repairs = REPAIRS.map((text, i) => {
      const chip = makeChip(`+ ${text}`, { color: INK.green, fill: 'rgba(76,139,95,0.09)', border: INK.green, size: 0.3 })
      chip.position.set(-3.6 + i * 2.45, -2.3, 0.5)
      group.add(chip)
      return chip
    })

    const verdict = makeChip('similarity ranks resemblance, something else has to rank truth', {
      color: INK.amber, fill: 'rgba(214,111,40,0.10)', border: INK.amber, size: 0.32,
    })
    verdict.position.set(0, -3.5, 0.5)
    group.add(verdict)

    return (p, t) => {
      POINTS.forEach((point, i) => {
        const shown = ramp(p, 0.02 + i * 0.05, 0.14 + i * 0.05)
        point.head.material.opacity = shown
        point.label.material.opacity = shown
      })
      const queryIn = ramp(p, 0.22, 0.32)
      query.material.opacity = queryIn
      queryLabel.material.opacity = queryIn
      const sweep = ramp(p, 0.3, 0.5, ease.out)
      halo.material.opacity = sweep * 0.5
      halo.scale.setScalar(0.2 + sweep * 0.85 + Math.sin(t * 2) * 0.012)

      rows.forEach((row, i) => {
        const shown = ramp(p, 0.44 + i * 0.07, 0.56 + i * 0.07)
        row.card.userData.plane.material.opacity = shown
        row.card.userData.edges.material.opacity = shown * 0.6
        row.name.material.opacity = shown
        row.score.material.opacity = shown
      })
      const flag = ramp(p, 0.64, 0.72)
      contradiction.material.opacity = flag
      paintCard(rows[1].card, { border: flag > 0.4 ? HEX.red : HEX.line })
      POINTS[1].head.scale.setScalar(1 + flag * (0.25 + Math.sin(t * 4) * 0.12))

      repairs.forEach((chip, i) => {
        chip.material.opacity = ramp(p, 0.74 + i * 0.04, 0.83 + i * 0.04)
      })
      verdict.material.opacity = ramp(p, 0.9, 0.99)
    }
  }

  /* ---- 6. updating means re-embedding ---- */
  chapter_mutate(group) {
    /* left: an edit forces a new vector and a new position */
    const edit = titledCard(4.9, 3.0, '1 · edit a memory', { fill: HEX.paper, titleColor: INK.violet, border: HEX.violet })
    edit.position.set(-2.9, 2.3, 0)
    group.add(edit)
    const oldText = makeChip('“Sam is my partner”', { color: INK.faint, fill: INK.paperAlt, border: INK.faint, size: 0.28 })
    oldText.position.set(0, 0.78, 0.3)
    edit.add(oldText)
    const arrow = makeArrow([0, 0.42, 0.3], [0, 0.06, 0.3], HEX.violet, { head: 0.12 })
    edit.add(arrow)
    const newText = makeChip('“Sam is my ex-partner”', { color: INK.violet, fill: INK.paper, border: INK.violet, size: 0.28 })
    newText.position.set(0, -0.26, 0.3)
    edit.add(newText)
    const pipeline = makeLabel('re-run the embedding model  ·  upsert by id', { color: INK.mute, size: 0.23 })
    pipeline.position.set(0, -0.92, 0.3)
    edit.add(pipeline)
    const strip = vectorStrip(34, 8, { cell: 0.12, height: 0.34 })
    strip.position.set(0, -1.26, 0.3)
    edit.add(strip)

    /* right: the neighbourhood has to be repaired */
    const space = titledCard(4.9, 3.0, '2 · the graph is repaired around it', { fill: HEX.paper })
    space.position.set(2.9, 2.3, 0)
    group.add(space)
    const cloud = Array.from({ length: 22 }, (_, i) => {
      const head = dot(HEX.grey, 0.075, 0.55)
      head.position.set((noise(i + 3) - 0.5) * 4.1, (noise(i + 61) - 0.5) * 2.1, 0.1)
      space.add(head)
      return head
    })
    const moving = dot(HEX.violet, 0.12)
    moving.position.set(-1.5, 0.55, 0.3)
    space.add(moving)
    const movingLabel = makeLabel('m3', { color: INK.violet, size: 0.24, bg: INK.paper })
    movingLabel.position.set(-1.5, 0.92, 0.4)
    space.add(movingLabel)
    const oldEdges = [0, 1, 2].map((i) => makeLine([-1.5, 0.55, 0.15], [cloud[i].position.x, cloud[i].position.y, 0.15], HEX.grey, 0.5))
    const newEdges = [8, 9, 10].map((i) => makeLine([1.35, -0.5, 0.15], [cloud[i].position.x, cloud[i].position.y, 0.15], HEX.violet, 0))
    oldEdges.forEach((line) => space.add(line))
    newEdges.forEach((line) => space.add(line))

    /* deletes are tombstones */
    const tomb = titledCard(4.9, 1.5, '3 · deletes are tombstones', { fill: HEX.paper, border: HEX.line })
    tomb.position.set(-2.9, -0.65, 0)
    group.add(tomb)
    const tombLabel = makeLabel('flagged in the index until a compaction pass runs', { color: INK.mute, size: 0.24 })
    tombLabel.position.set(0, 0, 0.3)
    tomb.add(tombLabel)

    /* the migration nobody plans for */
    const swap = titledCard(4.9, 1.5, '4 · change the embedding model', {
      fill: HEX.paper, border: HEX.red, titleColor: INK.red,
    })
    swap.position.set(2.9, -0.65, 0)
    group.add(swap)
    const swapLabel = new DynamicLabel({ color: INK.red, size: 0.26, maxChars: 40 })
    swapLabel.position.set(0, 0, 0.3)
    swap.add(swapLabel.sprite)

    const scatterLabel = new DynamicLabel({ color: INK.mute, size: 0.28, maxChars: 48 })
    scatterLabel.position.set(0, -1.75, 0.5)
    group.add(scatterLabel.sprite)

    const scatter = Array.from({ length: 30 }, (_, i) => {
      const head = dot(HEX.cyan, 0.08, 0.5)
      const ax = (noise(i + 200) - 0.5) * 9.0
      const ay = -2.5 + (noise(i + 400) - 0.5) * 1.3
      const bx = (noise(i + 600) - 0.5) * 9.0
      const by = -2.5 + (noise(i + 800) - 0.5) * 1.3
      head.position.set(ax, ay, 0.1)
      group.add(head)
      return { head, ax, ay, bx, by }
    })

    const verdict = makeChip('the embedding model is part of your schema: changing it rewrites everything', {
      color: INK.amber, fill: 'rgba(214,111,40,0.10)', border: INK.amber, size: 0.3,
    })
    verdict.position.set(0, -3.8, 0.5)
    group.add(verdict)

    return (p, t) => {
      const editIn = ramp(p, 0.02, 0.14)
      oldText.material.opacity = editIn * 0.9
      arrow.userData.shaft.material.opacity = ramp(p, 0.12, 0.2)
      arrow.userData.tip.material.opacity = ramp(p, 0.12, 0.2)
      newText.material.opacity = ramp(p, 0.16, 0.26)
      pipeline.material.opacity = ramp(p, 0.24, 0.34)
      strip.material.opacity = ramp(p, 0.3, 0.42)

      const move = ramp(p, 0.4, 0.6, ease.inOut)
      const mx = -1.5 + move * 2.85
      const my = 0.55 - move * 1.05
      moving.position.set(mx, my, 0.3)
      movingLabel.position.set(mx, my + 0.37, 0.4)
      oldEdges.forEach((line, i) => {
        setLinePoints(line, [mx, my, 0.15], [cloud[i].position.x, cloud[i].position.y, 0.15])
        line.material.opacity = (1 - move) * 0.5
      })
      newEdges.forEach((line, i) => {
        setLinePoints(line, [mx, my, 0.15], [cloud[8 + i].position.x, cloud[8 + i].position.y, 0.15])
        line.material.opacity = move * 0.7
      })

      const tombIn = ramp(p, 0.6, 0.7)
      tombLabel.material.opacity = tombIn
      const swapIn = ramp(p, 0.72, 0.8)
      swapLabel.setText(swapIn > 0.4 ? 'every vector you hold is now meaningless' : '')
      swapLabel.opacity = swapIn

      const rescatter = ramp(p, 0.78, 0.94, ease.inOut)
      scatterLabel.setText(
        rescatter > 0.02 ? (rescatter > 0.9 ? 'every memory re-embedded and moved' : 're-embedding every memory you hold') : '',
        rescatter > 0.9 ? INK.violet : INK.mute
      )
      scatterLabel.opacity = ramp(p, 0.76, 0.84)
      scatter.forEach((point) => {
        point.head.position.x = point.ax + (point.bx - point.ax) * rescatter
        point.head.position.y = point.ay + (point.by - point.ay) * rescatter
        point.head.material.color.set(rescatter > 0.5 ? HEX.violet : HEX.cyan)
        point.head.material.opacity = 0.5 + Math.sin(t * 1.5 + point.ax) * 0.08
      })
      verdict.material.opacity = ramp(p, 0.9, 0.99)
    }
  }
}
VectorInternals.CHAPTERS = ['embed', 'normalize', 'cosine', 'hnsw', 'limits', 'mutate']


/* ============================================================
   GRAPH - extraction, resolution, two clocks, invalidation,
           traversal, communities
   ============================================================ */

/* An entity node: a filled circle with a name that stays upright. */
function entityNode(name, { colour = HEX.grey, ink = INK.dim, radius = 0.16, labelSize = 0.26 } = {}) {
  const group = new THREE.Group()
  const core = new THREE.Mesh(
    new THREE.CircleGeometry(radius, 24),
    new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: 0.95, depthWrite: false })
  )
  const halo = new THREE.Mesh(
    new THREE.CircleGeometry(radius * 2.1, 24),
    new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: 0.12, depthWrite: false })
  )
  halo.position.z = -0.01
  const label = makeLabel(name, { color: ink, size: labelSize, bg: INK.paper })
  label.position.set(0, radius + 0.26, 0.3)
  group.add(halo, core, label)
  group.userData = { core, halo, label, radius }
  return group
}

/* An edge with a relationship name floating at its midpoint.
   The name is a DynamicLabel rather than a tinted sprite: tinting a sprite
   multiplies its whole texture, which would turn the label's paper
   background into a solid block of colour the moment the edge is
   highlighted. Re-rendering the glyphs keeps the background paper. */
function relation(from, to, name, { colour = HEX.grey, ink = INK.mute, opacity = 0.7, dashed = false } = {}) {
  const group = new THREE.Group()
  const line = dashed
    ? makeDashedLine([from[0], from[1], 0.02], [to[0], to[1], 0.02], colour, { opacity, dash: 0.13, gap: 0.1 })
    : makeLine([from[0], from[1], 0.02], [to[0], to[1], 0.02], colour, opacity)
  const label = new DynamicLabel({ color: ink, size: 0.22, bg: INK.paper, maxChars: name.length + 1, font: FONTS.mono(24) })
  label.setText(name, ink)
  label.position.set((from[0] + to[0]) / 2, (from[1] + to[1]) / 2, 0.25)
  group.add(line, label.sprite)
  group.userData = {
    line,
    label,
    name,
    /* Paint the edge and its name together. */
    paint(lineColour, textInk, lineOpacity, textOpacity = lineOpacity) {
      line.material.color.set(lineColour)
      line.material.opacity = lineOpacity
      label.setText(name, textInk)
      label.opacity = textOpacity
    },
  }
  return group
}

const MAYA_GRAPH = {
  maya: { pos: [-1.5, 0.35], name: 'Maya', colour: HEX.amber, ink: INK.amber, radius: 0.22 },
  peanuts: { pos: [0.85, 1.75], name: 'Peanuts' },
  luna: { pos: [1.15, -0.7], name: 'Luna' },
  sam: { pos: [-3.3, -1.15], name: 'Sam' },
  italian: { pos: [3.3, -1.5], name: 'Italian' },
  rule: { pos: [3.4, 1.4], name: 'check the menu' },
}

class GraphInternals extends InternalView {
  /* ---- 1. sentences become triples ---- */
  chapter_extract(group) {
    const utterance = titledCard(7.4, 1.15, 'what she actually said', { fill: HEX.paper })
    utterance.position.set(0, 3.7, 0)
    group.add(utterance)
    const utteranceLabel = makeLabel('“I can’t do the Thai place, peanut allergy. Book Luna instead.”', {
      color: INK.text, size: 0.3,
    })
    utteranceLabel.position.z = 0.2
    utterance.add(utteranceLabel)

    const extractor = makeCard(4.2, 0.78, { fill: HEX.paperAlt, border: HEX.violet, borderOpacity: 0.9 })
    extractor.position.set(0, 2.35, 0)
    const extractorLabel = makeLabel('extraction model', { color: INK.violet, size: 0.28 })
    extractorLabel.position.z = 0.2
    extractor.add(extractorLabel)
    group.add(extractor)
    const feed = makeArrow([0, 3.08, 0.3], [0, 2.8, 0.3], HEX.grey, { head: 0.11 })
    group.add(feed)
    const emit = makeArrow([0, 1.92, 0.3], [0, 1.64, 0.3], HEX.violet, { head: 0.11 })
    group.add(emit)

    const TRIPLES = [
      { text: '(Maya) -[ALLERGIC_TO]-> (Peanuts)', y: 1.2 },
      { text: '(Maya) -[BOOKED]-> (Luna)', y: 0.62 },
      { text: '(Luna) -[CUISINE]-> (Italian)', y: 0.04 },
    ]
    const triples = TRIPLES.map((triple) => {
      const card = makeCard(6.6, 0.5, { fill: HEX.paper, border: HEX.violet, borderOpacity: 0.75 })
      card.position.set(0, triple.y, 0.05)
      const label = makeLabel(triple.text, { color: INK.violet, size: 0.27 })
      label.position.z = 0.2
      card.add(label)
      card.userData.label = label
      group.add(card)
      return card
    })

    const built = new THREE.Group()
    built.position.set(0, -2.15, 0)
    group.add(built)
    const NODES = {
      maya: [-2.3, 0.3], peanuts: [0, 0.95], luna: [0.2, -0.55], italian: [2.4, -0.75],
    }
    const nodes = Object.entries(NODES).map(([id, pos]) => {
      const node = entityNode(id === 'maya' ? 'Maya' : id[0].toUpperCase() + id.slice(1), {
        colour: id === 'maya' ? HEX.amber : HEX.grey,
        ink: id === 'maya' ? INK.amber : INK.dim,
        radius: id === 'maya' ? 0.2 : 0.15,
      })
      node.position.set(pos[0], pos[1], 0.1)
      built.add(node)
      return { id, node }
    })
    const edges = [
      relation(NODES.maya, NODES.peanuts, 'ALLERGIC_TO', { colour: HEX.amber, ink: INK.amber }),
      relation(NODES.maya, NODES.luna, 'BOOKED', { colour: HEX.grey }),
      relation(NODES.luna, NODES.italian, 'CUISINE', { colour: HEX.grey }),
    ]
    edges.forEach((edge) => built.add(edge))

    const cost = makeChip('one model call on every write  ·  this is the substrate’s real bill', {
      color: INK.red, fill: 'rgba(196,73,85,0.09)', border: INK.red, size: 0.3,
    })
    cost.position.set(0, -3.55, 0.5)
    group.add(cost)

    const verdict = makeChip('the graph is only ever as good as its extraction step', {
      color: INK.amber, fill: 'rgba(214,111,40,0.10)', border: INK.amber, size: 0.32,
    })
    verdict.position.set(0, -4.15, 0.5)
    group.add(verdict)

    return (p, t) => {
      utteranceLabel.material.opacity = ramp(p, 0.02, 0.12)
      const feedIn = ramp(p, 0.1, 0.18)
      feed.userData.shaft.material.opacity = feedIn * 0.7
      feed.userData.tip.material.opacity = feedIn * 0.7
      const extractIn = ramp(p, 0.16, 0.26)
      extractor.userData.plane.material.opacity = extractIn
      extractor.userData.edges.material.opacity = extractIn * 0.9
      extractorLabel.material.opacity = extractIn
      extractor.scale.setScalar(1 + Math.sin(t * 3) * 0.006 * extractIn)
      const emitIn = ramp(p, 0.26, 0.34)
      emit.userData.shaft.material.opacity = emitIn * 0.8
      emit.userData.tip.material.opacity = emitIn * 0.8

      triples.forEach((card, i) => {
        const shown = ramp(p, 0.32 + i * 0.08, 0.44 + i * 0.08)
        card.userData.plane.material.opacity = shown
        card.userData.edges.material.opacity = shown * 0.75
        card.userData.label.material.opacity = shown
        card.position.x = (1 - shown) * -1.2
      })

      nodes.forEach((entry, i) => {
        const shown = ramp(p, 0.58 + i * 0.05, 0.7 + i * 0.05)
        entry.node.userData.core.material.opacity = shown * 0.95
        entry.node.userData.halo.material.opacity = shown * 0.12
        entry.node.userData.label.material.opacity = shown
        entry.node.scale.setScalar(0.6 + shown * 0.4)
      })
      edges.forEach((edge, i) => {
        const shown = ramp(p, 0.66 + i * 0.05, 0.78 + i * 0.05)
        edge.userData.line.material.opacity = shown * 0.75
        edge.userData.label.opacity = shown
      })
      cost.material.opacity = ramp(p, 0.84, 0.92)
      verdict.material.opacity = ramp(p, 0.9, 0.99)
    }
  }

  /* ---- 2. deciding that two names are one thing ---- */
  chapter_resolve(group) {
    group.add(sceneLabel('THREE MENTIONS, ONE PERSON?', -2.6, 4.05, { size: 0.28, color: INK.mute }))
    const MENTIONS = ['“Sam”', '“Sammy”', '“my partner”']
    const mentions = MENTIONS.map((text, i) => {
      const chip = makeChip(text, { color: INK.dim, fill: INK.paper, border: INK.faint, size: 0.3 })
      chip.position.set(-3.7, 3.25 - i * 0.72, 0.4)
      group.add(chip)
      return chip
    })

    const candidate = titledCard(5.2, 2.3, 'candidate match', { fill: HEX.paper, border: HEX.cyan, titleColor: INK.cyan })
    candidate.position.set(2.0, 2.5, 0)
    group.add(candidate)
    const candidateBlock = makeTextBlock([
      { text: 'existing node   Sam (person)', color: INK.dim },
      { text: 'embedding sim   0.93', color: INK.cyan },
      { text: 'shared edges    PARTNER, LIVES_WITH', color: INK.dim },
      { text: 'model verdict   same entity', color: INK.green },
    ], { width: 4.95, lineHeight: 0.4, fontSize: 20, bg: null })
    candidateBlock.position.z = 0.05
    candidate.add(candidateBlock)

    const merged = entityNode('Sam', { colour: HEX.green, ink: INK.green, radius: 0.26, labelSize: 0.3 })
    merged.position.set(-1.4, 0.55, 0.2)
    group.add(merged)
    const aliases = makeLabel('aliases: Sam, Sammy, my partner', { color: INK.mute, size: 0.24, bg: INK.paper })
    aliases.position.set(-1.4, -0.1, 0.4)
    group.add(aliases)
    const spokes = MENTIONS.map((_, i) => makeLine([-3.7, 3.25 - i * 0.72, 0.05], [-1.4, 0.55, 0.05], HEX.green, 0))
    spokes.forEach((line) => group.add(line))

    group.add(sceneLabel('AND BOTH WAYS OF GETTING IT WRONG', 0, -1.15, { size: 0.28, color: INK.red }))
    const FAILURES = [
      {
        x: -2.7, title: 'over-merged',
        lines: ['two different people called Alex', 'become one incoherent entity'],
      },
      {
        x: 2.7, title: 'under-merged',
        lines: ['one person split across nodes that', 'no traversal ever visits together'],
      },
    ]
    const failures = FAILURES.map((failure) => {
      const card = titledCard(5.0, 1.5, failure.title, { fill: HEX.paper, border: HEX.red, titleColor: INK.red })
      card.position.set(failure.x, -2.15, 0)
      group.add(card)
      const block = makeTextBlock(failure.lines.map((text) => ({ text, color: INK.dim })), {
        width: 4.75, lineHeight: 0.38, fontSize: 19, bg: null,
      })
      block.position.z = 0.05
      card.add(block)
      return { card, block }
    })

    const verdict = makeChip('identity is a judgement call, and it is where graphs go wrong first', {
      color: INK.amber, fill: 'rgba(214,111,40,0.10)', border: INK.amber, size: 0.32,
    })
    verdict.position.set(0, -3.7, 0.5)
    group.add(verdict)

    return (p, t) => {
      mentions.forEach((chip, i) => {
        chip.material.opacity = ramp(p, 0.02 + i * 0.06, 0.14 + i * 0.06)
      })
      const candidateIn = ramp(p, 0.22, 0.36)
      candidate.userData.card.userData.plane.material.opacity = candidateIn
      candidate.userData.card.userData.edges.material.opacity = candidateIn * 0.9
      candidate.userData.label.material.opacity = candidateIn
      candidateBlock.material.opacity = candidateIn

      const mergeIn = ramp(p, 0.42, 0.58)
      merged.userData.core.material.opacity = mergeIn * 0.95
      merged.userData.halo.material.opacity = mergeIn * 0.16
      merged.userData.label.material.opacity = mergeIn
      merged.scale.setScalar(0.6 + mergeIn * 0.4 + Math.sin(t * 2.4) * 0.01 * mergeIn)
      aliases.material.opacity = ramp(p, 0.54, 0.64)
      spokes.forEach((line, i) => {
        line.material.opacity = ramp(p, 0.4 + i * 0.05, 0.52 + i * 0.05) * 0.55
      })

      failures.forEach((failure, i) => {
        const shown = ramp(p, 0.68 + i * 0.07, 0.8 + i * 0.07)
        failure.card.userData.card.userData.plane.material.opacity = shown
        failure.card.userData.card.userData.edges.material.opacity = shown * 0.9
        failure.card.userData.label.material.opacity = shown
        failure.block.material.opacity = shown
      })
      verdict.material.opacity = ramp(p, 0.88, 0.98)
    }
  }

  /* ---- 3. two clocks ---- */
  chapter_bitemporal(group) {
    const chart = titledCard(6.9, 5.6, 'every edge carries two independent timestamps', { fill: HEX.paper })
    chart.position.set(-1.75, 0.85, 0)
    group.add(chart)

    const axisX = makeArrow([-3.0, -2.35, 0.1], [3.0, -2.35, 0.1], HEX.grey, { head: 0.12, opacity: 0.7 })
    const axisY = makeArrow([-3.0, -2.35, 0.1], [-3.0, 2.3, 0.1], HEX.grey, { head: 0.12, opacity: 0.7 })
    chart.add(axisX, axisY)
    const xLabel = makeLabel('valid time  ·  when it was true in the world', { color: INK.mute, size: 0.24 })
    xLabel.position.set(0.15, -2.68, 0.3)
    const yLabel = makeLabel('transaction time', { color: INK.mute, size: 0.24 })
    yLabel.position.set(-1.85, 2.5, 0.3)
    chart.add(xLabel, yLabel)

    for (let i = 0; i < 5; i += 1) {
      const gx = -3.0 + (i + 1) * 1.18
      chart.add(makeDashedLine([gx, -2.35, 0], [gx, 2.05, 0], HEX.line, { opacity: 0.3, dash: 0.08, gap: 0.1 }))
    }

    const span = makeLine([-2.1, -0.55, 0.2], [1.5, -0.55, 0.2], HEX.green, 0)
    chart.add(span)
    const spanLabel = makeLabel('PARTNER edge: valid 2025-03-02 to 2026-08-18', { color: INK.green, size: 0.24, bg: INK.paper })
    spanLabel.position.set(-0.3, -0.19, 0.35)
    chart.add(spanLabel)
    const startDot = dot(HEX.green, 0.11)
    startDot.position.set(-2.1, -0.55, 0.25)
    const endDot = dot(HEX.red, 0.11)
    endDot.position.set(1.5, -0.55, 0.25)
    chart.add(startDot, endDot)

    const learned = dot(HEX.violet, 0.12)
    learned.position.set(2.15, 0.85, 0.25)
    chart.add(learned)
    const learnedLabel = makeLabel('recorded 2026-08-20', { color: INK.violet, size: 0.24, bg: INK.paper })
    learnedLabel.position.set(1.95, 1.24, 0.35)
    chart.add(learnedLabel)
    const gap = makeDashedLine([1.5, -0.55, 0.2], [2.15, 0.85, 0.2], HEX.violet, { opacity: 0, dash: 0.1, gap: 0.08 })
    chart.add(gap)
    const gapLabel = makeLabel('two days of being wrong', { color: INK.violet, size: 0.23, bg: INK.paper })
    gapLabel.position.set(1.9, 0.12, 0.4)
    chart.add(gapLabel)

    const questions = titledCard(3.4, 2.9, 'two different questions', { fill: HEX.paperAlt })
    questions.position.set(3.55, 2.05, 0)
    group.add(questions)
    const qBlock = makeTextBlock([
      { text: 'what was true', color: INK.mute },
      { text: 'on Friday?', color: INK.green },
      { text: '' },
      { text: 'what did the agent', color: INK.mute },
      { text: 'believe on Friday?', color: INK.violet },
    ], { width: 3.15, lineHeight: 0.38, fontSize: 19, bg: null })
    qBlock.position.z = 0.05
    questions.add(qBlock)

    const verdict = makeChip('one timestamp cannot tell being wrong apart from being late', {
      color: INK.amber, fill: 'rgba(214,111,40,0.10)', border: INK.amber, size: 0.32,
    })
    verdict.position.set(0, -3.5, 0.5)
    group.add(verdict)

    return (p, t) => {
      const axesIn = ramp(p, 0.02, 0.14)
      ;[axisX, axisY].forEach((axis) => {
        axis.userData.shaft.material.opacity = axesIn * 0.7
        axis.userData.tip.material.opacity = axesIn * 0.7
      })
      xLabel.material.opacity = axesIn
      yLabel.material.opacity = axesIn

      const grow = ramp(p, 0.2, 0.44, ease.inOut)
      setLinePoints(span, [-2.1, -0.55, 0.2], [-2.1 + grow * 3.6, -0.55, 0.2])
      span.material.opacity = grow * 0.95
      startDot.material.opacity = ramp(p, 0.2, 0.28)
      spanLabel.material.opacity = ramp(p, 0.28, 0.4)
      endDot.material.opacity = ramp(p, 0.44, 0.52)

      const learnIn = ramp(p, 0.54, 0.66)
      learned.material.opacity = learnIn
      learnedLabel.material.opacity = learnIn
      learned.scale.setScalar(1 + Math.sin(t * 3) * 0.08 * learnIn)
      gap.material.opacity = ramp(p, 0.6, 0.7) * 0.85
      gapLabel.material.opacity = ramp(p, 0.64, 0.74)

      const qIn = ramp(p, 0.76, 0.88)
      questions.userData.card.userData.plane.material.opacity = qIn
      questions.userData.card.userData.edges.material.opacity = qIn * 0.85
      questions.userData.label.material.opacity = qIn
      qBlock.material.opacity = qIn
      verdict.material.opacity = ramp(p, 0.9, 0.99)
    }
  }

  /* ---- 4. facts expire, they do not disappear ---- */
  chapter_invalidate(group) {
    const stage = new THREE.Group()
    stage.position.set(-0.4, 1.5, 0)
    group.add(stage)

    const nodes = Object.fromEntries(Object.entries(MAYA_GRAPH).map(([id, def]) => {
      const node = entityNode(def.name, {
        colour: def.colour ?? HEX.grey, ink: def.ink ?? INK.dim, radius: def.radius ?? 0.15,
      })
      node.position.set(def.pos[0], def.pos[1], 0.1)
      stage.add(node)
      return [id, node]
    }))

    const partner = relation(MAYA_GRAPH.maya.pos, MAYA_GRAPH.sam.pos, 'PARTNER', { colour: HEX.grey })
    const others = [
      relation(MAYA_GRAPH.maya.pos, MAYA_GRAPH.peanuts.pos, 'ALLERGIC_TO', { colour: HEX.grey }),
      relation(MAYA_GRAPH.maya.pos, MAYA_GRAPH.luna.pos, 'BOOKED', { colour: HEX.grey }),
      relation(MAYA_GRAPH.luna.pos, MAYA_GRAPH.italian.pos, 'CUISINE', { colour: HEX.grey }),
      relation(MAYA_GRAPH.peanuts.pos, MAYA_GRAPH.rule.pos, 'REQUIRES', { colour: HEX.grey }),
    ]
    stage.add(partner)
    others.forEach((edge) => stage.add(edge))

    const stamp = makeChip('invalid_at = 2026-08-18', {
      color: INK.red, fill: 'rgba(196,73,85,0.10)', border: INK.red, size: 0.26,
    })
    stamp.position.set(-1.35, -1.9, 0.5)
    stamp.material.opacity = 0
    stage.add(stamp)

    const event = makeChip('“Sam and I broke up”', { color: INK.violet, fill: INK.paper, border: INK.violet, size: 0.3 })
    event.position.set(0, 4.0, 0.6)
    group.add(event)

    const filters = [
      { text: 'default: invalid_at IS NULL', ink: INK.cyan, border: INK.cyan, x: -2.6 },
      { text: 'rewind: as of 2026-08-10', ink: INK.violet, border: INK.violet, x: 2.6 },
    ].map((filter) => {
      const chip = makeChip(filter.text, { color: filter.ink, fill: INK.paper, border: filter.border, size: 0.3 })
      chip.position.set(filter.x, -2.0, 0.6)
      group.add(chip)
      return chip
    })

    const readout = new DynamicLabel({ color: INK.dim, size: 0.3, maxChars: 52 })
    readout.position.set(0, -2.75, 0.5)
    group.add(readout.sprite)

    const note = makeChip('the edge is never deleted: history is the same structure, read with a different clause', {
      color: INK.mute, fill: 'rgba(255,253,248,0.94)', border: INK.faint, size: 0.28,
    })
    note.position.set(0, -3.4, 0.5)
    group.add(note)

    const verdict = makeChip('invalidation keeps the past queryable instead of throwing it away', {
      color: INK.amber, fill: 'rgba(214,111,40,0.10)', border: INK.amber, size: 0.32,
    })
    verdict.position.set(0, -4.05, 0.5)
    group.add(verdict)

    return (p, t) => {
      const graphIn = ramp(p, 0.02, 0.16)
      Object.values(nodes).forEach((node) => {
        node.userData.core.material.opacity = graphIn * 0.95
        node.userData.halo.material.opacity = graphIn * 0.12
        node.userData.label.material.opacity = graphIn
      })
      others.forEach((edge) => {
        edge.userData.line.material.opacity = graphIn * 0.7
        edge.userData.label.opacity = graphIn * 0.9
      })

      event.material.opacity = ramp(p, 0.2, 0.3)
      const expire = ramp(p, 0.32, 0.46)
      partner.userData.paint(
        expire > 0.3 ? HEX.red : HEX.grey,
        expire > 0.3 ? INK.red : INK.mute,
        graphIn * (0.7 - expire * 0.42),
        graphIn * (1 - expire * 0.45)
      )
      stamp.material.opacity = expire
      nodes.sam.userData.core.material.opacity = graphIn * (0.95 - expire * 0.5)
      nodes.sam.userData.label.material.opacity = graphIn * (1 - expire * 0.45)

      const present = window01(p, 0.52, 0.74, 0.03)
      const past = ramp(p, 0.78, 0.88)
      filters[0].material.opacity = present
      filters[1].material.opacity = past

      if (past > 0.4) {
        partner.userData.paint(HEX.violet, INK.violet, 0.9, 1)
        nodes.sam.userData.core.material.color.set(HEX.violet)
        nodes.sam.userData.core.material.opacity = 0.95
        nodes.sam.userData.label.material.opacity = 1
        stamp.material.opacity = 0.25
      } else {
        nodes.sam.userData.core.material.color.set(HEX.grey)
        if (present > 0.4) {
          partner.userData.line.material.opacity = 0.08
          partner.userData.label.opacity = 0.12
        }
      }

      readout.setText(
        past > 0.4 ? 'on 08-10 the PARTNER edge was still current'
          : present > 0.4 ? 'the expired edge is simply filtered out of the answer'
            : '',
        past > 0.4 ? INK.violet : INK.cyan
      )
      readout.opacity = Math.max(present, past)
      note.material.opacity = ramp(p, 0.86, 0.94)
      verdict.material.opacity = ramp(p, 0.92, 0.99)
      stage.position.y = 1.5 + Math.sin(t * 0.6) * 0.012
    }
  }

  /* ---- 5. the answer is a path ---- */
  chapter_traverse(group) {
    const question = makeChip('“somewhere for dinner on Friday”', {
      color: INK.cyan, fill: INK.paper, border: INK.cyan, size: 0.34,
    })
    question.position.set(0, 4.05, 0.6)
    group.add(question)

    const stage = new THREE.Group()
    stage.position.set(-0.5, 1.35, 0)
    group.add(stage)

    const nodes = Object.fromEntries(Object.entries(MAYA_GRAPH).map(([id, def]) => {
      const node = entityNode(def.name, {
        colour: def.colour ?? HEX.grey, ink: def.ink ?? INK.dim, radius: def.radius ?? 0.15,
      })
      node.position.set(def.pos[0], def.pos[1], 0.1)
      stage.add(node)
      return [id, node]
    }))

    const EDGES = [
      { id: 'allergy', a: 'maya', b: 'peanuts', name: 'ALLERGIC_TO', hop: 1 },
      { id: 'booked', a: 'maya', b: 'luna', name: 'BOOKED', hop: 1 },
      { id: 'partner', a: 'maya', b: 'sam', name: 'PARTNER', hop: 1, expired: true },
      { id: 'cuisine', a: 'luna', b: 'italian', name: 'CUISINE', hop: 2 },
      { id: 'rule', a: 'peanuts', b: 'rule', name: 'REQUIRES', hop: 2 },
    ].map((edge) => {
      const line = relation(MAYA_GRAPH[edge.a].pos, MAYA_GRAPH[edge.b].pos, edge.name, { colour: HEX.grey })
      stage.add(line)
      return { ...edge, group: line }
    })

    const frontier = new THREE.Mesh(
      new THREE.RingGeometry(0.96, 1.02, 64),
      new THREE.MeshBasicMaterial({ color: HEX.cyan, transparent: true, opacity: 0, depthWrite: false })
    )
    frontier.position.set(MAYA_GRAPH.maya.pos[0], MAYA_GRAPH.maya.pos[1], 0.05)
    stage.add(frontier)

    const skipped = makeChip('invalid_at is set  ·  skipped', {
      color: INK.red, fill: 'rgba(196,73,85,0.10)', border: INK.red, size: 0.25,
    })
    skipped.position.set(-3.3, -1.75, 0.5)
    skipped.material.opacity = 0
    stage.add(skipped)

    const hopLabel = new DynamicLabel({ color: INK.cyan, size: 0.3, maxChars: 40 })
    hopLabel.position.set(0, -1.55, 0.5)
    group.add(hopLabel.sprite)

    const answer = titledCard(9.4, 1.5, 'what actually reaches the model', {
      fill: HEX.paper, border: HEX.cyan, titleColor: INK.cyan,
    })
    answer.position.set(0, -2.6, 0)
    group.add(answer)
    const answerBlock = makeTextBlock([
      { text: 'hop 1   Maya ALLERGIC_TO Peanuts        a hard constraint', color: INK.dim },
      { text: 'hop 2   Peanuts REQUIRES check the menu  a learned procedure', color: INK.dim },
      { text: 'hop 2   Luna CUISINE Italian             a precedent that worked', color: INK.dim },
    ], { width: 9.1, lineHeight: 0.38, fontSize: 19, bg: null })
    answerBlock.position.z = 0.05
    answer.add(answerBlock)

    const verdict = makeChip('a constraint two hops away still arrives, because structure connects them', {
      color: INK.amber, fill: 'rgba(214,111,40,0.10)', border: INK.amber, size: 0.3,
    })
    verdict.position.set(0, -4.0, 0.5)
    group.add(verdict)

    return (p, t) => {
      question.material.opacity = ramp(p, 0, 0.08)
      const graphIn = ramp(p, 0.04, 0.18)
      Object.values(nodes).forEach((node) => {
        node.userData.core.material.opacity = graphIn * 0.9
        node.userData.halo.material.opacity = graphIn * 0.1
        node.userData.label.material.opacity = graphIn * 0.95
      })
      EDGES.forEach((edge) => {
        edge.group.userData.line.material.opacity = graphIn * 0.4
        edge.group.userData.label.opacity = graphIn * 0.55
      })

      const anchor = ramp(p, 0.18, 0.28)
      nodes.maya.userData.halo.material.opacity = anchor * (0.28 + Math.sin(t * 3) * 0.08)

      const expand = ramp(p, 0.28, 0.72, ease.linear) * 2.6
      frontier.material.opacity = expand > 0.05 && expand < 2.5 ? 0.4 : 0
      frontier.scale.setScalar(Math.max(0.05, expand))

      EDGES.forEach((edge) => {
        const reached = expand >= edge.hop * 0.95
        if (!reached) return
        if (edge.expired) {
          edge.group.userData.paint(HEX.red, INK.faint, 0.22, 0.3)
          nodes.sam.userData.core.material.opacity = 0.25
          nodes.sam.userData.label.material.opacity = 0.3
        } else {
          edge.group.userData.paint(HEX.cyan, INK.cyan, 0.95, 1)
          const target = nodes[edge.b]
          target.userData.core.material.color.set(HEX.cyan)
          target.userData.halo.material.color.set(HEX.cyan)
          target.userData.halo.material.opacity = 0.2
        }
      })
      skipped.material.opacity = ramp(p, 0.42, 0.52)

      hopLabel.setText(
        expand < 1 ? '' : expand < 2 ? 'hop 1: direct facts about Maya' : 'hop 2: facts about the things those facts point at'
      )
      hopLabel.opacity = ramp(p, 0.34, 0.44)

      const answerIn = ramp(p, 0.72, 0.86)
      answer.userData.card.userData.plane.material.opacity = answerIn
      answer.userData.card.userData.edges.material.opacity = answerIn * 0.9
      answer.userData.label.material.opacity = answerIn
      answerBlock.material.opacity = answerIn
      verdict.material.opacity = ramp(p, 0.9, 0.99)
    }
  }

  /* ---- 6. zooming out ---- */
  chapter_community(group) {
    const CLUSTERS = [
      { id: 'food', centre: [-3.0, 1.6], colour: HEX.amber, ink: INK.amber, count: 11, seed: 5, summary: 'how she eats: allergies, timing, cuisines that worked' },
      { id: 'people', centre: [0.4, 2.3], colour: HEX.violet, ink: INK.violet, count: 9, seed: 41, summary: 'who is around her, and since when' },
      { id: 'work', centre: [3.3, 1.3], colour: HEX.cyan, ink: INK.cyan, count: 12, seed: 77, summary: 'projects, deadlines, standing decisions' },
    ]
    const stage = new THREE.Group()
    stage.position.set(0, 0.7, 0)
    group.add(stage)

    const clusters = CLUSTERS.map((cluster) => {
      const nodes = Array.from({ length: cluster.count }, (_, i) => {
        const angle = noise(i + cluster.seed) * Math.PI * 2
        const radius = 0.25 + noise(i + cluster.seed + 300) * 1.05
        const x = cluster.centre[0] + Math.cos(angle) * radius
        const y = cluster.centre[1] + Math.sin(angle) * radius * 0.78
        const head = dot(HEX.grey, 0.085, 0.7)
        head.position.set(x, y, 0.1)
        stage.add(head)
        return { head, x, y }
      })
      const links = nodes.slice(1).map((node, i) => {
        const other = nodes[i % Math.max(1, nodes.length - 1)]
        const line = makeLine([node.x, node.y, 0.02], [other.x, other.y, 0.02], HEX.line, 0.5)
        stage.add(line)
        return line
      })
      const hull = new THREE.Mesh(
        new THREE.CircleGeometry(1.35, 40),
        new THREE.MeshBasicMaterial({ color: cluster.colour, transparent: true, opacity: 0, depthWrite: false })
      )
      hull.position.set(cluster.centre[0], cluster.centre[1], -0.02)
      hull.scale.y = 0.82
      stage.add(hull)
      const name = makeLabel(cluster.id, { color: cluster.ink, size: 0.26, bg: INK.paper })
      name.position.set(cluster.centre[0], cluster.centre[1] - 1.28, 0.4)
      name.material.opacity = 0
      stage.add(name)
      return { ...cluster, nodes, links, hull, name }
    })

    const summaries = CLUSTERS.map((cluster, i) => {
      const card = makeCard(9.6, 0.66, { fill: HEX.paper, border: cluster.colour, borderOpacity: 0.85 })
      card.position.set(0, -1.35 - i * 0.8, 0.1)
      const label = makeLabel(`${cluster.id}:  ${cluster.summary}`, { color: cluster.ink, size: 0.26 })
      label.position.set(-4.6 + label.scale.x / 2, 0, 0.2)
      card.add(label)
      card.userData.label = label
      group.add(card)
      return card
    })
    group.add(sceneLabel('A MODEL WRITES ONE SUMMARY PER CLUSTER, AHEAD OF TIME', 0, -0.8, { size: 0.26, color: INK.mute }))

    const routes = [
      { text: '“what do you know about how I eat?”  ->  read the summaries', ink: INK.violet, border: INK.violet, y: -3.72 },
      { text: '“can she eat at Luna?”  ->  traverse the raw edges', ink: INK.cyan, border: INK.cyan, y: -4.24 },
    ].map((route) => {
      const chip = makeChip(route.text, { color: route.ink, fill: INK.paper, border: route.border, size: 0.28 })
      chip.position.set(0, route.y, 0.5)
      group.add(chip)
      return chip
    })

    return (p, t) => {
      clusters.forEach((cluster, ci) => {
        const shown = ramp(p, 0.02 + ci * 0.05, 0.18 + ci * 0.05)
        cluster.nodes.forEach((node, i) => {
          node.head.material.opacity = shown * 0.7
          node.head.position.y = node.y + Math.sin(t * 0.7 + i) * 0.014
        })
        cluster.links.forEach((line) => { line.material.opacity = shown * 0.4 })

        const grouped = ramp(p, 0.3 + ci * 0.07, 0.46 + ci * 0.07)
        cluster.hull.material.opacity = grouped * 0.1
        cluster.name.material.opacity = grouped
        cluster.nodes.forEach((node) => {
          node.head.material.color.set(grouped > 0.4 ? cluster.colour : HEX.grey)
        })
      })

      summaries.forEach((card, i) => {
        const shown = ramp(p, 0.58 + i * 0.07, 0.7 + i * 0.07)
        card.userData.plane.material.opacity = shown
        card.userData.edges.material.opacity = shown * 0.85
        card.userData.label.material.opacity = shown
        card.position.x = (1 - shown) * -0.8
      })
      routes.forEach((chip, i) => {
        chip.material.opacity = ramp(p, 0.8 + i * 0.06, 0.9 + i * 0.06)
      })
    }
  }
}
GraphInternals.CHAPTERS = ['extract', 'resolve', 'bitemporal', 'invalidate', 'traverse', 'community']

export const INTERNAL_VIEWS = {
  files: FilesInternals,
  sqlite: SqliteInternals,
  vector: VectorInternals,
  graph: GraphInternals,
}

export const INTERNAL_CHAPTERS = {
  files: FilesInternals.CHAPTERS,
  sqlite: SqliteInternals.CHAPTERS,
  vector: VectorInternals.CHAPTERS,
  graph: GraphInternals.CHAPTERS,
}

