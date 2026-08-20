// Validates the content JSON the nightly maintenance job is allowed to edit.
// Fails loudly on structural drift so a bad bot edit can never ship.
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const load = (f) => JSON.parse(readFileSync(join(root, 'src/content', f), 'utf8'))
const errors = []
const err = (msg) => errors.push(msg)

const DATE = /^\d{4}-\d{2}-\d{2}$/
const isHttps = (u) => /^https:\/\//.test(u)

let site, stores, taxonomy, systems, choosing, sources
try {
  site = load('site.json')
  stores = load('stores.json')
  taxonomy = load('taxonomy.json')
  systems = load('systems.json')
  choosing = load('choosing.json')
  sources = load('sources.json')
} catch (e) {
  console.error('JSON parse failure:', e.message)
  process.exit(1)
}

/* site.json */
for (const k of ['problem', 'loop', 'scenario', 'explorer', 'taxonomy', 'systems', 'choosing', 'footer', 'meta'])
  if (!site[k]) err(`site.json missing section "${k}"`)
if (!DATE.test(site.meta?.contentUpdated ?? '')) err('site.json meta.contentUpdated must be YYYY-MM-DD')
if ((site.loop?.stages ?? []).length !== 4) err('site.json loop.stages must have exactly 4 entries')
const memIds = (site.scenario?.memories ?? []).map((m) => m.id)
if (JSON.stringify(memIds) !== JSON.stringify(['m1', 'm2', 'm3', 'm4', 'm5']))
  err('site.json scenario.memories must be exactly m1..m5 (the pedagogy is stable)')

/* stores.json */
const storeIds = (stores.stores ?? []).map((s) => s.id)
if (JSON.stringify(storeIds) !== JSON.stringify(['files', 'sqlite', 'vector', 'graph']))
  err('stores.json must contain exactly the four stores files/sqlite/vector/graph, in order')
for (const s of stores.stores ?? []) {
  for (const phase of ['store', 'retrieve', 'maintain']) {
    const p = s.phases?.[phase]
    if (!p) { err(`stores.json ${s.id} missing phase "${phase}"`); continue }
    if (!p.caption) err(`stores.json ${s.id}.${phase} missing caption`)
    for (const d of ['1', '2', '3']) {
      if (!p.depth?.[d]?.title || !p.depth?.[d]?.html)
        err(`stores.json ${s.id}.${phase} depth ${d} needs title + html`)
    }
    if (!p.inspector?.label || !p.inspector?.code)
      err(`stores.json ${s.id}.${phase} inspector needs label + code`)
  }
}

/* taxonomy.json */
if ((taxonomy.types ?? []).length !== 4) err('taxonomy.json must have exactly 4 types')
for (const t of taxonomy.types ?? [])
  for (const k of ['id', 'label', 'title', 'body', 'example', 'policies'])
    if (!t[k]) err(`taxonomy.json type "${t.id ?? '?'}" missing ${k}`)

/* sources.json */
const srcIds = new Set()
for (const s of sources.sources ?? []) {
  for (const k of ['id', 'title', 'pub', 'url', 'lastVerified'])
    if (!s[k]) err(`sources.json entry "${s.id ?? s.title ?? '?'}" missing ${k}`)
  if (s.url && !isHttps(s.url)) err(`sources.json "${s.id}" url must be https`)
  if (s.lastVerified && !DATE.test(s.lastVerified)) err(`sources.json "${s.id}" lastVerified must be YYYY-MM-DD`)
  if (srcIds.has(s.id)) err(`sources.json duplicate id "${s.id}"`)
  srcIds.add(s.id)
}

/* systems.json */
if ((systems.systems ?? []).length > 8) err('systems.json must keep 8 entries or fewer')
for (const s of systems.systems ?? []) {
  for (const k of ['id', 'name', 'tagline', 'stores', 'whyHtml'])
    if (!s[k]) err(`systems.json "${s.id ?? '?'}" missing ${k}`)
  for (const ref of s.sourceIds ?? [])
    if (!srcIds.has(ref)) err(`systems.json "${s.id}" references unknown source "${ref}"`)
}

/* choosing.json */
if ((choosing.columns ?? []).length !== 5) err('choosing.json must have exactly 5 columns')
for (const r of choosing.rows ?? [])
  for (const k of ['substrate', 'when', 'retrieval', 'cant', 'watch'])
    if (!r[k]) err(`choosing.json row "${r.substrate ?? '?'}" missing ${k}`)

/* html allowlist in *Html fields */
const HTML_OK = /<\/?(p|strong|em|code|a)(\s+href="https:\/\/[^"]*"(\s+target="_blank")?(\s+rel="noopener")?)?\s*>/g
function checkHtml(label, html) {
  const stripped = html.replace(HTML_OK, '')
  const leftover = stripped.match(/<[a-zA-Z/][^>]*>/g)
  if (leftover) err(`${label}: disallowed HTML tags: ${[...new Set(leftover)].join(' ')}`)
}
checkHtml('site.problem.bodyHtml', site.problem?.bodyHtml ?? '')
for (const s of systems.systems ?? []) checkHtml(`systems.${s.id}.whyHtml`, s.whyHtml ?? '')
for (const s of stores.stores ?? [])
  for (const phase of Object.values(s.phases ?? {}))
    for (const d of Object.values(phase.depth ?? {}))
      checkHtml(`stores depth html`, d.html ?? '')

if (errors.length) {
  console.error(`content validation FAILED (${errors.length}):\n- ` + errors.join('\n- '))
  process.exit(1)
}
console.log('content validation passed ✓')
