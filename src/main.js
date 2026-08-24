import './styles.css'
import site from './content/site.json'
import stores from './content/stores.json'
import taxonomy from './content/taxonomy.json'
import systems from './content/systems.json'
import choosing from './content/choosing.json'
import sources from './content/sources.json'
import internals from './content/internals.json'
import { initSystemLab } from './three/system-lab.js'
import { initLabUI } from './ui/lab-ui.js'

const sceneApi = initSystemLab(document.getElementById('lab-canvas'))

initLabUI(
  { site, stores, taxonomy, systems, choosing, sources, internals },
  sceneApi
)

if (import.meta.env?.DEV) window.__lab = sceneApi
