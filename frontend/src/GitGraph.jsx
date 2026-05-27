import { useEffect, useRef, useState } from 'react'
import * as d3 from 'd3'
import Glossary from './Glossary'
import './GitGraph.css'

/**
 * GitGraph: Visualización vertical estilo "git log --graph"
 *
 * Layout:
 * - Eje Y: tiempo (más recientes arriba)
 * - Eje X: carriles (lanes) - una columna por rama
 * - Rama principal (master/main) en el carril central (más prominente)
 * - Otras ramas en carriles a los lados
 */

function GitGraph({ data, branches }) {
  const svgRef = useRef(null)
  const containerRef = useRef(null)

  const positionsRef = useRef(new Map())
  const dataSignatureRef = useRef(null)
  const prevResetKeyRef = useRef(0)

  const [resetKey, setResetKey] = useState(0)

  const getDataSignature = (data) => {
    if (!data || !data.commits) return ''
    return data.commits.map(c => c.fullHash).sort().join(',') +
           '|' + data.branches.map(b => `${b.name}:${b.fullHead}`).join(',')
  }

  /**
   * Detecta cuál es la rama principal (main, master o la primera)
   */
  const getMainBranch = (branches) => {
    const main = branches.find(b => b.name === 'main')
    if (main) return main
    const master = branches.find(b => b.name === 'master')
    if (master) return master
    return branches[0]
  }

  /**
   * Asigna cada commit a un carril (lane).
   *
   * Algoritmo correcto (como git log --graph):
   * 1. Walk first-parent desde HEAD de main → estos commits van al lane 0
   * 2. Para cada otra rama, walk desde su HEAD → los commits no asignados
   *    se asignan al lane de esa rama
   * 3. Esto hace que los commits aparezcan en el lane de la rama donde
   *    fueron CREADOS, no donde terminaron por merge
   */
  const assignLanes = (commits, branches) => {
    const mainBranch = getMainBranch(branches)
    const laneMap = new Map()

    // Asigna lanes a las ramas
    laneMap.set(mainBranch.name, 0)

    const otherBranches = branches.filter(b => b.name !== mainBranch.name)
    otherBranches.forEach((branch, index) => {
      // Alterna: 1, -1, 2, -2, ...
      const lane = (Math.floor(index / 2) + 1) * (index % 2 === 0 ? 1 : -1)
      laneMap.set(branch.name, lane)
    })

    // Map de hash → commit para búsquedas rápidas
    const commitMap = new Map()
    commits.forEach(c => commitMap.set(c.fullHash, c))

    const commitLanes = new Map()

    // PASO 1: First-parent walk desde HEAD de main → lane 0
    // Esto recorre la "línea principal" de main
    let current = mainBranch.fullHead
    const visited = new Set()
    while (current && !visited.has(current)) {
      visited.add(current)
      commitLanes.set(current, 0)
      const commit = commitMap.get(current)
      if (!commit || !commit.parents || commit.parents.length === 0) break
      // FIRST PARENT solamente (esto es la magia)
      current = commit.parents[0]
    }

    // PASO 2: Para cada rama no-main, walk desde su HEAD
    // Los commits no asignados van al lane de esa rama
    otherBranches.forEach(branch => {
      const lane = laneMap.get(branch.name)
      const branchVisited = new Set()
      const queue = [branch.fullHead]

      while (queue.length > 0) {
        const hash = queue.shift()
        if (branchVisited.has(hash)) continue
        branchVisited.add(hash)

        // Solo asignar si no tiene lane (no está en main first-parent)
        if (!commitLanes.has(hash)) {
          commitLanes.set(hash, lane)
        }

        const commit = commitMap.get(hash)
        if (commit?.parents) {
          for (const parent of commit.parents) {
            if (!branchVisited.has(parent)) {
              queue.push(parent)
            }
          }
        }
      }
    })

    // Cualquier commit sin lane (huérfano) → lane 0
    commits.forEach(c => {
      if (!commitLanes.has(c.fullHash)) {
        commitLanes.set(c.fullHash, 0)
      }
    })

    return { laneMap, commitLanes, mainBranch }
  }

  /**
   * Calcula posiciones X,Y para cada commit
   */
  const calculatePositions = (commits, branches, width, height) => {
    const { laneMap, commitLanes, mainBranch } = assignLanes(commits, branches)

    // Ordena commits por timestamp DESCENDENTE (más nuevos arriba)
    const sortedCommits = [...commits].sort((a, b) => b.timestamp - a.timestamp)

    const VERTICAL_SPACING = 90
    const LANE_WIDTH = 280
    const TOP_PADDING = 100

    const centerX = width / 2

    const positions = new Map()
    sortedCommits.forEach((commit, index) => {
      const lane = commitLanes.get(commit.fullHash) ?? 0
      positions.set(commit.fullHash, {
        x: centerX + (lane * LANE_WIDTH),
        y: TOP_PADDING + (index * VERTICAL_SPACING),
        lane
      })
    })

    return { positions, laneMap, mainBranch, sortedCommits }
  }

  useEffect(() => {
    if (!data || !data.commits || data.commits.length === 0) return

    const isReset = resetKey !== prevResetKeyRef.current
    prevResetKeyRef.current = resetKey

    if (isReset) {
      positionsRef.current.clear()
      dataSignatureRef.current = null
    }

    const newSignature = getDataSignature(data)
    if (newSignature === dataSignatureRef.current) return
    dataSignatureRef.current = newSignature

    const container = containerRef.current
    const width = container.clientWidth
    const height = container.clientHeight

    d3.select(svgRef.current).selectAll('*').remove()

    // ============================================
    // PASO 1: Calcular posiciones (layout vertical)
    // ============================================

    const { positions, laneMap, mainBranch, sortedCommits } =
      calculatePositions(data.commits, data.branches, width, height)

    const nodes = sortedCommits.map(commit => {
      const pos = positions.get(commit.fullHash)
      const savedPos = positionsRef.current.get(commit.fullHash)

      return {
        id: commit.fullHash,
        hash: commit.hash,
        message: commit.message,
        author: commit.author,
        timestamp: commit.timestamp,
        branches: commit.branches || [],
        color: commit.color || '#58a6ff',
        isHead: commit.fullHash === data.HEAD.commit,
        lane: pos.lane,
        // Si hay posición guardada (drag manual), úsala
        x: savedPos?.fx ?? pos.x,
        y: savedPos?.fy ?? pos.y,
        fx: savedPos?.fx ?? pos.x,
        fy: savedPos?.fy ?? pos.y
      }
    })

    const nodeMap = new Map()
    nodes.forEach(n => nodeMap.set(n.id, n))

    // Links con info de la rama para colorear
    const links = []
    data.commits.forEach(commit => {
      commit.parents.forEach(parentHash => {
        const sourceNode = nodeMap.get(commit.fullHash)
        const targetNode = nodeMap.get(parentHash)
        if (sourceNode && targetNode) {
          // El link toma el color del commit hijo (más reciente)
          const isMainBranchLink = sourceNode.lane === 0 && targetNode.lane === 0
          links.push({
            source: sourceNode,
            target: targetNode,
            color: sourceNode.color,
            isMainBranch: isMainBranchLink
          })
        }
      })
    })

    // ============================================
    // PASO 2: SVG y Zoom
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

    // Zoom inicial - intenta encajar todos los commits
    const totalHeight = nodes.length * 100 + 200
    const scaleToFit = Math.min(1, height / totalHeight, 1)
    const initialScale = 0.85

    svg.call(zoom.transform, d3.zoomIdentity
      .translate(width / 2, 50)
      .scale(initialScale)
      .translate(-width / 2, 0)
    )

    // ============================================
    // PASO 3: Dibujar columnas de carriles (background)
    // ============================================

    const lanesGroup = g.append('g').attr('class', 'lanes')

    // Crea columnas verticales suaves para cada rama
    const uniqueLanes = [...new Set(nodes.map(n => n.lane))]
    uniqueLanes.forEach(lane => {
      const x = width / 2 + (lane * 280)
      const isMainLane = lane === 0

      // Encuentra el color de la rama de este lane
      let laneColor = '#7dd3fc'
      laneMap.forEach((laneNum, branchName) => {
        if (laneNum === lane) {
          const branch = data.branches.find(b => b.name === branchName)
          if (branch) laneColor = branch.color
        }
      })

      // Background del carril
      lanesGroup.append('rect')
        .attr('class', isMainLane ? 'lane-bg main-lane-bg' : 'lane-bg')
        .attr('x', x - (isMainLane ? 100 : 80))
        .attr('y', 0)
        .attr('width', isMainLane ? 200 : 160)
        .attr('height', totalHeight + 200)
        .attr('fill', isMainLane
          ? `rgba(125, 211, 252, 0.08)`
          : `${laneColor}10`)
        .attr('stroke', isMainLane
          ? 'rgba(125, 211, 252, 0.4)'
          : `${laneColor}50`)
        .attr('stroke-width', isMainLane ? 2 : 1.5)
        .attr('stroke-dasharray', isMainLane ? 'none' : '8,4')
        .attr('rx', 12)
    })

    // Label del nombre de cada rama arriba
    uniqueLanes.forEach(lane => {
      const x = width / 2 + (lane * 280)
      const isMainLane = lane === 0

      // Encuentra qué ramas están en este lane
      const branchesInLane = []
      laneMap.forEach((laneNum, branchName) => {
        if (laneNum === lane) branchesInLane.push(branchName)
      })

      if (branchesInLane.length > 0) {
        // Background del label
        const labelGroup = lanesGroup.append('g')
          .attr('transform', `translate(${x}, 30)`)

        const text = labelGroup.append('text')
          .attr('class', isMainLane ? 'lane-header main-lane-header' : 'lane-header')
          .attr('text-anchor', 'middle')
          .attr('dominant-baseline', 'middle')
          .text(`🌿 ${branchesInLane.join(' / ')}`)

        // Background pill
        const bbox = text.node().getBBox()
        labelGroup.insert('rect', 'text')
          .attr('x', bbox.x - 12)
          .attr('y', bbox.y - 6)
          .attr('width', bbox.width + 24)
          .attr('height', bbox.height + 12)
          .attr('rx', bbox.height / 2 + 6)
          .attr('fill', isMainLane ? 'rgba(125, 211, 252, 0.15)' : 'rgba(125, 211, 252, 0.08)')
          .attr('stroke', isMainLane ? '#7dd3fc' : 'rgba(125, 211, 252, 0.3)')
          .attr('stroke-width', isMainLane ? 2 : 1)
      }
    })

    // ============================================
    // PASO 4: Dibujar links (con curvas suaves)
    // ============================================

    const linkGroup = g.append('g').attr('class', 'links')

    const link = linkGroup.selectAll('path')
      .data(links)
      .join('path')
      .attr('class', d => `link ${d.isMainBranch ? 'main-link' : ''}`)
      .attr('stroke', d => d.color)
      .attr('stroke-width', d => d.isMainBranch ? 4 : 2.5)
      .attr('fill', 'none')
      .attr('opacity', d => d.isMainBranch ? 0.9 : 0.6)
      .attr('d', d => {
        // Si están en el mismo lane, línea recta
        if (d.source.x === d.target.x) {
          return `M ${d.source.x} ${d.source.y} L ${d.target.x} ${d.target.y}`
        }
        // Si están en lanes diferentes, curva Bezier
        const midY = (d.source.y + d.target.y) / 2
        return `M ${d.source.x} ${d.source.y}
                C ${d.source.x} ${midY}, ${d.target.x} ${midY}, ${d.target.x} ${d.target.y}`
      })

    // ============================================
    // PASO 5: Nodos
    // ============================================

    const nodeGroup = g.append('g').attr('class', 'nodes')
    const labelGroup = g.append('g').attr('class', 'labels')

    const NODE_RADIUS = 14
    const HEAD_RADIUS = 18
    const MAIN_NODE_RADIUS = 16

    const node = nodeGroup.selectAll('circle')
      .data(nodes)
      .join('circle')
      .attr('r', d => {
        if (d.isHead) return HEAD_RADIUS
        if (d.lane === 0) return MAIN_NODE_RADIUS // Más grande si es main
        return NODE_RADIUS
      })
      .attr('class', d => `node ${d.isHead ? 'head' : ''} ${d.lane === 0 ? 'main-node' : ''}`)
      .attr('fill', d => d.color)
      .attr('stroke', '#0a0e27')
      .attr('stroke-width', d => d.isHead ? 3 : (d.lane === 0 ? 3 : 2))
      .attr('cx', d => d.x)
      .attr('cy', d => d.y)
      .style('cursor', 'grab')
      .call(drag())

    // ============================================
    // PASO 6: Labels (hash, autor, mensaje)
    // ============================================

    const nodeIcons = labelGroup.selectAll('text.node-icon')
      .data(nodes)
      .join('text')
      .attr('class', 'node-icon')
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .attr('pointer-events', 'none')
      .attr('font-size', d => d.isHead ? '16px' : '12px')
      .attr('x', d => d.x)
      .attr('y', d => d.y)
      .text(d => d.isHead ? '⭐' : '●')
      .attr('fill', d => d.isHead ? '#fbbf24' : '#0a0e27')

    // Info del commit al lado del nodo (mensaje + autor)
    const commitInfo = labelGroup.selectAll('g.commit-info')
      .data(nodes)
      .join('g')
      .attr('class', 'commit-info')
      .attr('transform', d => {
        // Posicionar a la derecha del nodo si lane <= 0, a la izquierda si lane > 0
        const radius = d.isHead ? HEAD_RADIUS : (d.lane === 0 ? MAIN_NODE_RADIUS : NODE_RADIUS)
        const offsetX = d.lane > 0 ? -(radius + 12) : (radius + 12)
        return `translate(${d.x + offsetX}, ${d.y})`
      })
      .attr('pointer-events', 'none')

    commitInfo.each(function(d) {
      const group = d3.select(this)
      const isRight = d.lane <= 0
      const anchor = isRight ? 'start' : 'end'

      // Mensaje (línea principal)
      group.append('text')
        .attr('class', 'commit-message')
        .attr('text-anchor', anchor)
        .attr('dominant-baseline', 'baseline')
        .attr('y', -4)
        .text(d.message.slice(0, 45) + (d.message.length > 45 ? '...' : ''))

      // Autor + hash (línea secundaria)
      group.append('text')
        .attr('class', 'commit-meta')
        .attr('text-anchor', anchor)
        .attr('dominant-baseline', 'hanging')
        .attr('y', 6)
        .text(`👤 ${d.author} · 📦 ${d.hash}`)
    })

    // Branch label arriba del nodo si es head de una rama
    const branchTags = labelGroup.selectAll('g.branch-tag')
      .data(nodes.filter(n => n.branches.length > 0))
      .join('g')
      .attr('class', 'branch-tag')
      .attr('pointer-events', 'none')
      .attr('transform', d => {
        const radius = d.isHead ? HEAD_RADIUS : (d.lane === 0 ? MAIN_NODE_RADIUS : NODE_RADIUS)
        return `translate(${d.x}, ${d.y - radius - 22})`
      })

    branchTags.each(function(d) {
      const group = d3.select(this)
      const text = group.append('text')
        .attr('class', 'branch-label')
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'middle')
        .attr('fill', d.color)
        .text(`🌿 ${d.branches.join(', ')}`)

      const bbox = text.node().getBBox()
      group.insert('rect', 'text')
        .attr('x', bbox.x - 8)
        .attr('y', bbox.y - 4)
        .attr('width', bbox.width + 16)
        .attr('height', bbox.height + 8)
        .attr('rx', (bbox.height + 8) / 2)
        .attr('fill', 'rgba(15, 23, 42, 0.95)')
        .attr('stroke', d.color)
        .attr('stroke-width', 1.5)
    })

    // Tooltips
    node.append('title')
      .text(d => `📦 ${d.hash}\n💬 ${d.message}\n👤 ${d.author}\n🕐 ${new Date(d.timestamp * 1000).toLocaleString()}\n${d.branches.length > 0 ? '🌿 ' + d.branches.join(', ') : ''}`)

    // ============================================
    // PASO 7: Drag (mover nodos manualmente)
    // ============================================

    function drag() {
      function dragstarted(event, d) {
        d3.select(this).style('cursor', 'grabbing')
      }

      function dragged(event, d) {
        d.x = event.x
        d.y = event.y
        d.fx = event.x
        d.fy = event.y

        // Actualiza posición del nodo
        d3.select(this)
          .attr('cx', d.x)
          .attr('cy', d.y)

        // Actualiza todas las posiciones relacionadas
        updatePositions()
      }

      function dragended(event, d) {
        d3.select(this).style('cursor', 'grab')
        // Guarda la posición
        positionsRef.current.set(d.id, {
          x: d.x,
          y: d.y,
          fx: d.x,
          fy: d.y
        })
      }

      return d3.drag()
        .on('start', dragstarted)
        .on('drag', dragged)
        .on('end', dragended)
    }

    function updatePositions() {
      // Actualiza nodos
      node.attr('cx', d => d.x).attr('cy', d => d.y)

      // Actualiza iconos
      nodeIcons.attr('x', d => d.x).attr('y', d => d.y)

      // Actualiza info de commits
      commitInfo.attr('transform', d => {
        const radius = d.isHead ? HEAD_RADIUS : (d.lane === 0 ? MAIN_NODE_RADIUS : NODE_RADIUS)
        const offsetX = d.lane > 0 ? -(radius + 12) : (radius + 12)
        return `translate(${d.x + offsetX}, ${d.y})`
      })

      // Actualiza branch tags
      branchTags.attr('transform', d => {
        const radius = d.isHead ? HEAD_RADIUS : (d.lane === 0 ? MAIN_NODE_RADIUS : NODE_RADIUS)
        return `translate(${d.x}, ${d.y - radius - 22})`
      })

      // Actualiza links
      link.attr('d', d => {
        if (d.source.x === d.target.x) {
          return `M ${d.source.x} ${d.source.y} L ${d.target.x} ${d.target.y}`
        }
        const midY = (d.source.y + d.target.y) / 2
        return `M ${d.source.x} ${d.source.y}
                C ${d.source.x} ${midY}, ${d.target.x} ${midY}, ${d.target.x} ${d.target.y}`
      })
    }

    return () => {
      // Guarda posiciones al desmontar
      nodes.forEach(n => {
        if (n.fx !== undefined && n.fy !== undefined) {
          positionsRef.current.set(n.id, {
            x: n.x,
            y: n.y,
            fx: n.fx,
            fy: n.fy
          })
        }
      })
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

      <Glossary branches={branches} />

      <button className="reset-button" onClick={handleReset} title="Reorganizar layout automáticamente">
        🔄 Reset Layout
      </button>

      <div className="graph-legend">
        <div className="legend-item">
          <div className="legend-circle head">⭐</div>
          <span>HEAD (commit actual)</span>
        </div>
        <div className="legend-item">
          <div className="legend-circle main"></div>
          <span>📦 Commits en main</span>
        </div>
        <div className="legend-item">
          <div className="legend-circle"></div>
          <span>📦 Commits en otras ramas</span>
        </div>
        <div className="legend-item">
          <div className="legend-line main-line"></div>
          <span>🌿 Rama principal</span>
        </div>
        <div className="legend-item">
          <div className="legend-line"></div>
          <span>↔️ Otras conexiones</span>
        </div>
      </div>

      <div className="graph-controls">
        <div className="control-item">
          <kbd>🖱️ Rueda</kbd> Zoom
        </div>
        <div className="control-item">
          <kbd>✋ Drag</kbd> Desplazar
        </div>
        <div className="control-item">
          <kbd>👆 Nodo</kbd> Mover commit
        </div>
      </div>
    </div>
  )
}

export default GitGraph
