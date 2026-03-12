import { useRef, useEffect } from 'react'
import * as d3 from 'd3'
import { cn } from '@/lib/utils'

interface DendrogramProps {
  newick: string
  treeModel?: string
  isPreview?: boolean
}

/* ─── Newick Parser ─── */

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
      // internal node
      i++ // skip '('
      const children: NewickNode[] = []
      children.push(readNode())
      while (s[i] === ',') {
        i++ // skip ','
        children.push(readNode())
      }
      if (s[i] === ')') i++ // skip ')'
      node.children = children
    }

    // read label
    let label = ''
    while (i < s.length && s[i] !== ':' && s[i] !== ',' && s[i] !== ')' && s[i] !== ';') {
      label += s[i]
      i++
    }
    node.name = label.trim()

    // read branch length
    if (s[i] === ':') {
      i++ // skip ':'
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

/* ─── Component ─── */

const MARGIN = { top: 20, right: 160, bottom: 20, left: 20 }

export function Dendrogram({ newick, treeModel, isPreview }: DendrogramProps) {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!svgRef.current || !containerRef.current) return

    const containerWidth = containerRef.current.clientWidth || 700
    const width = containerWidth
    const height = 400

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()
    svg.attr('width', width).attr('height', height).attr('viewBox', `0 0 ${width} ${height}`)

    // Parse Newick
    const rootData = parseNewick(newick)
    const hierarchy = d3.hierarchy<NewickNode>(rootData, (d) => d.children)

    // Cluster layout — horizontal
    const innerWidth = width - MARGIN.left - MARGIN.right
    const innerHeight = height - MARGIN.top - MARGIN.bottom

    const cluster = d3.cluster<NewickNode>().size([innerHeight, innerWidth])
    const root = cluster(hierarchy)

    // Scale branch lengths
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

    // Set x positions based on cumulative branch lengths
    root.each((node) => {
      const n = node as d3.HierarchyPointNode<NewickNode> & { cumulativeLength: number }
      n.y = xScale(n.cumulativeLength)
    })

    // Container group with zoom
    const g = svg.append('g').attr('transform', `translate(${MARGIN.left},${MARGIN.top})`)

    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.5, 5])
      .on('zoom', (event: d3.D3ZoomEvent<SVGSVGElement, unknown>) => {
        g.attr('transform', event.transform.toString())
      })

    svg.call(zoom)
    svg.call(zoom.transform, d3.zoomIdentity.translate(MARGIN.left, MARGIN.top))

    // Draw elbow links
    const links = g
      .selectAll<SVGPathElement, d3.HierarchyPointLink<NewickNode>>('.link')
      .data(root.links())
      .enter()
      .append('path')
      .attr('class', 'link')
      .attr('d', (d) => {
        return `M${d.source.y},${d.source.x}H${d.target.y}V${d.target.x}`
      })
      .attr('fill', 'none')
      .attr('stroke', '#06B6D4')
      .attr('stroke-width', 1.5)
      .attr('stroke-opacity', 0.8)

    // Animate branches using stroke-dashoffset
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

    // Node dots
    const nodes = g
      .selectAll<SVGCircleElement, d3.HierarchyPointNode<NewickNode>>('.node')
      .data(root.descendants())
      .enter()
      .append('circle')
      .attr('class', 'node')
      .attr('cx', (d) => d.y)
      .attr('cy', (d) => d.x)
      .attr('r', 3)
      .attr('fill', '#06B6D4')
      .attr('stroke', 'none')
      .attr('stroke-width', 0)
      .attr('opacity', 0)

    nodes
      .transition()
      .delay(1000)
      .duration(400)
      .attr('opacity', 1)

    // Leaf labels
    const labels = g
      .selectAll<SVGTextElement, d3.HierarchyPointNode<NewickNode>>('.label')
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

    labels
      .transition()
      .delay(1200)
      .duration(400)
      .attr('opacity', 1)
  }, [newick])

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

      {/* SVG container */}
      <div
        ref={containerRef}
        className="w-full rounded border border-border bg-panel overflow-hidden"
        style={{ height: 400 }}
      >
        <svg ref={svgRef} className="w-full h-full" />
      </div>
    </div>
  )
}
