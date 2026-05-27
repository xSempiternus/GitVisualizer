import { useState, useEffect, useCallback } from 'react'
import GitGraph from './GitGraph'
import Glossary from './Glossary'
import SmartSuggestions from './SmartSuggestions'
import './App.css'

function App() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchData = useCallback(async () => {
    try {
      const response = await fetch('/api/git-data')
      if (!response.ok) throw new Error('Failed to fetch git data')
      const jsonData = await response.json()
      setData(jsonData)
      setLoading(false)
    } catch (err) {
      setError(err.message)
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
    // Refetch cada 10 segundos
    const interval = setInterval(fetchData, 10000)
    return () => clearInterval(interval)
  }, [fetchData])

  if (loading) return <div className="container"><p>Cargando repositorio...</p></div>
  if (error) return <div className="container"><p style={{color: 'red'}}>Error: {error}</p></div>
  if (!data) return <div className="container"><p>Sin datos</p></div>

  return (
    <div className="app">
      <header className="header">
        <div className="header-brand">
          <div className="brand-logo"></div>
          <h1>Git Visualizer</h1>
        </div>
        <div className="info">
          <div className="info-stat">
            <span className="info-value">{data.commits.length}</span>
            <span className="info-label">commits</span>
          </div>
          <div className="info-divider"></div>
          <div className="info-stat">
            <span className="info-value">{data.branches.length}</span>
            <span className="info-label">branches</span>
          </div>
          <div className="info-divider"></div>
          <div className="info-stat">
            <span className="info-value head-branch">{data.HEAD.branch}</span>
            <span className="info-label">HEAD</span>
          </div>
        </div>
      </header>

      <div className="app-main">
        <div className="canvas-wrapper">
          <SmartSuggestions onActionExecuted={fetchData} />
          <GitGraph data={data} branches={data.branches} />
        </div>

        <aside className="sidebar">
          <section className="sidebar-section">
            <h3>Branches</h3>
            <ul className="branch-list">
              {data.branches.map(branch => (
                <li
                  key={branch.name}
                  className={branch.head === data.HEAD.commit ? 'active' : ''}
                >
                  <span className="branch-indicator" style={{ backgroundColor: branch.color }}></span>
                  <div className="branch-content">
                    <div className="branch-name">{branch.name}</div>
                    <code className="branch-hash">{branch.head}</code>
                  </div>
                  {branch.head === data.HEAD.commit && <span className="head-badge">HEAD</span>}
                </li>
              ))}
            </ul>
          </section>

          <section className="sidebar-section">
            <h3>Contributors</h3>
            <ul className="authors-list">
              {[...new Set(data.commits.map(c => c.author))].map(author => {
                const authorCommits = data.commits.filter(c => c.author === author);
                return (
                  <li key={author} className="author-item">
                    <div className="author-avatar">
                      {author.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                    </div>
                    <div className="author-info">
                      <div className="author-name">{author}</div>
                      <small>{authorCommits.length} {authorCommits.length === 1 ? 'commit' : 'commits'}</small>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="sidebar-section">
            <h3>Recent Activity</h3>
            <ul className="recent-commits">
              {[...data.commits]
                .sort((a, b) => b.timestamp - a.timestamp)
                .slice(0, 5)
                .map(commit => (
                  <li key={commit.fullHash} className="recent-commit-item" title={commit.message}>
                    <span className="recent-commit-dot" style={{ backgroundColor: commit.color }}></span>
                    <div className="recent-commit-content">
                      <div className="recent-commit-message">
                        {commit.message.split('\n')[0].slice(0, 40)}
                        {commit.message.length > 40 && '…'}
                      </div>
                      <div className="recent-commit-meta">
                        <code>{commit.hash}</code>
                        <span>·</span>
                        <span>{commit.author}</span>
                      </div>
                    </div>
                  </li>
                ))}
            </ul>
          </section>
        </aside>
      </div>
    </div>
  )
}

export default App
