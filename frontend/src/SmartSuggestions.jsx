import { useState, useEffect } from 'react'
import './SmartSuggestions.css'

/**
 * SmartSuggestions: Sistema inteligente que sugiere acciones Git
 *
 * Analiza el estado del repo y muestra botones accionables
 * para flujos comunes (commit, push, pull, merge, cleanup)
 */

function SmartSuggestions({ onActionExecuted }) {
  const [suggestions, setSuggestions] = useState([])
  const [executing, setExecuting] = useState(null)
  const [feedback, setFeedback] = useState(null)
  const [collapsed, setCollapsed] = useState(false)

  const fetchSuggestions = async () => {
    try {
      const res = await fetch('/api/suggestions')
      if (!res.ok) throw new Error('Failed to fetch')
      const data = await res.json()
      setSuggestions(data.suggestions || [])
    } catch (err) {
      console.error('Error fetching suggestions:', err)
    }
  }

  useEffect(() => {
    fetchSuggestions()
    // Refresh sugerencias cada 3 segundos (responsive a cambios)
    const interval = setInterval(fetchSuggestions, 3000)
    return () => clearInterval(interval)
  }, [])

  const runCommand = async (command) => {
    const res = await fetch('/api/execute-action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command })
    })
    return res.json()
  }

  const executeAction = async (action) => {
    setExecuting(action.id)
    setFeedback(null)

    try {
      // Ejecutar comando principal
      const result = await runCommand(action.command)

      if (!result.success) {
        setFeedback({
          type: 'error',
          message: `✗ ${result.error}`
        })
        return
      }

      // Si hay followUp (ej: checkout + merge), ejecutarlo
      if (action.followUp) {
        const followResult = await runCommand(action.followUp)
        if (!followResult.success) {
          setFeedback({
            type: 'error',
            message: `✗ Follow-up: ${followResult.error}`
          })
          return
        }
      }

      setFeedback({
        type: 'success',
        message: `✓ ${action.label}`
      })

      // Refrescar después de la acción
      setTimeout(() => {
        fetchSuggestions()
        if (onActionExecuted) onActionExecuted()
      }, 500)
    } catch (err) {
      setFeedback({
        type: 'error',
        message: `✗ ${err.message}`
      })
    } finally {
      setExecuting(null)
      setTimeout(() => setFeedback(null), 4000)
    }
  }

  // Cuenta sugerencias por prioridad
  const counts = suggestions.reduce((acc, s) => {
    acc[s.priority] = (acc[s.priority] || 0) + 1
    return acc
  }, {})

  if (suggestions.length === 0) {
    return (
      <div className="smart-suggestions empty">
        <div className="suggestions-header">
          <div className="header-title">
            <span className="ai-icon"></span>
            <span>Smart Suggestions</span>
          </div>
        </div>
        <div className="empty-state">
          <span className="empty-check">✓</span>
          <span>Tu repo está limpio. Nada que hacer.</span>
        </div>
      </div>
    )
  }

  return (
    <div className={`smart-suggestions ${collapsed ? 'collapsed' : ''}`}>
      <div className="suggestions-header" onClick={() => setCollapsed(!collapsed)}>
        <div className="header-title">
          <span className="ai-icon"></span>
          <span>Smart Suggestions</span>
          <span className="badge">{suggestions.length}</span>
        </div>
        <button className="collapse-btn">
          {collapsed ? '▼' : '▲'}
        </button>
      </div>

      {!collapsed && (
        <div className="suggestions-list">
          {suggestions.map(suggestion => (
            <div
              key={suggestion.id}
              className={`suggestion-card priority-${suggestion.priority}`}
            >
              <div className="suggestion-header">
                <span className="suggestion-icon">{suggestion.icon}</span>
                <div className="suggestion-content">
                  <div className="suggestion-title">{suggestion.title}</div>
                  <div className="suggestion-description">{suggestion.description}</div>
                </div>
              </div>

              {suggestion.details && (
                <div className="suggestion-details">
                  {suggestion.details.untracked && suggestion.details.untracked.length > 0 && (
                    <div className="detail-group">
                      <span className="detail-label">Untracked:</span>
                      <code>{suggestion.details.untracked.join(', ')}</code>
                    </div>
                  )}
                  {suggestion.details.modified && suggestion.details.modified.length > 0 && (
                    <div className="detail-group">
                      <span className="detail-label">Modified:</span>
                      <code>{suggestion.details.modified.join(', ')}</code>
                    </div>
                  )}
                  {suggestion.details.branches && (
                    <div className="detail-group">
                      <span className="detail-label">Branches:</span>
                      <code>{suggestion.details.branches.join(', ')}</code>
                    </div>
                  )}
                </div>
              )}

              <div className="suggestion-actions">
                {suggestion.actions.map(action => (
                  <button
                    key={action.id}
                    className="action-button"
                    onClick={() => executeAction(action)}
                    disabled={executing === action.id}
                    title={action.command}
                  >
                    {executing === action.id ? 'Ejecutando...' : action.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {feedback && (
        <div className={`feedback ${feedback.type}`}>
          {feedback.message}
        </div>
      )}
    </div>
  )
}

export default SmartSuggestions
