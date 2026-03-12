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
    return request<Record<string, unknown>>(`/analysis/${id}`)
  },
}
