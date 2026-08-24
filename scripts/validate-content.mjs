// Validates the content JSON the nightly maintenance job is allowed to edit.
// Fails loudly on structural drift so a bad bot edit can never ship.
import { readFileSync, readdirSync, statSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const load = (f) => JSON.parse(readFileSync(join(root, 'src/content', f), 'utf8'))
const errors = []
const err = (msg) => errors.push(msg)

const forbiddenDash = String.fromCodePoint(0x2014)
const checkedExtensions = new Set(['.css', '.html', '.js', '.json', '.md', '.mjs', '.yml', '.yaml'])
const ignoredDirectories = new Set(['.git', 'dist', 'node_modules'])

function checkForbiddenPunctuation(directory) {
  for (const entry of readdirSync(directory)) {
    if (ignoredDirectories.has(entry)) continue
    const path = join(directory, entry)
    if (statSync(path).isDirectory()) {
      checkForbiddenPunctuation(path)
      continue
    }
    const extension = entry.slice(entry.lastIndexOf('.'))
    if (!checkedExtensions.has(extension)) continue
    const text = readFileSync(path, 'utf8')
    if (text.includes(forbiddenDash)) {
      err(`${path.slice(root.length + 1)} contains forbidden Unicode U+2014`)
    }
  }
}

checkForbiddenPunctuation(root)

const DATE = /^\d{4}-\d{2}-\d{2}$/
const isHttps = (u) => /^https:\/\//.test(u)

let site, stores, taxonomy, systems, choosing, sources, internals
try {
  site = load('site.json')
  stores = load('stores.json')
  taxonomy = load('taxonomy.json')
  systems = load('systems.json')
  choosing = load('choosing.json')
  sources = load('sources.json')
  internals = load('internals.json')
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

/* internals.json - the "inside the store" chapters.
   Chapter ids are a contract with src/three/internals.js: each id selects a
   scene builder by name, so a renamed or reordered id silently loses a scene.
   Rather than duplicating the list here, read it back out of the module so
   the two can never drift apart. */
const INTERNAL_CHAPTERS = (() => {
  const source = readFileSync(join(root, 'src/three/internals.js'), 'utf8')
  const classToStore = { Files: 'files', Sqlite: 'sqlite', Vector: 'vector', Graph: 'graph' }
  const found = {}
  for (const [, name, list] of source.matchAll(/(\w+)Internals\.CHAPTERS\s*=\s*\[([^\]]*)\]/g)) {
    const store = classToStore[name]
    if (!store) continue
    found[store] = [...list.matchAll(/'([^']+)'/g)].map((m) => m[1])
  }
  for (const store of ['files', 'sqlite', 'vector', 'graph'])
    if (!found[store]?.length) err(`internals.js does not declare CHAPTERS for "${store}"`)
  return found
})()
if (!internals.intro?.title || !internals.intro?.html) err('internals.json needs intro.title + intro.html')
const internalIds = (internals.stores ?? []).map((s) => s.id)
if (JSON.stringify(internalIds) !== JSON.stringify(storeIds))
  err('internals.json stores must match stores.json, in the same order')
for (const store of internals.stores ?? []) {
  if (!store.title || !store.tagline) err(`internals.json "${store.id}" needs title + tagline`)
  const expected = INTERNAL_CHAPTERS[store.id] ?? []
  const actual = (store.chapters ?? []).map((c) => c.id)
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    err(`internals.json "${store.id}" chapter ids must be exactly [${expected.join(', ')}] in that order, got [${actual.join(', ')}]`)
  for (const chapter of store.chapters ?? []) {
    for (const k of ['label', 'title', 'html', 'takeaway'])
      if (!chapter[k]) err(`internals.json ${store.id}.${chapter.id} missing ${k}`)
    if (chapter.label && chapter.label.length > 14)
      err(`internals.json ${store.id}.${chapter.id} label "${chapter.label}" is too long for the chapter rail (max 14)`)
    if (chapter.takeaway && chapter.takeaway.length > 130)
      err(`internals.json ${store.id}.${chapter.id} takeaway is too long (max 130)`)
    // Beats narrate the animation as it runs: "at" is a progress mark in 0..1,
    // and the strip shows the last beat the playhead has passed.
    const beats = chapter.beats ?? []
    if (beats.length < 2 || beats.length > 5)
      err(`internals.json ${store.id}.${chapter.id} needs 2 to 5 beats, has ${beats.length}`)
    if (beats.length && beats[0].at !== 0)
      err(`internals.json ${store.id}.${chapter.id} first beat must start at 0`)
    beats.forEach((beat, i) => {
      if (typeof beat.at !== 'number' || beat.at < 0 || beat.at > 1)
        err(`internals.json ${store.id}.${chapter.id} beat ${i} "at" must be a number in 0..1`)
      if (i > 0 && !(beat.at > beats[i - 1].at))
        err(`internals.json ${store.id}.${chapter.id} beat ${i} "at" must increase`)
      if (!beat.text) err(`internals.json ${store.id}.${chapter.id} beat ${i} missing text`)
      if (beat.text && beat.text.length > 110)
        err(`internals.json ${store.id}.${chapter.id} beat ${i} is too long for the story strip (max 110)`)
    })
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
checkHtml('internals.intro.html', internals.intro?.html ?? '')
for (const store of internals.stores ?? [])
  for (const chapter of store.chapters ?? [])
    checkHtml(`internals.${store.id}.${chapter.id}.html`, chapter.html ?? '')
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
