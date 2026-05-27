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
          <ul>
            {data.branches.map(branch => (
              <li key={branch.name} className={branch.head === data.HEAD.commit ? 'active' : ''}>
                <span className="badge">{branch.type}</span>
                {branch.name}
              </li>
            ))}
          </ul>

          <h3>Últimos Commits</h3>
          <ul>
            {data.commits.slice(0, 5).map(commit => (
              <li key={commit.fullHash} title={commit.message}>
                <code>{commit.hash}</code>
                <small>{commit.message.slice(0, 30)}</small>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </div>
  )
}

export default App
