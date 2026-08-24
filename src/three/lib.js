import * as THREE from 'three'

// Palette - keep in sync with CSS custom properties in styles.css
export const COL = {
  bg: 0xf3f0e8,
  amber: 0xd66f28,
  amberDim: 0xb98b69,
  cyan: 0x177a9b,
  violet: 0x7254a3,
  red: 0xc44955,
  green: 0x4c8b5f,
  grey: 0x8a929f,
  line: 0xd8d2c6,
  text: 0x202630,
}

export const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

/* ---------- renderer / scene scaffolding ---------- */

export function createStage(canvas, { fov = 45, z = 14 } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(fov, 1, 0.1, 200)
  camera.position.set(0, 0, z)

  function resize() {
    const w = canvas.clientWidth || canvas.parentElement.clientWidth
    const h = canvas.clientHeight || canvas.parentElement.clientHeight
    if (!w || !h) return
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
  }
  resize()
  const ro = new ResizeObserver(resize)
  ro.observe(canvas.parentElement || canvas)
  return { renderer, scene, camera, resize, dispose: () => ro.disconnect() }
}

/* ---------- soft round particle texture ---------- */

let _dotTex = null
export function dotTexture() {
  if (_dotTex) return _dotTex
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  grad.addColorStop(0, 'rgba(255,255,255,1)')
  grad.addColorStop(0.35, 'rgba(255,255,255,0.8)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 64, 64)
  _dotTex = new THREE.CanvasTexture(c)
  return _dotTex
}

/* ---------- text label sprite (mono font, crisp) ---------- */

export function makeLabel(text, { color = '#a7adbd', size = 0.5, bg = null, pad = 8, font = '500 26px "IBM Plex Mono", monospace' } = {}) {
  const dpr = 2
  const c = document.createElement('canvas')
  const g = c.getContext('2d')
  g.font = font
  const w = Math.ceil(g.measureText(text).width) + pad * 2
  const h = 40 + pad
  c.width = w * dpr
  c.height = h * dpr
  g.scale(dpr, dpr)
  if (bg) {
    g.fillStyle = bg
    g.beginPath()
    g.roundRect(0, 0, w, h, 6)
    g.fill()
  }
  g.font = font
  g.fillStyle = color
  g.textBaseline = 'middle'
  g.fillText(text, pad, h / 2 + 1)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false })
  const sp = new THREE.Sprite(mat)
  sp.renderOrder = 10
  const aspect = w / h
  sp.scale.set(size * aspect, size, 1)
  return sp
}

/* ---------- glowing packet (the memory travelling through the system) ---------- */

export function makePacket(color = COL.amber, size = 0.55) {
  const group = new THREE.Group()
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(size * 0.16, 16, 16),
    new THREE.MeshBasicMaterial({ color })
  )
  const glowMat = new THREE.SpriteMaterial({
    map: dotTexture(), color, transparent: true, opacity: 0.85,
    blending: THREE.AdditiveBlending, depthWrite: false,
  })
  const glow = new THREE.Sprite(glowMat)
  glow.scale.set(size, size, 1)
  group.add(glow, core)
  group.userData = { core, glow }
  return group
}

/* ---------- curve flow: send a packet along a path ---------- */

export function curveFrom(points, tension = 0.5) {
  return new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)), false, 'catmullrom', tension)
}

/* ---------- tiny timeline / tween engine ---------- */

export const ease = {
  linear: (t) => t,
  inOut: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  out: (t) => 1 - Math.pow(1 - t, 3),
  in: (t) => t * t * t,
}

export class Timeline {
  constructor({ loop = true, holdEnd = 1.2 } = {}) {
    this.items = []
    this.t = 0
    this.duration = 0
    this.loop = loop
    this.holdEnd = holdEnd
    this.onLoop = null
  }
  // fn receives eased progress 0..1
  add(at, dur, fn, easing = ease.inOut) {
    this.items.push({ at, dur, fn, easing, done: false })
    this.duration = Math.max(this.duration, at + dur)
    return this
  }
  call(at, fn) {
    this.items.push({ at, dur: 0, fn, easing: ease.linear, done: false })
    this.duration = Math.max(this.duration, at)
    return this
  }
  update(dt) {
    this.t += dt
    for (const it of this.items) {
      if (this.t < it.at) continue
      if (it.dur === 0) {
        if (!it.done) { it.fn(); it.done = true }
        continue
      }
      const p = Math.min(1, (this.t - it.at) / it.dur)
      it.fn(it.easing(p))
      if (p >= 1) it.done = true
    }
    if (this.t > this.duration + this.holdEnd && this.loop) {
      this.reset()
      if (this.onLoop) this.onLoop()
    }
  }
  reset() {
    this.t = 0
    for (const it of this.items) it.done = false
  }
}

export function moveAlong(obj, curve, p) {
  const pos = curve.getPoint(p)
  obj.position.copy(pos)
}

/* ---------- misc ---------- */

export function fadeMaterials(root, opacity) {
  root.traverse((o) => {
    if (o.material) {
      o.material.transparent = true
      o.material.opacity = opacity * (o.userData.baseOpacity ?? 1)
    }
  })
}

export function disposeGroup(root) {
  root.traverse((o) => {
    if (o.geometry) o.geometry.dispose()
    if (o.material) {
      const mats = Array.isArray(o.material) ? o.material : [o.material]
      mats.forEach((m) => {
        if (m.map && m.map !== _dotTex) m.map.dispose()
        m.dispose()
      })
    }
  })
}

/* only run render loops while on screen */
export function whenVisible(el, cb) {
  let visible = false
  const io = new IntersectionObserver((entries) => {
    visible = entries[0].isIntersecting
    cb(visible)
  }, { rootMargin: '100px' })
  io.observe(el)
  return () => io.disconnect()
}

/* ============================================================
   Deep-dive primitives: cards, dynamic labels, arrows, dashes.
   Used by src/three/internals.js. Everything here is built once
   per chapter and animated by transform/colour, never redrawn
   per frame, so the internals scenes stay cheap.
   ============================================================ */

const FONT_MONO = (px, weight = 500) => `${weight} ${px}px "IBM Plex Mono", monospace`
const FONT_SANS = (px, weight = 500) => `${weight} ${px}px "DM Sans", system-ui, sans-serif`
export const FONTS = { mono: FONT_MONO, sans: FONT_SANS }

/* A label whose text changes over time (counters, scores, live values).
   Re-renders only when the string actually changes, onto a small canvas. */
export class DynamicLabel {
  constructor({ color = '#475467', size = 0.26, bg = null, pad = 8, font = FONT_MONO(26), align = 'center', maxChars = 34 } = {}) {
    this.opts = { color, size, bg, pad, font, align }
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    ctx.font = font
    // Fix the canvas to a stable width so the sprite does not jitter as digits change.
    this.w = Math.ceil(ctx.measureText('M'.repeat(maxChars)).width) + pad * 2
    this.h = 40 + pad
    canvas.width = this.w * 2
    canvas.height = this.h * 2
    ctx.scale(2, 2)
    this.canvas = canvas
    this.ctx = ctx
    this.texture = new THREE.CanvasTexture(canvas)
    this.texture.colorSpace = THREE.SRGBColorSpace
    const material = new THREE.SpriteMaterial({ map: this.texture, transparent: true, depthWrite: false, depthTest: false })
    this.sprite = new THREE.Sprite(material)
    this.sprite.renderOrder = 11
    this.sprite.scale.set(size * (this.w / this.h), size, 1)
    this.text = null
    this.setText('')
  }

  setText(text, color) {
    const nextColor = color || this.opts.color
    if (text === this.text && nextColor === this._color) return
    this.text = text
    this._color = nextColor
    const { ctx, w, h } = this
    ctx.clearRect(0, 0, w, h)
    ctx.font = this.opts.font
    if (this.opts.bg && text) {
      ctx.fillStyle = this.opts.bg
      ctx.beginPath()
      const tw = Math.min(w, ctx.measureText(text).width + this.opts.pad * 2)
      const x = this.opts.align === 'left' ? 0 : (w - tw) / 2
      ctx.roundRect(x, 0, tw, h, 6)
      ctx.fill()
    }
    // Shrink to fit rather than clip: a counter that outgrows its box should
    // still be readable, and callers should not have to size every string.
    ctx.font = this.opts.font
    const available = w - this.opts.pad * 2
    const measured = ctx.measureText(text).width
    if (measured > available && measured > 0) {
      const base = Number(this.opts.font.match(/(\d+(?:\.\d+)?)px/)?.[1] ?? 26)
      const scaled = Math.max(8, Math.floor(base * (available / measured)))
      ctx.font = this.opts.font.replace(/\d+(?:\.\d+)?px/, `${scaled}px`)
    }
    ctx.fillStyle = nextColor
    ctx.textBaseline = 'middle'
    ctx.textAlign = this.opts.align === 'left' ? 'left' : 'center'
    ctx.fillText(text, this.opts.align === 'left' ? this.opts.pad : w / 2, h / 2 + 1)
    this.texture.needsUpdate = true
  }

  get position() { return this.sprite.position }
  set opacity(value) { this.sprite.material.opacity = value }
  get opacity() { return this.sprite.material.opacity }
}

/* A flat card: filled plane plus a crisp border. The workhorse of the
   internals scenes - every panel, row, page and chip is one of these. */
export function makeCard(width, height, {
  fill = 0xfffdf8,
  border = COL.line,
  fillOpacity = 1,
  borderOpacity = 0.85,
  z = 0,
} = {}) {
  const group = new THREE.Group()
  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({ color: fill, transparent: true, opacity: fillOpacity, depthWrite: false })
  )
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(plane.geometry),
    new THREE.LineBasicMaterial({ color: border, transparent: true, opacity: borderOpacity })
  )
  edges.position.z = 0.001
  group.add(plane, edges)
  group.position.z = z
  group.userData = { plane, edges, width, height }
  return group
}

/* Recolour a card built by makeCard. */
export function paintCard(card, { fill, border, fillOpacity, borderOpacity } = {}) {
  const { plane, edges } = card.userData
  if (fill !== undefined) plane.material.color.set(fill)
  if (border !== undefined) edges.material.color.set(border)
  if (fillOpacity !== undefined) plane.material.opacity = fillOpacity
  if (borderOpacity !== undefined) edges.material.opacity = borderOpacity
}

/* Straight line between two points, rebuildable in place. */
export function makeLine(from, to, color = COL.grey, opacity = 0.7) {
  const geometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(...from), new THREE.Vector3(...to),
  ])
  const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color, transparent: true, opacity }))
  line.userData.baseOpacity = opacity
  return line
}

export function setLinePoints(line, from, to) {
  line.geometry.setFromPoints([new THREE.Vector3(...from), new THREE.Vector3(...to)])
  line.geometry.attributes.position.needsUpdate = true
}

/* Dashed line - needs computeLineDistances, easy to forget. */
export function makeDashedLine(from, to, color = COL.grey, { opacity = 0.7, dash = 0.09, gap = 0.07 } = {}) {
  const geometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(...from), new THREE.Vector3(...to),
  ])
  const line = new THREE.Line(geometry, new THREE.LineDashedMaterial({
    color, transparent: true, opacity, dashSize: dash, gapSize: gap,
  }))
  line.computeLineDistances()
  return line
}

/* Arrow: shaft plus a triangular head, drawn flat in the XY plane. */
export function makeArrow(from, to, color = COL.grey, { opacity = 0.85, head = 0.13 } = {}) {
  const group = new THREE.Group()
  const a = new THREE.Vector3(...from)
  const b = new THREE.Vector3(...to)
  const direction = b.clone().sub(a)
  const length = direction.length()
  if (length < 1e-5) return group
  direction.normalize()
  const shaftEnd = b.clone().sub(direction.clone().multiplyScalar(head * 0.9))
  const shaft = makeLine([a.x, a.y, a.z], [shaftEnd.x, shaftEnd.y, shaftEnd.z], color, opacity)
  const tip = new THREE.Mesh(
    new THREE.CircleGeometry(head, 3),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false })
  )
  tip.position.copy(b)
  // CircleGeometry's first vertex sits at angle 0, so the triangle already
  // points along +x. Rotate it straight onto the direction of travel.
  tip.rotation.z = Math.atan2(direction.y, direction.x)
  group.add(shaft, tip)
  group.userData = { shaft, tip, color }
  return group
}

/* A rounded pill of text - the visual language for tokens, keys and chips. */
export function makeChip(text, {
  color = '#475467',
  fill = '#fffdf8',
  border = null,
  size = 0.24,
  font = FONT_MONO(24),
  padX = 14,
} = {}) {
  const dpr = 2
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  ctx.font = font
  const w = Math.ceil(ctx.measureText(text).width) + padX * 2
  const h = 46
  canvas.width = w * dpr
  canvas.height = h * dpr
  ctx.scale(dpr, dpr)
  ctx.beginPath()
  ctx.roundRect(1, 1, w - 2, h - 2, 9)
  ctx.fillStyle = fill
  ctx.fill()
  if (border) {
    ctx.strokeStyle = border
    ctx.lineWidth = 1.6
    ctx.stroke()
  }
  ctx.font = font
  ctx.fillStyle = color
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'center'
  ctx.fillText(text, w / 2, h / 2 + 1)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, depthTest: false }))
  sprite.renderOrder = 10
  sprite.scale.set(size * (w / h), size, 1)
  return sprite
}

/* Multi-line block of monospace text on a plane - code, file contents, plans.
   Lines accept {text, color, bg, strike, indent}. */
export function makeTextBlock(lines, {
  width = 4.2,
  lineHeight = 0.28,
  fontSize = 24,
  color = '#475467',
  bg = '#fffdf8',
  padX = 22,
  padY = 20,
  ppu = 96,
} = {}) {
  const rows = lines.length
  const heightUnits = padY / ppu * 2 + rows * lineHeight
  const W = Math.round(width * ppu)
  const H = Math.round(heightUnits * ppu)
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const canvas = document.createElement('canvas')
  canvas.width = W * dpr
  canvas.height = H * dpr
  const ctx = canvas.getContext('2d')
  ctx.scale(dpr, dpr)
  const rowPx = lineHeight * ppu

  // Shrink the whole block rather than clipping its longest line. Clipped
  // code samples read as typos, and every caller would otherwise have to
  // count characters by hand.
  let size = fontSize
  ctx.font = FONT_MONO(fontSize)
  const widest = lines.reduce((max, line) => {
    const indent = (line.indent || 0) * fontSize * 0.6
    return Math.max(max, indent + (line.text ? ctx.measureText(line.text).width : 0))
  }, 0)
  const room = W - padX * 2
  if (widest > room && widest > 0) size = Math.max(9, Math.floor(fontSize * (room / widest)))

  function paint() {
    ctx.clearRect(0, 0, W, H)
    if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H) }
    ctx.textBaseline = 'middle'
    lines.forEach((line, i) => {
      const y = padY + rowPx * (i + 0.5)
      const x = padX + (line.indent || 0) * size * 0.6
      if (line.bg) {
        ctx.fillStyle = line.bg
        ctx.fillRect(padX * 0.4, y - rowPx * 0.48, W - padX * 0.8, rowPx * 0.96)
      }
      if (!line.text) return
      ctx.font = FONT_MONO(size, line.weight || 500)
      ctx.fillStyle = line.color || color
      ctx.fillText(line.text, x, y)
      if (line.strike) {
        const w = ctx.measureText(line.text).width
        ctx.strokeStyle = line.color || color
        ctx.lineWidth = 1.6
        ctx.beginPath()
        ctx.moveTo(x, y - 1)
        ctx.lineTo(x + w, y - 1)
        ctx.stroke()
      }
    })
    texture.needsUpdate = true
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(width, heightUnits),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false })
  )
  paint()
  mesh.userData = {
    lines,
    repaint: paint,
    lineY: (i) => heightUnits / 2 - (padY / ppu + lineHeight * (i + 0.5)),
    width,
    height: heightUnits,
  }
  return mesh
}

/* Horizontal progress/budget bar with a filled portion. */
export function makeBar(width, height, { track = 0xe8e3d8, fill = COL.amber, trackOpacity = 1 } = {}) {
  const group = new THREE.Group()
  const back = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({ color: track, transparent: true, opacity: trackOpacity, depthWrite: false })
  )
  const front = new THREE.Mesh(
    new THREE.PlaneGeometry(1, height),
    new THREE.MeshBasicMaterial({ color: fill, transparent: true, depthWrite: false })
  )
  front.position.z = 0.002
  group.add(back, front)
  group.userData = {
    back,
    front,
    width,
    // value 0..1, anchored to the left edge
    set(value) {
      const v = Math.max(0.0001, Math.min(1, value))
      front.scale.x = v * width
      front.position.x = -width / 2 + (v * width) / 2
    },
  }
  group.userData.set(0)
  return group
}

/* Smoothly ramp 0..1 between two progress marks, with an ease-out curve. */
export function ramp(progress, start, end, easing = ease.out) {
  if (end <= start) return progress >= end ? 1 : 0
  const t = Math.max(0, Math.min(1, (progress - start) / (end - start)))
  return easing(t)
}

/* 1 while progress sits inside [start,end], with soft edges. */
export function window01(progress, start, end, edge = 0.03) {
  return ramp(progress, start - edge, start, ease.linear) * (1 - ramp(progress, end, end + edge, ease.linear))
}

/* Set opacity across a subtree, respecting each material's base opacity. */
export function setGroupOpacity(root, opacity) {
  root.traverse((object) => {
    if (!object.material) return
    const materials = Array.isArray(object.material) ? object.material : [object.material]
    materials.forEach((material) => {
      material.transparent = true
      material.opacity = opacity * (object.userData.baseOpacity ?? 1)
    })
  })
}
