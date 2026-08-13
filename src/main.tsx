import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import './styles/global.css'
import './styles/experience.css'

const root = document.getElementById('root')
if (!root) throw new Error('Application root is missing.')

createRoot(root).render(<App />)
