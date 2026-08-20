// Renders the content JSON into the static sections of the page.
// All content is first-party (from src/content/*.json), so innerHTML is fine here.

export function renderSections({ site, taxonomy, systems, choosing, sources }) {
  /* problem */
  document.getElementById('problem-title').textContent = site.problem.title
  document.getElementById('problem-body').innerHTML = site.problem.bodyHtml

  /* loop */
  document.getElementById('loop-title').textContent = site.loop.title
  document.getElementById('loop-intro').innerHTML = site.loop.introHtml
  document.getElementById('loop-stages').innerHTML = site.loop.stages
    .map(
      (s) => `<div class="loop-stage" data-k="${s.k}">
        <span class="mono">${s.label}</span>
        <h3>${s.title}</h3>
        <p>${s.body}</p>
      </div>`
    )
    .join('')

  /* scenario */
  document.getElementById('scenario-title').textContent = site.scenario.title
  document.getElementById('scenario-body').innerHTML = site.scenario.bodyHtml
  document.getElementById('scenario-memories').innerHTML = site.scenario.memories
    .map(
      (m) => `<div class="memory-card" ${m.invalidates ? 'data-invalid="true"' : ''}>
        <p class="mono"><span>${m.id} · ${m.date}</span><span class="mtype">${m.type}</span></p>
        <blockquote>${m.text}</blockquote>
        <p>${m.note}</p>
      </div>`
    )
    .join('')

  /* explorer heading */
  document.getElementById('explorer-title').textContent = site.explorer.title
  document.getElementById('explorer-intro').innerHTML = site.explorer.introHtml

  /* taxonomy */
  document.getElementById('taxonomy-title').textContent = site.taxonomy.title
  document.getElementById('taxonomy-intro').innerHTML = site.taxonomy.introHtml
  document.getElementById('taxonomy-cards').innerHTML = taxonomy.types
    .map(
      (t) => `<div class="taxonomy-card">
        <span class="mono">${t.label}</span>
        <h3>${t.title}</h3>
        <p>${t.body}</p>
        <p>${t.policies}</p>
        <p class="example">${t.example}</p>
      </div>`
    )
    .join('')

  /* systems */
  const srcById = Object.fromEntries(sources.sources.map((s) => [s.id, s]))
  document.getElementById('systems-title').textContent = site.systems.title
  document.getElementById('systems-intro').innerHTML = site.systems.introHtml
  document.getElementById('systems-cards').innerHTML = systems.systems
    .map((s) => {
      const links = (s.sourceIds || [])
        .map((id) => srcById[id])
        .filter(Boolean)
        .map((src) => `<a href="${src.url}" target="_blank" rel="noopener">${src.title}</a>`)
        .join(' · ')
      return `<div class="system-card">
        <div>
          <h3>${s.name}</h3>
          <p class="tagline">${s.tagline}</p>
          <div class="stores">${s.stores.map((st) => `<span class="store-chip">${st}</span>`).join('')}</div>
        </div>
        <div class="why">
          <span class="why-label">why this store</span>
          ${s.whyHtml}
          ${links ? `<p class="tagline">Sources: ${links}</p>` : ''}
        </div>
      </div>`
    })
    .join('')

  /* choosing */
  document.getElementById('choosing-title').textContent = site.choosing.title
  document.getElementById('choosing-intro').innerHTML = site.choosing.introHtml
  document.getElementById('choosing-table').innerHTML = `<table>
    <thead><tr>${choosing.columns.map((c) => `<th>${c}</th>`).join('')}</tr></thead>
    <tbody>${choosing.rows
      .map(
        (r) => `<tr>
          <td>${r.substrate}</td><td>${r.when}</td><td>${r.retrieval}</td><td>${r.cant}</td><td>${r.watch}</td>
        </tr>`
      )
      .join('')}</tbody>
  </table>`

  /* sources */
  document.getElementById('sources-list').innerHTML = sources.sources
    .map(
      (s) => `<div class="source-item">
        <div class="s-main">
          <div class="s-title"><a href="${s.url}" target="_blank" rel="noopener">${s.title}</a></div>
          <div class="s-pub">${s.pub}</div>
        </div>
        <span class="s-verified">verified ${s.lastVerified}</span>
      </div>`
    )
    .join('')

  /* footer */
  document.getElementById('footer-meta').textContent = site.footer.metaMono
}
