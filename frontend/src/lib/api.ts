import type {
  SpeciesSearchResult,
  SequenceListResponse,
  SeqType,
  CollectionOut,
  CollectionDetailOut,
  CollectionSpeciesOut,
  JobStatusOut,
  JobResultsOut,
  GeneTarget,
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

  getSequences(taxonId: number, type: SeqType = 'dna', limit = 50, gene = '') {
    let url = `/sequences/${taxonId}?type=${type}&limit=${limit}`
    if (gene) url += `&gene=${encodeURIComponent(gene)}`
    return request<SequenceListResponse>(url)
  },

  getGeneTargets() {
    return request<GeneTarget[]>('/collections/gene-targets')
  },

  createCollection(name: string, seq_type: SeqType, gene_target?: string) {
    return request<CollectionOut>('/collections', {
      method: 'POST',
      body: JSON.stringify({ name, seq_type, gene_target: gene_target ?? null }),
    })
  },

  autoAddSpecies(collectionId: string, speciesName: string) {
    return request<CollectionSpeciesOut>(`/collections/${collectionId}/auto-add`, {
      method: 'POST',
      body: JSON.stringify({ species_name: speciesName }),
    })
  },

  getCollection(id: string) {
    return request<CollectionDetailOut>(`/collections/${id}`)
  },

  addToCollection(collectionId: string, speciesTaxonId: number, sequenceId: string) {
    return request<CollectionSpeciesOut>(`/collections/${collectionId}/species`, {
      method: 'POST',
      body: JSON.stringify({ species_taxon_id: speciesTaxonId, sequence_id: sequenceId }),
    })
  },

  removeFromCollection(collectionId: string, sequenceId: string) {
    return request<unknown>(`/collections/${collectionId}/species/${sequenceId}`, { method: 'DELETE' })
  },

  createJob(collectionId: string, outgroupAccession?: string) {
    return request<JobStatusOut>('/jobs', {
      method: 'POST',
      body: JSON.stringify({
        collection_id: collectionId,
        outgroup_accession: outgroupAccession ?? null,
      }),
    })
  },

  getJobStatus(jobId: string) {
    return request<JobStatusOut>(`/jobs/${jobId}`)
  },

  getJobResults(jobId: string) {
    return request<JobResultsOut>(`/jobs/${jobId}/results`)
  },
}

export function connectJobProgress(
  jobId: string,
  onMessage: (data: { pct: number; msg: string; status?: string }) => void,
): WebSocket {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const ws = new WebSocket(`${protocol}//${window.location.host}/ws/jobs/${jobId}`)
  ws.onmessage = (e) => onMessage(JSON.parse(e.data))
  return ws
}
