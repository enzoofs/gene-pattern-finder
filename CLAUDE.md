# CLAUDE.md - Contexto para Claude Code

## Projeto

Gene Pattern Finder (TimeLabs) — Plataforma web de analise filogenetica comparativa.
Pesquisadores buscam especies no NCBI, montam colecoes com gene-alvo, e rodam pipeline de analise (MAFFT -> FastTree -> IQ-TREE -> conservacao com Shannon entropy).

## Comandos

### Iniciar todos os servicos

```bash
# 1. PostgreSQL + Redis
docker compose up -d db redis

# 2. Migracoes
cd backend && alembic upgrade head

# 3. Backend (terminal 1)
cd backend && uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

# 4. Celery worker (terminal 2)
cd backend && python -m celery -A app.worker.celery_app worker --loglevel=info --pool=solo

# 5. Frontend (terminal 3)
cd frontend && npm run dev
```

### Verificar saude

```bash
curl http://localhost:8000/api/health       # basico
curl http://localhost:8000/api/health/deep   # completo (DB + Redis + ferramentas)
```

### Testes

```bash
cd backend && python -m pytest tests/ -v   # 35 testes unitarios
cd frontend && npx tsc --noEmit            # type check
cd frontend && npm run build               # build producao
```

### Migracao de banco

```bash
cd backend && alembic upgrade head
```

## Estrutura

```
backend/
  app/
    main.py              # FastAPI app, CORS, health checks, request ID middleware
    config.py            # Settings via pydantic-settings (.env)
    database.py          # SQLAlchemy async engine + Base
    models.py            # ORM: Species, Sequence, Collection, CollectionSpecies, AnalysisJob
    schemas.py           # Pydantic schemas request/response
    gene_targets.py      # Mapeamento genes-alvo (COI, rbcL, 16S, etc.)
    routers/
      species.py         # GET /api/species/search?q= (com rate limiting)
      sequences.py       # GET /api/sequences/{species_id}?seq_type=dna
      collections.py     # CRUD colecoes + add/remove species + gene targets
      jobs.py            # POST /api/jobs + GET status + WebSocket progress
      exports.py         # GET /api/exports/fasta|excel|svg/{job_id}
    services/
      ncbi.py            # Entrez search + fetch (com retry)
      mafft.py           # MAFFT alignment (Windows msys2 handling)
      iqtree.py          # FastTree + IQ-TREE (ModelFinder + UFBoot + SH-aLRT)
      conservation.py    # Regioes conservadas (identidade + Shannon entropy)
    utils/
      sequence.py        # validate_dna(), validate_rna(), validate_protein()
    worker/
      celery_app.py      # Config Celery + Redis + beat schedule
      tasks.py           # Task run_analysis (pipeline completo)
  tests/
    test_conservation.py # Testes Shannon entropy + regioes conservadas
    test_iqtree.py       # Testes parsing bootstrap Newick
    test_sequence.py     # Testes validacao DNA/RNA/proteina

frontend/src/
  components/
    workspace/
      AnalysisWorkspace.tsx  # Orquestra tudo: colecao -> job -> resultados
      CollectionBuilder.tsx  # Busca especies, monta colecao (batch + individual)
      JobProgress.tsx        # Pipeline visual com timer, retry, status conexao
      SpeciesSearch.tsx      # Input busca NCBI com timer
    results/
      Dendrogram.tsx         # Arvore D3.js com bootstrap color-coded
      AlignmentViewer.tsx    # Viewer canvas com overlay de conservacao
      ConservationMap.tsx    # Heatmap canvas de conservacao
    layout/
      Header.tsx             # Header com versao
      Layout.tsx             # Layout wrapper
    ui/
      GlowButton.tsx         # Botao customizado
      ScanLoader.tsx         # Spinner
      SequenceText.tsx       # Texto estilo codigo
  hooks/
    useJobProgress.ts        # WebSocket + reconnect + polling fallback
    useElapsedTime.ts        # Timer de loading
    useDebounce.ts           # Debounce para inputs
  lib/
    api.ts                   # Cliente API (fetch wrapper)
    types.ts                 # TypeScript types
    download.ts              # Utilitario de download
    utils.ts                 # Utilitarios gerais
```

## Convencoes

- Versao: incrementar em Header.tsx e main.py a cada mudanca
- Backend: FastAPI async, SQLAlchemy async, Celery para jobs pesados
- Frontend: React funcional com hooks, Tailwind CSS v4, Framer Motion para animacoes
- Tema: "Deep Scan" — fundo escuro (#0A0E17), cyan accent (#06B6D4), IBM Plex Mono
- NCBI: busca sequencial (nao paralela) para evitar rate limiting, com retry automatico
- IQ-TREE: bootstrap so com 4+ sequencias, senao roda sem -bb/-alrt
- MAFFT no Windows: usa distribuicao msys2, precisa de MAFFT_BINARIES e TMPDIR configurados
- Ferramentas externas em tools/ (gitignored)
- CORS: origens configuradas via ALLOWED_ORIGINS no .env
- Rate limiting: 3 req/s sem API key NCBI, 10 com

## Problemas Conhecidos

- MAFFT no Windows precisa de handling especial (bash.exe do msys2, envs TMPDIR/MAFFT_BINARIES)
- NCBI retorna timeout com buscas paralelas — usar busca sequencial
- IQ-TREE requer minimo 4 sequencias para bootstrap
- Sequencias muito grandes (genomas completos) podem estourar timeout do MAFFT (1h atual)
