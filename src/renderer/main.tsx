import { render } from 'preact'
import './i18n'
import './styles/theme.css'
import './styles/layout.css'
import './styles/components.css'

const params = new URLSearchParams(location.search)
const view = params.get('view')

if (view === 'workspaces') {
  import('./components/WorkspacesWindow').then(({ WorkspacesWindow }) => {
    render(<WorkspacesWindow />, document.getElementById('app')!)
  })
} else if (view === 'sidebar') {
  import('./components/SidebarWindow').then(({ SidebarWindow }) => {
    render(<SidebarWindow />, document.getElementById('app')!)
  })
} else {
  import('./app').then(({ App }) => {
    render(<App />, document.getElementById('app')!)
  })
}
