import * as THREE from 'three'
import {
  COL,
  createStage,
  curveFrom,
  disposeGroup,
  dotTexture,
  makeLabel,
  makePacket,
  reducedMotion,
} from './lib.js'
import { MEMORY_VIEWS } from './explorer.js'

const PHASE_COLORS = {
  store: COL.amber,
  retrieve: COL.cyan,
  maintain: COL.violet,
}

const STORE_TITLES = {
  files: 'PLAIN FILES · HUMAN-READABLE',
  sqlite: 'SQLITE · STRUCTURED TRUTH',
  vector: 'VECTOR STORE · SEMANTIC RECALL',
  graph: 'KNOWLEDGE GRAPH · RELATIONSHIPS + TIME',
}

const IMPACT_AT = { store: 0.44, retrieve: 0.32, maintain: 0.44 }
const RETRIEVE_RELEASE_AT = 0.71

function revealBetween(progress, start, end) {
  const value = THREE.MathUtils.clamp((progress - start) / (end - start), 0, 1)
  return 1 - Math.pow(1 - value, 3)
}

const STORY = {
  store: [
    ['01 / OBSERVE', 'Maya says: “I can’t do the Thai place - peanut allergy.”'],
    ['02 / EXTRACT', 'The agent isolates one durable semantic fact from the message.'],
    ['03 / WRITE', 'The fact crosses the memory boundary and takes the store’s native shape.'],
    ['04 / AVAILABLE', 'Future runs can now retrieve it without carrying the full conversation.'],
  ],
  retrieve: [
    ['01 / REQUEST', 'Maya asks: “Find somewhere for dinner on Friday.”'],
    ['02 / QUERY', 'The agent translates intent into this store’s retrieval operation.'],
    ['03 / RECALL', 'Relevant memories travel back into the working context.'],
    ['04 / RESPOND', 'The model plans with the allergy, precedent, and learned safety rule in view.'],
  ],
  maintain: [
    ['01 / NEW EVENT', 'Maya says: “Sam and I broke up.”'],
    ['02 / COMPARE', 'The agent detects that the event conflicts with an existing relationship fact.'],
    ['03 / SUPERSEDE', 'The old memory is changed, replaced, or invalidated in the store’s native way.'],
    ['04 / CURRENT TRUTH', 'The present stays clean while provenance and history remain inspectable.'],
  ],
}

const MEMORY_TARGETS = {
  files: {
    store: [-1.6, 1.66],
    retrieve: [-1.6, 0.1],
    maintain: [-1.6, 0.35],
  },
  sqlite: {
    store: [-1.2, 1.5],
    retrieve: [-1.2, 0.4],
    maintain: [-1.2, -1.5],
  },
  vector: {
    store: [1.9, 1.1],
    retrieve: [1.7, 0.55],
    maintain: [-2.0, -0.5],
  },
  graph: {
    store: [0, 0.3],
    retrieve: [0, 0.3],
    maintain: [-1.25, 0.75],
  },
}

const USER_PROMPTS = {
  store: 'Maya: “Peanut allergy.”',
  retrieve: 'Maya: “Dinner on Friday?”',
  maintain: 'Maya: “Sam and I broke up.”',
}

function lineFrom(points, color, opacity = 1) {
  const geometry = new THREE.BufferGeometry().setFromPoints(points.map((p) => new THREE.Vector3(...p)))
  const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity })
  const line = new THREE.Line(geometry, material)
  line.userData.baseOpacity = opacity
  return line
}

function tubeFrom(curve, color, opacity = 0.72, radius = 0.024) {
  const geometry = new THREE.TubeGeometry(curve, 96, radius, 6, false)
  const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, depthTest: false })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.renderOrder = 7
  return mesh
}

function makeNode(title, subtitle, position, size = [2.05, 1.0]) {
  const group = new THREE.Group()
  group.position.set(...position)

  const panel = new THREE.Mesh(
    new THREE.BoxGeometry(size[0], size[1], 0.22),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.84 })
  )
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(panel.geometry),
    new THREE.LineBasicMaterial({ color: 0x9da5b1, transparent: true, opacity: 0.56 })
  )
  const core = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.12, 1),
    new THREE.MeshBasicMaterial({ color: COL.grey, transparent: true, opacity: 0.56 })
  )
  core.position.x = -size[0] * 0.35
  const name = makeLabel(title, { color: '#475467', size: 0.31 })
  name.position.set(0.12, 0.09, 0.18)
  const sub = makeLabel(subtitle, { color: '#7a8290', size: 0.21 })
  sub.position.set(0.12, -0.25, 0.18)
  sub.userData.detailLabel = true
  group.add(panel, edges, core, name, sub)
  group.userData = { panel, edges, core, sub, baseY: position[1] }
  return group
}

function addCorner(group, x, y, sx, sy, color = COL.amber) {
  const points = [
    new THREE.Vector3(x + sx * 0.35, y, 0.24),
    new THREE.Vector3(x, y, 0.24),
    new THREE.Vector3(x, y + sy * 0.35, 0.24),
  ]
  group.add(new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.85 })
  ))
}

function makeMemoryChamber() {
  const group = new THREE.Group()
  group.position.set(0.55, -1.9, 0)

  const panel = new THREE.Mesh(
    new THREE.BoxGeometry(9.7, 4.85, 0.34),
    new THREE.MeshBasicMaterial({ color: 0xfffdf8, transparent: true, opacity: 0.95, depthWrite: false })
  )
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(panel.geometry),
    new THREE.LineBasicMaterial({ color: COL.amberDim, transparent: true, opacity: 0.48 })
  )
  group.add(panel, edges)
  addCorner(group, -4.85, 2.425, 1, -1)
  addCorner(group, 4.85, 2.425, -1, -1)
  addCorner(group, -4.85, -2.425, 1, 1)
  addCorner(group, 4.85, -2.425, -1, 1)

  const label = makeLabel('LONG-TERM MEMORY', { color: '#d66f28', size: 0.24 })
  label.position.set(-3.7, 2.12, 0.3)
  const storeTitle = makeLabel(STORE_TITLES.files, { color: '#7a8290', size: 0.21 })
  storeTitle.position.set(2.25, 2.12, 0.3)
  group.add(label, storeTitle)
  group.userData = { panel, edges, storeTitle }
  return group
}

function textBar(width, y, color = 0x8d96a4, opacity = 0.7) {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(width, 0.055),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity })
  )
  mesh.position.set(-1.55 + width / 2, y, 0.07)
  return mesh
}

class FilesStore {
  constructor() {
    this.group = new THREE.Group()
    this.group.position.set(-0.7, -0.18, 0.27)
    this.group.scale.setScalar(1.28)
    this.phase = 'store'
    this.detail = 1
    this.lines = []
    this.labels = new THREE.Group()
    this.impl = new THREE.Group()

    for (let i = 2; i >= 0; i -= 1) {
      const page = new THREE.Mesh(
        new THREE.PlaneGeometry(2.65, 1.55),
        new THREE.MeshBasicMaterial({ color: i === 0 ? 0xffffff : 0xeeeae1, transparent: true, opacity: i === 0 ? 1 : 0.8 })
      )
      page.position.set(-0.75 + i * 0.14, -0.06 + i * 0.1, -i * 0.08)
      page.rotation.z = (i - 1) * 0.025
      const edge = new THREE.LineSegments(
        new THREE.EdgesGeometry(page.geometry),
        new THREE.LineBasicMaterial({ color: i === 0 ? COL.amberDim : COL.line, transparent: true, opacity: 0.62 })
      )
      edge.position.copy(page.position)
      edge.rotation.copy(page.rotation)
      this.group.add(page, edge)
    }

    const widths = [1.2, 1.82, 1.45, 1.96, 1.66, 1.32]
    widths.forEach((w, i) => {
      const bar = textBar(w, 0.48 - i * 0.19, i === 1 ? COL.amber : 0x8d96a4, i === 1 ? 1 : 0.64)
      bar.position.x -= 0.75
      bar.userData.baseX = bar.position.x
      bar.userData.width = w
      this.group.add(bar)
      this.lines.push(bar)
    })
    const fileLabel = makeLabel('memory/maya.md', { color: '#475467', size: 0.24 })
    fileLabel.position.set(1.3, 0.45, 0.1)
    const factLabel = makeLabel('m1 · semantic', { color: '#d66f28', size: 0.2 })
    factLabel.position.set(1.25, 0.05, 0.1)
    this.factLabel = factLabel
    const accessLabel = makeLabel('load → grep → read', { color: '#177a9b', size: 0.19 })
    accessLabel.position.set(1.28, -0.31, 0.1)
    this.labels.add(fileLabel, factLabel, accessLabel)

    const tokens = ['UTF-8', 'git diff', 'no index']
    tokens.forEach((text, i) => {
      const label = makeLabel(text, { color: '#7a8290', size: 0.16, bg: '#fffdf8' })
      label.position.set(0.75 + i * 0.85, -0.72, 0.12)
      this.impl.add(label)
    })
    this.scan = new THREE.Mesh(
      new THREE.PlaneGeometry(2.5, 0.11),
      new THREE.MeshBasicMaterial({ color: COL.cyan, transparent: true, opacity: 0 })
    )
    this.scan.position.set(-0.75, 0.58, 0.15)
    this.replacement = textBar(1.72, 0.24, COL.violet, 0)
    this.replacement.position.x -= 0.75
    this.replacement.userData.baseX = this.replacement.position.x
    this.replacement.userData.width = 1.72
    this.group.add(this.scan, this.replacement, this.labels, this.impl)
    this.setState('store', 1)
  }

  setState(phase, detail) {
    this.phase = phase
    this.detail = detail
    this.labels.visible = detail >= 3
    this.impl.visible = detail >= 4
    this.lines.forEach((line, i) => {
      line.material.color.set(i === 1 ? (phase === 'maintain' ? COL.red : PHASE_COLORS[phase]) : 0x8d96a4)
      line.material.opacity = detail >= 3 ? (i === 1 ? 1 : 0.64) : 0.34
    })
    this.replacement.material.opacity = 0
    this.replacement.scale.x = 0.001
  }

  update(t, progress) {
    this.group.rotation.y = Math.sin(t * 0.45) * 0.035
    const hit = IMPACT_AT[this.phase]
    const entry = this.lines[1]
    const reveal = revealBetween(progress, hit, hit + 0.09)

    if (this.phase === 'store') {
      entry.scale.x = Math.max(0.001, reveal)
      entry.position.x = entry.userData.baseX - entry.userData.width * (1 - reveal) * 0.5
      entry.material.opacity = reveal
      this.factLabel.material.opacity = reveal
      this.scan.material.opacity = 0
    }

    if (this.phase === 'retrieve') {
      entry.scale.x = 1
      entry.position.x = entry.userData.baseX
      this.factLabel.material.opacity = 1
      const scanProgress = revealBetween(progress, hit - 0.06, hit + 0.12)
      this.scan.material.opacity = progress >= hit - 0.06 && progress < 0.78 ? 0.2 : 0
      this.scan.position.y = 0.58 - scanProgress * 1.12
      this.lines.forEach((line, i) => {
        const selected = [0, 1, 3, 4].includes(i) && progress >= hit
        line.material.color.set(selected ? COL.cyan : (i === 1 ? COL.amber : 0x8d96a4))
      })
    }

    if (this.phase === 'maintain') {
      entry.scale.x = 1 - reveal * 0.76
      entry.position.x = entry.userData.baseX - entry.userData.width * reveal * 0.38
      entry.material.color.set(COL.red)
      entry.material.opacity = 1 - reveal * 0.5
      this.factLabel.material.color.set(COL.red)
      const replacement = revealBetween(progress, hit + 0.04, hit + 0.13)
      this.replacement.scale.x = Math.max(0.001, replacement)
      this.replacement.position.x = this.replacement.userData.baseX - this.replacement.userData.width * (1 - replacement) * 0.5
      this.replacement.material.opacity = replacement
      this.scan.material.opacity = 0
    } else {
      this.factLabel.material.color.set(COL.amber)
    }
  }
}

class SqliteStore {
  constructor() {
    this.group = new THREE.Group()
    this.group.position.set(0, -0.12, 0.27)
    this.group.scale.setScalar(1.25)
    this.rows = []
    this.rowLabels = []
    this.labels = new THREE.Group()
    this.impl = new THREE.Group()
    this.phase = 'store'
    this.detail = 1

    const table = new THREE.Mesh(
      new THREE.BoxGeometry(5.05, 1.95, 0.2),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.96 })
    )
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(table.geometry),
      new THREE.LineBasicMaterial({ color: COL.amberDim, transparent: true, opacity: 0.6 })
    )
    this.group.add(table, edges)
    for (let i = 0; i < 5; i += 1) {
      const row = new THREE.Mesh(
        new THREE.BoxGeometry(4.72, 0.23, 0.08),
        new THREE.MeshBasicMaterial({ color: i === 0 ? 0xf4d9c2 : i === 4 ? 0xe5d9f3 : 0xe8ebef, transparent: true, opacity: 0.92 })
      )
      row.position.set(0, 0.58 - i * 0.31, 0.17)
      this.group.add(row)
      this.rows.push(row)
    }
    const heads = ['id', 'type', 'subject', 'text', 'superseded_by']
    heads.forEach((text, i) => {
      const label = makeLabel(text, { color: '#7a8290', size: 0.14 })
      label.position.set(-1.95 + i * 0.94, 0.9, 0.22)
      this.labels.add(label)
    })
    const rowLabels = ['m1 · semantic · maya · peanut allergy', 'm2 · episodic · maya · Luna 19:00', 'm3 · semantic · maya · partner: Sam', 'm4 · procedural · maya · check menu', 'm5 · episodic · maya · relationship ended']
    rowLabels.forEach((text, i) => {
      const label = makeLabel(text, { color: i === 0 ? '#d66f28' : i === 4 ? '#7254a3' : '#475467', size: 0.16 })
      label.position.set(-0.72, 0.58 - i * 0.31, 0.28)
      this.labels.add(label)
      this.rowLabels.push(label)
    })
    const indexLabel = makeLabel('B-tree index → subject, created_at', { color: '#177a9b', size: 0.17, bg: '#fffdf8' })
    indexLabel.position.set(1.2, -1.08, 0.15)
    const guarantee = makeLabel('WHERE superseded_by IS NULL', { color: '#7254a3', size: 0.16, bg: '#fffdf8' })
    guarantee.position.set(-1.35, -1.08, 0.15)
    this.impl.add(indexLabel, guarantee)
    this.group.add(this.labels, this.impl)
    this.setState('store', 1)
  }

  setState(phase, detail) {
    this.phase = phase
    this.detail = detail
    this.labels.visible = detail >= 3
    this.impl.visible = detail >= 4
    this.rows.forEach((row, i) => {
      let color = i === 0 ? 0xf4d9c2 : i === 4 ? 0xe5d9f3 : 0xe8ebef
      if (phase === 'retrieve' && [0, 1, 3].includes(i)) color = 0xcbe8f1
      if (phase === 'maintain' && i === 2) color = 0xf2cdd2
      row.material.color.set(color)
      row.material.opacity = detail >= 3 ? 0.94 : 0.5
    })
  }

  update(t, progress) {
    const hit = IMPACT_AT[this.phase]
    const reveal = revealBetween(progress, hit, hit + 0.09)
    const m1 = this.rows[0]
    const m5 = this.rows[4]

    this.rows.forEach((row) => {
      row.position.z = 0.17
      row.position.x = 0
      row.scale.x = 1
    })
    this.rowLabels.forEach((label) => { label.material.opacity = 1 })

    if (this.phase === 'store') {
      m1.scale.x = Math.max(0.001, reveal)
      m1.position.x = -2.36 * (1 - reveal)
      m1.material.opacity = reveal
      this.rowLabels[0].material.opacity = reveal
      m5.visible = false
      this.rowLabels[4].visible = false
    }

    if (this.phase === 'retrieve') {
      m5.visible = false
      this.rowLabels[4].visible = false
      if (progress >= hit) {
        ;[0, 1, 3].forEach((i) => {
          this.rows[i].material.color.set(0xcbe8f1)
          this.rows[i].position.z = 0.25 + Math.sin(t * 4 + i) * 0.015
        })
      }
    }

    if (this.phase === 'maintain') {
      m5.visible = true
      this.rowLabels[4].visible = true
      m5.scale.x = Math.max(0.001, reveal)
      m5.position.x = -2.36 * (1 - reveal)
      m5.material.opacity = reveal
      this.rowLabels[4].material.opacity = reveal
      const old = this.rows[2]
      old.material.color.set(progress >= hit ? COL.red : 0xe8ebef)
      old.material.opacity = 0.92 - reveal * 0.48
      old.position.z = progress >= hit ? 0.25 : 0.17
    }
  }
}

function seeded(index) {
  const value = Math.sin(index * 9187.13 + 0.731) * 43758.5453
  return value - Math.floor(value)
}

class VectorStore {
  constructor() {
    this.group = new THREE.Group()
    this.group.position.set(0, -0.12, 0.28)
    this.group.scale.setScalar(1.36)
    this.phase = 'store'
    this.detail = 1
    this.labels = new THREE.Group()
    this.impl = new THREE.Group()

    const positions = []
    for (let i = 0; i < 100; i += 1) {
      const cluster = i % 4
      const cx = [-1.55, -0.35, 0.9, 1.65][cluster]
      const cy = [0.3, -0.25, 0.35, -0.4][cluster]
      positions.push(
        cx + (seeded(i * 3) - 0.5) * 1.2,
        cy + (seeded(i * 3 + 1) - 0.5) * 0.85,
        (seeded(i * 3 + 2) - 0.5) * 0.42
      )
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    this.points = new THREE.Points(geometry, new THREE.PointsMaterial({
      color: COL.grey,
      size: 0.105,
      map: dotTexture(),
      transparent: true,
      opacity: 0.65,
      depthWrite: false,
      blending: THREE.NormalBlending,
    }))
    this.group.add(this.points)

    this.highlights = [
      [-1.55, 0.32, 0.18],
      [-0.35, -0.12, 0.2],
      [0.92, 0.42, 0.12],
    ].map((p, i) => {
      const node = makePacket(i === 0 ? COL.amber : COL.cyan, 0.33)
      node.userData.glow.material.blending = THREE.NormalBlending
      node.userData.glow.material.opacity = 0.28
      node.position.set(...p)
      this.group.add(node)
      return node
    })
    this.newPoint = makePacket(COL.violet, 0.35)
    this.newPoint.userData.glow.material.blending = THREE.NormalBlending
    this.newPoint.userData.glow.material.opacity = 0.28
    this.newPoint.position.set(-1.1, 0.02, 0.24)
    this.group.add(this.newPoint)
    this.query = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(0.88, 2)),
      new THREE.LineBasicMaterial({ color: COL.cyan, transparent: true, opacity: 0.45 })
    )
    this.query.position.set(-0.2, 0.05, 0)
    this.group.add(this.query)

    const labels = [
      ['m1 · allergy · 0.69', -1.55, 0.68],
      ['m2 · Luna · 0.81', -0.25, -0.55],
      ['m4 · menu check · 0.74', 1.2, 0.78],
    ]
    labels.forEach(([text, x, y]) => {
      const label = makeLabel(text, { color: '#475467', size: 0.16, bg: '#fffdf8' })
      label.position.set(x, y, 0.32)
      this.labels.add(label)
    })

    const hnswLines = [
      [[-2.1,-.2,0],[-.8,.3,0]], [[-.8,.3,0],[.2,-.4,0]], [[.2,-.4,0],[1.45,.35,0]],
      [[-1.6,.6,0],[-.1,.55,0]], [[-.1,.55,0],[1.2,.6,0]], [[-.8,-.55,0],[.8,-.5,0]],
    ]
    hnswLines.forEach((points) => this.impl.add(lineFrom(points, COL.violet, 0.23)))
    const hnswLabel = makeLabel('HNSW · approximate nearest neighbours', { color: '#7254a3', size: 0.16, bg: '#fffdf8' })
    hnswLabel.position.set(1.2, -0.85, 0.22)
    this.impl.add(hnswLabel)
    this.group.add(this.labels, this.impl)
    this.setState('store', 1)
  }

  setState(phase, detail) {
    this.phase = phase
    this.detail = detail
    this.labels.visible = detail >= 3
    this.impl.visible = detail >= 4
    this.query.visible = phase === 'retrieve' && detail >= 3
    this.points.material.opacity = detail >= 3 ? 0.68 : 0.34
    this.highlights.forEach((node, i) => {
      node.visible = detail >= 2
      const color = phase === 'maintain' && i === 0 ? COL.red : phase === 'store' && i === 0 ? COL.amber : COL.cyan
      node.userData.core.material.color.set(color)
      node.userData.glow.material.color.set(color)
    })
    this.newPoint.visible = false
  }

  update(t, progress) {
    this.group.rotation.y = Math.sin(t * 0.26) * 0.12
    this.query.rotation.x = t * 0.2
    this.query.rotation.y = t * 0.28
    const hit = IMPACT_AT[this.phase]
    const reveal = revealBetween(progress, hit, hit + 0.09)
    const pulse = 0.92 + Math.sin(t * 2.4) * 0.09

    if (this.phase === 'store') {
      this.query.visible = false
      this.highlights[0].visible = reveal > 0
      this.highlights[0].scale.setScalar(Math.max(0.01, reveal) * (1 + Math.sin(t * 5) * 0.05))
      this.highlights[1].visible = true
      this.highlights[2].visible = true
      this.highlights[1].scale.setScalar(1)
      this.highlights[2].scale.setScalar(1)
      this.newPoint.visible = false
      this.labels.children[0].material.opacity = reveal
    }

    if (this.phase === 'retrieve') {
      const queryReveal = revealBetween(progress, hit - 0.08, hit + 0.04)
      this.query.visible = queryReveal > 0
      this.query.scale.setScalar(Math.max(0.01, queryReveal) * pulse)
      this.query.material.opacity = 0.12 + queryReveal * 0.36
      this.highlights.forEach((node, i) => {
        node.visible = true
        node.scale.setScalar(progress >= hit ? 1 + Math.sin(t * 4 + i) * 0.08 : 0.68)
        node.userData.glow.material.opacity = progress >= hit ? 0.34 : 0.12
      })
      this.newPoint.visible = false
      this.labels.children.forEach((label) => { label.material.opacity = progress >= hit ? 1 : 0.28 })
    }

    if (this.phase === 'maintain') {
      this.query.visible = false
      this.highlights[0].visible = true
      this.highlights[0].scale.setScalar(1 - reveal * 0.72)
      this.highlights[0].userData.core.material.color.set(COL.red)
      this.highlights[0].userData.glow.material.color.set(COL.red)
      this.newPoint.visible = reveal > 0
      this.newPoint.scale.setScalar(Math.max(0.01, reveal))
      this.highlights[1].visible = true
      this.highlights[2].visible = true
      this.highlights[1].scale.setScalar(1)
      this.highlights[2].scale.setScalar(1)
      this.labels.children[0].material.opacity = 1 - reveal * 0.65
    }
  }
}

class GraphStore {
  constructor() {
    this.group = new THREE.Group()
    this.group.position.set(0, -0.08, 0.28)
    this.group.scale.setScalar(1.34)
    this.phase = 'store'
    this.detail = 1
    this.nodes = {}
    this.nodeLabels = {}
    this.edges = {}
    this.labels = new THREE.Group()
    this.impl = new THREE.Group()
    const defs = {
      maya: [-1.25, 0.15, 0.1],
      peanuts: [0.15, 0.68, 0],
      luna: [0.38, -0.45, 0.08],
      sam: [-0.55, -0.72, 0],
      italian: [1.68, -0.35, -0.04],
      episode: [-2.15, 0.67, -0.12],
      rule: [1.65, 0.58, 0.02],
    }
    for (const [id, pos] of Object.entries(defs)) {
      const node = new THREE.Group()
      const sphere = new THREE.Mesh(
        new THREE.IcosahedronGeometry(id === 'maya' ? 0.2 : 0.14, 2),
        new THREE.MeshBasicMaterial({ color: id === 'maya' ? COL.amber : 0x758092, transparent: true, opacity: 0.9 })
      )
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTexture(), color: id === 'maya' ? COL.amber : COL.grey, transparent: true, opacity: 0.2, depthWrite: false, blending: THREE.NormalBlending }))
      glow.scale.set(id === 'maya' ? 0.9 : 0.6, id === 'maya' ? 0.9 : 0.6, 1)
      node.position.set(...pos)
      node.add(glow, sphere)
      node.userData = { sphere, glow, baseY: pos[1] }
      this.nodes[id] = node
      this.group.add(node)
      const label = makeLabel(id === 'episode' ? 'episode_017' : id[0].toUpperCase() + id.slice(1), { color: id === 'maya' ? '#d66f28' : '#475467', size: 0.16, bg: '#fffdf8' })
      label.position.set(pos[0], pos[1] + 0.31, 0.23)
      this.labels.add(label)
      this.nodeLabels[id] = label
    }
    const edgeDefs = {
      allergy: ['maya', 'peanuts', 'ALLERGIC_TO'],
      booked: ['maya', 'luna', 'BOOKED'],
      partner: ['maya', 'sam', 'PARTNER'],
      cuisine: ['luna', 'italian', 'CUISINE'],
      source: ['episode', 'maya', 'MENTIONS'],
      avoids: ['rule', 'peanuts', 'CHECK_MENU_FOR'],
    }
    for (const [id, [a, b, relation]] of Object.entries(edgeDefs)) {
      const line = lineFrom([defs[a], defs[b]], 0x929baa, 0.7)
      this.edges[id] = line
      this.group.add(line)
      const mid = new THREE.Vector3(...defs[a]).lerp(new THREE.Vector3(...defs[b]), 0.5)
      const label = makeLabel(relation, { color: '#7a8290', size: 0.12 })
      label.position.copy(mid).add(new THREE.Vector3(0, 0.1, 0.15))
      label.userData.edgeName = id
      this.impl.add(label)
    }
    const temporal = makeLabel('valid_from · invalid_at · source', { color: '#7254a3', size: 0.16, bg: '#fffdf8' })
    temporal.position.set(1.15, -0.88, 0.2)
    this.impl.add(temporal)
    this.group.add(this.labels, this.impl)
    this.setState('store', 1)
  }

  setState(phase, detail) {
    this.phase = phase
    this.detail = detail
    this.labels.visible = detail >= 3
    this.impl.visible = detail >= 4
    for (const [id, line] of Object.entries(this.edges)) {
      let color = 0x929baa
      let opacity = detail >= 3 ? 0.72 : 0.34
      if (phase === 'retrieve' && ['allergy', 'booked', 'cuisine', 'avoids'].includes(id)) { color = COL.cyan; opacity = 0.92 }
      if (phase === 'maintain' && id === 'partner') { color = COL.red; opacity = 0.95 }
      if (phase === 'store' && id === 'allergy') { color = COL.amber; opacity = 1 }
      line.material.color.set(color)
      line.material.opacity = opacity
    }
  }

  update(t, progress) {
    this.group.rotation.y = Math.sin(t * 0.25) * 0.08
    const hit = IMPACT_AT[this.phase]
    const reveal = revealBetween(progress, hit, hit + 0.1)
    for (const [id, node] of Object.entries(this.nodes)) {
      node.position.y = node.userData.baseY + Math.sin(t * 0.8 + node.position.x * 2.1) * 0.025
      node.scale.setScalar(1)
      node.userData.glow.material.color.set(id === 'maya' ? COL.amber : COL.grey)
      node.userData.glow.material.opacity = id === 'maya' ? 0.22 : 0.12
      this.nodeLabels[id].material.opacity = 1
    }

    if (this.phase === 'store') {
      const edge = this.edges.allergy
      edge.visible = reveal > 0
      edge.material.color.set(COL.amber)
      edge.material.opacity = reveal
      this.nodes.peanuts.scale.setScalar(0.78 + reveal * 0.22)
      this.nodes.peanuts.userData.glow.material.opacity = 0.08 + reveal * 0.22
      this.impl.children.forEach((label) => {
        if (label.userData.edgeName === 'allergy') label.material.opacity = reveal
      })
    }

    if (this.phase === 'retrieve') {
      for (const [id, edge] of Object.entries(this.edges)) {
        edge.visible = true
        const selected = ['allergy', 'booked', 'cuisine', 'avoids'].includes(id) && progress >= hit
        edge.material.color.set(selected ? COL.cyan : 0x929baa)
        edge.material.opacity = selected ? 0.95 : 0.42
      }
      if (progress >= hit) {
        ;['maya', 'peanuts', 'luna', 'italian', 'rule'].forEach((id) => {
          this.nodes[id].userData.glow.material.color.set(COL.cyan)
          this.nodes[id].userData.glow.material.opacity = 0.22 + Math.sin(t * 4 + id.length) * 0.05
        })
      }
    }

    if (this.phase === 'maintain') {
      for (const edge of Object.values(this.edges)) edge.visible = true
      const partner = this.edges.partner
      partner.material.color.set(progress >= hit ? COL.red : 0x929baa)
      partner.material.opacity = progress >= hit ? 0.95 - reveal * 0.65 : 0.7
      this.nodes.sam.userData.glow.material.color.set(progress >= hit ? COL.red : COL.grey)
      this.nodes.sam.userData.glow.material.opacity = 0.12 + reveal * 0.16
      this.nodeLabels.sam.material.opacity = 1 - reveal * 0.35
    }
  }
}

const STORE_VIEWS = { files: FilesStore, sqlite: SqliteStore, vector: VectorStore, graph: GraphStore }

const EMBEDDED_LAYOUT = {
  files: {
    store: { scale: 0.7, x: 1.12, y: -0.1 },
    retrieve: { scale: 0.62, x: -0.66, y: -0.1 },
    maintain: { scale: 0.7, x: 1.12, y: -0.1 },
  },
  sqlite: {
    store: { scale: 0.8, x: 0.96, y: -0.18 },
    retrieve: { scale: 0.64, x: -0.58, y: -0.16 },
    maintain: { scale: 0.8, x: 0.96, y: -0.18 },
  },
  vector: {
    store: { scale: 0.82, scaleY: 0.74, x: 0, y: -0.08 },
    retrieve: { scale: 0.82, scaleY: 0.74, x: 0, y: -0.08 },
    maintain: { scale: 0.82, scaleY: 0.74, x: 0, y: -0.08 },
  },
  graph: {
    store: { scale: 0.86, x: -0.7, y: -0.12 },
    retrieve: { scale: 0.86, x: -0.7, y: -0.12 },
    maintain: { scale: 0.86, x: -0.7, y: -0.12 },
  },
}

function createBackground(scene) {
  const group = new THREE.Group()
  const positions = []
  for (let i = 0; i < 150; i += 1) {
    positions.push((seeded(i) - 0.5) * 22, (seeded(i + 200) - 0.5) * 13, -2 - seeded(i + 400) * 8)
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  const stars = new THREE.Points(geometry, new THREE.PointsMaterial({ color: 0x9da5b1, size: 0.025, transparent: true, opacity: 0.24 }))
  group.add(stars)

  const grid = new THREE.GridHelper(24, 24, 0xc9c3b8, 0xe2ddd3)
  grid.position.set(0, -3.75, -1.2)
  grid.material.transparent = true
  grid.material.opacity = 0.24
  group.add(grid)
  scene.add(group)
  return group
}

export function initSystemLab(canvas) {
  const stage = createStage(canvas, { fov: 43, z: 16 })
  const { renderer, scene, camera } = stage
  renderer.outputColorSpace = THREE.SRGBColorSpace
  scene.fog = new THREE.Fog(COL.bg, 15, 30)
  camera.position.set(0, 1.0, 16)
  camera.lookAt(0, -0.15, 0)

  const root = new THREE.Group()
  scene.add(root)
  const background = createBackground(scene)

  const nodes = {
    user: makeNode('USER INPUT', USER_PROMPTS.store, [-6.0, 1.35, 0], [2.35, 0.96]),
    agent: makeNode('AGENT CORE', 'orchestrate · decide', [-3.55, 1.35, 0], [2.1, 1.1]),
    context: makeNode('WORKING CONTEXT', 'instructions + recall', [-0.35, 2.65, 0], [2.5, 0.9]),
    model: makeNode('LANGUAGE MODEL', 'reason · plan · choose', [2.35, 1.35, 0], [2.25, 1.08]),
    tools: makeNode('TOOLS', 'search · browser · APIs', [5.45, 2.55, 0], [1.85, 0.85]),
    response: makeNode('ACTION / REPLY', 'world state changes', [5.45, 1.25, 0], [1.95, 0.9]),
    curator: makeNode('MEMORY CURATOR', 'extract · compare · compact', [-5.55, -1.9, 0], [2.0, 0.88]),
  }
  Object.values(nodes).forEach((node) => root.add(node))

  const chamber = makeMemoryChamber()
  root.add(chamber)

  const baseLinks = [
    [[-4.82,1.35,0],[-4.6,1.35,0]],
    [[-2.5,1.35,0],[-1.7,1.8,0],[-1.25,2.65,0]],
    [[0.9,2.65,0],[1.3,2.0,0],[1.25,1.55,0]],
    [[3.5,1.5,0],[4.15,2.15,0],[4.5,2.45,0]],
    [[3.45,1.1,0],[4.45,1.25,0]],
    [[-3.6,.8,0],[-4.25,-.45,0],[-5.15,-1.48,0]],
    [[.55,.52,0],[.2,1.35,0],[-.25,2.2,0]],
  ]
  const baseLinkGroup = new THREE.Group()
  baseLinks.forEach((points) => baseLinkGroup.add(lineFrom(points, 0xaeb5bf, 0.52)))
  root.add(baseLinkGroup)

  const detailSystem = new THREE.Group()
  const labels = [
    ['select + inject', -0.05, 1.05], ['tool call', 4.15, 2.15], ['response tokens', 4.42, 1.0], ['write policy', -3.2, -.45],
  ]
  labels.forEach(([text, x, y]) => {
    const label = makeLabel(text, { color: '#7a8290', size: 0.15, bg: '#fffdf8' })
    label.position.set(x, y, 0.2)
    detailSystem.add(label)
  })
  root.add(detailSystem)

  let state = { store: 'files', phase: 'store', detail: 4, paused: false }
  let storeView = null
  let routeGroup = null
  let routeCurve = null
  let routeCurveOut = null
  let routePacket = null
  let storeTimeline = null
  let elapsed = 0
  const cycle = 10.2
  let progressCallback = () => {}

  function replaceStore(id, { updateTitle = true, resetElapsed = true } = {}) {
    if (storeView) {
      storeView.dispose()
    }
    storeView = new MEMORY_VIEWS[id](chamber, { embedded: true })
    const layout = EMBEDDED_LAYOUT[id][state.phase]
    storeView.group.position.set(layout.x, layout.y, 1.05)
    storeView.group.scale.set(layout.scale, layout.scaleY ?? layout.scale, layout.scale * 0.22)
    storeView.group.traverse((object) => {
      if (object.isSprite && object.material.map !== dotTexture()) {
        object.material.depthTest = false
        object.renderOrder = 10
      }
    })
    storeTimeline = storeView.phase(state.phase)
    storeTimeline.loop = false
    storeTimeline.holdEnd = 0

    if (updateTitle) {
      chamber.remove(chamber.userData.storeTitle)
      disposeGroup(chamber.userData.storeTitle)
      const storeTitle = makeLabel(STORE_TITLES[id], { color: '#7a8290', size: 0.21 })
      storeTitle.position.set(2.25, 2.12, 0.3)
      chamber.userData.storeTitle = storeTitle
      chamber.add(storeTitle)
    }
    if (resetElapsed) elapsed = reducedMotion ? cycle * 0.78 : 0
  }

  function activeMemoryTarget() {
    const layout = EMBEDDED_LAYOUT[state.store][state.phase]
    const [localX, localY] = MEMORY_TARGETS[state.store][state.phase]
    return [
      chamber.position.x + layout.x + localX * layout.scale,
      chamber.position.y + layout.y + localY * (layout.scaleY ?? layout.scale),
      1.28,
    ]
  }

  function activeRoutes() {
    const target = activeMemoryTarget()
    const start = [-6.0, 1.35, 0.56]
    if (state.phase === 'retrieve') {
      return {
        inbound: [start, [-4.82, 1.35, 0.54], [-3.55, 1.25, 0.58], [-2.55, 0.45, 0.74], [-1.8, -0.3, 0.92], target],
        outbound: [target, [-1.55, 0.82, 0.96], [-0.35, 2.65, 0.58], [2.35, 1.35, 0.56], [5.45, 1.25, 0.56]],
      }
    }
    return {
      inbound: [start, [-4.82, 1.35, 0.54], [-3.55, 1.2, 0.58], [-4.15, -0.3, 0.74], [-5.55, -1.9, 0.82], target],
      outbound: null,
    }
  }

  function updateUserPrompt() {
    const oldPrompt = nodes.user.userData.sub
    nodes.user.remove(oldPrompt)
    disposeGroup(oldPrompt)
    const prompt = makeLabel(USER_PROMPTS[state.phase], { color: '#667085', size: 0.18 })
    prompt.position.set(0.12, -0.25, 0.18)
    prompt.userData.detailLabel = true
    prompt.visible = state.detail >= 2
    nodes.user.add(prompt)
    nodes.user.userData.sub = prompt
  }

  function replaceRoute() {
    if (routeGroup) {
      root.remove(routeGroup)
      disposeGroup(routeGroup)
    }
    routeGroup = new THREE.Group()
    const routes = activeRoutes()
    routeCurve = curveFrom(routes.inbound, 0.35)
    routeCurveOut = routes.outbound ? curveFrom(routes.outbound, 0.35) : null
    const color = PHASE_COLORS[state.phase]
    const ghost = tubeFrom(routeCurve, color, 0.24, 0.014)
    routeGroup.add(ghost)
    if (routeCurveOut) routeGroup.add(tubeFrom(routeCurveOut, color, 0.2, 0.014))
    routePacket = makePacket(color, 0.58)
    routePacket.userData.glow.material.blending = THREE.NormalBlending
    routePacket.userData.glow.material.opacity = 0.32
    const tagText = state.phase === 'store' ? 'm1 · semantic fact' : state.phase === 'retrieve' ? 'query → retrieved context' : 'm5 · contradicts m3'
    const tag = makeLabel(tagText, { color: state.phase === 'store' ? '#d66f28' : state.phase === 'retrieve' ? '#177a9b' : '#7254a3', size: 0.18, bg: '#fffdf8', pad: 10 })
    tag.position.set(0, 0.38, 0)
    routePacket.add(tag)
    routePacket.traverse((object) => {
      if (!object.material) return
      object.material.depthTest = false
      object.material.depthWrite = false
      object.renderOrder = object.isSprite ? 10 : 9
    })
    routeGroup.add(routePacket)
    root.add(routeGroup)
    updateUserPrompt()
  }

  function applyDetail() {
    Object.values(nodes).forEach((node) => { node.userData.sub.visible = state.detail >= 2 })
    detailSystem.visible = state.detail >= 4
    chamber.userData.panel.material.opacity = 0.82 + state.detail * 0.035
    chamber.userData.edges.material.opacity = 0.3 + state.detail * 0.1
    replaceRoute()
  }

  function setStore(id) {
    if (!MEMORY_VIEWS[id] || state.store === id) return
    state.store = id
    replaceStore(id)
    replaceRoute()
  }

  function setPhase(phase) {
    if (!PHASE_COLORS[phase] || state.phase === phase) return
    state.phase = phase
    replaceStore(state.store, { updateTitle: false })
    chamber.userData.edges.material.color.set(PHASE_COLORS[phase])
    replaceRoute()
  }

  function setDetail(detail) {
    state.detail = Math.max(1, Math.min(4, detail))
    applyDetail()
  }

  function setPaused(paused) { state.paused = paused }
  function seek(progress) {
    const targetProgress = THREE.MathUtils.clamp(progress, 0, 0.999)
    replaceStore(state.store, { updateTitle: false, resetElapsed: false })
    elapsed = targetProgress * cycle
    const localSeconds = Math.max(0, elapsed - IMPACT_AT[state.phase] * cycle) * 1.12
    if (storeTimeline && localSeconds > 0) storeTimeline.update(localSeconds)
  }
  function restart() { replaceStore(state.store, { updateTitle: false }) }
  function onProgress(callback) { progressCallback = callback || (() => {}) }

  replaceStore('files')
  applyDetail()

  const pointer = new THREE.Vector2()
  const orbit = {
    dragging: false,
    lastX: 0,
    lastY: 0,
    yaw: 0,
    pitch: 0,
    targetYaw: 0,
    targetPitch: 0,
  }

  canvas.addEventListener('pointerdown', (event) => {
    orbit.dragging = true
    orbit.lastX = event.clientX
    orbit.lastY = event.clientY
    canvas.setPointerCapture(event.pointerId)
    canvas.classList.add('is-orbiting')
  })
  canvas.addEventListener('pointermove', (event) => {
    const rect = canvas.getBoundingClientRect()
    pointer.x = ((event.clientX - rect.left) / rect.width - 0.5) * 2
    pointer.y = ((event.clientY - rect.top) / rect.height - 0.5) * 2
    if (orbit.dragging) {
      const dx = event.clientX - orbit.lastX
      const dy = event.clientY - orbit.lastY
      orbit.targetYaw = THREE.MathUtils.clamp(orbit.targetYaw + dx * 0.0035, -0.22, 0.22)
      orbit.targetPitch = THREE.MathUtils.clamp(orbit.targetPitch + dy * 0.0028, -0.08, 0.08)
      orbit.lastX = event.clientX
      orbit.lastY = event.clientY
    }
  }, { passive: true })
  function stopOrbit(event) {
    orbit.dragging = false
    if (event?.pointerId != null && canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId)
    canvas.classList.remove('is-orbiting')
  }
  canvas.addEventListener('pointerup', stopOrbit)
  canvas.addEventListener('pointercancel', stopOrbit)
  canvas.addEventListener('pointerleave', () => {
    pointer.set(0, 0)
    if (!orbit.dragging) canvas.classList.remove('is-orbiting')
  })

  function resetView() {
    orbit.targetYaw = 0
    orbit.targetPitch = 0
  }

  const timer = new THREE.Timer()
  timer.connect(document)
  function frame(timestamp) {
    requestAnimationFrame(frame)
    timer.update(timestamp)
    const rawDelta = timer.getDelta()
    const dt = Number.isFinite(rawDelta) ? Math.max(0, Math.min(rawDelta, 0.05)) : 0
    const t = timer.getElapsed()
    if (!state.paused && !reducedMotion) {
      elapsed += dt
      if (elapsed >= cycle) replaceStore(state.store, { updateTitle: false })
    }
    const progress = elapsed / cycle

    if (storeView && !state.paused) storeView.update(dt, t)
    if (storeTimeline && progress >= IMPACT_AT[state.phase] && !state.paused) {
      if (reducedMotion && storeTimeline.t < storeTimeline.duration) storeTimeline.update(storeTimeline.duration + 0.1)
      else if (!reducedMotion) storeTimeline.update(dt * 1.12)
    }
    if (routePacket && routeCurve) {
      const impact = IMPACT_AT[state.phase]
      if (state.phase === 'retrieve') {
        if (progress <= impact) {
          const inbound = THREE.MathUtils.clamp((progress - 0.055) / (impact - 0.055), 0, 1)
          routePacket.position.copy(routeCurve.getPoint(inbound))
        } else if (progress < RETRIEVE_RELEASE_AT) {
          routePacket.position.copy(routeCurve.getPoint(1))
        } else {
          const outbound = THREE.MathUtils.clamp((progress - RETRIEVE_RELEASE_AT) / (0.91 - RETRIEVE_RELEASE_AT), 0, 1)
          routePacket.position.copy(routeCurveOut.getPoint(outbound))
        }
        routePacket.visible = progress >= 0.045 && progress <= 0.94
      } else {
        const travel = THREE.MathUtils.clamp((progress - 0.055) / (impact - 0.055), 0, 1)
        routePacket.visible = progress >= 0.045 && progress <= impact + 0.035
        routePacket.position.copy(routeCurve.getPoint(travel))
      }
      const impactDistance = Math.abs(progress - IMPACT_AT[state.phase])
      const impactPulse = Math.max(0, 1 - impactDistance / 0.06)
      routePacket.scale.setScalar(0.92 + Math.sin(t * 4) * 0.04 + impactPulse * 0.35)
    }
    const impact = IMPACT_AT[state.phase]
    const borderFlash = revealBetween(progress, impact, impact + 0.025) * (1 - revealBetween(progress, impact + 0.03, impact + 0.16))
    chamber.userData.edges.material.opacity = 0.62 + borderFlash * 0.38

    const stepIndex = progress < 0.16 ? 0
      : progress < IMPACT_AT[state.phase] ? 1
        : state.phase === 'retrieve' && progress < RETRIEVE_RELEASE_AT ? 2
          : progress < 0.82 ? 2 : 3
    progressCallback({
      progress,
      seconds: Math.floor(elapsed),
      stepIndex,
      step: STORY[state.phase][stepIndex],
    })

    const targetZ = camera.aspect < 1 ? 23 : camera.aspect < 1.35 ? 18.5 : 16
    camera.position.z += (targetZ - camera.position.z) * 0.045
    if (!reducedMotion) {
      camera.position.x += (pointer.x * 0.18 - camera.position.x) * 0.025
      camera.position.y += (1 - pointer.y * 0.1 - camera.position.y) * 0.025
      background.rotation.y = t * 0.003
    }
    orbit.yaw += (orbit.targetYaw - orbit.yaw) * 0.12
    orbit.pitch += (orbit.targetPitch - orbit.pitch) * 0.12
    root.rotation.y = orbit.yaw
    root.rotation.x = orbit.pitch
    camera.lookAt(0, -0.15, 0)
    renderer.render(scene, camera)
  }
  requestAnimationFrame(frame)

  return {
    setStore,
    setPhase,
    setDetail,
    setPaused,
    seek,
    restart,
    resetView,
    onProgress,
    getDuration: () => cycle,
    getState: () => ({ ...state }),
    dispose: () => {
      timer.dispose()
      stage.dispose()
      disposeGroup(root)
      disposeGroup(background)
    },
  }
}
