const PHASES = [
  { id: 'store', label: 'Write' },
  { id: 'retrieve', label: 'Recall' },
  { id: 'maintain', label: 'Maintain' },
]

const STORE_META = {
  files: { name: 'Plain files', strength: 'Readable and editable' },
  sqlite: { name: 'SQLite rows', strength: 'Exact filters and history' },
  vector: { name: 'Vector store', strength: 'Semantic similarity' },
  graph: { name: 'Knowledge graph', strength: 'Relationships and time' },
}

const PHASE_COPY = {
  store: {
    verb: 'STORE',
    title: {
      files: 'Watch one fact become an editable document.',
      sqlite: 'Watch one fact become an enforceable row.',
      vector: 'Watch one fact become a point in semantic space.',
      graph: 'Watch one fact become a relationship.',
    },
    route: 'The utterance enters the agent, a curator extracts a durable fact, and the fact crosses the long-term memory boundary.',
  },
  retrieve: {
    verb: 'RETRIEVE',
    title: {
      files: 'The agent reads its notes back into context.',
      sqlite: 'A deterministic query selects current facts.',
      vector: 'Meaning pulls nearby memories into context.',
      graph: 'The question opens a path through relationships.',
    },
    route: 'The request reaches the agent, touches long-term memory, and returns a small set of relevant facts to the working context before the model acts.',
  },
  maintain: {
    verb: 'MAINTAIN',
    title: {
      files: 'The document must be deliberately rewritten.',
      sqlite: 'The old row is superseded inside a transaction.',
      vector: 'A model must judge two nearby points.',
      graph: 'The relationship gets an end date, not an eraser.',
    },
    route: 'A new event is compared with existing memory. The model judges the contradiction; the substrate records the outcome in its own way.',
  },
}

const REFERENCE_TABS = [
  { id: 'fundamentals', label: 'MEMORY 101' },
  { id: 'types', label: 'MEMORY TYPES' },
  { id: 'systems', label: 'REAL SYSTEMS' },
  { id: 'choose', label: 'CHOOSE A STORE' },
  { id: 'sources', label: 'SOURCES' },
]

function renderStoreControls(stores, currentStore) {
  return stores.map((store) => {
    const meta = STORE_META[store.id]
    return `
      <button class="store-option" role="tab" data-store="${store.id}" aria-selected="${store.id === currentStore}">
        <span class="store-glyph" data-kind="${store.id}" aria-hidden="true"><i></i></span>
        <span class="store-label"><strong>${meta.name}</strong><small>${meta.strength}</small></span>
        <span class="store-arrow" aria-hidden="true">›</span>
      </button>`
  }).join('')
}

function renderPhaseControls(currentPhase) {
  return PHASES.map((phase) => `
    <button class="phase-button" type="button" data-phase="${phase.id}" aria-pressed="${phase.id === currentPhase}">${phase.label}</button>
  `).join('')
}

function fundamentalsMarkup(site) {
  return `
    <div class="reference-intro">
      <span class="mono">WHY MEMORY EXISTS</span>
      <h3>${site.problem.title}</h3>
      ${site.problem.bodyHtml}
    </div>
    <div class="reference-grid">
      ${site.loop.stages.map((stage, index) => `
        <article class="reference-card">
          <span class="mono">0${index + 1} · ${stage.label}</span>
          <h4>${stage.title}</h4>
          <p>${stage.body}</p>
        </article>`).join('')}
    </div>`
}

function typesMarkup(site, taxonomy) {
  return `
    <div class="reference-intro">
      <span class="mono">THE COGNITIVE LAYER</span>
      <h3>${site.taxonomy.title}</h3>
      ${site.taxonomy.introHtml}
    </div>
    <div class="reference-grid">
      ${taxonomy.types.map((type) => `
        <article class="reference-card">
          <span class="mono">${type.label}</span>
          <h4>${type.title}</h4>
          <p>${type.body}</p>
          <p class="example">${type.example}</p>
          <p><strong>Policy:</strong> ${type.policies}</p>
        </article>`).join('')}
    </div>`
}

function systemsMarkup(site, systems) {
  return `
    <div class="reference-intro">
      <span class="mono">DESIGNS IN THE WILD</span>
      <h3>${site.systems.title}</h3>
      ${site.systems.introHtml}
    </div>
    <div class="reference-grid">
      ${systems.systems.map((system) => `
        <article class="reference-card">
          <span class="mono">${system.tagline}</span>
          <h4>${system.name}</h4>
          <div class="reference-stores">${system.stores.map((store) => `<span>${store}</span>`).join('')}</div>
          ${system.whyHtml}
        </article>`).join('')}
    </div>`
}

function chooseMarkup(site, choosing) {
  return `
    <div class="reference-intro">
      <span class="mono">A PRACTICAL HEURISTIC</span>
      <h3>${site.choosing.title}</h3>
      ${site.choosing.introHtml}
    </div>
    <div class="choice-wrap">
      <table class="choice-table">
        <thead><tr>${choosing.columns.map((column) => `<th>${column}</th>`).join('')}</tr></thead>
        <tbody>${choosing.rows.map((row) => `
          <tr>
            <td>${row.substrate}</td><td>${row.when}</td><td>${row.retrieval}</td><td>${row.cant}</td><td>${row.watch}</td>
          </tr>`).join('')}</tbody>
      </table>
    </div>`
}

function sourcesMarkup(sources) {
  return `
    <div class="reference-intro">
      <span class="mono">PRIMARY MATERIAL</span>
      <h3>Trace every claim to its source.</h3>
      <p>This bibliography is re-verified by the site’s maintenance workflow. Dates show the last successful check.</p>
    </div>
    <div class="source-list">
      ${sources.sources.map((source) => `
        <div class="source-row">
          <div><a href="${source.url}" target="_blank" rel="noreferrer">${source.title}</a><p>${source.pub}</p></div>
          <time class="mono" datetime="${source.lastVerified}">${source.lastVerified}</time>
        </div>`).join('')}
    </div>`
}

function initReference(content) {
  const dialog = document.getElementById('reference-dialog')
  const openButton = document.getElementById('reference-toggle')
  const closeButton = document.getElementById('reference-close')
  const tabs = document.getElementById('reference-tabs')
  const panel = document.getElementById('reference-content')
  let current = 'fundamentals'

  const renderers = {
    fundamentals: () => fundamentalsMarkup(content.site),
    types: () => typesMarkup(content.site, content.taxonomy),
    systems: () => systemsMarkup(content.site, content.systems),
    choose: () => chooseMarkup(content.site, content.choosing),
    sources: () => sourcesMarkup(content.sources),
  }

  tabs.innerHTML = REFERENCE_TABS.map((tab) => `
    <button class="reference-tab" role="tab" data-reference="${tab.id}" aria-selected="${tab.id === current}">${tab.label}</button>
  `).join('')

  function render() {
    tabs.querySelectorAll('.reference-tab').forEach((tab) => {
      tab.setAttribute('aria-selected', String(tab.dataset.reference === current))
    })
    panel.innerHTML = renderers[current]()
    panel.scrollTop = 0
  }

  tabs.addEventListener('click', (event) => {
    const tab = event.target.closest('.reference-tab')
    if (!tab) return
    current = tab.dataset.reference
    render()
  })
  openButton.addEventListener('click', () => {
    render()
    dialog.showModal()
  })
  closeButton.addEventListener('click', () => dialog.close())
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close()
  })
}

export function initLabUI(content, sceneApi) {
  const stores = content.stores.stores
  const state = { store: stores[0].id, phase: 'store', mode: 'full', paused: false }
  const app = document.getElementById('app')
  const storeOptions = document.getElementById('store-options')
  const phaseButtons = document.getElementById('phase-buttons')
  const learningPanel = document.querySelector('.learning-panel')
  const explanationMode = document.getElementById('explanation-mode')
  const worldEyebrow = document.getElementById('world-eyebrow')
  const worldTitle = document.getElementById('world-title')
  const explanationKicker = document.getElementById('explanation-kicker')
  const explanationTitle = document.getElementById('explanation-title')
  const explanationBody = document.getElementById('explanation-body')
  const mechanicsTitle = document.getElementById('mechanics-title')
  const mechanicsBody = document.getElementById('mechanics-body')
  const underhoodTitle = document.getElementById('underhood-title')
  const underhoodBody = document.getElementById('underhood-body')
  const playButton = document.getElementById('play-toggle')
  const playIcon = playButton.querySelector('.play-icon')
  const replayButton = document.getElementById('replay-button')
  const viewReset = document.getElementById('view-reset')
  const storyStep = document.getElementById('story-step')
  const storyText = document.getElementById('story-text')
  const storyTime = document.getElementById('story-time')
  const storyScrubber = document.getElementById('story-scrubber')
  const duration = sceneApi.getDuration()

  storeOptions.innerHTML = renderStoreControls(stores, state.store)
  phaseButtons.insertAdjacentHTML('beforeend', renderPhaseControls(state.phase))

  function currentStore() { return stores.find((store) => store.id === state.store) }

  function render() {
    const store = currentStore()
    const phase = store.phases[state.phase]
    const phaseCopy = PHASE_COPY[state.phase]
    const overview = phase.depth['1']
    const mechanics = phase.depth['2']
    const underhood = phase.depth['3']

    app.dataset.phase = state.phase
    storeOptions.querySelectorAll('.store-option').forEach((button) => {
      button.setAttribute('aria-selected', String(button.dataset.store === state.store))
    })
    phaseButtons.querySelectorAll('.phase-button').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.phase === state.phase))
    })
    explanationMode.querySelectorAll('button').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.mode === state.mode))
    })

    learningPanel.dataset.mode = state.mode
    worldEyebrow.textContent = `${STORE_META[state.store].name.toUpperCase()} / ${phaseCopy.verb}`
    worldTitle.textContent = phaseCopy.title[state.store]
    explanationKicker.textContent = `${state.store.toUpperCase()} · ${phaseCopy.verb}`
    explanationTitle.textContent = overview.title
    explanationBody.innerHTML = `${overview.html}<p><strong>Follow the path:</strong> ${phaseCopy.route}</p>`
    mechanicsTitle.textContent = mechanics.title
    mechanicsBody.innerHTML = mechanics.html
    underhoodTitle.textContent = underhood.title
    underhoodBody.innerHTML = underhood.html
  }

  storeOptions.addEventListener('click', (event) => {
    const button = event.target.closest('.store-option')
    if (!button) return
    state.store = button.dataset.store
    sceneApi.setStore(state.store)
    render()
  })

  phaseButtons.addEventListener('click', (event) => {
    const button = event.target.closest('.phase-button')
    if (!button) return
    state.phase = button.dataset.phase
    lastStep = -1
    sceneApi.setPhase(state.phase)
    render()
  })

  explanationMode.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-mode]')
    if (!button) return
    state.mode = button.dataset.mode
    render()
  })

  function setPaused(paused) {
    state.paused = paused
    sceneApi.setPaused(state.paused)
    playButton.setAttribute('aria-pressed', String(state.paused))
    playButton.setAttribute('aria-label', state.paused ? 'Play animation' : 'Pause animation')
    playIcon.textContent = state.paused ? '▶' : 'Ⅱ'
  }

  playButton.addEventListener('click', () => setPaused(!state.paused))

  storyScrubber.addEventListener('input', () => {
    setPaused(true)
    lastStep = -1
    sceneApi.seek(Number(storyScrubber.value) / Number(storyScrubber.max))
  })

  replayButton.addEventListener('click', () => {
    lastStep = -1
    sceneApi.restart()
  })

  viewReset.addEventListener('click', () => sceneApi.resetView())

  let lastStep = -1
  sceneApi.onProgress(({ progress, seconds, stepIndex, step }) => {
    const percent = Math.round(progress * 1000) / 10
    storyScrubber.value = String(Math.round(progress * Number(storyScrubber.max)))
    storyScrubber.style.setProperty('--progress', `${percent}%`)
    storyScrubber.setAttribute('aria-valuetext', `${seconds} of ${Math.round(duration)} seconds`)
    storyTime.textContent = `${state.paused ? 'PAUSED' : 'LIVE LOOP'} · 00:${String(seconds).padStart(2, '0')} / 00:${String(Math.round(duration)).padStart(2, '0')}`
    if (stepIndex !== lastStep) {
      storyStep.textContent = step[0]
      storyText.textContent = step[1]
      lastStep = stepIndex
    }
  })

  initReference(content)
  sceneApi.setDetail(4)
  render()
}
