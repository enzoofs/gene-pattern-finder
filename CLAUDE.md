# CLAUDE.md - Contexto para Claude Code

## Projeto

Gene Pattern Finder (TimeLabs) - Plataforma web de analise filogenetica comparativa.
Pesquisadores buscam especies no NCBI, montam colecoes, e rodam pipeline de analise (MAFFT -> FastTree -> IQ-TREE -> conservacao).

## Comandos

### Iniciar todos os servicos

```bash
# 1. PostgreSQL + Redis
docker compose up -d

# 2. Backend (terminal 1)
cd backend && uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

# 3. Celery worker (terminal 2)
cd backend && python -m celery -A app.worker.celery_app worker --loglevel=info --pool=solo

# 4. Frontend (terminal 3)
cd frontend && npm run dev
```

### Verificar saude

```bash
curl http://localhost:8000/api/health
```

### Migracao de banco

```bash
cd backend && alembic upgrade head
```

### Build frontend

```bash
cd frontend && npx tsc --noEmit  # type check
cd frontend && npm run build     # build producao
```

## Estrutura

```
backend/
  app/
    main.py          # FastAPI app, routers, CORS, lifespan
    config.py        # Settings via pydantic-settings (.env)
    database.py      # SQLAlchemy async engine + Base
    models.py        # ORM: Species, Sequence, Collection, CollectionSpecies, AnalysisJob
    schemas.py       # Pydantic schemas request/response
    routers/
      species.py     # GET /api/species/search?q=
      sequences.py   # GET /api/sequences/{species_id}?seq_type=dna
      collections.py # CRUD colecoes + add/remove species
      jobs.py        # POST /api/jobs + GET status + WebSocket progress
    services/
      ncbi.py        # Entrez search species + fetch sequences (com retry)
      mafft.py       # MAFFT alignment (Windows msys2 handling)
      iqtree.py      # FastTree preview + IQ-TREE com ModelFinder + bootstrap
      conservation.py # Deteccao regioes conservadas
    worker/
      celery_app.py  # Config Celery + Redis
      tasks.py       # Task run_analysis (pipeline completo)

frontend/src/
  components/
    workspace/
      AnalysisWorkspace.tsx  # Orquestra tudo: colecao -> job -> resultados
      CollectionBuilder.tsx  # Busca especies, monta colecao (batch + individual)
      JobProgress.tsx        # Pipeline visual com timer e retry
      SpeciesSearch.tsx      # Input busca NCBI com timer
      SequencePanel.tsx      # Lista sequencias com badges
    results/
      Dendrogram.tsx         # Arvore D3.js (newick parser)
      ConservationMap.tsx    # Heatmap canvas de conservacao
    layout/
      Header.tsx             # Header com versao
      Layout.tsx             # Layout wrapper
  hooks/
    useJobProgress.ts        # WebSocket + polling fallback
    useElapsedTime.ts        # Timer de loading
    useDebounce.ts           # Debounce para inputs
  lib/
    api.ts                   # Cliente API (fetch wrapper)
    types.ts                 # TypeScript types
```

## Convencoes

- Versao: incrementar em Header.tsx e main.py a cada mudanca
- Backend: FastAPI async, SQLAlchemy async, Celery para jobs pesados
- Frontend: React funcional com hooks, Tailwind CSS v4, Framer Motion para animacoes
- Tema: "Deep Scan" - fundo escuro (#0A0E17), cyan accent (#06B6D4), IBM Plex Mono
- NCBI: busca sequencial (nao paralela) para evitar rate limiting, com retry automatico
- IQ-TREE: bootstrap so com 4+ sequencias, senao roda sem -bb
- MAFFT no Windows: usa distribuicao msys2, precisa de MAFFT_BINARIES e TMPDIR configurados
- Ferramentas externas em tools/ (gitignored)

## Problemas Conhecidos

- MAFFT no Windows precisa de handling especial (bash.exe do msys2, envs TMPDIR/MAFFT_BINARIES)
- NCBI retorna timeout com buscas paralelas - usar busca sequencial
- IQ-TREE requer minimo 4 sequencias para bootstrap
- Sequencias muito grandes (genomas completos) podem estourar timeout do MAFFT (1h atual)
