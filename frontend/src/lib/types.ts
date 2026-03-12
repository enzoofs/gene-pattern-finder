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
  score: number
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
