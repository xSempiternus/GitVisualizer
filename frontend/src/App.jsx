import { useState, useEffect } from 'react'
import GitGraph from './GitGraph'
import './App.css'

function App() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    // Fetch datos del backend cada 2 segundos
    const fetchData = async () => {
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
    }

    fetchData()
    const interval = setInterval(fetchData, 2000)
    return () => clearInterval(interval)
  }, [])

  if (loading) return <div className="container"><p>Cargando repositorio...</p></div>
  if (error) return <div className="container"><p style={{color: 'red'}}>Error: {error}</p></div>
  if (!data) return <div className="container"><p>Sin datos</p></div>

  return (
    <div className="app">
      <header className="header">
        <h1>📊 Git Visualizer</h1>
        <div className="info">
          <span>{data.commits.length} commits</span>
          <span>·</span>
          <span>{data.branches.length} branches</span>
          <span>·</span>
          <span>HEAD: <strong>{data.HEAD.branch}</strong></span>
        </div>
      </header>

      <div className="app-main">
        <GitGraph data={data} />

        <aside className="sidebar">
          <h3>Branches</h3>
          <ul className="branch-list">
            {data.branches.map(branch => (
              <li
                key={branch.name}
                className={branch.head === data.HEAD.commit ? 'active' : ''}
                style={{ borderLeftColor: branch.color }}
              >
                <span className="branch-dot" style={{ backgroundColor: branch.color }}></span>
                <div>
                  <div className="branch-name">{branch.name}</div>
                  <code className="branch-hash">{branch.head}</code>
                </div>
              </li>
            ))}
          </ul>

          <h3>Commits por Rama</h3>
          {data.branches.map(branch => {
            const branchCommits = data.commits.filter(c => c.branches?.includes(branch.name));
            return (
              <div key={branch.name} className="branch-commits">
                <div className="branch-group-title" style={{ color: branch.color }}>
                  {branch.name}
                </div>
                <ul className="commits-list">
                  {branchCommits.slice(0, 3).map(commit => (
                    <li key={commit.fullHash} title={commit.message}>
                      <code>{commit.hash}</code>
                      <small>{commit.message.split('\n')[0].slice(0, 25)}</small>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </aside>
      </div>
    </div>
  )
}

export default App
