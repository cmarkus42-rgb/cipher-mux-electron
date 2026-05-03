import { render } from 'preact'
import './i18n'
import './styles/theme.css'
import './styles/layout.css'
import './styles/components.css'
import './styles/a11y.css'

const params = new URLSearchParams(location.search)
const view = params.get('view')

function mountError(err: unknown) {
  const el = document.getElementById('app')
  if (el) {
    el.style.cssText = 'padding:20px;color:#ccc;font-family:monospace;white-space:pre-wrap'
    el.textContent = `Failed to mount view "${view}":\n${err instanceof Error ? err.stack ?? err.message : String(err)}`
  }
  console.error('[cipher-mux] Mount error:', err)
}

if (view === 'workspaces') {
  import('./components/WorkspacesWindow').then(({ WorkspacesWindow }) => {
    render(<WorkspacesWindow />, document.getElementById('app')!)
  }).catch(mountError)
} else if (view === 'sidebar') {
  import('./components/SidebarWindow').then(({ SidebarWindow }) => {
    render(<SidebarWindow />, document.getElementById('app')!)
  }).catch(mountError)
} else {
  import('./app').then(({ App }) => {
    render(<App />, document.getElementById('app')!)
  }).catch(mountError)
}
