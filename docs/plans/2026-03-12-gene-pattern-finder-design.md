# Gene Pattern Finder (TimeLabs) — Design Document

**Date:** 2026-03-12
**Status:** Approved

## Overview

Plataforma web de analise de sequencias geneticas. Pesquisador busca especie no NCBI, sistema puxa sequencias, pesquisador cola sua sequencia e o sistema roda BLAST+ local para comparacao. Resultados incluem scores de similaridade, alinhamento visual e dendrograma filogenetico.

## Decisoes de Design

- **Abordagem hibrida:** NCBI Entrez API para busca de sequencias + BLAST+ local para analise
- **Cache em PostgreSQL:** sequencias baixadas do NCBI sao cacheadas para reuso
- **Sem autenticacao** na v1 (sera adicionado depois)
- **Acesso aberto** sem login
- **Pesquisador escolhe:** tipo de sequencia, programa BLAST, limite de resultados (25/50/100/200)
- **Dois modos de dendrograma:** query vs. resultados E filogenetico completo (all vs all)
- **Upload manual** de sequencias sera adicionado em fase posterior

## Estrutura do Projeto

```
rainman/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI app + CORS + rotas
│   │   ├── config.py            # Settings (DB, NCBI, BLAST paths)
│   │   ├── database.py          # SQLAlchemy engine + session
│   │   ├── models.py            # ORM models
│   │   ├── schemas.py           # Pydantic schemas (request/response)
│   │   ├── routers/
│   │   │   ├── species.py       # GET /species/search
│   │   │   ├── sequences.py     # GET /sequences/{species}
│   │   │   └── analysis.py      # POST /analysis/blast, /analysis/tree
│   │   ├── services/
│   │   │   ├── ncbi.py          # Entrez API client
│   │   │   ├── blast.py         # BLAST+ local runner
│   │   │   └── phylogeny.py     # Dendrograma (Biopython + scipy)
│   │   └── utils/
│   │       └── sequence.py      # Helpers (validacao, formatacao FASTA)
│   ├── requirements.txt
│   ├── alembic/                 # Migrations
│   └── alembic.ini
├── frontend/                    # (fase 2)
└── docker-compose.yml           # PostgreSQL + backend
```

## Modelo de Dados

### species
| Coluna     | Tipo            | Descricao                    |
|------------|-----------------|------------------------------|
| id         | UUID PK         | Identificador unico          |
| taxon_id   | INT UNIQUE      | NCBI Taxonomy ID             |
| name       | VARCHAR         | Nome da especie              |
| rank       | VARCHAR         | species, subspecies          |
| lineage    | TEXT            | Taxonomia completa           |
| created_at | TIMESTAMP       | Data de criacao              |

### sequences
| Coluna     | Tipo            | Descricao                    |
|------------|-----------------|------------------------------|
| id         | UUID PK         | Identificador unico          |
| species_id | UUID FK         | Referencia a species         |
| accession  | VARCHAR UNIQUE  | Ex: NC_000913.3              |
| seq_type   | ENUM            | dna, rna, protein            |
| title      | TEXT            | Titulo da sequencia          |
| sequence   | TEXT            | Sequencia raw                |
| length     | INT             | Tamanho da sequencia         |
| source     | ENUM            | ncbi, manual                 |
| fetched_at | TIMESTAMP       | Data de download             |

### analysis_results
| Coluna        | Tipo         | Descricao                      |
|---------------|--------------|--------------------------------|
| id            | UUID PK      | Identificador unico            |
| query_seq     | TEXT         | Sequencia do pesquisador       |
| seq_type      | ENUM         | dna, rna, protein              |
| species_id    | UUID FK      | Referencia a species           |
| blast_results | JSON         | Resultado raw do BLAST         |
| tree_data     | JSON         | Dados do dendrograma           |
| max_results   | INT          | Limite de resultados           |
| created_at    | TIMESTAMP    | Data de criacao                |

## Endpoints da API

| Metodo | Rota                                          | Descricao                                     |
|--------|-----------------------------------------------|-----------------------------------------------|
| GET    | /api/species/search?q=termo                   | Busca especies no NCBI Taxonomy               |
| GET    | /api/sequences/{taxon_id}?type=dna&limit=50   | Busca sequencias (cache ou NCBI)              |
| POST   | /api/analysis/blast                            | Roda BLAST+ local                             |
| POST   | /api/analysis/tree                             | Gera dendrograma                              |
| GET    | /api/analysis/{id}                             | Recupera resultado anterior                   |

## Fluxo de Dados

1. Pesquisador busca especie → Entrez esearch (taxonomy)
2. Seleciona especie → GET /sequences/{taxon_id}
3. Cache hit → retorna do PostgreSQL / Cache miss → Entrez efetch → salva → retorna
4. Pesquisador cola sequencia + escolhe programa BLAST
5. POST /analysis/blast → makeblastdb temporario → roda BLAST → parseia → salva + retorna
6. POST /analysis/tree → alinhamento multiplo → clustering hierarquico → retorna Newick + dados

## Stack Tecnica

- **Backend:** FastAPI + Uvicorn
- **ORM:** SQLAlchemy + Alembic
- **Bioinformatica:** Biopython, BLAST+ (local), scipy
- **Banco:** PostgreSQL (Docker)
- **Frontend (fase 2):** React + TypeScript + Tailwind + shadcn/ui
