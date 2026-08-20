import * as THREE from 'three'

// Palette — keep in sync with CSS custom properties in styles.css
export const COL = {
  bg: 0x0b0d12,
  amber: 0xffb454,
  amberDim: 0x8a6335,
  cyan: 0x7dd3fc,
  violet: 0xc4b5fd,
  red: 0xf38ba8,
  green: 0x9ece8f,
  grey: 0x737b8f,
  line: 0x232a3b,
  text: 0xe8e6e0,
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
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false })
  const sp = new THREE.Sprite(mat)
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
