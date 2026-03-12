# Gene Pattern Finder (TimeLabs) — Design Document v2

**Date:** 2026-03-12
**Status:** Approved (v2 — revised scope)

## Overview

Plataforma web de analise comparativa de sequencias geneticas. Pesquisador monta uma colecao curada de especies/subespecies buscando no NCBI, e o sistema roda alinhamento multiplo (MAFFT) + filogenia (IQ-TREE) para responder: "Dentro desse conjunto, quais regioes sao conservadas e como as especies se relacionam evolutivamente?"

## Decisoes de Design

- **Colecao curada:** pesquisador seleciona multiplas especies (dezenas a centenas)
- **NCBI Entrez** para busca e fetch de sequencias, cacheadas em PostgreSQL
- **MAFFT** para alinhamento multiplo (modo --auto, escala para centenas de seqs)
- **FastTree** para preview rapido da arvore filogenetica
- **IQ-TREE** para arvore definitiva com ModelFinder + ultrafast bootstrap
- **Celery + Redis** para processamento assincrono com progresso em tempo real
- **WebSocket** para push de progresso ao frontend
- **Sem autenticacao** na v1 (sera adicionado depois)
- **Upload manual** de sequencias considerado na arquitetura, implementado depois

## Estrutura do Projeto

```
rainman/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI app + CORS + WebSocket
│   │   ├── config.py            # Settings (DB, NCBI, tool paths)
│   │   ├── database.py          # SQLAlchemy async engine + session
│   │   ├── models.py            # ORM models
│   │   ├── schemas.py           # Pydantic schemas (request/response)
│   │   ├── routers/
│   │   │   ├── species.py       # GET /species/search
│   │   │   ├── sequences.py     # GET /sequences/{taxon_id}
│   │   │   ├── collections.py   # CRUD /collections
│   │   │   └── jobs.py          # POST /jobs, GET /jobs/{id}, WS /ws/jobs/{id}
│   │   ├── services/
│   │   │   ├── ncbi.py          # Entrez API client (mantido)
│   │   │   ├── mafft.py         # MAFFT runner
│   │   │   ├── iqtree.py        # IQ-TREE + FastTree runner
│   │   │   └── conservation.py  # Deteccao de regioes conservadas
│   │   ├── worker/
│   │   │   ├── celery_app.py    # Celery config
│   │   │   └── tasks.py         # Task: run_analysis pipeline
│   │   └── utils/
│   │       └── sequence.py      # Helpers (validacao, formatacao FASTA)
│   ├── requirements.txt
│   ├── alembic/
│   └── alembic.ini
├── frontend/
│   └── (React + TypeScript + Tailwind + D3.js)
└── docker-compose.yml           # PostgreSQL + Redis + Backend + Worker
```

## Modelo de Dados

### species (mantido)
| Coluna     | Tipo            | Descricao                    |
|------------|-----------------|------------------------------|
| id         | UUID PK         |                              |
| taxon_id   | INT UNIQUE      | NCBI Taxonomy ID             |
| name       | VARCHAR         | Nome cientifico              |
| rank       | VARCHAR         | species, subspecies          |
| lineage    | TEXT            | Taxonomia completa           |
| created_at | TIMESTAMP       |                              |

### sequences (mantido)
| Coluna     | Tipo            | Descricao                    |
|------------|-----------------|------------------------------|
| id         | UUID PK         |                              |
| species_id | UUID FK         | → species.id                 |
| accession  | VARCHAR UNIQUE  | Ex: NC_000913.3              |
| seq_type   | ENUM            | dna, rna, protein            |
| title      | TEXT            |                              |
| sequence   | TEXT            | Sequencia raw                |
| length     | INT             |                              |
| source     | ENUM            | ncbi, manual                 |
| fetched_at | TIMESTAMP       |                              |

### collections (novo)
| Coluna     | Tipo            | Descricao                    |
|------------|-----------------|------------------------------|
| id         | UUID PK         |                              |
| name       | VARCHAR         | Ex: "Enterobacteriaceae"     |
| seq_type   | ENUM            | dna, rna, protein            |
| created_at | TIMESTAMP       |                              |

### collection_species (novo, tabela de juncao)
| Coluna        | Tipo         | Descricao                    |
|---------------|--------------|------------------------------|
| collection_id | UUID FK      | → collections.id             |
| species_id    | UUID FK      | → species.id                 |
| sequence_id   | UUID FK      | → sequences.id               |

### analysis_jobs (substitui analysis_results)
| Coluna         | Tipo         | Descricao                              |
|----------------|--------------|----------------------------------------|
| id             | UUID PK      |                                        |
| collection_id  | UUID FK      | → collections.id                       |
| status         | ENUM         | queued/aligning/preview_tree/full_tree/conservation/done/failed |
| progress_pct   | INT          | 0-100                                  |
| progress_msg   | TEXT         | Mensagem da etapa atual                |
| error_msg      | TEXT         | Mensagem de erro (se failed)           |
| alignment      | TEXT         | FASTA alinhado (output MAFFT)          |
| preview_tree   | TEXT         | Newick do FastTree                     |
| tree           | TEXT         | Newick do IQ-TREE                      |
| tree_model     | VARCHAR      | Modelo evolutivo escolhido pelo MFP    |
| bootstrap_data | JSON         | Valores de suporte nos nos             |
| conservation   | JSON         | Regioes conservadas detectadas         |
| created_at     | TIMESTAMP    |                                        |
| finished_at    | TIMESTAMP    |                                        |

## Endpoints da API

| Metodo | Rota                          | Descricao                                |
|--------|-------------------------------|------------------------------------------|
| GET    | /api/species/search?q=termo   | Busca especies no NCBI Taxonomy          |
| GET    | /api/sequences/{taxon_id}     | Fetch sequencias (cache ou NCBI)         |
| POST   | /api/collections              | Cria colecao com especies selecionadas   |
| GET    | /api/collections/{id}         | Detalhes da colecao                      |
| PATCH  | /api/collections/{id}         | Adiciona/remove especies                 |
| POST   | /api/jobs                     | Inicia analise (MAFFT → FastTree → IQ-TREE) |
| GET    | /api/jobs/{id}                | Status + progresso do job                |
| GET    | /api/jobs/{id}/results        | Resultados completos                     |
| WS     | /ws/jobs/{id}                 | Progresso em tempo real                  |

## Pipeline de Analise

```
Etapa 1: Preparar FASTA (0-5%)
  Juntar todas as sequencias da colecao num arquivo FASTA

Etapa 2: MAFFT — alinhamento multiplo (5-40%)
  mafft --auto --thread -1 input.fasta > aligned.fasta

Etapa 3: FastTree — preview rapido (40-50%)
  FastTree -nt aligned.fasta > preview.nwk
  Salva no banco → frontend mostra preview imediato

Etapa 4: IQ-TREE — arvore definitiva (50-90%)
  iqtree2 -s aligned.fasta -m MFP -bb 1000 -nt AUTO
  MFP = ModelFinder Plus (descobre melhor modelo)
  -bb 1000 = ultrafast bootstraps

Etapa 5: Deteccao de regioes conservadas (90-100%)
  Para cada posicao do alinhamento: % de identidade
  Agrupa posicoes consecutivas acima do threshold
```

## Fluxo do Usuario

1. Pesquisador busca especies e adiciona a uma colecao (acumula N especies)
2. Escolhe tipo de sequencia (DNA/RNA/Proteina)
3. Sistema puxa sequencias do NCBI para cada especie (com cache)
4. Pesquisador clica "Iniciar Analise"
5. Pipeline assincrono roda (MAFFT → FastTree → IQ-TREE → conservacao)
6. Frontend mostra progresso em tempo real via WebSocket
7. Resultados: arvore filogenetica interativa + mapa de regioes conservadas

## Stack Tecnica

- **Backend:** FastAPI + Uvicorn
- **ORM:** SQLAlchemy + Alembic
- **Fila:** Celery + Redis
- **Bioinformatica:** MAFFT, FastTree, IQ-TREE, Biopython
- **Banco:** PostgreSQL (Docker)
- **Frontend:** React + TypeScript + Tailwind + D3.js
- **Infra:** Docker Compose (PostgreSQL + Redis + Backend + Worker)

## Dependencias Externas (binarios)

- **MAFFT** (~5MB) — alinhamento multiplo
- **FastTree** (~1MB) — arvore rapida
- **IQ-TREE** (~15MB) — arvore definitiva com ModelFinder
