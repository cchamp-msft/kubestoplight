import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@carbon/charts-react/styles.min.css'
import './styles/index.scss'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
