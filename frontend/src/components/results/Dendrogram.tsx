import { useRef, useEffect, useState, useCallback } from 'react'
import * as d3 from 'd3'
import { cn } from '@/lib/utils'
import { ZoomIn, ZoomOut, RotateCcw, Search, GitBranch, Circle } from 'lucide-react'

// Layout da arvore: retangular (cluster horizontal) ou radial (circular)
type TreeLayout = 'rectangular' | 'radial'

interface DendrogramProps {
  newick: string
  treeModel?: string
  isPreview?: boolean
  onReady?: (fns: { exportSvg: () => string }) => void
}

/* --- Newick Parser --- */

interface NewickNode {
  name: string
  length: number
  children?: NewickNode[]
}

function parseNewick(nwk: string): NewickNode {
  let i = 0
  const s = nwk.trim().replace(/;\s*$/, '')

  function readNode(): NewickNode {
    const node: NewickNode = { name: '', length: 0 }

    if (s[i] === '(') {
      i++
      const children: NewickNode[] = []
      children.push(readNode())
      while (s[i] === ',') {
        i++
        children.push(readNode())
      }
      if (s[i] === ')') i++
      node.children = children
    }

    let label = ''
    while (i < s.length && s[i] !== ':' && s[i] !== ',' && s[i] !== ')' && s[i] !== ';') {
      label += s[i]
      i++
    }
    node.name = label.trim()

    if (s[i] === ':') {
      i++
      let numStr = ''
      while (i < s.length && /[\d.eE\-+]/.test(s[i])) {
        numStr += s[i]
        i++
      }
      node.length = parseFloat(numStr) || 0
    }

    return node
  }

  return readNode()
}

// Conta folhas da arvore
function countLeaves(node: NewickNode): number {
  if (!node.children || node.children.length === 0) return 1
  return node.children.reduce((sum, child) => sum + countLeaves(child), 0)
}

// Verifica se um label de no interno eh um valor de bootstrap
function parseBootstrapValue(name: string): { ufboot: number; shAlrt?: number } | null {
  if (!name) return null
  // Formato IQ-TREE com -bb e -alrt: "95/87"
  // Formato so -bb: "95"
  const parts = name.split('/')
  const first = parseFloat(parts[0])
  if (isNaN(first) || first < 0 || first > 100) return null
  const result: { ufboot: number; shAlrt?: number } = { ufboot: first }
  if (parts.length > 1) {
    const second = parseFloat(parts[1])
    if (!isNaN(second)) result.shAlrt = second
  }
  return result
}

// Cor do bootstrap por nivel de suporte
function bootstrapColor(value: number): string {
  if (value >= 95) return '#10B981' // verde — forte
  if (value >= 70) return '#F59E0B' // amarelo — moderado
  return '#EF4444' // vermelho — fraco
}

/* --- Component --- */

const MARGIN = { top: 20, right: 160, bottom: 20, left: 20 }

export function Dendrogram({ newick, treeModel, isPreview, onReady }: DendrogramProps) {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null)
  const [layout, setLayout] = useState<TreeLayout>('rectangular')
  const [searchTerm, setSearchTerm] = useState('')
  const [showBootstrap, setShowBootstrap] = useState(true)

  // Exporta SVG como string
  const exportSvg = useCallback(() => {
    if (!svgRef.current) return ''
    const serializer = new XMLSerializer()
    return serializer.serializeToString(svgRef.current)
  }, [])

  // Notifica o pai que ta pronto
  useEffect(() => {
    onReady?.({ exportSvg })
  }, [onReady, exportSvg])

  // Controles de zoom
  const handleZoomIn = useCallback(() => {
    if (!svgRef.current || !zoomRef.current) return
    d3.select(svgRef.current).transition().duration(300).call(zoomRef.current.scaleBy, 1.5)
  }, [])

  const handleZoomOut = useCallback(() => {
    if (!svgRef.current || !zoomRef.current) return
    d3.select(svgRef.current).transition().duration(300).call(zoomRef.current.scaleBy, 0.67)
  }, [])

  const handleZoomReset = useCallback(() => {
    if (!svgRef.current || !zoomRef.current) return
    d3.select(svgRef.current)
      .transition()
      .duration(300)
      .call(zoomRef.current.transform, d3.zoomIdentity.translate(MARGIN.left, MARGIN.top))
  }, [])

  useEffect(() => {
    if (!svgRef.current || !containerRef.current) return

    const rootData = parseNewick(newick)
    const numLeaves = countLeaves(rootData)
    const containerWidth = containerRef.current.clientWidth || 700

    // Altura dinamica: 22px por folha, minimo 400
    const dynamicHeight = Math.max(400, numLeaves * 22)
    const width = containerWidth
    const height = layout === 'radial' ? Math.max(600, width) : dynamicHeight

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()
    svg.attr('width', width).attr('height', height).attr('viewBox', `0 0 ${width} ${height}`)

    const hierarchy = d3.hierarchy<NewickNode>(rootData, (d) => d.children)

    if (layout === 'rectangular') {
      renderRectangular(svg, hierarchy, width, height, numLeaves)
    } else {
      renderRadial(svg, hierarchy, width, height)
    }

    // Highlight de busca
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase()
      svg.selectAll<SVGTextElement, d3.HierarchyPointNode<NewickNode>>('.label')
        .attr('fill', (d) => {
          return d.data.name.toLowerCase().includes(term) ? '#FBBF24' : '#64748B'
        })
        .attr('font-weight', (d) => {
          return d.data.name.toLowerCase().includes(term) ? '700' : '400'
        })

      // Auto-scroll pro primeiro match
      const firstMatch = svg.selectAll<SVGTextElement, d3.HierarchyPointNode<NewickNode>>('.label')
        .filter((d) => d.data.name.toLowerCase().includes(term))

      if (!firstMatch.empty() && zoomRef.current) {
        const matchData = firstMatch.datum()
        if (matchData) {
          const targetX = matchData.y ?? 0
          const targetY = matchData.x ?? 0
          d3.select(svgRef.current!)
            .transition()
            .duration(500)
            .call(
              zoomRef.current.transform,
              d3.zoomIdentity.translate(width / 2 - targetX, height / 2 - targetY).scale(1.2),
            )
        }
      }
    }
  }, [newick, layout, searchTerm, showBootstrap])

  function renderRectangular(
    svg: d3.Selection<SVGSVGElement, unknown, null, undefined>,
    hierarchy: d3.HierarchyNode<NewickNode>,
    width: number,
    height: number,
    numLeaves: number,
  ) {
    const innerWidth = width - MARGIN.left - MARGIN.right
    const innerHeight = height - MARGIN.top - MARGIN.bottom

    const cluster = d3.cluster<NewickNode>().size([innerHeight, innerWidth])
    const root = cluster(hierarchy)

    // Branch lengths
    let maxDepth = 0
    root.each((node) => {
      let depth = 0
      let cur: d3.HierarchyPointNode<NewickNode> | null = node
      while (cur) {
        depth += cur.data.length || 0
        cur = cur.parent
      }
      ;(node as d3.HierarchyPointNode<NewickNode> & { cumulativeLength: number }).cumulativeLength = depth
      if (depth > maxDepth) maxDepth = depth
    })

    const xScale = d3.scaleLinear().domain([0, maxDepth || 1]).range([0, innerWidth])

    root.each((node) => {
      const n = node as d3.HierarchyPointNode<NewickNode> & { cumulativeLength: number }
      n.y = xScale(n.cumulativeLength)
    })

    const g = svg.append('g').attr('transform', `translate(${MARGIN.left},${MARGIN.top})`)

    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 8])
      .on('zoom', (event: d3.D3ZoomEvent<SVGSVGElement, unknown>) => {
        g.attr('transform', event.transform.toString())
      })

    zoomRef.current = zoom
    svg.call(zoom)
    svg.call(zoom.transform, d3.zoomIdentity.translate(MARGIN.left, MARGIN.top))

    // Links (elbow)
    const links = g
      .selectAll<SVGPathElement, d3.HierarchyPointLink<NewickNode>>('.link')
      .data(root.links())
      .enter()
      .append('path')
      .attr('class', 'link')
      .attr('d', (d) => `M${d.source.y},${d.source.x}H${d.target.y}V${d.target.x}`)
      .attr('fill', 'none')
      .attr('stroke', '#06B6D4')
      .attr('stroke-width', 1.5)
      .attr('stroke-opacity', 0.8)

    links.each(function () {
      const path = this as SVGPathElement
      const totalLength = path.getTotalLength()
      d3.select(path)
        .attr('stroke-dasharray', totalLength)
        .attr('stroke-dashoffset', totalLength)
        .transition()
        .duration(1200)
        .ease(d3.easeCubicInOut)
        .attr('stroke-dashoffset', 0)
    })

    // Nodes
    g.selectAll<SVGCircleElement, d3.HierarchyPointNode<NewickNode>>('.node')
      .data(root.descendants())
      .enter()
      .append('circle')
      .attr('class', 'node')
      .attr('cx', (d) => d.y)
      .attr('cy', (d) => d.x)
      .attr('r', 3)
      .attr('fill', '#06B6D4')
      .attr('opacity', 0)
      .transition()
      .delay(1000)
      .duration(400)
      .attr('opacity', 1)

    // Labels das folhas
    g.selectAll<SVGTextElement, d3.HierarchyPointNode<NewickNode>>('.label')
      .data(root.leaves())
      .enter()
      .append('text')
      .attr('class', 'label')
      .attr('x', (d) => d.y + 8)
      .attr('y', (d) => d.x)
      .attr('dy', '0.35em')
      .attr('font-family', "'IBM Plex Mono', monospace")
      .attr('font-size', '11px')
      .attr('fill', '#E2E8F0')
      .attr('font-weight', '400')
      .text((d) => d.data.name)
      .attr('opacity', 0)
      .transition()
      .delay(1200)
      .duration(400)
      .attr('opacity', 1)

    // Labels de bootstrap nos nos internos
    if (showBootstrap) {
      const internalNodes = root.descendants().filter(
        (d) => d.children && d.children.length > 0 && parseBootstrapValue(d.data.name)
      )

      g.selectAll<SVGTextElement, d3.HierarchyPointNode<NewickNode>>('.bootstrap-label')
        .data(internalNodes)
        .enter()
        .append('text')
        .attr('class', 'bootstrap-label')
        .attr('x', (d) => d.y)
        .attr('y', (d) => d.x - 8)
        .attr('text-anchor', 'middle')
        .attr('font-family', "'IBM Plex Mono', monospace")
        .attr('font-size', '9px')
        .attr('fill', (d) => {
          const bs = parseBootstrapValue(d.data.name)
          return bs ? bootstrapColor(bs.ufboot) : 'transparent'
        })
        .attr('font-weight', '600')
        .text((d) => {
          const bs = parseBootstrapValue(d.data.name)
          if (!bs) return ''
          // Mostrar UFBoot/SH-aLRT se ambos disponiveis
          if (bs.shAlrt !== undefined) return `${bs.ufboot.toFixed(0)}/${bs.shAlrt.toFixed(0)}`
          return bs.ufboot.toFixed(0)
        })
        .attr('opacity', 0)
        .transition()
        .delay(1400)
        .duration(400)
        .attr('opacity', 1)
    }
  }

  function renderRadial(
    svg: d3.Selection<SVGSVGElement, unknown, null, undefined>,
    hierarchy: d3.HierarchyNode<NewickNode>,
    width: number,
    height: number,
  ) {
    const radius = Math.min(width, height) / 2 - 120

    const cluster = d3.cluster<NewickNode>().size([2 * Math.PI, radius])
    const root = cluster(hierarchy)

    // Branch lengths radiais
    let maxDepth = 0
    root.each((node) => {
      let depth = 0
      let cur: d3.HierarchyPointNode<NewickNode> | null = node
      while (cur) {
        depth += cur.data.length || 0
        cur = cur.parent
      }
      ;(node as d3.HierarchyPointNode<NewickNode> & { cumulativeLength: number }).cumulativeLength = depth
      if (depth > maxDepth) maxDepth = depth
    })

    const rScale = d3.scaleLinear().domain([0, maxDepth || 1]).range([0, radius])

    root.each((node) => {
      const n = node as d3.HierarchyPointNode<NewickNode> & { cumulativeLength: number }
      n.y = rScale(n.cumulativeLength)
    })

    // Conversao polar -> cartesiano
    function project(x: number, y: number): [number, number] {
      const angle = x - Math.PI / 2
      return [y * Math.cos(angle), y * Math.sin(angle)]
    }

    const g = svg.append('g').attr('transform', `translate(${width / 2},${height / 2})`)

    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 8])
      .on('zoom', (event: d3.D3ZoomEvent<SVGSVGElement, unknown>) => {
        g.attr('transform', event.transform.toString())
      })

    zoomRef.current = zoom
    svg.call(zoom)
    svg.call(zoom.transform, d3.zoomIdentity.translate(width / 2, height / 2))

    // Links radiais
    const links = g
      .selectAll<SVGPathElement, d3.HierarchyPointLink<NewickNode>>('.link')
      .data(root.links())
      .enter()
      .append('path')
      .attr('class', 'link')
      .attr('d', (d) => {
        const [sx, sy] = project(d.source.x, d.source.y)
        const [tx, ty] = project(d.target.x, d.target.y)
        // Arco entre source e target no mesmo raio, depois linha reta
        const [mx, my] = project(d.target.x, d.source.y)
        return `M${sx},${sy}L${mx},${my}L${tx},${ty}`
      })
      .attr('fill', 'none')
      .attr('stroke', '#06B6D4')
      .attr('stroke-width', 1.5)
      .attr('stroke-opacity', 0.8)

    links.each(function () {
      const path = this as SVGPathElement
      const totalLength = path.getTotalLength()
      d3.select(path)
        .attr('stroke-dasharray', totalLength)
        .attr('stroke-dashoffset', totalLength)
        .transition()
        .duration(1200)
        .ease(d3.easeCubicInOut)
        .attr('stroke-dashoffset', 0)
    })

    // Nodes
    g.selectAll<SVGCircleElement, d3.HierarchyPointNode<NewickNode>>('.node')
      .data(root.descendants())
      .enter()
      .append('circle')
      .attr('class', 'node')
      .attr('cx', (d) => project(d.x, d.y)[0])
      .attr('cy', (d) => project(d.x, d.y)[1])
      .attr('r', 3)
      .attr('fill', '#06B6D4')
      .attr('opacity', 0)
      .transition()
      .delay(1000)
      .duration(400)
      .attr('opacity', 1)

    // Labels radiais (rotacionados)
    g.selectAll<SVGTextElement, d3.HierarchyPointNode<NewickNode>>('.label')
      .data(root.leaves())
      .enter()
      .append('text')
      .attr('class', 'label')
      .attr('transform', (d) => {
        const [x, y] = project(d.x, d.y)
        const angle = ((d.x * 180) / Math.PI - 90)
        const flip = d.x > Math.PI
        return `translate(${x},${y}) rotate(${flip ? angle + 180 : angle})`
      })
      .attr('dx', (d) => (d.x > Math.PI ? -8 : 8))
      .attr('dy', '0.35em')
      .attr('text-anchor', (d) => (d.x > Math.PI ? 'end' : 'start'))
      .attr('font-family', "'IBM Plex Mono', monospace")
      .attr('font-size', '10px')
      .attr('fill', '#E2E8F0')
      .attr('font-weight', '400')
      .text((d) => d.data.name)
      .attr('opacity', 0)
      .transition()
      .delay(1200)
      .duration(400)
      .attr('opacity', 1)

    // Bootstrap labels radiais
    if (showBootstrap) {
      const internalNodes = root.descendants().filter(
        (d) => d.children && d.children.length > 0 && parseBootstrapValue(d.data.name)
      )

      g.selectAll<SVGTextElement, d3.HierarchyPointNode<NewickNode>>('.bootstrap-label')
        .data(internalNodes)
        .enter()
        .append('text')
        .attr('class', 'bootstrap-label')
        .attr('transform', (d) => {
          const [x, y] = project(d.x, d.y)
          return `translate(${x},${y - 6})`
        })
        .attr('text-anchor', 'middle')
        .attr('font-family', "'IBM Plex Mono', monospace")
        .attr('font-size', '8px')
        .attr('fill', (d) => {
          const bs = parseBootstrapValue(d.data.name)
          return bs ? bootstrapColor(bs.ufboot) : 'transparent'
        })
        .attr('font-weight', '600')
        .text((d) => {
          const bs = parseBootstrapValue(d.data.name)
          if (!bs) return ''
          if (bs.shAlrt !== undefined) return `${bs.ufboot.toFixed(0)}/${bs.shAlrt.toFixed(0)}`
          return bs.ufboot.toFixed(0)
        })
        .attr('opacity', 0)
        .transition()
        .delay(1400)
        .duration(400)
        .attr('opacity', 1)
    }
  }

  // Calcula altura do container
  const rootData = parseNewick(newick)
  const numLeaves = countLeaves(rootData)
  const containerHeight = layout === 'radial'
    ? Math.max(600, (containerRef.current?.clientWidth || 700))
    : Math.max(400, numLeaves * 22)

  return (
    <div className="flex flex-col gap-3">
      {/* Badges */}
      <div className="flex items-center gap-2">
        {isPreview !== undefined && (
          <span
            className={cn(
              'px-2 py-0.5 rounded font-mono text-[10px] font-bold uppercase tracking-wider border',
              isPreview
                ? 'text-amber border-amber/30 bg-amber/10'
                : 'text-green border-green/30 bg-green/10',
            )}
          >
            {isPreview ? 'PREVIEW' : 'FINAL'}
          </span>
        )}
        {treeModel && (
          <span className="px-2 py-0.5 rounded font-mono text-[10px] text-text-muted border border-border bg-panel">
            Modelo: {treeModel}
          </span>
        )}
      </div>

      {/* Controles: zoom, busca, layout, bootstrap */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Zoom */}
        <div className="flex items-center gap-1">
          <button
            onClick={handleZoomIn}
            className="p-1.5 rounded border border-border bg-panel hover:bg-panel/80 text-text-muted hover:text-text transition-colors cursor-pointer"
            title="Zoom in"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleZoomOut}
            className="p-1.5 rounded border border-border bg-panel hover:bg-panel/80 text-text-muted hover:text-text transition-colors cursor-pointer"
            title="Zoom out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleZoomReset}
            className="p-1.5 rounded border border-border bg-panel hover:bg-panel/80 text-text-muted hover:text-text transition-colors cursor-pointer"
            title="Reset zoom"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Separador */}
        <div className="w-px h-5 bg-border" />

        {/* Layout toggle */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setLayout('rectangular')}
            className={cn(
              'p-1.5 rounded border transition-colors cursor-pointer',
              layout === 'rectangular'
                ? 'border-cyan bg-cyan/10 text-cyan'
                : 'border-border bg-panel text-text-muted hover:text-text',
            )}
            title="Layout retangular"
          >
            <GitBranch className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setLayout('radial')}
            className={cn(
              'p-1.5 rounded border transition-colors cursor-pointer',
              layout === 'radial'
                ? 'border-cyan bg-cyan/10 text-cyan'
                : 'border-border bg-panel text-text-muted hover:text-text',
            )}
            title="Layout radial"
          >
            <Circle className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Separador */}
        <div className="w-px h-5 bg-border" />

        {/* Toggle bootstrap */}
        <button
          onClick={() => setShowBootstrap(!showBootstrap)}
          className={cn(
            'px-2.5 py-1 rounded border font-mono text-[10px] font-semibold transition-colors cursor-pointer',
            showBootstrap
              ? 'border-green/30 bg-green/10 text-green'
              : 'border-border bg-panel text-text-dim hover:text-text-muted',
          )}
          title="Mostrar/ocultar valores de bootstrap"
        >
          Bootstrap
        </button>

        {/* Separador */}
        <div className="w-px h-5 bg-border" />

        {/* Busca */}
        <div className="relative flex items-center">
          <Search className="absolute left-2 w-3 h-3 text-text-dim pointer-events-none" />
          <input
            type="text"
            placeholder="Buscar especie..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-7 pr-3 py-1 w-48 rounded border border-border bg-panel font-mono text-xs text-text placeholder:text-text-dim focus:outline-none focus:border-cyan"
          />
        </div>
      </div>

      {/* Legenda de bootstrap */}
      {showBootstrap && (
        <div className="flex items-center gap-3 font-mono text-[10px] text-text-dim">
          <span>Bootstrap:</span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full" style={{ background: '#10B981' }} />
            {'>='}95 (forte)
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full" style={{ background: '#F59E0B' }} />
            70-94 (moderado)
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full" style={{ background: '#EF4444' }} />
            {'<'}70 (fraco)
          </span>
        </div>
      )}

      {/* SVG container com scroll */}
      <div
        ref={containerRef}
        className="w-full rounded border border-border bg-panel overflow-auto"
        style={{ maxHeight: 600 }}
      >
        <svg ref={svgRef} className="w-full" style={{ minHeight: containerHeight }} />
      </div>
    </div>
  )
}
