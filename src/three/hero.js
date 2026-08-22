import * as THREE from 'three'
import { COL, createStage, dotTexture, makePacket, makeLabel, curveFrom, moveAlong, whenVisible, reducedMotion } from './lib.js'

/*
  Hero: a stream of token particles flows left→right through the agent core.
  Most dissolve on the far side (forgotten). Every couple of seconds one token
  is "written": it turns amber and arcs out to one of four orbiting stores:
  file / rows / vectors / graph - which pulses as it absorbs the memory.
*/

export function initHero(canvas) {
  const stage = createStage(canvas, { fov: 42, z: 16 })
  const { renderer, scene, camera } = stage

  scene.fog = new THREE.Fog(COL.bg, 18, 34)

  /* ---- ambient starfield ---- */
  {
    const n = 260
    const pos = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 46
      pos[i * 3 + 1] = (Math.random() - 0.5) * 26
      pos[i * 3 + 2] = -6 - Math.random() * 18
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    const mat = new THREE.PointsMaterial({
      size: 0.12, map: dotTexture(), color: 0x39415a, transparent: true,
      opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending,
    })
    scene.add(new THREE.Points(geo, mat))
  }

  /* ---- agent core: nested wireframe icosahedra ---- */
  const core = new THREE.Group()
  const shellMat = new THREE.MeshBasicMaterial({ color: COL.grey, wireframe: true, transparent: true, opacity: 0.35 })
  const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(2.1, 1), shellMat)
  const innerMat = new THREE.MeshBasicMaterial({ color: COL.amber, wireframe: true, transparent: true, opacity: 0.5 })
  const inner = new THREE.Mesh(new THREE.IcosahedronGeometry(1.15, 0), innerMat)
  const heart = new THREE.Sprite(new THREE.SpriteMaterial({
    map: dotTexture(), color: COL.amber, transparent: true, opacity: 0.35,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }))
  heart.scale.set(3.4, 3.4, 1)
  core.add(shell, inner, heart)
  core.position.set(2.5, 0.2, 0)
  scene.add(core)

  const coreLabel = makeLabel('agent', { color: '#a7adbd', size: 0.55 })
  coreLabel.position.set(2.5, -2.9, 0)
  scene.add(coreLabel)

  /* ---- the conversation stream (grey tokens flowing through the core) ---- */
  const streamCurve = curveFrom([
    [-16, -0.6, -2], [-8, 0.4, -0.8], [2.5, 0.2, 0], [9, -0.2, -0.6], [16, 0.6, -2],
  ])
  const N_TOK = 90
  const tokGeo = new THREE.BufferGeometry()
  const tokPos = new Float32Array(N_TOK * 3)
  tokGeo.setAttribute('position', new THREE.BufferAttribute(tokPos, 3))
  const tokMat = new THREE.PointsMaterial({
    size: 0.34, map: dotTexture(), color: 0x9aa3ba, transparent: true,
    opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending,
  })
  const tokens = new THREE.Points(tokGeo, tokMat)
  scene.add(tokens)
  const tokState = Array.from({ length: N_TOK }, (_, i) => ({ p: (i / N_TOK), speed: 0.055 + Math.random() * 0.02, jitter: Math.random() * 100 }))

  // faint line tracing the stream
  {
    const pts = streamCurve.getPoints(80)
    const geo = new THREE.BufferGeometry().setFromPoints(pts)
    const mat = new THREE.LineBasicMaterial({ color: COL.line, transparent: true, opacity: 0.8 })
    scene.add(new THREE.Line(geo, mat))
  }

  /* ---- the four stores orbiting the core ---- */
  const stores = []
  const storeDefs = [
    { id: 'file', label: 'files.md', pos: [8.6, 3.4, -1] },
    { id: 'rows', label: 'sqlite', pos: [10.6, 0.6, -2] },
    { id: 'vec', label: 'vectors', pos: [8.9, -2.6, -1] },
    { id: 'graph', label: 'graph', pos: [5.6, 4.6, -3] },
  ]

  function buildGlyph(id) {
    const g = new THREE.Group()
    const mat = () => new THREE.MeshBasicMaterial({ color: COL.grey, wireframe: false, transparent: true, opacity: 0.9 })
    const lineMat = () => new THREE.LineBasicMaterial({ color: COL.grey, transparent: true, opacity: 0.9 })
    if (id === 'file') {
      const page = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.9), new THREE.MeshBasicMaterial({ color: 0x171b27, transparent: true, opacity: 0.95 }))
      const edge = new THREE.LineSegments(new THREE.EdgesGeometry(page.geometry), lineMat())
      g.add(page, edge)
      for (let i = 0; i < 5; i++) {
        const w = 0.9 - (i % 3) * 0.18
        const line = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.07), mat())
        line.position.set(-0.55 + w / 2 + 0.35 - 0.55 + 0.2, 0.62 - i * 0.3, 0.01)
        line.position.x = -0.75 + 0.15 + w / 2
        g.add(line)
      }
    } else if (id === 'rows') {
      for (let i = 0; i < 3; i++) {
        const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 0.34, 24), new THREE.MeshBasicMaterial({ color: 0x171b27, transparent: true, opacity: 0.95 }))
        disc.position.y = 0.55 - i * 0.55
        const rim = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.CylinderGeometry(0.8, 0.8, 0.34, 24)), lineMat())
        rim.position.y = disc.position.y
        g.add(disc, rim)
      }
    } else if (id === 'vec') {
      const n = 42
      const pos = new Float32Array(n * 3)
      for (let i = 0; i < n; i++) {
        const v = new THREE.Vector3().randomDirection().multiplyScalar(Math.cbrt(Math.random()) * 1.05)
        pos.set([v.x, v.y, v.z], i * 3)
      }
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
      g.add(new THREE.Points(geo, new THREE.PointsMaterial({
        size: 0.16, map: dotTexture(), color: COL.grey, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending,
      })))
    } else if (id === 'graph') {
      const nodes = [[0, 0.7, 0], [-0.8, -0.2, 0.2], [0.8, -0.1, -0.2], [0.15, -0.8, 0.1], [-0.5, 0.9, -0.3]]
      const edges = [[0, 1], [0, 2], [0, 4], [2, 3], [1, 3]]
      for (const nd of nodes) {
        const s = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 12), mat())
        s.position.set(...nd)
        g.add(s)
      }
      for (const [a, b] of edges) {
        const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...nodes[a]), new THREE.Vector3(...nodes[b])])
        g.add(new THREE.Line(geo, lineMat()))
      }
    }
    return g
  }

  for (const def of storeDefs) {
    const glyph = buildGlyph(def.id)
    glyph.position.set(...def.pos)
    const label = makeLabel(def.label, { color: '#737b8f', size: 0.42 })
    label.position.set(def.pos[0], def.pos[1] - 1.6, def.pos[2])
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: dotTexture(), color: COL.amber, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }))
    halo.scale.set(3.2, 3.2, 1)
    halo.position.copy(glyph.position)
    scene.add(glyph, label, halo)
    stores.push({ def, glyph, halo, pulse: 0 })
  }

  /* ---- memory packets: amber writes from core to stores ---- */
  const packets = []
  let nextWrite = 1.2
  function spawnWrite() {
    const store = stores[Math.floor(Math.random() * stores.length)]
    const from = new THREE.Vector3(2.5, 0.2, 0)
    const to = store.glyph.position.clone()
    const mid = from.clone().lerp(to, 0.5).add(new THREE.Vector3(0, 1.6, 0.8))
    const curve = new THREE.CatmullRomCurve3([from, mid, to])
    const mesh = makePacket(COL.amber, 0.75)
    scene.add(mesh)
    packets.push({ mesh, curve, t: 0, dur: 1.7, store })
  }

  /* ---- mouse parallax ---- */
  const target = new THREE.Vector2()
  window.addEventListener('pointermove', (e) => {
    target.x = (e.clientX / window.innerWidth - 0.5) * 2
    target.y = (e.clientY / window.innerHeight - 0.5) * 2
  }, { passive: true })

  /* ---- loop ---- */
  let running = true
  const clock = new THREE.Clock()
  const stopVis = whenVisible(canvas, (v) => { running = v })

  function frame() {
    requestAnimationFrame(frame)
    if (!running) return
    const dt = Math.min(clock.getDelta(), 0.05)
    const t = clock.elapsedTime

    core.rotation.y += dt * 0.25
    inner.rotation.x -= dt * 0.4
    heart.material.opacity = 0.28 + Math.sin(t * 2.1) * 0.08

    // tokens along stream
    for (let i = 0; i < N_TOK; i++) {
      const s = tokState[i]
      s.p += s.speed * dt * (reducedMotion ? 0.3 : 1)
      if (s.p > 1) s.p -= 1
      const pos = streamCurve.getPoint(s.p)
      tokPos[i * 3] = pos.x
      tokPos[i * 3 + 1] = pos.y + Math.sin(s.jitter + t * 1.4) * 0.12
      tokPos[i * 3 + 2] = pos.z
    }
    tokGeo.attributes.position.needsUpdate = true

    // periodic memory writes
    nextWrite -= dt
    if (nextWrite <= 0 && !reducedMotion) {
      spawnWrite()
      nextWrite = 2.2 + Math.random() * 1.6
    }
    for (let i = packets.length - 1; i >= 0; i--) {
      const p = packets[i]
      p.t += dt / p.dur
      if (p.t >= 1) {
        p.store.pulse = 1
        scene.remove(p.mesh)
        packets.splice(i, 1)
        continue
      }
      moveAlong(p.mesh, p.curve, p.t)
      const s = 0.7 + Math.sin(p.t * Math.PI) * 0.35
      p.mesh.userData.glow.scale.set(s, s, 1)
    }

    // store pulses + gentle bobbing
    for (const s of stores) {
      s.pulse = Math.max(0, s.pulse - dt * 1.2)
      s.halo.material.opacity = s.pulse * 0.5
      s.glyph.rotation.y += dt * 0.2
      s.glyph.position.y = s.def.pos[1] + Math.sin(t * 0.7 + s.def.pos[0]) * 0.12
      s.halo.position.copy(s.glyph.position)
    }

    // parallax
    camera.position.x += (target.x * 0.9 - camera.position.x) * 0.03
    camera.position.y += (-target.y * 0.6 - camera.position.y) * 0.03
    camera.lookAt(1.5, 0, 0)

    renderer.render(scene, camera)
  }
  frame()
  return () => { stopVis(); stage.dispose() }
}
