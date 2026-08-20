import './styles.css'
import site from './content/site.json'
import stores from './content/stores.json'
import taxonomy from './content/taxonomy.json'
import systems from './content/systems.json'
import choosing from './content/choosing.json'
import sources from './content/sources.json'
import { renderSections } from './ui/sections.js'
import { initExplorerUI } from './ui/explorer-ui.js'
import { initHero } from './three/hero.js'
import { initExplorer } from './three/explorer.js'

renderSections({ site, taxonomy, systems, choosing, sources })

initHero(document.getElementById('hero-canvas'))

const explorerApi = initExplorer(document.getElementById('explorer-canvas'))
initExplorerUI(stores, explorerApi)
