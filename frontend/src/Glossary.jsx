import { useState } from 'react'
import './Glossary.css'

/**
 * Glossary: Panel desplegable con explicaciones de Git y la visualización
 */

function Glossary({ branches, branchColors }) {
  const [isOpen, setIsOpen] = useState(false)
  const [activeTab, setActiveTab] = useState('colors')

  return (
    <>
      <button
        className="glossary-toggle"
        onClick={() => setIsOpen(true)}
        title="Abrir glosario y ayuda"
      >
        Docs
      </button>

      {isOpen && (
        <>
          <div className="glossary-overlay" onClick={() => setIsOpen(false)} />
          <div className="glossary-panel">
            <header className="glossary-header">
              <h2>📖 Glosario & Ayuda</h2>
              <button className="glossary-close" onClick={() => setIsOpen(false)}>
                ✕
              </button>
            </header>

            <nav className="glossary-tabs">
              <button
                className={activeTab === 'colors' ? 'active' : ''}
                onClick={() => setActiveTab('colors')}
              >
                🎨 Colores
              </button>
              <button
                className={activeTab === 'concepts' ? 'active' : ''}
                onClick={() => setActiveTab('concepts')}
              >
                💡 Conceptos
              </button>
              <button
                className={activeTab === 'controls' ? 'active' : ''}
                onClick={() => setActiveTab('controls')}
              >
                🎮 Controles
              </button>
              <button
                className={activeTab === 'how' ? 'active' : ''}
                onClick={() => setActiveTab('how')}
              >
                ⚙️ Cómo funciona
              </button>
            </nav>

            <div className="glossary-content">

              {/* TAB: COLORES */}
              {activeTab === 'colors' && (
                <div className="glossary-section">
                  <h3>🎨 Significado de los colores</h3>
                  <p className="glossary-intro">
                    Cada <strong>rama</strong> tiene su color único. Los <strong>commits</strong> se colorean según la primera rama a la que pertenecen.
                  </p>

                  <div className="color-legend-grid">
                    <div className="color-card special">
                      <div className="color-circle head">⭐</div>
                      <div>
                        <h4>HEAD (Amarillo dorado)</h4>
                        <p>El commit actual en el que estás trabajando. Es el "puntero" que indica dónde está tu workspace.</p>
                      </div>
                    </div>

                    <h4 className="color-section-title">Colores por rama</h4>
                    {branches && branches.map(branch => (
                      <div key={branch.name} className="color-card">
                        <div
                          className="color-circle"
                          style={{ backgroundColor: branch.color, boxShadow: `0 0 8px ${branch.color}` }}
                        ></div>
                        <div>
                          <h4>🌿 {branch.name}</h4>
                          <p>Los commits de esta rama aparecen en este color. Último commit: <code>{branch.head}</code></p>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="info-box">
                    <strong>💡 Tip:</strong> Si un commit pertenece a varias ramas (porque fue mergeado), se colorea con el color de la primera rama listada.
                  </div>
                </div>
              )}

              {/* TAB: CONCEPTOS */}
              {activeTab === 'concepts' && (
                <div className="glossary-section">
                  <h3>💡 Conceptos básicos de Git</h3>

                  <div className="concept">
                    <h4>📦 Commit</h4>
                    <p>
                      Una "fotografía" del estado de tu código en un momento específico.
                      Cada commit tiene:
                    </p>
                    <ul>
                      <li><strong>Hash</strong>: identificador único (ej: <code>a412a95</code>)</li>
                      <li><strong>Mensaje</strong>: descripción del cambio</li>
                      <li><strong>Autor</strong>: quién hizo el cambio</li>
                      <li><strong>Parents</strong>: commits anteriores en la historia</li>
                    </ul>
                  </div>

                  <div className="concept">
                    <h4>🌿 Branch (Rama)</h4>
                    <p>
                      Una línea de desarrollo independiente. Es como una copia paralela
                      del código donde puedes hacer cambios sin afectar la rama principal.
                    </p>
                    <p>Ejemplos comunes:</p>
                    <ul>
                      <li><code>master</code> o <code>main</code>: rama principal estable</li>
                      <li><code>develop</code>: rama de desarrollo activo</li>
                      <li><code>feature/xyz</code>: ramas para nuevas funcionalidades</li>
                    </ul>
                  </div>

                  <div className="concept">
                    <h4>⭐ HEAD</h4>
                    <p>
                      Un "puntero" que indica en qué commit y rama estás trabajando actualmente.
                      Cuando haces un nuevo commit, HEAD se mueve al nuevo commit.
                    </p>
                  </div>

                  <div className="concept">
                    <h4>🔀 Merge</h4>
                    <p>
                      Combinar los cambios de una rama en otra. En el grafo se ve como
                      dos líneas que se juntan en un solo nodo.
                    </p>
                  </div>

                  <div className="concept">
                    <h4>↔️ Parent</h4>
                    <p>
                      El commit anterior a otro. Las líneas grises en el grafo conectan
                      cada commit con su(s) parent(s). Un commit puede tener:
                    </p>
                    <ul>
                      <li><strong>1 parent</strong>: commit normal</li>
                      <li><strong>2 parents</strong>: commit de merge</li>
                      <li><strong>0 parents</strong>: primer commit (initial commit)</li>
                    </ul>
                  </div>
                </div>
              )}

              {/* TAB: CONTROLES */}
              {activeTab === 'controls' && (
                <div className="glossary-section">
                  <h3>🎮 Cómo usar la visualización</h3>

                  <div className="control-explained">
                    <kbd>🖱️ Rueda del mouse</kbd>
                    <p>Hacer <strong>zoom in/out</strong> en cualquier parte del canvas.</p>
                  </div>

                  <div className="control-explained">
                    <kbd>✋ Click + Arrastrar (fondo)</kbd>
                    <p>Desplazarte por el "universo" del grafo, como un mapa.</p>
                  </div>

                  <div className="control-explained">
                    <kbd>👆 Click + Arrastrar (nodo)</kbd>
                    <p>Mover un commit a una posición específica. <strong>El nodo se queda fijo</strong> donde lo dejes, incluso al refrescar datos.</p>
                  </div>

                  <div className="control-explained">
                    <kbd>👁️ Hover (sobre nodo)</kbd>
                    <p>Ver el tooltip con información completa del commit: hash, mensaje, autor, fecha y ramas.</p>
                  </div>

                  <div className="control-explained">
                    <kbd>🔄 Reset Layout</kbd>
                    <p>Reorganiza automáticamente todos los nodos en una distribución limpia (descarta tus posiciones manuales).</p>
                  </div>
                </div>
              )}

              {/* TAB: CÓMO FUNCIONA */}
              {activeTab === 'how' && (
                <div className="glossary-section">
                  <h3>⚙️ Cómo funciona Git Visualizer</h3>

                  <div className="how-step">
                    <div className="step-number">1</div>
                    <div>
                      <h4>Backend lee tu repositorio</h4>
                      <p>
                        Un servidor Node.js lee directamente los archivos de la carpeta
                        <code>.git/</code>:
                      </p>
                      <ul>
                        <li><code>.git/HEAD</code> → rama actual</li>
                        <li><code>.git/refs/heads/*</code> → todas las ramas</li>
                        <li><code>.git/objects/*</code> → commits comprimidos</li>
                      </ul>
                    </div>
                  </div>

                  <div className="how-step">
                    <div className="step-number">2</div>
                    <div>
                      <h4>Descomprime y parsea commits</h4>
                      <p>
                        Cada commit está guardado en formato comprimido (zlib).
                        El backend los descomprime y extrae: hash, mensaje, autor, parents.
                      </p>
                    </div>
                  </div>

                  <div className="how-step">
                    <div className="step-number">3</div>
                    <div>
                      <h4>API REST entrega los datos</h4>
                      <p>
                        El endpoint <code>/api/git-data</code> devuelve un JSON con
                        commits, branches, colores y HEAD.
                      </p>
                    </div>
                  </div>

                  <div className="how-step">
                    <div className="step-number">4</div>
                    <div>
                      <h4>React + D3.js renderizan el grafo</h4>
                      <p>
                        D3 usa <strong>force simulation</strong> (simulación de fuerzas
                        físicas) para posicionar los nodos automáticamente:
                      </p>
                      <ul>
                        <li>Repulsión entre nodos (se alejan)</li>
                        <li>Atracción por links (se unen)</li>
                        <li>Centrado al medio del canvas</li>
                      </ul>
                    </div>
                  </div>

                  <div className="how-step">
                    <div className="step-number">5</div>
                    <div>
                      <h4>Polling cada 10 segundos</h4>
                      <p>
                        El frontend pregunta al backend si hay cambios. Si los datos
                        son iguales, NO re-renderiza (mantiene tus posiciones manuales).
                      </p>
                    </div>
                  </div>
                </div>
              )}

            </div>
          </div>
        </>
      )}
    </>
  )
}

export default Glossary
