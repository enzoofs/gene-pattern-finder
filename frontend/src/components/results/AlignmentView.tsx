import type { BlastHit } from '@/lib/types'

interface AlignmentViewProps {
  hit: BlastHit
}

const CHUNK_SIZE = 60

function chunkAlignment(hit: BlastHit) {
  const chunks: {
    queryLine: string
    matchLine: string
    hitLine: string
    queryPos: number
    hitPos: number
  }[] = []

  const { query_aligned, match_line, hit_aligned, query_start, hit_start } = hit

  let qPos = query_start
  let hPos = hit_start

  for (let i = 0; i < query_aligned.length; i += CHUNK_SIZE) {
    const qChunk = query_aligned.slice(i, i + CHUNK_SIZE)
    const mChunk = match_line.slice(i, i + CHUNK_SIZE)
    const hChunk = hit_aligned.slice(i, i + CHUNK_SIZE)

    chunks.push({
      queryLine: qChunk,
      matchLine: mChunk,
      hitLine: hChunk,
      queryPos: qPos,
      hitPos: hPos,
    })

    // Advance positions, skipping gaps
    for (const ch of qChunk) {
      if (ch !== '-') qPos++
    }
    for (const ch of hChunk) {
      if (ch !== '-') hPos++
    }
  }

  return chunks
}

function colorChar(char: string, matchChar: string) {
  if (char === '-') return 'text-text-dim'
  if (matchChar === '|') return 'text-cyan'
  return 'text-red'
}

function AlignmentLine({
  label,
  seq,
  matchLine,
  pos,
}: {
  label: string
  seq: string
  matchLine: string
  pos: number
}) {
  return (
    <div className="flex gap-0 whitespace-pre leading-tight">
      <span className="text-text-dim w-[60px] shrink-0 text-right pr-2">
        {label} {pos}
      </span>
      <span>
        {seq.split('').map((ch, i) => (
          <span key={i} className={colorChar(ch, matchLine[i] ?? ' ')}>
            {ch}
          </span>
        ))}
      </span>
    </div>
  )
}

function MatchLineRow({ matchLine }: { matchLine: string }) {
  return (
    <div className="flex gap-0 whitespace-pre leading-tight">
      <span className="w-[60px] shrink-0" />
      <span className="text-text-dim">
        {matchLine.split('').map((ch, i) => (
          <span
            key={i}
            className={ch === '|' ? 'text-cyan' : 'text-text-dim'}
          >
            {ch}
          </span>
        ))}
      </span>
    </div>
  )
}

export function AlignmentView({ hit }: AlignmentViewProps) {
  const chunks = chunkAlignment(hit)

  return (
    <div className="rounded border border-border bg-deep-bg/60 p-4 overflow-x-auto">
      <div className="flex flex-col gap-3">
        {chunks.map((chunk, idx) => (
          <div key={idx} className="font-mono text-[11px]">
            <AlignmentLine
              label="Query"
              seq={chunk.queryLine}
              matchLine={chunk.matchLine}
              pos={chunk.queryPos}
            />
            <MatchLineRow matchLine={chunk.matchLine} />
            <AlignmentLine
              label="Sbjct"
              seq={chunk.hitLine}
              matchLine={chunk.matchLine}
              pos={chunk.hitPos}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
