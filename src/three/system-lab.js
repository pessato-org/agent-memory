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
import { INTERNAL_CHAPTERS, INTERNAL_VIEWS, STAGE as INTERNAL_STAGE } from './internals.js'

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

// Bounding box of the system diagram, used to frame the camera. The slight
// elevation keeps the diagram reading as a scene rather than a flat chart.
const SYSTEM_STAGE = { w: 13.9, h: 7.8, cx: -0.35, cy: -0.62, elevation: 0.55 }

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

function seeded(index) {
  const value = Math.sin(index * 9187.13 + 0.731) * 43758.5453
  return value - Math.floor(value)
}


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
  // Depth haze, kept relative to the camera. A fixed range would swallow the
  // whole scene whenever the camera pulls back to fit a tall, narrow viewport.
  scene.fog = new THREE.Fog(COL.bg, 15, 30)
  function updateFog() {
    scene.fog.near = Math.max(0.1, camera.position.z - 1.5)
    scene.fog.far = camera.position.z + 15
  }
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

  let state = { store: 'files', phase: 'store', detail: 4, paused: false, mode: 'system', chapter: 0 }
  let storeView = null
  let routeGroup = null
  let routeCurve = null
  let routeCurveOut = null
  let routePacket = null
  let storeTimeline = null
  let elapsed = 0
  const cycle = 10.2
  let progressCallback = () => {}

  /* ---------- internals ("inside the store") layer ---------- */

  const internalsRoot = new THREE.Group()
  internalsRoot.visible = false
  scene.add(internalsRoot)
  let internalView = null
  let chapterElapsed = 0
  const CHAPTER_RUN = 9.0
  const CHAPTER_HOLD = 2.6
  const chapterCycle = CHAPTER_RUN + CHAPTER_HOLD

  function chapterIds() { return INTERNAL_CHAPTERS[state.store] ?? [] }
  function chapterId() { return chapterIds()[state.chapter] ?? chapterIds()[0] }

  function buildInternals() {
    if (internalView) internalView.dispose()
    internalView = new INTERNAL_VIEWS[state.store](internalsRoot)
    internalView.setChapter(chapterId())
    chapterElapsed = reducedMotion ? CHAPTER_RUN : 0
  }

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
    routePacket.userData.tag = tag
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
    if (state.mode === 'internals') {
      state.chapter = 0
      buildInternals()
    } else if (internalView) {
      internalView.dispose()
      internalView = null
    }
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

  function setMode(mode) {
    const next = mode === 'internals' ? 'internals' : 'system'
    if (state.mode === next) return
    state.mode = next
    snapCamera = true
    if (next === 'internals') {
      buildInternals()
      internalsRoot.visible = true
      root.visible = false
    } else {
      internalsRoot.visible = false
      root.visible = true
      elapsed = reducedMotion ? cycle * 0.78 : 0
      replaceStore(state.store, { updateTitle: false })
    }
  }

  function setChapter(index) {
    const ids = chapterIds()
    if (!ids.length) return
    const next = ((index % ids.length) + ids.length) % ids.length
    state.chapter = next
    if (state.mode === 'internals') {
      if (!internalView) buildInternals()
      else {
        internalView.setChapter(chapterId())
        chapterElapsed = reducedMotion ? CHAPTER_RUN : 0
      }
    }
  }

  function stepChapter(delta) { setChapter(state.chapter + delta) }

  function setPaused(paused) { state.paused = paused }

  function seek(progress) {
    const targetProgress = THREE.MathUtils.clamp(progress, 0, 0.999)
    if (state.mode === 'internals') {
      chapterElapsed = targetProgress * CHAPTER_RUN
      return
    }
    replaceStore(state.store, { updateTitle: false, resetElapsed: false })
    elapsed = targetProgress * cycle
    const localSeconds = Math.max(0, elapsed - IMPACT_AT[state.phase] * cycle) * 1.12
    if (storeTimeline && localSeconds > 0) storeTimeline.update(localSeconds)
  }

  function restart() {
    if (state.mode === 'internals') {
      chapterElapsed = reducedMotion ? CHAPTER_RUN : 0
      return
    }
    replaceStore(state.store, { updateTitle: false })
  }

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

  /* The canvas runs edge to edge, but fixed chrome sits over the top and
     bottom of it. Fitting a scene to the raw canvas would tuck content
     underneath that chrome, so every scene is fitted to the clear band
     between them. The UI layer measures that band from the live DOM and
     pushes it in here, which keeps the fit correct across every breakpoint
     rather than depending on hardcoded control heights. */
  // Framing eases while the viewport settles, but must be correct on the
  // very first painted frame and immediately after a view switch.
  let snapCamera = true
  let safeArea = { top: 104, bottom: 104, side: 18 }

  function setSafeArea(next) {
    const updated = {
      top: Math.max(0, next?.top ?? safeArea.top),
      bottom: Math.max(0, next?.bottom ?? safeArea.bottom),
      side: Math.max(0, next?.side ?? safeArea.side),
    }
    const changed = updated.top !== safeArea.top
      || updated.bottom !== safeArea.bottom
      || updated.side !== safeArea.side
    safeArea = updated
    // The band moves on discrete events (load, resize, view switch), so
    // re-frame at once rather than easing across a visible drift.
    if (changed) snapCamera = true
  }

  function fitCamera(box) {
    const height = canvas.clientHeight || 1
    const width = canvas.clientWidth || 1
    const usableHeight = Math.max(140, height - safeArea.top - safeArea.bottom)
    const usableWidth = Math.max(140, width - safeArea.side * 2)
    const tanHalfFov = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
    // Blow the box up by the ratio of full canvas to safe band, so the box
    // itself lands inside the band once the whole canvas is filled.
    const neededHeight = box.h * (height / usableHeight)
    const neededWidth = box.w * (width / usableWidth)
    const zForHeight = neededHeight / 2 / tanHalfFov
    const zForWidth = neededWidth / 2 / (tanHalfFov * Math.max(camera.aspect, 0.35))
    const z = Math.max(zForHeight, zForWidth)
    // Recentre on the safe band when the chrome is lopsided.
    const visibleHeight = 2 * z * tanHalfFov
    const bandCentre = safeArea.top + usableHeight / 2
    const offsetY = ((bandCentre - height / 2) / height) * visibleHeight
    return { z, offsetY }
  }

  const timer = new THREE.Timer()
  timer.connect(document)
  function frameInternals(dt, t) {
    if (!state.paused && !reducedMotion) {
      chapterElapsed += dt
      if (chapterElapsed >= chapterCycle) chapterElapsed = 0
    }
    const p = THREE.MathUtils.clamp(chapterElapsed / CHAPTER_RUN, 0, 1)
    // Freeze the idle-motion clock under reduced motion: the chapter still
    // shows its finished state, it just stops breathing.
    if (internalView) internalView.render(p, reducedMotion ? 0 : t)

    const ids = chapterIds()
    progressCallback({
      // The scrubber tracks the chapter's own progress; the hold that
      // follows it simply parks the playhead at the end.
      mode: 'internals',
      progress: p,
      seconds: Math.min(Math.floor(chapterElapsed), Math.round(CHAPTER_RUN)),
      chapterIndex: state.chapter,
      chapterId: chapterId(),
      chapterCount: ids.length,
    })

    const fit = fitCamera(INTERNAL_STAGE)
    const ease = snapCamera ? 1 : 0.06
    snapCamera = false
    camera.position.z += (fit.z - camera.position.z) * ease
    camera.position.x += (INTERNAL_STAGE.cx - camera.position.x) * ease
    camera.position.y += (INTERNAL_STAGE.cy + fit.offsetY - camera.position.y) * ease
    orbit.yaw += (orbit.targetYaw - orbit.yaw) * 0.12
    orbit.pitch += (orbit.targetPitch - orbit.pitch) * 0.12
    internalsRoot.rotation.y = orbit.yaw * 0.5
    internalsRoot.rotation.x = orbit.pitch * 0.5
    camera.lookAt(INTERNAL_STAGE.cx, INTERNAL_STAGE.cy + fit.offsetY, 0)
    updateFog()
    renderer.render(scene, camera)
  }

  function frame(timestamp) {
    requestAnimationFrame(frame)
    timer.update(timestamp)
    const rawDelta = timer.getDelta()
    const dt = Number.isFinite(rawDelta) ? Math.max(0, Math.min(rawDelta, 0.05)) : 0
    const t = timer.getElapsed()
    if (state.mode === 'internals') {
      frameInternals(dt, t)
      return
    }
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
      /* The tag reads the packet while it travels, but it is a wide sprite drawn
         over everything - park it before the packet lands so it never sits on top
         of the memory graphic at the exact moment that graphic changes. */
      const tag = routePacket.userData.tag
      if (tag) {
        const arriving = 1 - revealBetween(progress, impact - 0.07, impact - 0.01)
        const leaving = state.phase === 'retrieve'
          ? revealBetween(progress, RETRIEVE_RELEASE_AT, RETRIEVE_RELEASE_AT + 0.035)
          : 0
        tag.material.opacity = Math.max(arriving, leaving)
        tag.visible = tag.material.opacity > 0.02
      }
    }
    const impact = IMPACT_AT[state.phase]
    const borderFlash = revealBetween(progress, impact, impact + 0.025) * (1 - revealBetween(progress, impact + 0.03, impact + 0.16))
    chamber.userData.edges.material.opacity = 0.62 + borderFlash * 0.38

    const stepIndex = progress < 0.16 ? 0
      : progress < IMPACT_AT[state.phase] ? 1
        : state.phase === 'retrieve' && progress < RETRIEVE_RELEASE_AT ? 2
          : progress < 0.82 ? 2 : 3
    progressCallback({
      mode: 'system',
      progress,
      seconds: Math.floor(elapsed),
      stepIndex,
      step: STORY[state.phase][stepIndex],
    })

    const fit = fitCamera(SYSTEM_STAGE)
    const focusY = SYSTEM_STAGE.cy + fit.offsetY
    const driftX = reducedMotion ? 0 : pointer.x * 0.18
    const driftY = reducedMotion ? 0 : -pointer.y * 0.1
    const glide = snapCamera ? 1 : 0.045
    const drift = snapCamera ? 1 : 0.025
    snapCamera = false
    camera.position.z += (fit.z - camera.position.z) * glide
    camera.position.x += (SYSTEM_STAGE.cx + driftX - camera.position.x) * drift
    camera.position.y += (focusY + SYSTEM_STAGE.elevation + driftY - camera.position.y) * drift
    if (!reducedMotion) background.rotation.y = t * 0.003
    orbit.yaw += (orbit.targetYaw - orbit.yaw) * 0.12
    orbit.pitch += (orbit.targetPitch - orbit.pitch) * 0.12
    root.rotation.y = orbit.yaw
    root.rotation.x = orbit.pitch
    camera.lookAt(SYSTEM_STAGE.cx, focusY, 0)
    updateFog()
    renderer.render(scene, camera)
  }
  requestAnimationFrame(frame)

  const api = {
    setStore,
    setPhase,
    setDetail,
    setMode,
    setSafeArea,
    setChapter,
    stepChapter,
    setPaused,
    seek,
    restart,
    resetView,
    onProgress,
    getDuration: () => (state.mode === 'internals' ? CHAPTER_RUN : cycle),
    getChapters: (id = state.store) => INTERNAL_CHAPTERS[id] ?? [],
    getState: () => ({ ...state }),
    dispose: () => {
      timer.dispose()
      stage.dispose()
      if (internalView) internalView.dispose()
      disposeGroup(internalsRoot)
      disposeGroup(root)
      disposeGroup(background)
    },
  }

  if (import.meta.env?.DEV) {
    // Handy when tuning scene framing: window.__lab.debug()
    api.debug = () => ({
      mode: state.mode,
      aspect: +camera.aspect.toFixed(3),
      camera: [camera.position.x, camera.position.y, camera.position.z].map((v) => +v.toFixed(2)),
      canvas: [canvas.clientWidth, canvas.clientHeight],
      fit: fitCamera(state.mode === 'internals' ? INTERNAL_STAGE : SYSTEM_STAGE),
    })
  }
  return api
}
