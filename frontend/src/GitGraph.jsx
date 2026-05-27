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

    const links = []
    data.commits.forEach(commit => {
      commit.parents.forEach(parentHash => {
        links.push({
          source: commit.fullHash,
          target: parentHash
        })
      })
    })

    const commitMap = new Map()
    data.commits.forEach(commit => {
      commitMap.set(commit.fullHash, commit)
    })

    // ============================================
    // PASO 2: Configurar D3 Force Simulation
    // ============================================

    const simulation = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(links)
        .id(d => d.id)
        .distance(160)
        .strength(0.9)
      )
      .force('charge', d3.forceManyBody().strength(-900))
      .force('center', d3.forceCenter(width / 2, height / 2).strength(0.1))
      .force('collision', d3.forceCollide().radius(70))
      .alpha(1)
      .alphaDecay(0.025)
      .alphaMin(0.001)
      .velocityDecay(0.7)

    // ============================================
    // PASO 3: Crear el SVG y zoom
    // ============================================

    const svg = d3.select(svgRef.current)
      .attr('width', width)
      .attr('height', height)

    // Rect invisible para capturar eventos de zoom/pan
    const captureRect = svg.append('rect')
      .attr('width', width)
      .attr('height', height)
      .attr('fill', 'transparent')
      .attr('pointer-events', 'all')

    // Grupo principal para zoom y pan
    const g = svg.append('g')

    const zoom = d3.zoom()
      .scaleExtent([0.3, 5])
      .filter((event) => {
        // Solo permite zoom/pan en áreas vacías o con la rueda del mouse
        // Esto evita conflictos con el drag de nodos
        return !event.button && (event.type === 'wheel' || event.target.tagName === 'rect')
      })
      .on('zoom', (event) => {
        g.attr('transform', event.transform)
      })

    svg.call(zoom)

    // Zoom inicial centrado
    const initialScale = 0.9
    svg.call(zoom.transform, d3.zoomIdentity
      .translate(width / 2, height / 2)
      .scale(initialScale)
      .translate(-width / 2, -height / 2)
    )

    // Grupos para organizar elementos
    const linkGroup = g.append('g').attr('class', 'links')
    const nodeGroup = g.append('g').attr('class', 'nodes')
    const labelGroup = g.append('g').attr('class', 'labels')

    // ============================================
    // PASO 4: Dibujar los links (líneas)
    // ============================================

    const link = linkGroup.selectAll('line')
      .data(links)
      .join('line')
      .attr('class', 'link')

    // ============================================
    // PASO 5: Dibujar los nodos (círculos)
    // ============================================

    const NODE_RADIUS = 14
    const HEAD_RADIUS = 18

    const node = nodeGroup.selectAll('circle')
      .data(nodes)
      .join('circle')
      .attr('r', d => d.isHead ? HEAD_RADIUS : NODE_RADIUS)
      .attr('class', d => `node ${d.isHead ? 'head' : ''}`)
      .attr('fill', d => d.color)
      .attr('stroke', '#0a0e27')
      .attr('stroke-width', d => d.isHead ? 3 : 2)
      .style('cursor', 'grab')
      .call(drag(simulation))

    // ============================================
    // PASO 6: Agregar labels DEBAJO de los nodos
    // ============================================

    // Hash del commit (debajo del círculo)
    const hashLabels = labelGroup.selectAll('text.hash-label')
      .data(nodes)
      .join('text')
      .attr('class', 'hash-label')
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'hanging')
      .attr('pointer-events', 'none')
      .text(d => `📦 ${d.hash}`)

    // Icono dentro del nodo (HEAD tiene estrella, otros punto)
    const nodeIcons = labelGroup.selectAll('text.node-icon')
      .data(nodes)
      .join('text')
      .attr('class', 'node-icon')
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .attr('pointer-events', 'none')
      .attr('font-size', d => d.isHead ? '16px' : '12px')
      .text(d => d.isHead ? '⭐' : '●')
      .attr('fill', d => d.isHead ? '#fbbf24' : '#0a0e27')

    // Labels de ramas (ARRIBA del círculo)
    const branchLabels = labelGroup.selectAll('g.branch-label-group')
      .data(nodes.filter(n => n.branches.length > 0))
      .join('g')
      .attr('class', 'branch-label-group')
      .attr('pointer-events', 'none')

    branchLabels.each(function(d) {
      const group = d3.select(this)
      d.branches.forEach((branchName, i) => {
        // Background rectangle para legibilidad
        const text = group.append('text')
          .attr('class', 'branch-label')
          .attr('text-anchor', 'middle')
          .attr('dominant-baseline', 'middle')
          .attr('fill', d.color)
          .attr('data-offset', i)
          .text(`🌿 ${branchName}`)
      })
    })

    // ============================================
    // PASO 7: Tooltips (información completa)
    // ============================================

    node.append('title')
      .text(d => {
        return `📦 ${d.hash}\n💬 ${d.message}\n👤 ${d.author}\n🕐 ${new Date(d.timestamp * 1000).toLocaleString()}\n${d.branches.length > 0 ? '🌿 ' + d.branches.join(', ') : ''}`
      })

    // ============================================
    // PASO 8: Actualizar posiciones en cada tick
    // ============================================

    let tickCount = 0
    const MAX_TICKS = 300

    simulation.on('tick', () => {
      tickCount++

      link
        .attr('x1', d => d.source.x)
        .attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x)
        .attr('y2', d => d.target.y)

      node
        .attr('cx', d => d.x)
        .attr('cy', d => d.y)

      nodeIcons
        .attr('x', d => d.x)
        .attr('y', d => d.y)

      // Hash debajo del nodo
      hashLabels
        .attr('x', d => d.x)
        .attr('y', d => d.y + (d.isHead ? HEAD_RADIUS : NODE_RADIUS) + 8)

      // Branch labels arriba del nodo (apilados)
      branchLabels.attr('transform', d => {
        const offsetY = d.y - (d.isHead ? HEAD_RADIUS : NODE_RADIUS) - 10
        return `translate(${d.x}, ${offsetY})`
      })

      branchLabels.selectAll('text').each(function(_, i, nodes) {
        const offset = parseInt(d3.select(this).attr('data-offset'))
        d3.select(this).attr('y', -offset * 16)
      })

      if (tickCount > MAX_TICKS) {
        simulation.stop()
      }
    })

    // ============================================
    // PASO 9: Interactividad (drag de nodos)
    // ============================================

    function drag(simulation) {
      function dragstarted(event, d) {
        if (!event.active) {
          // Reactiva la simulación para que el drag funcione
          tickCount = 0 // Resetea el contador para que no se detenga
          simulation.alphaTarget(0.3).restart()
        }
        d.fx = d.x
        d.fy = d.y
      }

      function dragged(event, d) {
        d.fx = event.x
        d.fy = event.y
      }

      function dragended(event, d) {
        if (!event.active) simulation.alphaTarget(0)
        // Deja el nodo donde lo soltaron (fijo)
        // d.fx = null  // Comentado: el nodo se queda donde lo dejas
        // d.fy = null
      }

      return d3.drag()
        .on('start', dragstarted)
        .on('drag', dragged)
        .on('end', dragended)
    }

    // Cleanup
    return () => {
      simulation.stop()
    }

  }, [data])

  return (
    <div className="git-graph-container" ref={containerRef}>
      <svg ref={svgRef}></svg>

      <div className="graph-legend">
        <div className="legend-item">
          <div className="legend-circle head">⭐</div>
          <span>HEAD (commit actual)</span>
        </div>
        <div className="legend-item">
          <div className="legend-circle">●</div>
          <span>📦 Commits</span>
        </div>
        <div className="legend-item">
          <div className="legend-line"></div>
          <span>↔️ Parents (relaciones)</span>
        </div>
        <div className="legend-item">
          <span style={{fontSize: '14px'}}>🌿</span>
          <span>Branches</span>
        </div>
      </div>

      <div className="graph-controls">
        <div className="control-item">
          <kbd>🖱️ Rueda</kbd> Zoom
        </div>
        <div className="control-item">
          <kbd>✋ Drag</kbd> Desplazar canvas
        </div>
        <div className="control-item">
          <kbd>👆 Nodo</kbd> Arrastrar commit
        </div>
      </div>
    </div>
  )
}

export default GitGraph
