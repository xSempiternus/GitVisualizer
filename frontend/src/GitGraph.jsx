import { useEffect, useRef, useState } from 'react'
import * as d3 from 'd3'
import './GitGraph.css'

/**
 * GitGraph: Visualiza el árbol de commits con D3.js
 *
 * Cómo preserva posiciones:
 * 1. Las posiciones de cada nodo se guardan en un ref (positionsRef)
 * 2. Solo re-renderiza cuando los datos realmente cambian (nuevos commits)
 * 3. Al re-renderizar, restaura las posiciones guardadas
 * 4. Botón "Reset Layout" recalcula desde cero
 */

function GitGraph({ data }) {
  const svgRef = useRef(null)
  const containerRef = useRef(null)

  // Guarda las posiciones manuales de los nodos (persisten entre renders)
  const positionsRef = useRef(new Map())

  // Guarda el hash de los datos para detectar cambios reales
  const dataSignatureRef = useRef(null)

  // Track del resetKey anterior para detectar cambios
  const prevResetKeyRef = useRef(0)

  // Trigger para forzar reset
  const [resetKey, setResetKey] = useState(0)

  // Genera una "firma" de los datos para comparar
  const getDataSignature = (data) => {
    if (!data || !data.commits) return ''
    return data.commits.map(c => c.fullHash).sort().join(',') +
           '|' + data.branches.map(b => `${b.name}:${b.fullHead}`).join(',')
  }

  useEffect(() => {
    if (!data || !data.commits || data.commits.length === 0) return

    // Detecta si fue un reset (resetKey cambió)
    const isReset = resetKey !== prevResetKeyRef.current
    prevResetKeyRef.current = resetKey

    // Si fue un reset, limpia el cache para forzar re-render
    if (isReset) {
      console.log('🔄 Reset triggered - clearing positions')
      positionsRef.current.clear()
      dataSignatureRef.current = null
    }

    const newSignature = getDataSignature(data)

    // Si la firma de datos no cambió, NO renderizar
    if (newSignature === dataSignatureRef.current) {
      console.log('✓ Datos sin cambios - manteniendo posiciones')
      return
    }

    console.log('🆕 Datos cambiaron - re-renderizando')
    dataSignatureRef.current = newSignature

    const container = containerRef.current
    const width = container.clientWidth
    const height = container.clientHeight

    // Limpiar SVG anterior
    d3.select(svgRef.current).selectAll('*').remove()

    // ============================================
    // PASO 1: Preparar nodos con posiciones guardadas
    // ============================================

    const nodes = data.commits.map(commit => {
      const node = {
        id: commit.fullHash,
        hash: commit.hash,
        message: commit.message,
        author: commit.author,
        timestamp: commit.timestamp,
        branches: commit.branches || [],
        color: commit.color || '#58a6ff',
        isHead: commit.fullHash === data.HEAD.commit
      }

      // Restaura posición guardada si existe
      const savedPos = positionsRef.current.get(commit.fullHash)
      if (savedPos) {
        node.x = savedPos.x
        node.y = savedPos.y
        node.fx = savedPos.fx
        node.fy = savedPos.fy
      }

      return node
    })

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
    // PASO 2: Force Simulation
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
    // PASO 3: SVG y Zoom
    // ============================================

    const svg = d3.select(svgRef.current)
      .attr('width', width)
      .attr('height', height)

    const captureRect = svg.append('rect')
      .attr('width', width)
      .attr('height', height)
      .attr('fill', 'transparent')
      .attr('pointer-events', 'all')

    const g = svg.append('g')

    const zoom = d3.zoom()
      .scaleExtent([0.3, 5])
      .filter((event) => {
        return !event.button && (event.type === 'wheel' || event.target.tagName === 'rect')
      })
      .on('zoom', (event) => {
        g.attr('transform', event.transform)
      })

    svg.call(zoom)

    const initialScale = 0.9
    svg.call(zoom.transform, d3.zoomIdentity
      .translate(width / 2, height / 2)
      .scale(initialScale)
      .translate(-width / 2, -height / 2)
    )

    const linkGroup = g.append('g').attr('class', 'links')
    const nodeGroup = g.append('g').attr('class', 'nodes')
    const labelGroup = g.append('g').attr('class', 'labels')

    // ============================================
    // PASO 4: Links
    // ============================================

    const link = linkGroup.selectAll('line')
      .data(links)
      .join('line')
      .attr('class', 'link')

    // ============================================
    // PASO 5: Nodos
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
    // PASO 6: Labels
    // ============================================

    const hashLabels = labelGroup.selectAll('text.hash-label')
      .data(nodes)
      .join('text')
      .attr('class', 'hash-label')
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'hanging')
      .attr('pointer-events', 'none')
      .text(d => `📦 ${d.hash}`)

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

    const branchLabels = labelGroup.selectAll('g.branch-label-group')
      .data(nodes.filter(n => n.branches.length > 0))
      .join('g')
      .attr('class', 'branch-label-group')
      .attr('pointer-events', 'none')

    branchLabels.each(function(d) {
      const group = d3.select(this)
      d.branches.forEach((branchName, i) => {
        group.append('text')
          .attr('class', 'branch-label')
          .attr('text-anchor', 'middle')
          .attr('dominant-baseline', 'middle')
          .attr('fill', d.color)
          .attr('data-offset', i)
          .text(`🌿 ${branchName}`)
      })
    })

    node.append('title')
      .text(d => {
        return `📦 ${d.hash}\n💬 ${d.message}\n👤 ${d.author}\n🕐 ${new Date(d.timestamp * 1000).toLocaleString()}\n${d.branches.length > 0 ? '🌿 ' + d.branches.join(', ') : ''}`
      })

    // ============================================
    // PASO 7: Tick - actualizar posiciones
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

      hashLabels
        .attr('x', d => d.x)
        .attr('y', d => d.y + (d.isHead ? HEAD_RADIUS : NODE_RADIUS) + 8)

      branchLabels.attr('transform', d => {
        const offsetY = d.y - (d.isHead ? HEAD_RADIUS : NODE_RADIUS) - 10
        return `translate(${d.x}, ${offsetY})`
      })

      branchLabels.selectAll('text').each(function() {
        const offset = parseInt(d3.select(this).attr('data-offset'))
        d3.select(this).attr('y', -offset * 16)
      })

      if (tickCount > MAX_TICKS) {
        // Guarda las posiciones finales cuando la simulación se detiene
        nodes.forEach(n => {
          positionsRef.current.set(n.id, {
            x: n.x,
            y: n.y,
            fx: n.fx,
            fy: n.fy
          })
        })
        simulation.stop()
      }
    })

    // ============================================
    // PASO 8: Drag
    // ============================================

    function drag(simulation) {
      function dragstarted(event, d) {
        if (!event.active) {
          tickCount = 0
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
        // FIJA el nodo en su nueva posición (no vuelve a moverse)
        // d.fx y d.fy mantienen el valor, congelando el nodo

        // Guarda la posición inmediatamente
        positionsRef.current.set(d.id, {
          x: d.x,
          y: d.y,
          fx: d.fx,
          fy: d.fy
        })
      }

      return d3.drag()
        .on('start', dragstarted)
        .on('drag', dragged)
        .on('end', dragended)
    }

    return () => {
      // Guarda posiciones antes de desmontar
      nodes.forEach(n => {
        if (n.x !== undefined && n.y !== undefined) {
          positionsRef.current.set(n.id, {
            x: n.x,
            y: n.y,
            fx: n.fx,
            fy: n.fy
          })
        }
      })
      simulation.stop()
    }

  }, [data, resetKey])

  const handleReset = () => {
    positionsRef.current.clear()
    dataSignatureRef.current = null
    setResetKey(prev => prev + 1)
  }

  return (
    <div className="git-graph-container" ref={containerRef}>
      <svg ref={svgRef}></svg>

      <button className="reset-button" onClick={handleReset} title="Reorganizar layout automáticamente">
        🔄 Reset Layout
      </button>

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
