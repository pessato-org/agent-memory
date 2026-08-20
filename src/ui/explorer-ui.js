// Wires the explorer controls (store tabs, phase buttons, depth dial) to the
// 3D scene and the explanation/inspector panel. Content comes from stores.json.

const PHASES = [
  { id: 'store', label: 'Store' },
  { id: 'retrieve', label: 'Retrieve' },
  { id: 'maintain', label: 'Maintain' },
]

// convert «hl»…«/hl» markup in inspector code to spans, escaping everything else
function renderCode(code) {
  const esc = code
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  return esc
    .replace(/«(hl|q|m|dim|del)»/g, (_, k) => {
      const cls = { hl: 'hl', q: 'hl-q', m: 'hl-m', dim: 'dim', del: 'del' }[k]
      return `<span class="${cls}">`
    })
    .replace(/«\/(hl|q|m|dim|del)»/g, '</span>')
}

export function initExplorerUI(storesContent, sceneApi) {
  const stores = storesContent.stores
  const state = { store: stores[0].id, phase: 'store', depth: '1' }

  const tabsEl = document.getElementById('store-tabs')
  const phasesEl = document.getElementById('phase-buttons')
  const depthEl = document.getElementById('depth-toggle')
  const captionEl = document.getElementById('explorer-caption')
  const explainEl = document.getElementById('panel-explain')
  const inspLabelEl = document.getElementById('inspector-label')
  const inspCodeEl = document.getElementById('inspector-code')

  /* build controls */
  tabsEl.innerHTML = stores
    .map(
      (s) => `<button class="store-tab" role="tab" data-store="${s.id}" aria-selected="false">${s.label}</button>`
    )
    .join('')
  phasesEl.innerHTML = PHASES.map(
    (p) => `<button class="phase-btn" data-phase="${p.id}" aria-pressed="false">${p.label}</button>`
  ).join('')
  for (const d of ['1', '2', '3']) {
    const b = document.createElement('button')
    b.className = 'depth-btn'
    b.dataset.depth = d
    b.textContent = d
    b.setAttribute('aria-pressed', 'false')
    b.setAttribute('aria-label', `Depth level ${d}`)
    depthEl.appendChild(b)
  }

  function render() {
    const store = stores.find((s) => s.id === state.store)
    const phase = store.phases[state.phase]
    const depth = phase.depth[state.depth]

    for (const el of tabsEl.querySelectorAll('.store-tab'))
      el.setAttribute('aria-selected', String(el.dataset.store === state.store))
    for (const el of phasesEl.querySelectorAll('.phase-btn'))
      el.setAttribute('aria-pressed', String(el.dataset.phase === state.phase))
    for (const el of depthEl.querySelectorAll('.depth-btn'))
      el.setAttribute('aria-pressed', String(el.dataset.depth === state.depth))

    captionEl.textContent = phase.caption
    explainEl.innerHTML = `<h3>${depth.title}</h3>${depth.html}`
    inspLabelEl.textContent = phase.inspector.label
    inspCodeEl.innerHTML = renderCode(phase.inspector.code)
  }

  tabsEl.addEventListener('click', (e) => {
    const b = e.target.closest('.store-tab')
    if (!b) return
    state.store = b.dataset.store
    sceneApi.setStore(state.store)
    sceneApi.setPhase(state.phase)
    render()
  })
  phasesEl.addEventListener('click', (e) => {
    const b = e.target.closest('.phase-btn')
    if (!b) return
    state.phase = b.dataset.phase
    sceneApi.setPhase(state.phase)
    render()
  })
  depthEl.addEventListener('click', (e) => {
    const b = e.target.closest('.depth-btn')
    if (!b) return
    state.depth = b.dataset.depth
    render()
  })

  /* init */
  sceneApi.setStore(state.store)
  render()
}
