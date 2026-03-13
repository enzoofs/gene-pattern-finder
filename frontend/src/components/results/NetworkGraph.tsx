import { useRef, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import * as d3 from 'd3'
import type { NetworkData, NetworkNode, NetworkEdge } from '@/lib/types'

interface NetworkGraphProps {
  data: NetworkData
}

const CLUSTER_COLORS = [
  '#06b6d4', // cyan
  '#10b981', // green
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#14b8a6', // teal
  '#f97316', // orange
]

function getNodeColor(node: NetworkNode): string {
  if (node.cluster != null) {
    return CLUSTER_COLORS[(node.cluster - 1) % CLUSTER_COLORS.length]
  }
  return '#06b6d4'
}

interface SimNode extends d3.SimulationNodeDatum {
  id: string
  label: string
  cluster: number | null
  degree_centrality?: number
  is_hub?: boolean
}

interface SimLink extends d3.SimulationLinkDatum<SimNode> {
  weight: number
  is_mst: boolean
}

export function NetworkGraph({ data }: NetworkGraphProps) {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [showMstOnly, setShowMstOnly] = useState(false)

  useEffect(() => {
    const svg = d3.select(svgRef.current)
    const container = containerRef.current
    if (!container) return

    const width = container.clientWidth
    const height = Math.max(400, Math.min(600, width * 0.6))

    svg.attr('width', width).attr('height', height)
    svg.selectAll('*').remove()

    const g = svg.append('g')

    // Zoom
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 5])
      .on('zoom', (event) => {
        g.attr('transform', event.transform)
      })
    svg.call(zoom)

    // Build simulation data
    const nodes: SimNode[] = data.nodes.map((n) => ({ ...n }))
    const nodeMap = new Map(nodes.map((n) => [n.id, n]))

    const links: SimLink[] = data.edges
      .filter((e) => !showMstOnly || e.is_mst)
      .map((e) => ({
        source: nodeMap.get(e.source)!,
        target: nodeMap.get(e.target)!,
        weight: e.weight,
        is_mst: e.is_mst,
      }))
      .filter((l) => l.source && l.target)

    // Force simulation
    const simulation = d3.forceSimulation(nodes)
      .force('link', d3.forceLink<SimNode, SimLink>(links)
        .id((d) => d.id)
        .distance((d) => 50 + d.weight * 200)
      )
      .force('charge', d3.forceManyBody().strength(-120))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(20))

    // Draw edges
    const link = g.append('g')
      .selectAll('line')
      .data(links)
      .enter()
      .append('line')
      .attr('stroke', (d) => d.is_mst ? '#4b5563' : '#374151')
      .attr('stroke-width', (d) => d.is_mst ? 2 : 1)
      .attr('stroke-dasharray', (d) => d.is_mst ? 'none' : '4,4')
      .attr('stroke-opacity', (d) => d.is_mst ? 0.8 : 0.4)

    // Draw edge weight labels
    const edgeLabel = g.append('g')
      .selectAll('text')
      .data(links)
      .enter()
      .append('text')
      .text((d) => d.weight.toFixed(3))
      .attr('font-family', 'monospace')
      .attr('font-size', '8px')
      .attr('fill', '#6b7280')
      .attr('text-anchor', 'middle')

    // Draw nodes
    const node = g.append('g')
      .selectAll('circle')
      .data(nodes)
      .enter()
      .append('circle')
      .attr('r', (d) => 6 + (d.degree_centrality ?? 0) * 16)
      .attr('fill', (d) => getNodeColor(d))
      .attr('stroke', (d) => d.is_hub ? '#f59e0b' : '#1a1a2e')
      .attr('stroke-width', (d) => d.is_hub ? 3 : 2)
      .attr('cursor', 'grab')
      .call(
        d3.drag<SVGCircleElement, SimNode>()
          .on('start', (event, d) => {
            if (!event.active) simulation.alphaTarget(0.3).restart()
            d.fx = d.x
            d.fy = d.y
          })
          .on('drag', (event, d) => {
            d.fx = event.x
            d.fy = event.y
          })
          .on('end', (event, d) => {
            if (!event.active) simulation.alphaTarget(0)
            d.fx = null
            d.fy = null
          })
      )

    // Draw labels
    const label = g.append('g')
      .selectAll('text')
      .data(nodes)
      .enter()
      .append('text')
      .text((d) => {
        const parts = d.label.split('|')
        return parts.length > 1 ? parts[1].replace(/_/g, ' ') : d.label
      })
      .attr('font-family', 'monospace')
      .attr('font-size', '10px')
      .attr('fill', '#9ca3af')
      .attr('dx', 12)
      .attr('dy', 4)

    // Tick
    simulation.on('tick', () => {
      link
        .attr('x1', (d: any) => d.source.x)
        .attr('y1', (d: any) => d.source.y)
        .attr('x2', (d: any) => d.target.x)
        .attr('y2', (d: any) => d.target.y)

      edgeLabel
        .attr('x', (d: any) => (d.source.x + d.target.x) / 2)
        .attr('y', (d: any) => (d.source.y + d.target.y) / 2 - 4)

      node
        .attr('cx', (d: any) => d.x)
        .attr('cy', (d: any) => d.y)

      label
        .attr('x', (d: any) => d.x)
        .attr('y', (d: any) => d.y)
    })

    return () => {
      simulation.stop()
    }
  }, [data, showMstOnly])

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-4">
        {[
          { label: 'Nos', value: data.stats.n_nodes },
          { label: 'Arestas', value: data.stats.n_edges },
          { label: 'MST Arestas', value: data.stats.n_mst_edges },
          { label: 'Componentes', value: data.stats.n_components ?? 1 },
          { label: 'Hubs', value: data.stats.hub_nodes?.length ?? 0 },
          { label: 'Distancia Media', value: data.stats.avg_distance.toFixed(3) },
        ].map((stat) => (
          <div key={stat.label} className="px-4 py-3 rounded border border-border bg-panel/50">
            <p className="font-mono text-[10px] text-text-dim uppercase tracking-wider">{stat.label}</p>
            <p className="font-mono text-lg text-cyan font-bold mt-1">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={showMstOnly}
            onChange={(e) => setShowMstOnly(e.target.checked)}
            className="accent-cyan"
          />
          <span className="font-mono text-xs text-text-muted">
            Mostrar apenas MST
          </span>
        </label>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] text-text-dim">
            Linhas solidas = MST
          </span>
          <span className="font-mono text-[10px] text-text-dim">|</span>
          <span className="font-mono text-[10px] text-text-dim">
            Tracejadas = arestas extras (dist &le; {data.stats.threshold})
          </span>
        </div>
      </div>

      {/* Graph */}
      <div
        ref={containerRef}
        className="border border-border rounded bg-panel/30 overflow-hidden"
      >
        <svg ref={svgRef} className="w-full" />
      </div>
    </div>
  )
}
