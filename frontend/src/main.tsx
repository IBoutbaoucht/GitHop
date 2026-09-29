import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom' // Import this
import App from './App'
import './index.css'
// add near top of src/main.tsx
import 'katex/dist/katex.min.css'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <BrowserRouter> {/* Wrap App here */}
      <App />
    </BrowserRouter>
  </React.StrictMode>,
)
