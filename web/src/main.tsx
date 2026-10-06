import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Inter ships with the bundle (not Google Fonts) so the embedded Go binary
// renders correctly on air-gapped hosts.
import '@fontsource-variable/inter/opsz.css'
import './vendor/jewel/css/jewel.css'
import './styles/index.scss'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
