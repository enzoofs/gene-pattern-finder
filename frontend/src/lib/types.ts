export type SeqType = 'dna' | 'rna' | 'protein'
export type SeqSource = 'ncbi' | 'manual'
export type JobStatus = 'queued' | 'aligning' | 'preview_tree' | 'full_tree' | 'conservation' | 'done' | 'failed'
export type ResultTab = 'tree' | 'alignment' | 'conservation'

export interface GeneTarget {
  id: string
  gene_query: string
  label: string
  description: string
  seq_type: SeqType
}

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

export interface CollectionOut {
  id: string
  name: string
  seq_type: SeqType
  gene_target: string | null
  species_count: number
  created_at: string
}

export interface CollectionSpeciesOut {
  species: SpeciesOut
  sequence: SequenceOut
}

export interface CollectionDetailOut {
  id: string
  name: string
  seq_type: SeqType
  gene_target: string | null
  created_at: string
  entries: CollectionSpeciesOut[]
}

export interface JobStatusOut {
  id: string
  collection_id: string
  status: JobStatus
  progress_pct: number
  progress_msg: string | null
  error_msg: string | null
  created_at: string
  finished_at: string | null
}

export interface ConservedRegion {
  start: number
  end: number
  length: number
  avg_identity: number
}

export interface ConservationData {
  position_identity: number[]
  position_entropy?: number[]
  regions: ConservedRegion[]
  total_positions: number
  total_conserved: number
  conservation_pct: number
  threshold: number
  method?: string
  n_sequences: number
}

export interface BootstrapEntry {
  ufboot: number
  sh_alrt?: number
}

export interface JobResultsOut {
  id: string
  status: JobStatus
  alignment: string | null
  preview_tree: string | null
  tree: string | null
  tree_model: string | null
  bootstrap_data: BootstrapEntry[] | Record<string, unknown> | null
  conservation: ConservationData | null
}
