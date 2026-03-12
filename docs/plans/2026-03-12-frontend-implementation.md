# Gene Pattern Finder — Frontend Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a futuristic bioinformatics-themed frontend ("Deep Scan" aesthetic) for the Gene Pattern Finder platform.

**Architecture:** Single-page React app with 3 main views — Species Search, Sequence Input + BLAST, Results (scores, alignment, dendrograma). State managed with React hooks/context. API calls via fetch to FastAPI backend at localhost:8000.

**Tech Stack:** React 18, TypeScript, Vite, Tailwind CSS 4, shadcn/ui, IBM Plex Mono + Instrument Sans fonts, D3.js (dendrograma), Framer Motion (animations)

**Design Direction — "Deep Scan":**
- Dark background (#0A0E17), panels (#111827), borders (#1E293B)
- Accent cyan (#06B6D4), bright cyan (#22D3EE), green (#10B981), red (#EF4444)
- IBM Plex Mono for sequences/data, Instrument Sans for UI text
- Terminal-like feel, scanning animations, neon glow effects
- Asymmetric layouts, generous negative space

---

### Task 1: Scaffold React + Vite + Tailwind + shadcn/ui

**Files:**
- Create: `frontend/` (via Vite scaffold)
- Modify: `frontend/tailwind.config.ts`
- Modify: `frontend/src/index.css`
- Create: `frontend/components.json` (shadcn config)

**Step 1: Create Vite project**

Run:
```bash
cd "c:/Users/Enzo Ferraz/OneDrive - Sintese Biotecnologia/Documentos/rainman"
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install
```

**Step 2: Install Tailwind CSS v4 + shadcn dependencies**

Run:
```bash
cd frontend
npm install tailwindcss @tailwindcss/vite
npm install -D @types/node
npm install class-variance-authority clsx tailwind-merge lucide-react
npm install framer-motion
```

**Step 3: Configure Vite for Tailwind v4**

Update `vite.config.ts`:
```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/api': 'http://localhost:8000',
    },
  },
})
```

**Step 4: Setup global CSS with design tokens**

Replace `src/index.css`:
```css
@import "tailwindcss";

@theme {
  --color-deep-bg: #0A0E17;
  --color-panel: #111827;
  --color-panel-hover: #1a2332;
  --color-border: #1E293B;
  --color-border-bright: #334155;
  --color-cyan: #06B6D4;
  --color-cyan-bright: #22D3EE;
  --color-green: #10B981;
  --color-red: #EF4444;
  --color-amber: #F59E0B;
  --color-text: #E2E8F0;
  --color-text-muted: #94A3B8;
  --color-text-dim: #64748B;

  --font-mono: 'IBM Plex Mono', monospace;
  --font-sans: 'Instrument Sans', sans-serif;
}

@layer base {
  body {
    @apply bg-deep-bg text-text font-sans antialiased;
  }

  ::selection {
    @apply bg-cyan/30 text-cyan-bright;
  }

  ::-webkit-scrollbar {
    width: 6px;
  }
  ::-webkit-scrollbar-track {
    @apply bg-deep-bg;
  }
  ::-webkit-scrollbar-thumb {
    @apply bg-border-bright rounded-full;
  }
}

@utility glow-cyan {
  box-shadow: 0 0 20px rgba(6, 182, 212, 0.15), 0 0 60px rgba(6, 182, 212, 0.05);
}

@utility glow-text-cyan {
  text-shadow: 0 0 10px rgba(6, 182, 212, 0.5);
}

@utility scan-line {
  background: linear-gradient(
    180deg,
    transparent 0%,
    rgba(6, 182, 212, 0.03) 50%,
    transparent 100%
  );
  animation: scan 3s linear infinite;
}

@keyframes scan {
  0% { transform: translateY(-100%); }
  100% { transform: translateY(100%); }
}

@keyframes pulse-glow {
  0%, 100% { opacity: 0.5; }
  50% { opacity: 1; }
}

@keyframes typing {
  from { width: 0; }
  to { width: 100%; }
}
```

**Step 5: Add Google Fonts to index.html**

Add to `<head>` in `index.html`:
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700&family=Instrument+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
<title>Gene Pattern Finder — TimeLabs</title>
```

**Step 6: Setup cn utility**

Create `src/lib/utils.ts`:
```ts
import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

**Step 7: Commit**

```bash
git add frontend/
git commit -m "feat: scaffold frontend with Vite, Tailwind v4, Deep Scan design tokens"
```

---

### Task 2: API Client + TypeScript Types

**Files:**
- Create: `frontend/src/lib/api.ts`
- Create: `frontend/src/lib/types.ts`

**Step 1: Create TypeScript types matching backend schemas**

Create `src/lib/types.ts`:
```ts
export type SeqType = 'dna' | 'rna' | 'protein'
export type SeqSource = 'ncbi' | 'manual'
export type BlastProgram = 'blastn' | 'blastp' | 'blastx' | 'tblastn' | 'tblastx'
export type TreeMode = 'query_vs_all' | 'all_vs_all'

export interface SpeciesSearchResult {
  taxon_id: number
  name: string
  rank: string
  lineage: string | null
}

export interface SpeciesOut {
  id: string
  taxon_id: number
  name: string
  rank: string
  lineage: string | null
  created_at: string
}

export interface SequenceOut {
  id: string
  accession: string
  seq_type: SeqType
  title: string
  length: number
  source: SeqSource
  fetched_at: string
}

export interface SequenceListResponse {
  species: SpeciesOut
  sequences: SequenceOut[]
  total: number
  from_cache: boolean
}

export interface BlastRequest {
  query_sequence: string
  seq_type: SeqType
  species_taxon_id: number
  program: BlastProgram
  max_results: number
}

export interface BlastHit {
  accession: string
  title: string
  score: float
  evalue: number
  identity_pct: number
  coverage: number
  query_start: number
  query_end: number
  hit_start: number
  hit_end: number
  query_aligned: string
  match_line: string
  hit_aligned: string
}

export interface BlastResponse {
  id: string
  query_length: number
  hits: BlastHit[]
  total_hits: number
}

export interface TreeRequest {
  analysis_id: string
  mode: TreeMode
}

export interface TreeResponse {
  newick: string
  labels: string[]
  distance_matrix: number[][]
}
```

**Step 2: Create API client**

Create `src/lib/api.ts`:
```ts
import type {
  SpeciesSearchResult,
  SequenceListResponse,
  SeqType,
  BlastRequest,
  BlastResponse,
  TreeRequest,
  TreeResponse,
} from './types'

const BASE = '/api'

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || 'Request failed')
  }
  return res.json()
}

export const api = {
  searchSpecies(q: string, limit = 20) {
    return request<SpeciesSearchResult[]>(
      `/species/search?q=${encodeURIComponent(q)}&limit=${limit}`
    )
  },

  getSequences(taxonId: number, type: SeqType = 'dna', limit = 50) {
    return request<SequenceListResponse>(
      `/sequences/${taxonId}?type=${type}&limit=${limit}`
    )
  },

  runBlast(data: BlastRequest) {
    return request<BlastResponse>('/analysis/blast', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  getTree(data: TreeRequest) {
    return request<TreeResponse>('/analysis/tree', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  getAnalysis(id: string) {
    return request<any>(`/analysis/${id}`)
  },
}
```

**Step 3: Commit**

```bash
git add frontend/src/lib/
git commit -m "feat: API client and TypeScript types for backend integration"
```

---

### Task 3: Layout Shell + Header

**Files:**
- Create: `frontend/src/components/layout/Header.tsx`
- Create: `frontend/src/components/layout/Layout.tsx`
- Modify: `frontend/src/App.tsx`

**Step 1: Create Header component**

Create `src/components/layout/Header.tsx`:
```tsx
import { motion } from 'framer-motion'

export function Header() {
  return (
    <header className="border-b border-border px-6 py-4 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <motion.div
          className="w-2 h-2 rounded-full bg-cyan"
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 2, repeat: Infinity }}
        />
        <h1 className="font-mono text-lg font-semibold tracking-tight text-text">
          GENE<span className="text-cyan">PATTERN</span>FINDER
        </h1>
        <span className="text-xs font-mono text-text-dim border border-border px-2 py-0.5">
          TimeLabs
        </span>
      </div>
      <div className="flex items-center gap-4">
        <span className="text-xs font-mono text-text-dim">
          v0.1.0
        </span>
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-green" />
          <span className="text-xs font-mono text-text-muted">SYSTEM ONLINE</span>
        </div>
      </div>
    </header>
  )
}
```

**Step 2: Create Layout component**

Create `src/components/layout/Layout.tsx`:
```tsx
import { Header } from './Header'

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-deep-bg flex flex-col">
      <Header />
      <main className="flex-1 flex flex-col">
        {children}
      </main>
    </div>
  )
}
```

**Step 3: Wire up App.tsx**

Replace `src/App.tsx`:
```tsx
import { Layout } from './components/layout/Layout'
import { AnalysisWorkspace } from './components/workspace/AnalysisWorkspace'

export default function App() {
  return (
    <Layout>
      <AnalysisWorkspace />
    </Layout>
  )
}
```

**Step 4: Commit**

```bash
git add frontend/src/
git commit -m "feat: layout shell with Deep Scan header"
```

---

### Task 4: Species Search Panel

**Files:**
- Create: `frontend/src/components/workspace/SpeciesSearch.tsx`
- Create: `frontend/src/hooks/useDebounce.ts`

**Step 1: Create debounce hook**

Create `src/hooks/useDebounce.ts`:
```ts
import { useState, useEffect } from 'react'

export function useDebounce<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}
```

**Step 2: Create SpeciesSearch component**

Create `src/components/workspace/SpeciesSearch.tsx` — a search input with dropdown results. On selection, emits the selected species. Features:
- Debounced search input (300ms)
- Dropdown with results from `/api/species/search`
- Shows taxon_id, name, rank, lineage
- Loading/error states with scanning animation
- Calls `onSelect(species: SpeciesSearchResult)` when chosen

**Step 3: Commit**

```bash
git add frontend/src/
git commit -m "feat: species search with debounced NCBI lookup"
```

---

### Task 5: Sequence Fetch + Query Input Panel

**Files:**
- Create: `frontend/src/components/workspace/SequencePanel.tsx`
- Create: `frontend/src/components/workspace/QueryInput.tsx`

**Step 1: Create SequencePanel**

Shows fetched sequences for selected species. Features:
- Sequence type selector (DNA/RNA/Protein tabs)
- Results limit selector (25, 50, 100, 200)
- Fetches from `/api/sequences/{taxonId}`
- Shows sequence list with accession, title, length
- From-cache indicator
- Loading state with scanning animation

**Step 2: Create QueryInput**

Textarea for the researcher's sequence. Features:
- Large monospace textarea
- BLAST program selector (blastn, blastp, blastx, tblastn, tblastx)
- Character count
- "Run Analysis" button with scanning animation
- Validation: min 10 characters
- Emits `onSubmit(BlastRequest)`

**Step 3: Commit**

```bash
git add frontend/src/
git commit -m "feat: sequence panel and query input with BLAST config"
```

---

### Task 6: BLAST Results — Score Table + Alignment View

**Files:**
- Create: `frontend/src/components/results/BlastResults.tsx`
- Create: `frontend/src/components/results/AlignmentView.tsx`
- Create: `frontend/src/components/results/ScoreBar.tsx`

**Step 1: Create ScoreBar**

Horizontal bar showing identity percentage. Cyan gradient fill, glow effect.

**Step 2: Create BlastResults**

Table showing BLAST hits. Columns:
- Accession (monospace, cyan)
- Title
- Score
- E-value (scientific notation)
- Identity % (with ScoreBar)
- Coverage % (with ScoreBar)

Sortable by clicking column headers. Rows expand on click to show AlignmentView.

**Step 3: Create AlignmentView**

Shows pairwise alignment for a single hit. Features:
- Query vs Hit aligned sequences in monospace
- Match line between them (pipes for match, spaces for mismatch)
- Color-coded: matches in cyan, mismatches in red
- Position numbers on both sides
- Wraps at 60 characters per line

**Step 4: Commit**

```bash
git add frontend/src/
git commit -m "feat: BLAST results table with alignment visualization"
```

---

### Task 7: Dendrograma (Phylogenetic Tree)

**Files:**
- Create: `frontend/src/components/results/Dendrogram.tsx`

**Dependencies to install:**
```bash
npm install d3 @types/d3
```

**Step 1: Create Dendrogram component**

D3-based phylogenetic tree visualization. Features:
- Parse Newick string from `/api/analysis/tree`
- Render as horizontal dendrogram (cluster layout)
- Cyan/teal colored branches on dark background
- Leaf labels in IBM Plex Mono
- Mode toggle: "Query vs All" / "Full Phylogeny" (all_vs_all)
- Zoom + pan
- Highlight query sequence node differently (bright cyan glow)
- Animated branch drawing on load (stroke-dashoffset transition)
- SVG export button

**Step 2: Commit**

```bash
git add frontend/src/
git commit -m "feat: D3 dendrogram with Newick parsing and neon styling"
```

---

### Task 8: Analysis Workspace (Main Orchestrator)

**Files:**
- Create: `frontend/src/components/workspace/AnalysisWorkspace.tsx`

**Step 1: Create workspace**

The main page that orchestrates the full flow. Features:
- State machine: SEARCH → SEQUENCES → ANALYSIS → RESULTS
- Left panel (40%): SpeciesSearch → SequencePanel → QueryInput (stacked)
- Right panel (60%): Results (BlastResults + Dendrogram tabs)
- Step indicator at top showing current phase
- Smooth transitions between states (Framer Motion)
- Error boundary for failed API calls

State management:
```ts
const [species, setSpecies] = useState<SpeciesSearchResult | null>(null)
const [sequences, setSequences] = useState<SequenceListResponse | null>(null)
const [blastResult, setBlastResult] = useState<BlastResponse | null>(null)
const [treeResult, setTreeResult] = useState<TreeResponse | null>(null)
const [phase, setPhase] = useState<'search' | 'sequences' | 'analysis' | 'results'>('search')
```

**Step 2: Commit**

```bash
git add frontend/src/
git commit -m "feat: analysis workspace orchestrating full search-to-results flow"
```

---

### Task 9: Loading States + Micro-interactions

**Files:**
- Create: `frontend/src/components/ui/ScanLoader.tsx`
- Create: `frontend/src/components/ui/GlowButton.tsx`
- Create: `frontend/src/components/ui/SequenceText.tsx`

**Step 1: Create ScanLoader**

Full-width scanning animation shown during BLAST/tree operations. Horizontal line sweeps across, leaving a subtle trail.

**Step 2: Create GlowButton**

Button with cyan glow effect on hover, pulse animation on loading state.

**Step 3: Create SequenceText**

Renders DNA/RNA/protein sequences with base-specific coloring:
- A = cyan, T = red, G = green, C = amber
- Amino acids: hydrophobic = cyan, polar = green, charged = red

**Step 4: Commit**

```bash
git add frontend/src/
git commit -m "feat: scanning loader, glow button, colored sequence text"
```

---

### Task 10: Final Integration + Polish

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: various components for final wiring

**Step 1: End-to-end test**

1. Start backend: `cd backend && python -m uvicorn app.main:app --port 8000`
2. Start frontend: `cd frontend && npm run dev`
3. Search for "Escherichia coli"
4. Fetch sequences
5. Paste a test DNA sequence, run BLAST
6. View results + dendrograma

**Step 2: Fix any integration issues**

**Step 3: Final commit**

```bash
git add frontend/
git commit -m "feat: complete frontend integration with backend API"
```
