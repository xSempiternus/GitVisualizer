import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'

// StrictMode deshabilitado: causa dobles renders en desarrollo
// que rompen la persistencia de posiciones de D3
ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)
