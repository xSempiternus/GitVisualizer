import { useEffect, useRef } from 'react'
import * as d3 from 'd3'
import './GitGraph.css'

/**
 * GitGraph: Visualiza el árbol de commits con D3.js
 *
 * ¿Cómo funciona?
 * 1. Crea un "force simulation" (fuerzas que repelen/atraen nodos)
 * 2. Los commits son nodos conectados por sus parents
 * 3. D3 calcula posiciones automáticamente para que no se crucen
 * 4. Dibuja líneas (edges) entre commits y los commits como círculos (nodos)
 */

function GitGraph({ data }) {
  const svgRef = useRef(null)
  const containerRef = useRef(null)

  useEffect(() => {
    if (!data || !data.commits || data.commits.length === 0) return

    const container = containerRef.current
    const width = container.clientWidth
    const height = container.clientHeight

    // Limpiar SVG anterior
    d3.select(svgRef.current).selectAll('*').remove()

    // ============================================
    // PASO 1: Preparar los datos para D3
    // ============================================

    // Los nodos son los commits
    const nodes = data.commits.map(commit => ({
      id: commit.fullHash,
      hash: commit.hash,
      message: commit.message,
      author: commit.author,
      timestamp: commit.timestamp,
      branches: commit.branches || [],
      color: commit.color || '#58a6ff',
      isHead: commit.fullHash === data.HEAD.commit
    }))

    // Los links son las conexiones (parent → child)
    // Cada commit apunta a sus parents
    const links = []
    data.commits.forEach(commit => {
      commit.parents.forEach(parentHash => {
        links.push({
          source: commit.fullHash,
          target: parentHash
        })
      })
    })

    // Mapear commits por hash para búsquedas rápidas
    const commitMap = new Map()
    data.commits.forEach(commit => {
      commitMap.set(commit.fullHash, commit)
    })

    // ============================================
    // PASO 2: Configurar D3 Force Simulation
    // ============================================

    // Esto calcula automáticamente las posiciones de los nodos
    // usando fuerzas simuladas (como imanes y resortes)
    const simulation = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(links)
        .id(d => d.id)
        .distance(100)
        .strength(0.8)
      )
      .force('charge', d3.forceManyBody().strength(-500)) // Repulsión entre nodos
      .force('center', d3.forceCenter(width / 2, height / 2).strength(0.3))
      .force('collision', d3.forceCollide().radius(45)) // Evita que se solapen
      .alpha(1) // Reinicia la simulación
      .alphaDecay(0.008) // Desaceleración más rápida
      .velocityDecay(0.4) // Más fricción para que se estabilice

    // ============================================
    // PASO 3: Crear el SVG
    // ============================================

    const svg = d3.select(svgRef.current)
      .attr('width', width)
      .attr('height', height)

    // Fondo fijo
    svg.append('rect')
      .attr('width', width)
      .attr('height', height)
      .attr('fill', '#0d1117')

    // Rect invisible para capturar eventos de zoom/pan
    const captureRect = svg.append('rect')
      .attr('width', width)
      .attr('height', height)
      .attr('fill', 'none')
      .attr('pointer-events', 'all')

    // Grupo principal para zoom y pan
    const g = svg.append('g')

    // ============================================
    // ZOOM Y PAN (Interactividad del canvas)
    // ============================================
    const zoom = d3.zoom()
      .scaleExtent([0.5, 5]) // Zoom entre 0.5x y 5x
      .on('zoom', (event) => {
        g.attr('transform', event.transform)
      })

    // Aplica zoom al rect invisible (no al SVG completo)
    captureRect.call(zoom)

    // Zoom inicial para que todo quepa en pantalla
    const initialScale = 0.8
    captureRect.call(zoom.transform, d3.zoomIdentity
      .translate(width / 2, height / 2)
      .scale(initialScale)
      .translate(-width / 2, -height / 2)
    )

    // Grupo para los links (líneas)
    const linkGroup = g.append('g').attr('class', 'links')

    // Grupo para los nodos (círculos)
    const nodeGroup = g.append('g').attr('class', 'nodes')

    // ============================================
    // PASO 4: Dibujar los links (líneas)
    // ============================================

    const link = linkGroup.selectAll('line')
      .data(links)
      .join('line')
      .attr('class', 'link')
      .attr('stroke', '#30363d')
      .attr('stroke-width', 2)
      .attr('opacity', 0.6)

    // ============================================
    // PASO 5: Dibujar los nodos (círculos)
    // ============================================

    const node = nodeGroup.selectAll('circle')
      .data(nodes)
      .join('circle')
      .attr('r', d => d.isHead ? 13 : 10)
      .attr('class', d => `node ${d.isHead ? 'head' : ''}`)
      .attr('fill', d => {
        // Si es HEAD, usa color más brillante
        if (d.isHead) return d.color
        return d.color
      })
      .attr('stroke', d => d.isHead ? '#0d1117' : '#0d1117')
      .attr('stroke-width', d => d.isHead ? 3 : 2)
      .call(drag(simulation))

    // ============================================
    // PASO 6: Agregar labels de texto
    // ============================================

    // Labels de commits (hash)
    const labels = nodeGroup.selectAll('text.node-label')
      .data(nodes)
      .join('text')
      .attr('class', 'node-label')
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'middle')
      .attr('font-size', '10px')
      .attr('font-family', 'Monaco, monospace')
      .attr('font-weight', 'bold')
      .attr('fill', '#0d1117')
      .attr('pointer-events', 'none')
      .text(d => d.hash)

    // Labels de ramas (si el commit es head de una rama)
    const branchLabels = nodeGroup.selectAll('text.branch-label')
      .data(nodes.filter(n => n.branches.length > 0))
      .join('text')
      .attr('class', 'branch-label')
      .attr('text-anchor', 'start')
      .attr('dominant-baseline', 'middle')
      .attr('font-size', '11px')
      .attr('font-family', 'sans-serif')
      .attr('font-weight', '600')
      .attr('fill', d => d.color)
      .attr('pointer-events', 'none')
      .text(d => d.branches.join(', '))

    // ============================================
    // PASO 7: Agregar tooltips (información)
    // ============================================

    node.append('title')
      .text(d => {
        const commit = commitMap.get(d.id)
        return `${d.hash}\n${d.message}\nAutor: ${d.author}\n${new Date(d.timestamp * 1000).toLocaleString()}`
      })

    // ============================================
    // PASO 8: Actualizar posiciones en cada tick
    // ============================================

    simulation.on('tick', () => {
      link
        .attr('x1', d => d.source.x)
        .attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x)
        .attr('y2', d => d.target.y)

      node
        .attr('cx', d => d.x)
        .attr('cy', d => d.y)

      labels
        .attr('x', d => d.x)
        .attr('y', d => d.y)

      branchLabels
        .attr('x', d => d.x + 18)
        .attr('y', d => d.y - 15)
    })

    // ============================================
    // PASO 9: Interactividad (drag de nodos)
    // ============================================

    function drag(simulation) {
      function dragstarted(event, d) {
        if (!event.active) simulation.alphaTarget(0.3).restart()
        d.fx = d.x
        d.fy = d.y
        // Desactiva el zoom mientras se draggea un nodo
        captureRect.on('.zoom', null)
      }

      function dragged(event, d) {
        d.fx = event.x
        d.fy = event.y
      }

      function dragended(event, d) {
        if (!event.active) simulation.alphaTarget(0)
        d.fx = null
        d.fy = null
        // Reactiva el zoom
        captureRect.call(zoom)
      }

      return d3.drag()
        .on('start', dragstarted)
        .on('drag', dragged)
        .on('end', dragended)
    }

  }, [data])

  return (
    <div className="git-graph-container" ref={containerRef}>
      <svg ref={svgRef}></svg>

      <div className="graph-legend">
        <div className="legend-item">
          <div className="legend-circle head"></div>
          <span>HEAD (commit actual)</span>
        </div>
        <div className="legend-item">
          <div className="legend-circle"></div>
          <span>Commits</span>
        </div>
        <div className="legend-item">
          <div className="legend-line"></div>
          <span>Parents (relaciones)</span>
        </div>
      </div>

      <div className="graph-controls">
        <div className="control-item">
          <kbd>🖱️ Rueda</kbd> Zoom
        </div>
        <div className="control-item">
          <kbd>Drag</kbd> Desplazar
        </div>
        <div className="control-item">
          <kbd>Nodo</kbd> Arrastrar
        </div>
      </div>
    </div>
  )
}

export default GitGraph
