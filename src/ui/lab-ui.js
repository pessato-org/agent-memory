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
  const internals = content.internals
  const internalsById = Object.fromEntries(internals.stores.map((store) => [store.id, store]))
  const state = { store: stores[0].id, phase: 'store', mode: 'full', view: 'system', chapter: 0, paused: false }
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
  const viewSwitch = document.getElementById('view-switch')
  const chapterRail = document.getElementById('chapter-rail')
  const chapterNav = document.getElementById('chapter-nav')
  const chapterPrev = document.getElementById('chapter-prev')
  const chapterNext = document.getElementById('chapter-next')
  const chapterJump = document.getElementById('chapter-jump')
  const takeawaySection = document.getElementById('takeaway-section')
  const takeawayBody = document.getElementById('takeaway-body')
  const mechanicsSection = document.getElementById('mechanics-section')
  const underhoodSection = document.getElementById('underhood-section')
  const panelKicker = document.getElementById('panel-kicker')
  const panelTitle = document.getElementById('panel-title')

  storeOptions.innerHTML = renderStoreControls(stores, state.store)
  phaseButtons.insertAdjacentHTML('beforeend', renderPhaseControls(state.phase))

  function currentStore() { return stores.find((store) => store.id === state.store) }
  function currentInternals() { return internalsById[state.store] }
  function currentChapter() {
    const chapters = currentInternals().chapters
    return chapters[Math.min(state.chapter, chapters.length - 1)]
  }

  function renderChapterRail() {
    const chapters = currentInternals().chapters
    chapterRail.innerHTML = chapters.map((chapter, index) => `
      <button class="chapter-pip" type="button" role="tab" data-chapter="${index}" aria-selected="${index === state.chapter}" title="${chapter.title}">
        <span class="pip-index mono">${String(index + 1).padStart(2, '0')}</span>
        <span class="pip-label">${chapter.label}</span>
      </button>`).join('')
    chapterJump.innerHTML = chapters.map((chapter, index) => `
      <button class="jump-row" type="button" data-chapter="${index}" aria-current="${index === state.chapter}">
        <span class="mono">${String(index + 1).padStart(2, '0')}</span>
        <span>${chapter.title}</span>
      </button>`).join('')
  }

  function renderInternals() {
    const store = currentInternals()
    const chapter = currentChapter()
    const chapters = store.chapters

    app.dataset.view = 'internals'
    storeOptions.querySelectorAll('.store-option').forEach((button) => {
      button.setAttribute('aria-selected', String(button.dataset.store === state.store))
    })
    chapterRail.querySelectorAll('.chapter-pip').forEach((button) => {
      button.setAttribute('aria-selected', String(Number(button.dataset.chapter) === state.chapter))
    })
    chapterJump.querySelectorAll('.jump-row').forEach((button) => {
      button.setAttribute('aria-current', String(Number(button.dataset.chapter) === state.chapter))
    })

    worldEyebrow.textContent = `${STORE_META[state.store].name.toUpperCase()} / ${chapter.label}`
    worldTitle.textContent = chapter.title
    panelKicker.textContent = 'mechanism'
    panelTitle.textContent = store.title
    explanationKicker.textContent = `${String(state.chapter + 1).padStart(2, '0')} / ${String(chapters.length).padStart(2, '0')} · ${chapter.label}`
    explanationTitle.textContent = chapter.title
    // The framing note earns its place once, on the way in. Repeating it above
    // every chapter would just be something to scroll past.
    const framing = state.chapter === 0
      ? `<div class="deep-intro"><span class="mono">${internals.intro.kicker}</span>${internals.intro.html}</div>`
      : ''
    explanationBody.innerHTML = `${framing}<p class="deep-tagline">${store.tagline}</p>${chapter.html}`
    takeawayBody.textContent = chapter.takeaway
    storyStep.textContent = `${String(state.chapter + 1).padStart(2, '0')} / ${chapter.label}`
    lastBeat = -1
  }

  function render() {
    writeHash()
    viewSwitch.querySelectorAll('button').forEach((button) => {
      button.setAttribute('aria-selected', String(button.dataset.mode === state.view))
    })
    if (state.view === 'internals') {
      renderInternals()
      return
    }
    app.dataset.view = 'system'
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
    panelKicker.textContent = 'explanation'
    panelTitle.textContent = 'What you’re seeing'
    worldEyebrow.textContent = `${STORE_META[state.store].name.toUpperCase()} / ${phaseCopy.verb}`
    worldTitle.textContent = phaseCopy.title[state.store]
    explanationKicker.textContent = `${state.store.toUpperCase()} · ${phaseCopy.verb}`
    explanationTitle.textContent = overview.title
    const deepStore = currentInternals()
    explanationBody.innerHTML = `${overview.html}`
      + `<p><strong>Follow the path:</strong> ${phaseCopy.route}</p>`
      + `<button class="deep-cta" type="button" data-open-internals>`
      + `<span class="mono">02 · GO DEEPER</span>`
      + `<strong>${deepStore.title}</strong>`
      + `<small>${deepStore.tagline}</small>`
      + `</button>`
    mechanicsTitle.textContent = mechanics.title
    mechanicsBody.innerHTML = mechanics.html
    underhoodTitle.textContent = underhood.title
    underhoodBody.innerHTML = underhood.html
  }

  /* Applies the section visibility that differs between the two views. */
  function applyViewChrome() {
    const isInternals = state.view === 'internals'
    chapterNav.hidden = !isInternals
    chapterJump.hidden = !isInternals
    takeawaySection.hidden = !isInternals
    mechanicsSection.hidden = isInternals
    underhoodSection.hidden = isInternals
    explanationMode.hidden = isInternals
    replayButton.hidden = isInternals
  }

  function setView(view) {
    if (state.view === view) return
    state.view = view
    lastStep = -1
    if (view === 'internals') {
      state.chapter = 0
      renderChapterRail()
      sceneApi.setChapter(0)
    }
    sceneApi.setMode(view)
    applyViewChrome()
    render()
    scheduleSafeArea()
  }

  function setChapter(index) {
    const chapters = currentInternals().chapters
    const next = ((index % chapters.length) + chapters.length) % chapters.length
    state.chapter = next
    sceneApi.setChapter(next)
    render()
  }

  storeOptions.addEventListener('click', (event) => {
    const button = event.target.closest('.store-option')
    if (!button) return
    state.store = button.dataset.store
    state.chapter = 0
    sceneApi.setStore(state.store)
    if (state.view === 'internals') renderChapterRail()
    render()
  })

  viewSwitch.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-mode]')
    if (!button) return
    setView(button.dataset.mode)
  })

  chapterRail.addEventListener('click', (event) => {
    const button = event.target.closest('.chapter-pip')
    if (!button) return
    setChapter(Number(button.dataset.chapter))
  })

  chapterJump.addEventListener('click', (event) => {
    const button = event.target.closest('.jump-row')
    if (!button) return
    setChapter(Number(button.dataset.chapter))
  })

  explanationBody.addEventListener('click', (event) => {
    if (event.target.closest('[data-open-internals]')) setView('internals')
  })

  chapterPrev.addEventListener('click', () => setChapter(state.chapter - 1))
  chapterNext.addEventListener('click', () => setChapter(state.chapter + 1))

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
  let lastBeat = -1
  sceneApi.onProgress(({ mode, progress, seconds, stepIndex, step }) => {
    const duration = sceneApi.getDuration()
    const percent = Math.round(progress * 1000) / 10
    storyScrubber.value = String(Math.round(progress * Number(storyScrubber.max)))
    storyScrubber.style.setProperty('--progress', `${percent}%`)
    storyScrubber.setAttribute('aria-valuetext', `${seconds} of ${Math.round(duration)} seconds`)
    const clock = `00:${String(seconds).padStart(2, '0')} / 00:${String(Math.round(duration)).padStart(2, '0')}`
    if (mode === 'internals') {
      storyTime.textContent = `${state.paused ? 'PAUSED' : 'CHAPTER LOOP'} · ${clock}`
      // Narrate the mechanism as it runs: show the last beat the playhead passed.
      const beats = currentChapter().beats
      let index = 0
      for (let i = 0; i < beats.length; i += 1) if (progress >= beats[i].at) index = i
      if (index !== lastBeat) {
        storyText.textContent = beats[index].text
        lastBeat = index
      }
      return
    }
    storyTime.textContent = `${state.paused ? 'PAUSED' : 'LIVE LOOP'} · ${clock}`
    if (stepIndex !== lastStep) {
      storyStep.textContent = step[0]
      storyText.textContent = step[1]
      lastStep = stepIndex
    }
  })

  document.addEventListener('keydown', (event) => {
    if (event.target.closest('input, textarea, dialog')) return
    if (state.view === 'internals' && (event.key === 'ArrowRight' || event.key === 'ArrowLeft')) {
      event.preventDefault()
      setChapter(state.chapter + (event.key === 'ArrowRight' ? 1 : -1))
    }
    if (event.key === ' ') {
      event.preventDefault()
      setPaused(!state.paused)
    }
  })

  /* ---------- deep links ----------
     #files/store            a substrate and an operation in the system view
     #files/inside/grep      a substrate and a chapter in the internals view
     Lets any chapter be linked to directly, and survives a reload. */

  function writeHash() {
    const next = state.view === 'internals'
      ? `#${state.store}/inside/${currentChapter().id}`
      : `#${state.store}/${state.phase}`
    if (location.hash !== next) history.replaceState(null, '', next)
  }

  function applyHash() {
    const raw = location.hash.replace(/^#\/?/, '')
    if (!raw) return false
    const [storeId, second, third] = raw.split('/')
    if (!stores.some((store) => store.id === storeId)) return false
    state.store = storeId
    state.chapter = 0
    sceneApi.setStore(storeId)
    if (second === 'inside') {
      const chapters = internalsById[storeId].chapters
      const index = Math.max(0, chapters.findIndex((chapter) => chapter.id === third))
      state.view = 'internals'
      state.chapter = index
      sceneApi.setMode('internals')
      sceneApi.setChapter(index)
    } else {
      state.view = 'system'
      if (PHASE_COPY[second]) {
        state.phase = second
        sceneApi.setPhase(second)
      }
      sceneApi.setMode('system')
    }
    lastStep = -1
    renderChapterRail()
    applyViewChrome()
    scheduleSafeArea()
    return true
  }

  window.addEventListener('hashchange', () => {
    if (applyHash()) render()
  })

  /* ---------- safe area ----------
     Controls float over the canvas, so the scene needs to know which band of
     it is actually clear. Measuring the live DOM keeps that correct at every
     breakpoint instead of encoding control heights in two places. */

  const canvas = document.getElementById('lab-canvas')
  const overlays = [
    document.querySelector('.view-switch'),
    document.getElementById('phase-buttons'),
    chapterRail,
    document.querySelector('.story-strip'),
    document.querySelector('.store-dock'),
    learningPanel,
  ].filter(Boolean)

  function publishSafeArea() {
    const frame = canvas.getBoundingClientRect()
    if (!frame.height) return
    const middle = frame.top + frame.height / 2
    let top = 12
    let bottom = 12
    for (const element of overlays) {
      if (element.hidden || !element.offsetParent) continue
      const box = element.getBoundingClientRect()
      if (!box.height || box.bottom < frame.top || box.top > frame.bottom) continue
      // Only chrome that actually sits over the canvas counts.
      if (box.right < frame.left + 4 || box.left > frame.right - 4) continue
      if (box.top + box.height / 2 < middle) top = Math.max(top, box.bottom - frame.top + 14)
      else bottom = Math.max(bottom, frame.bottom - box.top + 14)
    }
    sceneApi.setSafeArea({ top, bottom, side: 18 })
  }

  const scheduleSafeArea = () => requestAnimationFrame(publishSafeArea)
  window.addEventListener('resize', scheduleSafeArea)
  if (window.ResizeObserver) {
    const observer = new ResizeObserver(scheduleSafeArea)
    overlays.forEach((element) => observer.observe(element))
    observer.observe(canvas)
  }

  initReference(content)
  renderChapterRail()
  applyHash()
  applyViewChrome()
  sceneApi.setDetail(4)
  render()
  scheduleSafeArea()
}
