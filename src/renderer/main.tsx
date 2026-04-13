import { render } from 'preact'
import { App } from './app'
import './styles/theme.css'
import './styles/layout.css'
import './styles/components.css'

render(<App />, document.getElementById('app')!)
