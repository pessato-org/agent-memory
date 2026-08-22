import * as THREE from 'three'
import {
  COL, createStage, dotTexture, makeLabel, makePacket, curveFrom, moveAlong,
  Timeline, ease, disposeGroup, whenVisible, reducedMotion,
} from './lib.js'

/* ============================================================
   Explorer: one canvas, four store views, three phases each.
   Each view: build() static group, phase(name) → looping Timeline,
   update(dt,t) idle motion.
   ============================================================ */

const C = (hex) => new THREE.Color(hex)

/* ---------- shared bits ---------- */

function contextTarget(x = 6.2, y = 2.4) {
  // the "context window" the retrieved memories fly into
  const g = new THREE.Group()
  const frame = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.PlaneGeometry(3.5, 3.5)),
    new THREE.LineBasicMaterial({ color: COL.cyan, transparent: true, opacity: 0.5 })
  )
  g.add(frame)
  const label = makeLabel('working context', { color: '#177a9b', size: 0.38, bg: '#fffdf8' })
  label.position.set(0, -2, 0)
  g.add(label)
  g.position.set(x, y, 0)
  return g
}

function pulseSprite(color, scale = 2.6) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({
    map: dotTexture(), color, transparent: true, opacity: 0,
    blending: THREE.NormalBlending, depthWrite: false,
  }))
  s.scale.set(scale, scale, 1)
  return s
}

/* ============================================================
   FILES VIEW - a living markdown document
   ============================================================ */

class FilesView {
  constructor(scene, { embedded = false } = {}) {
    this.scene = scene
    this.embedded = embedded
    this.group = new THREE.Group()
    scene.add(this.group)

    this.baseLines = [
      { text: '# Maya', c: '#202630' },
      { text: '' },
      { text: '## Preferences', c: '#667085' },
      { text: '- Allergic to peanuts (severe).', c: '#475467', id: 'm1' },
      { text: '- Dinner around 19:00.', c: '#475467' },
      { text: '' },
      { text: '## People', c: '#667085' },
      { text: "- Sam - Maya's partner.", c: '#475467', id: 'm3' },
      { text: '' },
      { text: '## History', c: '#667085' },
      { text: '- 08-04: Booked Luna (Italian),', c: '#475467', id: 'm2' },
      { text: '  Maya + Sam, Friday 19:00.', c: '#475467', id: 'm2b' },
      { text: '' },
      { text: '## Lessons', c: '#667085' },
      { text: '- Check menus for peanut', c: '#475467', id: 'm4' },
      { text: '  dishes before booking.', c: '#475467', id: 'm4b' },
    ]
    this.overrides = {} // id -> {color, strike}

    // canvas-textured page
    this.cw = 560; this.ch = 700
    this.canvas = document.createElement('canvas')
    this.canvas.width = this.cw * 2
    this.canvas.height = this.ch * 2
    this.ctx = this.canvas.getContext('2d')
    this.ctx.scale(2, 2)
    this.tex = new THREE.CanvasTexture(this.canvas)
    this.tex.colorSpace = THREE.SRGBColorSpace
    this.tex.anisotropy = 4

    const page = new THREE.Mesh(
      new THREE.PlaneGeometry(4.6, 5.75),
      new THREE.MeshBasicMaterial({ map: this.tex, transparent: true })
    )
    page.position.set(-1.6, 0.1, 0)
    const edge = new THREE.LineSegments(
      new THREE.EdgesGeometry(page.geometry),
      new THREE.LineBasicMaterial({ color: COL.line })
    )
    edge.position.copy(page.position)
    this.page = page
    this.group.add(page, edge)

    const fname = makeLabel('memory/maya.md', { color: '#475467', size: 0.36, bg: '#fffdf8' })
    fname.position.set(-1.6, 3.35, 0)
    this.group.add(fname)

    this.ctxTarget = contextTarget(4.9, 0.6)
    this.ctxTarget.visible = false
    this.group.add(this.ctxTarget)

    this.scanBar = new THREE.Mesh(
      new THREE.PlaneGeometry(4.6, 0.28),
      new THREE.MeshBasicMaterial({ color: COL.cyan, transparent: true, opacity: 0 })
    )
    this.scanBar.position.set(-1.6, 0, 0.02)
    this.group.add(this.scanBar)

    this.packet = makePacket(COL.amber)
    this.packet.visible = false
    this.group.add(this.packet)

    this.draw()
  }

  draw() {
    const g = this.ctx
    g.clearRect(0, 0, this.cw, this.ch)
    g.fillStyle = '#fffdf8'
    g.fillRect(0, 0, this.cw, this.ch)
    g.font = '26px "IBM Plex Mono", monospace'
    let y = 56
    for (const line of this.lines || this.baseLines) {
      const ov = line.id ? this.overrides[line.id] : null
      const color = ov?.color || line.c || '#475467'
      if (ov?.bg) {
        g.fillStyle = ov.bg
        g.fillRect(20, y - 26, this.cw - 40, 38)
      }
      g.fillStyle = color
      g.fillText(line.text, 36, y)
      if (ov?.strike && line.text) {
        g.strokeStyle = color
        g.lineWidth = 2
        const w = g.measureText(line.text).width
        g.beginPath(); g.moveTo(36, y - 9); g.lineTo(36 + w, y - 9); g.stroke()
      }
      y += 40
    }
    this.tex.needsUpdate = true
  }

  setOverride(id, ov) {
    if (ov) this.overrides[id] = ov
    else delete this.overrides[id]
    this.draw()
  }

  lineY(idx) {
    // world-space y of a given line index on the page
    const frac = (56 + idx * 40 - 16) / this.ch
    return this.page.position.y + 5.75 / 2 - frac * 5.75
  }

  phase(name) {
    const tl = new Timeline()
    this.overrides = {}
    this.lines = this.baseLines.map((l) => ({ ...l }))
    this.ctxTarget.visible = false
    this.packet.visible = false
    this.draw()

    if (name === 'store') {
      const target = this.baseLines.find((line) => line.id === 'm1').text
      const targetLine = this.lines.find((line) => line.id === 'm1')
      targetLine.text = ''
      this.overrides.m1 = { color: '#d66f28', bg: 'rgba(214,111,40,0.12)' }
      this.draw()

      if (!this.embedded) {
        const curve = curveFrom([[-8, 4.4, 1.2], [-5, 2.8, 0.8], [-1.6, this.lineY(3), 0.15]])
        tl.call(0.15, () => { this.packet.visible = true })
        tl.add(0.15, 1.4, (p) => moveAlong(this.packet, curve, p))
        tl.call(1.55, () => { this.packet.visible = false })
      }

      const typeAt = this.embedded ? 0.08 : 1.55
      tl.add(typeAt, 1.0, (p) => {
        targetLine.text = target.slice(0, Math.ceil(target.length * p))
        this.draw()
      }, ease.out)
      tl.call(typeAt + 2.15, () => this.setOverride('m1', null))
    }

    if (name === 'retrieve') {
      this.ctxTarget.visible = true
      const matches = [
        { id: 'm2', line: 10 }, { id: 'm2b', line: 11 },
        { id: 'm4', line: 14 }, { id: 'm4b', line: 15 },
        { id: 'm1', line: 3 },
      ]
      const retrieved = [
        { id: 'm2', line: 10, text: 'Luna · Friday 19:00' },
        { id: 'm4', line: 14, text: 'Check menu for peanuts' },
        { id: 'm1', line: 3, text: 'Peanut allergy · severe' },
      ]
      // scan bar sweeps the page
      tl.call(0.1, () => { this.scanBar.material.opacity = 0.25 })
      tl.add(0.1, 2.2, (p) => {
        this.scanBar.position.y = this.page.position.y + 2.7 - p * 5.4
        // highlight lines as the bar passes
        for (const m of matches) {
          if (this.scanBar.position.y < this.lineY(m.line) && !this.overrides[m.id]) {
            this.setOverride(m.id, { color: '#177a9b', bg: 'rgba(23,122,155,0.12)' })
          }
        }
      }, ease.linear)
      tl.call(2.4, () => { this.scanBar.material.opacity = 0 })
      // fly excerpts to context
      retrieved.forEach((m, i) => {
        const chip = makePacket(COL.cyan, 0.5)
        chip.visible = false
        this.group.add(chip)
        const result = makeLabel(m.text, { color: '#177a9b', size: 0.27, bg: '#fffdf8' })
        result.position.set(0, 1.02 - i * 0.78, 0.15)
        result.visible = false
        this.ctxTarget.add(result)
        const from = [-1.6, this.lineY(m.line), 0.2]
        const toY = 0.6 + result.position.y
        const curve = curveFrom([from, [1.6, from[1] + 0.7, 0.6], [4.9, toY, 0]])
        tl.call(2.6 + i * 0.35, () => { chip.visible = true })
        tl.add(2.6 + i * 0.35, 1.1, (p) => moveAlong(chip, curve, p))
        tl.call(3.75 + i * 0.35, () => { chip.visible = false; result.visible = true })
        tl.call(5.2, () => { result.visible = false })
      })
      tl.call(5.2, () => {
        for (const m of matches) this.setOverride(m.id, { color: '#475467' })
        this.overrides = {}
        this.draw()
      })
    }

    if (name === 'maintain') {
      tl.call(0.25, () => this.setOverride('m3', { color: '#c44955', bg: 'rgba(196,73,85,0.10)', strike: true }))
      tl.call(1.0, () => {
        const idx = this.lines.findIndex((l) => l.id === 'm3')
        this.lines[idx] = { text: '- Sam is now an ex-partner (08-18).', c: '#4f3377', id: 'm3b' }
        delete this.overrides.m3
        this.overrides.m3b = { color: '#4f3377', bg: 'rgba(114,84,163,0.18)' }
        this.draw()
      })
      tl.call(2.0, () => {
        const idx = this.lines.findIndex((l) => l.id === 'm2b')
        this.lines.splice(idx + 1, 0, { text: '- 08-18: Maya + Sam broke up.', c: '#4f3377', id: 'm5' })
        this.overrides.m5 = { color: '#4f3377', bg: 'rgba(114,84,163,0.12)' }
        this.draw()
      })
      tl.call(4.25, () => {
        this.overrides.m3b = null
        this.overrides.m5 = null
        this.draw()
      })
    }
    return tl
  }

  update(dt, t) {
    this.group.rotation.y = Math.sin(t * 0.3) * 0.05
  }

  dispose() {
    this.scene.remove(this.group)
    disposeGroup(this.group)
  }
}

/* ============================================================
   SQLITE VIEW - rows in a table
   ============================================================ */

class SqliteView {
  constructor(scene, { embedded = false } = {}) {
    this.scene = scene
    this.embedded = embedded
    this.group = new THREE.Group()
    scene.add(this.group)

    this.rowDefs = [
      { id: 'm1', label: "m1 · semantic  · allergic to peanuts", y: 1.5 },
      { id: 'm2', label: 'm2 · episodic  · booked Luna, Fri 19:00', y: 0.75 },
      { id: 'm3', label: "m3 · semantic  · Sam is Maya's partner", y: 0 },
      { id: 'm4', label: 'm4 · procedural· check menus for peanuts', y: -0.75 },
    ]
    this.rows = {}

    const header = makeLabel('memories  ·  subject = maya', { color: '#475467', size: 0.38, bg: '#fffdf8' })
    header.position.set(-1.2, 2.6, 0)
    this.group.add(header)

    // table frame
    const frame = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.PlaneGeometry(6.4, 3.9)),
      new THREE.LineBasicMaterial({ color: COL.line })
    )
    frame.position.set(-1.2, 0.4, -0.05)
    this.group.add(frame)

    for (const def of this.rowDefs) this.addRow(def)

    this.ctxTarget = contextTarget(4.9, 0.6)
    this.ctxTarget.visible = false
    this.group.add(this.ctxTarget)
  }

  addRow(def, color = 0xf7f4ed) {
    const g = new THREE.Group()
    const slab = new THREE.Mesh(
      new THREE.BoxGeometry(6, 0.52, 0.24),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.98 })
    )
    const edge = new THREE.LineSegments(
      new THREE.EdgesGeometry(slab.geometry),
      new THREE.LineBasicMaterial({ color: COL.grey, transparent: true, opacity: 0.6 })
    )
    const label = makeLabel(def.label, { color: '#475467', size: 0.34 })
    label.position.z = 0.2
    g.add(slab, edge, label)
    g.position.set(-1.2, def.y, 0)
    g.userData = { slab, edge, label, def }
    this.group.add(g)
    this.rows[def.id] = g
    return g
  }

  rowColor(id, color, edgeColor) {
    const r = this.rows[id]
    if (!r) return
    r.userData.slab.material.color.set(color)
    if (edgeColor) r.userData.edge.material.color.set(edgeColor)
  }

  phase(name) {
    const tl = new Timeline()
    this.ctxTarget.visible = false
    // reset
    for (const id of Object.keys(this.rows)) {
      if (id === 'm5') { this.group.remove(this.rows[id]); delete this.rows[id]; continue }
      const r = this.rows[id]
      r.position.set(-1.2, r.userData.def.y, 0)
      r.visible = true
      r.scale.setScalar(1)
      this.rowColor(id, 0xf7f4ed, COL.grey)
      r.userData.label.material.opacity = 1
      r.userData.slab.material.opacity = 0.98
    }

    if (name === 'store') {
      const r = this.rows.m1
      r.visible = false
      const enterAt = this.embedded ? 0.08 : 0.3
      const enterFrom = this.embedded ? -6.1 : -10.2
      tl.call(enterAt, () => {
        r.visible = true
        this.rowColor('m1', 0xf4d9c2, COL.amber)
      })
      tl.add(enterAt, this.embedded ? 0.95 : 1.2, (p) => {
        r.position.x = -1.2 + (1 - p) * enterFrom
        r.userData.slab.material.opacity = p
      })
      tl.add(2.25, 1.1, (p) => {
        if (p >= 1) this.rowColor('m1', 0xf7f4ed, COL.grey)
      })
    }

    if (name === 'retrieve') {
      this.ctxTarget.visible = true
      // a query bracket sweeps down; matches glow, m3 (superseded in this phase's fiction) stays
      const sweep = new THREE.Mesh(
        new THREE.PlaneGeometry(6.4, 0.6),
        new THREE.MeshBasicMaterial({ color: COL.cyan, transparent: true, opacity: 0 })
      )
      sweep.position.set(-1.2, 2, 0.15)
      this.group.add(sweep)
      tl.call(0.1, () => { sweep.material.opacity = 0.16 })
      tl.add(0.1, 1.8, (p) => { sweep.position.y = 2 - p * 3.4 }, ease.linear)
      tl.call(1.95, () => { sweep.material.opacity = 0; this.group.remove(sweep) })
      const hits = ['m1', 'm2', 'm4']
      hits.forEach((id, i) => {
        tl.call(0.4 + i * 0.45, () => this.rowColor(id, 0xd9eef3, COL.cyan))
      })
      // rows fly to context
      hits.forEach((id, i) => {
        const r = this.rows[id]
        const targetY = 1.35 - i * 0.72
        tl.add(2.3 + i * 0.3, 1.0, (p) => {
          r.position.x = -1.2 + p * 6.1
          r.position.y = r.userData.def.y + p * (targetY - r.userData.def.y)
          r.scale.setScalar(1 - p * 0.45)
          r.userData.label.material.opacity = 1 - p * 0.3
        })
      })
      tl.call(5.4, () => {
        hits.forEach((id) => {
          const r = this.rows[id]
          r.position.set(-1.2, r.userData.def.y, 0)
          r.scale.setScalar(1)
          r.userData.label.material.opacity = 1
          this.rowColor(id, 0xf7f4ed, COL.grey)
        })
      })
    }

    if (name === 'maintain') {
      tl.call(0.12, () => {
        const r = this.addRow({ id: 'm5', label: 'm5 · episodic  · “Sam and I broke up.”', y: -1.5 }, 0xe8def3)
        this.rowColor('m5', 0xe8def3, COL.violet)
        r.position.x = this.embedded ? -7.3 : -10
      })
      tl.add(0.12, 1.05, (p) => {
        const r = this.rows.m5
        if (r) {
          const start = this.embedded ? -7.3 : -10
          r.position.x = start + p * (-1.2 - start)
        }
      })
      tl.call(1.55, () => this.rowColor('m3', 0xf3d6da, COL.red))
      tl.call(2.15, () => {
        const r = this.rows.m3
        const tag = makeLabel('superseded_by = m5', { color: '#c44955', size: 0.3, bg: '#fffdf8' })
        tag.position.set(2.2, 0.32, 0.3)
        r.add(tag)
        r.userData.tag = tag
      })
      tl.add(2.9, 1.0, (p) => {
        const r = this.rows.m3
        r.userData.slab.material.opacity = 0.98 - p * 0.6
        r.userData.label.material.opacity = 1 - p * 0.6
      })
      tl.call(4.8, () => {
        const r = this.rows.m3
        if (r.userData.tag) { r.remove(r.userData.tag); r.userData.tag = null }
        r.userData.slab.material.opacity = 0.98
        r.userData.label.material.opacity = 1
        this.rowColor('m3', 0xf7f4ed, COL.grey)
      })
    }
    return tl
  }

  update(dt, t) {
    this.group.rotation.y = Math.sin(t * 0.25) * 0.06
    this.group.rotation.x = Math.sin(t * 0.2) * 0.02
  }

  dispose() {
    this.scene.remove(this.group)
    disposeGroup(this.group)
  }
}

/* ============================================================
   VECTOR VIEW - the embedding space
   ============================================================ */

class VectorView {
  constructor(scene, { embedded = false } = {}) {
    this.scene = scene
    this.embedded = embedded
    this.group = new THREE.Group()
    scene.add(this.group)

    // background points
    const n = 340
    const pos = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(Math.pow(Math.random(), 0.55) * 4.4)
      v.y *= 0.72
      pos.set([v.x, v.y, v.z], i * 3)
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    this.cloud = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 0.09, map: dotTexture(), color: 0x8a929f, transparent: true,
      opacity: 0.66, depthWrite: false, blending: THREE.NormalBlending,
    }))
    this.group.add(this.cloud)

    // memory points - deliberate geometry: food/booking cluster vs people cluster
    this.memDefs = [
      { id: 'm1', label: 'm1 allergy', pos: [1.9, 1.1, 0.4] },
      { id: 'm4', label: 'm4 menu check', pos: [2.4, 0.5, -0.3] },
      { id: 'm2', label: 'm2 Luna booking', pos: [1.2, 0.2, 0.8] },
      { id: 'm3', label: 'm3 Sam partner', pos: [-2.4, -0.9, 0.3] },
    ]
    this.mems = {}
    for (const def of this.memDefs) {
      const g = new THREE.Group()
      const dot = new THREE.Mesh(
        new THREE.SphereGeometry(0.09, 14, 14),
        new THREE.MeshBasicMaterial({ color: COL.amber })
      )
      const glow = pulseSprite(COL.amber, 0.7)
      glow.material.opacity = 0.55
      const label = makeLabel(def.label, { color: '#d66f28', size: 0.3, bg: 'rgba(255,253,248,0.72)' })
      if (def.id === 'm1') label.position.set(0, 0.48, 0)
      if (def.id === 'm2') label.position.set(-0.62, -0.02, 0)
      if (def.id === 'm3') label.position.set(0, -0.44, 0)
      if (def.id === 'm4') label.position.set(0.72, 0.02, 0)
      g.add(dot, glow, label)
      g.position.set(...def.pos)
      g.userData = { dot, glow, label }
      this.group.add(g)
      this.mems[def.id] = g
    }

    this.axisHint = makeLabel('1024-d embedding space  →  3-d projection', { color: '#667085', size: 0.3, bg: '#fffdf8' })
    this.axisHint.position.set(0, -2.5, 0)
    this.group.add(this.axisHint)
  }

  phase(name) {
    const tl = new Timeline()
    // cleanup transient objects
    if (this.transient) { this.group.remove(this.transient); disposeGroup(this.transient) }
    this.transient = new THREE.Group()
    this.group.add(this.transient)
    for (const id of Object.keys(this.mems)) {
      const m = this.mems[id]
      m.visible = true
      m.scale.setScalar(1)
      m.userData.dot.material.color.set(COL.amber)
      m.userData.glow.material.color.set(COL.amber)
    }

    if (name === 'store') {
      const m1 = this.mems.m1
      m1.visible = false
      const arriveAt = this.embedded ? 0.12 : 1.8
      if (!this.embedded) {
        const packet = makePacket(COL.amber)
        this.transient.add(packet)
        const curve = curveFrom([[-7, 3.4, 1.5], [-2.5, 2.6, 1], [1.9, 1.1, 0.4]])
        tl.add(0.2, 1.6, (p) => moveAlong(packet, curve, p))
        tl.call(1.8, () => { packet.visible = false })
      }
      tl.call(arriveAt, () => {
        m1.visible = true
        m1.scale.setScalar(0.01)
      })
      tl.add(arriveAt, 0.7, (p) => m1.scale.setScalar(0.01 + p), ease.out)
      // neighborhood shimmer: nearby background points briefly brighten
      tl.add(arriveAt + 0.72, 1.2, (p) => {
        this.cloud.material.opacity = 0.66 + Math.sin(p * Math.PI) * 0.28
      })
    }

    if (name === 'retrieve') {
      const qpos = new THREE.Vector3(1.7, 0.55, 0.35)
      const q = new THREE.Group()
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.11, 14, 14), new THREE.MeshBasicMaterial({ color: COL.cyan }))
      const glow = pulseSprite(COL.cyan, 0.9); glow.material.opacity = 0.6
      const label = makeLabel('q: “dinner Friday”', { color: '#177a9b', size: 0.32, bg: 'rgba(255,253,248,0.78)' })
      label.position.set(0, 0.4, 0)
      q.add(dot, glow, label)
      q.position.copy(qpos)
      q.visible = false
      this.transient.add(q)

      // search sphere
      const ring = new THREE.Mesh(
        new THREE.SphereGeometry(1, 24, 24),
        new THREE.MeshBasicMaterial({ color: COL.cyan, wireframe: true, transparent: true, opacity: 0.18 })
      )
      ring.position.copy(qpos)
      ring.visible = false
      this.transient.add(ring)

      tl.call(0.2, () => { q.visible = true })
      tl.call(0.7, () => { ring.visible = true })
      tl.add(0.7, 1.6, (p) => {
        ring.scale.setScalar(0.05 + p * 1.9)
        ring.material.opacity = 0.22 * (1 - p * 0.6)
      }, ease.out)

      const hits = [
        { id: 'm2', score: '0.81', at: 1.4 },
        { id: 'm4', score: '0.74', at: 1.8 },
        { id: 'm1', score: '0.69', at: 2.2 },
      ]
      for (const h of hits) {
        const m = this.mems[h.id]
        const lineGeo = new THREE.BufferGeometry().setFromPoints([qpos, m.position])
        const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: COL.cyan, transparent: true, opacity: 0 }))
        this.transient.add(line)
        const score = makeLabel(h.score, { color: '#177a9b', size: 0.26, bg: 'rgba(255,253,248,0.78)' })
        score.position.copy(qpos.clone().lerp(m.position, 0.55)).add(new THREE.Vector3(0, 0.18, 0))
        score.visible = false
        this.transient.add(score)
        tl.call(h.at, () => {
          line.material.opacity = 0.7
          score.visible = true
          m.userData.dot.material.color.set(COL.cyan)
          m.userData.glow.material.color.set(COL.cyan)
        })
      }
      // m3 stays far & dim - visually: briefly flash grey
      tl.call(2.6, () => {
        const m3 = this.mems.m3
        m3.userData.dot.material.color.set(0x8a929f)
        m3.userData.glow.material.color.set(0x8a929f)
      })
      tl.call(5.6, () => {
        for (const h of hits) {
          this.mems[h.id].userData.dot.material.color.set(COL.amber)
          this.mems[h.id].userData.glow.material.color.set(COL.amber)
        }
        const m3 = this.mems.m3
        m3.userData.dot.material.color.set(COL.amber)
        m3.userData.glow.material.color.set(COL.amber)
      })
    }

    if (name === 'maintain') {
      // m5 arrives near m3 (same region of meaning), gate detects conflict, m3 deleted
      const m3 = this.mems.m3
      const m5pos = new THREE.Vector3(-2.0, -0.5, 0.1)
      const m5 = new THREE.Group()
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.09, 14, 14), new THREE.MeshBasicMaterial({ color: COL.violet }))
      const glow = pulseSprite(COL.violet, 0.7); glow.material.opacity = 0.55
      const label = makeLabel('m5 · relationship ended', { color: '#7254a3', size: 0.3, bg: 'rgba(255,253,248,0.78)' })
      label.position.set(0, 0.32, 0)
      m5.add(dot, glow, label)
      m5.position.copy(m5pos)
      m5.visible = false
      this.transient.add(m5)

      const arriveAt = this.embedded ? 0.12 : 1.6
      if (!this.embedded) {
        const packet = makePacket(COL.violet)
        this.transient.add(packet)
        const curve = curveFrom([[-7, 3, 1.5], [-4.5, 1.4, 0.8], [m5pos.x, m5pos.y, m5pos.z]])
        tl.add(0.2, 1.4, (p) => moveAlong(packet, curve, p))
        tl.call(1.6, () => { packet.visible = false })
      }
      tl.call(arriveAt, () => { m5.visible = true; m5.scale.setScalar(0.01) })
      tl.add(arriveAt, 0.55, (p) => m5.scale.setScalar(0.01 + p), ease.out)

      // similarity check line to m3
      const lineGeo = new THREE.BufferGeometry().setFromPoints([m5pos, m3.position])
      const simLine = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: COL.red, transparent: true, opacity: 0 }))
      this.transient.add(simLine)
      const simLabel = makeLabel('similarity 0.87  →  CONTRADICTS', { color: '#c44955', size: 0.28, bg: 'rgba(255,253,248,0.78)' })
      simLabel.position.copy(m5pos.clone().lerp(m3.position, 0.5)).add(new THREE.Vector3(0, 0.3, 0))
      simLabel.visible = false
      this.transient.add(simLabel)

      tl.call(this.embedded ? 1.05 : 2.2, () => { simLine.material.opacity = 0.8; simLabel.visible = true })
      tl.call(this.embedded ? 1.75 : 3.2, () => {
        m3.userData.dot.material.color.set(COL.red)
        m3.userData.glow.material.color.set(COL.red)
      })
      const removeAt = this.embedded ? 2.4 : 3.9
      tl.add(removeAt, 1.0, (p) => m3.scale.setScalar(1 - p * 0.99))
      tl.call(removeAt + 1, () => { m3.visible = false; simLine.material.opacity = 0.25 })
      tl.call(this.embedded ? 4.8 : 6.8, () => {
        m3.visible = true
        m3.scale.setScalar(1)
        m3.userData.dot.material.color.set(COL.amber)
        m3.userData.glow.material.color.set(COL.amber)
        simLine.material.opacity = 0
        simLabel.visible = false
        m5.visible = false
      })
    }
    return tl
  }

  update(dt, t) {
    this.group.rotation.y += dt * 0.06
  }

  dispose() {
    this.scene.remove(this.group)
    disposeGroup(this.group)
  }
}

/* ============================================================
   GRAPH VIEW - entities, edges, time
   ============================================================ */

class GraphView {
  constructor(scene, { embedded = false } = {}) {
    this.scene = scene
    this.embedded = embedded
    this.group = new THREE.Group()
    scene.add(this.group)

    this.nodeDefs = [
      { id: 'maya', label: 'Maya', pos: [0, 0.3, 0], size: 0.28, color: COL.text },
      { id: 'peanuts', label: 'Peanuts', pos: [2.6, 1.7, -0.5], size: 0.17 },
      { id: 'luna', label: 'Luna', pos: [2.3, -1.3, 0.4], size: 0.2 },
      { id: 'sam', label: 'Sam', pos: [-2.5, 1.2, 0.3], size: 0.2 },
      { id: 'italian', label: 'Italian', pos: [4.0, -1.65, -0.2], size: 0.14 },
    ]
    this.edgeDefs = [
      { id: 'allergic', a: 'maya', b: 'peanuts', label: 'ALLERGIC_TO' },
      { id: 'booked', a: 'maya', b: 'luna', label: 'BOOKED 08-04' },
      { id: 'partner', a: 'maya', b: 'sam', label: 'PARTNER' },
      { id: 'cuisine', a: 'luna', b: 'italian', label: 'CUISINE' },
    ]
    this.nodes = {}
    this.edges = {}

    for (const d of this.nodeDefs) {
      const g = new THREE.Group()
      const s = new THREE.Mesh(
        new THREE.SphereGeometry(d.size, 20, 20),
        new THREE.MeshBasicMaterial({ color: d.color ?? 0x8a929f })
      )
      const glow = pulseSprite(d.color ?? 0x8a929f, d.size * 4)
      glow.material.opacity = 0.3
      const label = makeLabel(d.label, { color: '#202630', size: 0.34, bg: '#fffdf8' })
      label.position.set(0, d.size + 0.32, 0)
      g.add(s, glow, label)
      g.position.set(...d.pos)
      g.userData = { s, glow, label, def: d }
      this.group.add(g)
      this.nodes[d.id] = g
    }

    for (const d of this.edgeDefs) {
      const a = this.nodes[d.a].position
      const b = this.nodes[d.b].position
      const geo = new THREE.BufferGeometry().setFromPoints([a.clone(), b.clone()])
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0x929baa, transparent: true, opacity: 0.78 }))
      const label = makeLabel(d.label, { color: '#667085', size: 0.26, bg: '#fffdf8' })
      label.position.copy(a.clone().lerp(b, 0.5)).add(new THREE.Vector3(0, 0.22, 0))
      this.group.add(line, label)
      this.edges[d.id] = { line, label, def: d, a: a.clone(), b: b.clone() }
    }
    this.group.position.y = 0.2
  }

  edgeColor(id, color, opacity = 0.9) {
    const e = this.edges[id]
    e.line.material.color.set(color)
    e.line.material.opacity = opacity
  }

  phase(name) {
    const tl = new Timeline()
    if (this.transient) { this.group.remove(this.transient); disposeGroup(this.transient) }
    this.transient = new THREE.Group()
    this.group.add(this.transient)
    for (const id of Object.keys(this.edges)) {
      this.edges[id].line.visible = true
      this.edges[id].label.visible = true
      this.edgeColor(id, 0x929baa, 0.78)
    }
    for (const id of Object.keys(this.nodes)) {
      const n = this.nodes[id]
      n.visible = true
      n.scale.setScalar(1)
      n.userData.glow.material.opacity = 0.3
    }

    if (name === 'store') {
      // m1 arrives: Peanuts node + ALLERGIC_TO edge grow in
      const peanuts = this.nodes.peanuts
      const edge = this.edges.allergic
      peanuts.visible = false
      edge.line.visible = false
      edge.label.visible = false

      const arriveAt = this.embedded ? 0.1 : 1.5
      if (!this.embedded) {
        const packet = makePacket(COL.amber)
        this.transient.add(packet)
        const curve = curveFrom([[-7, 3.2, 1], [-3, 2.4, 0.5], [0, 0.3, 0]])
        tl.add(0.2, 1.3, (p) => moveAlong(packet, curve, p))
        tl.call(1.5, () => { packet.visible = false })
      }
      tl.call(arriveAt, () => {
        this.nodes.maya.userData.glow.material.opacity = 0.7
        edge.line.visible = true
        this.edgeColor('allergic', COL.amber, 1)
      })
      // edge grows outward
      tl.add(arriveAt, 0.9, (p) => {
        const pts = [edge.a.clone(), edge.a.clone().lerp(edge.b, p)]
        edge.line.geometry.setFromPoints(pts)
      }, ease.out)
      tl.call(arriveAt + 0.9, () => {
        peanuts.visible = true
        peanuts.scale.setScalar(0.01)
        edge.label.visible = true
      })
      tl.add(arriveAt + 0.9, 0.6, (p) => peanuts.scale.setScalar(0.01 + p), ease.out)
      tl.call(arriveAt + 2.7, () => {
        this.edgeColor('allergic', 0x929baa, 0.78)
        this.nodes.maya.userData.glow.material.opacity = 0.3
      })
    }

    if (name === 'retrieve') {
      // BFS pulse from Maya
      const order = [
        { edge: 'allergic', node: 'peanuts', at: 0.8 },
        { edge: 'booked', node: 'luna', at: 1.3 },
        { edge: 'partner', node: 'sam', at: 1.8, invalid: true },
        { edge: 'cuisine', node: 'italian', at: 2.6, from: 'luna' },
      ]
      tl.call(0.2, () => { this.nodes.maya.userData.glow.material.opacity = 0.85 })
      for (const step of order) {
        const e = this.edges[step.edge]
        const pulse = makePacket(step.invalid ? COL.grey : COL.cyan, 0.45)
        pulse.visible = false
        this.transient.add(pulse)
        tl.call(step.at, () => { pulse.visible = true })
        tl.add(step.at, 0.7, (p) => {
          pulse.position.copy(e.a.clone().lerp(e.b, p))
        })
        tl.call(step.at + 0.7, () => {
          pulse.visible = false
          if (step.invalid) {
            this.edgeColor(step.edge, COL.red, 0.35)
            this.nodes[step.node].userData.glow.material.opacity = 0.12
          } else {
            this.edgeColor(step.edge, COL.cyan, 1)
            this.nodes[step.node].userData.glow.material.opacity = 0.8
          }
        })
      }
      const tag = makeLabel('invalid_at ≠ null  →  skipped', { color: '#c44955', size: 0.26, bg: '#fffdf8' })
      tag.position.set(-1.25, 2.05, 0.4)
      tag.visible = false
      this.transient.add(tag)
      tl.call(2.7, () => { tag.visible = true })
      tl.call(6, () => {
        for (const id of Object.keys(this.edges)) this.edgeColor(id, 0x929baa, 0.78)
        for (const id of Object.keys(this.nodes)) this.nodes[id].userData.glow.material.opacity = 0.3
        tag.visible = false
      })
    }

    if (name === 'maintain') {
      const e = this.edges.partner
      const arriveAt = this.embedded ? 0.1 : 1.5
      if (!this.embedded) {
        const packet = makePacket(COL.violet)
        this.transient.add(packet)
        const curve = curveFrom([[-7, -2.5, 1], [-4.5, -0.5, 0.6], [0, 0.3, 0]])
        tl.add(0.2, 1.3, (p) => moveAlong(packet, curve, p))
        tl.call(1.5, () => { packet.visible = false })
      }
      tl.call(arriveAt, () => {
        this.edgeColor('partner', COL.red, 1)
      })
      const tag = makeLabel('invalid_at = 2026-08-18', { color: '#c44955', size: 0.28, bg: '#fffdf8' })
      tag.position.copy(e.a.clone().lerp(e.b, 0.5)).add(new THREE.Vector3(0, -0.25, 0.2))
      tag.visible = false
      this.transient.add(tag)
      tl.call(this.embedded ? 0.8 : 2.2, () => { tag.visible = true })
      const fadeAt = this.embedded ? 1.7 : 3.2
      tl.add(fadeAt, 1.4, (p) => {
        e.line.material.opacity = 1 - p * 0.72
        this.nodes.sam.userData.glow.material.opacity = 0.3 - p * 0.2
      })
      const note = makeLabel('edge kept  ·  history, not deletion', { color: '#7254a3', size: 0.28, bg: '#fffdf8' })
      note.position.set(-1.3, -1.8, 0.4)
      note.visible = false
      this.transient.add(note)
      tl.call(this.embedded ? 3.35 : 4.8, () => { note.visible = true })
      tl.call(this.embedded ? 5.1 : 7.2, () => {
        this.edgeColor('partner', 0x929baa, 0.78)
        tag.visible = false
        note.visible = false
        this.nodes.sam.userData.glow.material.opacity = 0.3
      })
    }
    return tl
  }

  update(dt, t) {
    this.group.rotation.y = Math.sin(t * 0.22) * 0.14
    for (const id of Object.keys(this.nodes)) {
      const n = this.nodes[id]
      n.position.y = n.userData.def.pos[1] + Math.sin(t * 0.8 + n.userData.def.pos[0] * 2) * 0.05
    }
    // keep edges attached
    for (const id of Object.keys(this.edges)) {
      const e = this.edges[id]
      const a = this.nodes[e.def.a].position
      const b = this.nodes[e.def.b].position
      e.a.copy(a); e.b.copy(b)
      e.line.geometry.setFromPoints([a, b])
      e.label.position.copy(a.clone().lerp(b, 0.5)).add(new THREE.Vector3(0, 0.22, 0))
    }
  }

  dispose() {
    this.scene.remove(this.group)
    disposeGroup(this.group)
  }
}

/* ============================================================
   Explorer controller
   ============================================================ */

export const MEMORY_VIEWS = { files: FilesView, sqlite: SqliteView, vector: VectorView, graph: GraphView }

const VIEWS = MEMORY_VIEWS

export function initExplorer(canvas) {
  const stage = createStage(canvas, { fov: 45, z: 11 })
  const { renderer, scene, camera } = stage
  scene.fog = new THREE.Fog(COL.bg, 14, 30)

  let view = null
  let timeline = null
  let storeId = null
  let phaseName = 'store'

  function setStore(id) {
    if (storeId === id) return
    storeId = id
    if (view) view.dispose()
    view = new VIEWS[id](scene)
    timeline = view.phase(phaseName)
  }

  function setPhase(name) {
    phaseName = name
    if (view) timeline = view.phase(name)
  }

  let running = true
  const stopVis = whenVisible(canvas, (v) => { running = v })
  const clock = new THREE.Clock()

  function frame() {
    requestAnimationFrame(frame)
    if (!running || !view) return
    const dt = Math.min(clock.getDelta(), 0.05)
    const t = clock.elapsedTime
    view.update(dt, t)
    if (timeline && !reducedMotion) timeline.update(dt)
    else if (timeline && reducedMotion && timeline.t < timeline.duration) timeline.update(0.4)
    renderer.render(scene, camera)
  }
  frame()

  return { setStore, setPhase, dispose: () => { stopVis(); stage.dispose() } }
}
