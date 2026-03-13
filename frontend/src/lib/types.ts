export type SeqType = 'dna' | 'rna' | 'protein'
export type SeqSource = 'ncbi' | 'manual'
export type JobStatus = 'queued' | 'aligning' | 'preview_tree' | 'full_tree' | 'conservation' | 'motifs' | 'clustering' | 'network' | 'insights' | 'done' | 'failed'
export type ResultTab = 'tree' | 'alignment' | 'conservation' | 'motifs' | 'clustering' | 'network' | 'insights'

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
  p_value?: number
}

export interface ConservationData {
  position_identity: number[]
  position_entropy?: number[]
  position_pvalue?: number[]
  regions: ConservedRegion[]
  total_positions: number
  total_conserved: number
  conservation_pct: number
  threshold: number
  method?: string
  n_sequences: number
  seq_type?: string
}

export interface MotifEntry {
  sequence: string
  length: number
  support: number
  positions: Record<string, number[]>
  consensus: string
  n_occurrences: number
  p_value?: number
  e_value?: number
  pwm?: Record<string, number>[]
  information_content?: number[]
}

export interface MotifsData {
  motifs: MotifEntry[]
  n_sequences: number
  alignment_length: number
  total_motifs: number
  parameters: {
    min_length: number
    max_length: number
    min_support: number
  }
  background_frequencies?: Record<string, number>
  n_kmers_tested?: number
}

export interface ClusteringData {
  labels: Record<string, number>
  dendrogram_data: number[][]
  distance_matrix: number[][]
  sequence_labels: string[]
  n_clusters: number
  silhouette_score: number
  method: string
  n_sequences: number
  cophenetic_r?: number
  bootstrap_stability?: Record<string, number>
  avg_bootstrap_stability?: number | null
  n_bootstrap?: number
}

export interface NetworkNode {
  id: string
  label: string
  cluster: number | null
  degree_centrality?: number
  betweenness_centrality?: number
  is_hub?: boolean
}

export interface NetworkEdge {
  source: string
  target: string
  weight: number
  is_mst: boolean
}

export interface NetworkData {
  nodes: NetworkNode[]
  edges: NetworkEdge[]
  stats: {
    n_nodes: number
    n_edges: number
    n_mst_edges: number
    n_extra_edges: number
    avg_distance: number
    min_distance: number
    max_distance: number
    threshold: number
    n_components?: number
    hub_nodes?: string[]
    degree_centrality?: Record<string, number>
    betweenness_centrality?: Record<string, number>
  }
}

export interface InsightEntry {
  category: string
  confidence: 'high' | 'medium' | 'low'
  text: string
  supporting_data: Record<string, unknown>
}

export interface InsightsData {
  insights: InsightEntry[]
  n_insights: number
  categories: string[]
  seq_type: string
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
  motifs: MotifsData | null
  clustering: ClusteringData | null
  network: NetworkData | null
  insights: InsightsData | null
}
