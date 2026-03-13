# Gene Pattern Finder

Plataforma web para analise filogenetica comparativa de sequencias geneticas. Pesquisadores buscam especies no NCBI, montam colecoes, executam pipelines de alinhamento e filogenia, e visualizam resultados interativos — tudo pelo navegador.

## Funcionalidades

- **Busca NCBI** — Pesquisa especies por nome cientifico com acesso direto ao Entrez (individual ou em lote)
- **Colecoes** — Monte colecoes de especies com sequencias DNA, RNA ou proteina para genes-alvo especificos (COI, rbcL, 16S rRNA, etc.)
- **Alinhamento multiplo** — MAFFT com deteccao automatica de estrategia
- **Arvore filogenetica** — FastTree (preview rapido) + IQ-TREE (definitiva com ModelFinder + ultrafast bootstrap + SH-aLRT)
- **Conservacao** — Deteccao de regioes conservadas por identidade posicional e entropia de Shannon
- **Visualizacao interativa** — Dendrograma D3.js com valores de bootstrap color-coded, viewer de alinhamento com overlay de conservacao, heatmap de conservacao
- **Exportacao** — Newick, FASTA alinhado, Excel, PNG e SVG
- **Progresso em tempo real** — WebSocket com reconexao automatica e fallback para polling

## Stack

| Camada | Tecnologias |
|--------|-------------|
| **Frontend** | React 19, TypeScript, Vite 8, Tailwind CSS v4, D3.js, Framer Motion |
| **Backend** | FastAPI, SQLAlchemy (async), Pydantic v2, Biopython |
| **Worker** | Celery 5 com Redis (broker + result backend) |
| **Banco** | PostgreSQL 16 |
| **Bioinfo** | MAFFT, FastTree, IQ-TREE 2 |

## Requisitos

- Python 3.11+
- Node.js 18+
- Docker e Docker Compose
- Ferramentas de bioinformatica (MAFFT, FastTree, IQ-TREE)

## Inicio rapido

### 1. Clone o repositorio

```bash
git clone https://github.com/enzoofs/gene-pattern-finder.git
cd gene-pattern-finder
```

### 2. Suba a infraestrutura

```bash
docker compose up -d db redis
```

### 3. Configure o backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate    # Linux/Mac
# .venv\Scripts\activate     # Windows
pip install -r requirements.txt
cp .env.example .env         # edite com seus caminhos
alembic upgrade head
```

### 4. Configure o frontend

```bash
cd frontend
npm install
```

### 5. Instale as ferramentas de bioinformatica

Baixe e coloque em `tools/` (gitignored), ou instale via package manager:

| Ferramenta | Versao minima | Download |
|------------|---------------|----------|
| MAFFT | v7.526 | https://mafft.cbrc.jp/alignment/software/ |
| FastTree | 2.1.11 | http://www.microbesonline.org/fasttree/ |
| IQ-TREE | 2.3.6 | http://www.iqtree.org/ |

Configure os caminhos no `.env`:

```env
MAFFT_BIN=mafft              # ou caminho absoluto
FASTTREE_BIN=FastTree         # ou caminho absoluto
IQTREE_BIN=iqtree2            # ou caminho absoluto
```

### 6. Inicie os servicos

Voce precisa de **3 terminais**:

```bash
# Terminal 1 — API
cd backend && uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

# Terminal 2 — Worker Celery
cd backend && python -m celery -A app.worker.celery_app worker --loglevel=info --pool=solo

# Terminal 3 — Frontend
cd frontend && npm run dev
```

Acesse **http://localhost:5173** no navegador.

## Como usar

### 1. Buscar especies

Digite o nome cientifico de uma especie na barra de busca (ex: *Homo sapiens*, *Arabidopsis thaliana*). O sistema consulta o NCBI e retorna resultados com taxonomia.

Voce pode buscar **em lote**: cole uma lista de nomes separados por linha para buscar varias especies de uma vez.

### 2. Montar colecao

Selecione um **gene-alvo** (COI, rbcL, 16S rRNA, ITS, matK, cytb, 18S rRNA, ou EF1a) e adicione as especies encontradas a colecao. O sistema busca automaticamente a sequencia correspondente no NCBI.

Minimo de **3 especies** por colecao para rodar a analise.

### 3. Rodar analise

Clique em "Iniciar Analise". O pipeline executa:

1. **Alinhamento** — MAFFT alinha todas as sequencias da colecao
2. **Arvore preview** — FastTree gera uma arvore rapida para visualizacao imediata
3. **Arvore final** — IQ-TREE roda com ModelFinder (selecao automatica do melhor modelo evolutivo), ultrafast bootstrap (1000 replicatas) e SH-aLRT (1000 replicatas)
4. **Conservacao** — Analise de regioes conservadas com identidade posicional e entropia de Shannon

O progresso e exibido em tempo real via WebSocket.

### 4. Visualizar resultados

- **Dendrograma** — Arvore filogenetica interativa com layout retangular ou radial. Valores de bootstrap sao exibidos com codigo de cores (verde >= 95%, amarelo 70-94%, vermelho < 70%)
- **Alinhamento** — Viewer canvas com coloracao por base/aminoacido e barra de conservacao sobreposta
- **Conservacao** — Heatmap mostrando regioes conservadas e divergentes ao longo do alinhamento

### 5. Exportar

- **Newick** (.nwk) — Arvore em formato padrao para uso em outros softwares (FigTree, iTOL, MEGA)
- **PNG** — Imagem da arvore em alta resolucao (2x)
- **FASTA** — Alinhamento multiplo
- **Excel** — Dados tabulares da analise

## Arquitetura

```
                    +-------------------+
                    |   React Frontend  |
                    |   localhost:5173   |
                    +--------+----------+
                             |
                        REST + WebSocket
                             |
                    +--------v----------+
                    |  FastAPI Backend   |
                    |   localhost:8000   |
                    +---+----------+----+
                        |          |
               +--------v--+  +---v----+
               | PostgreSQL |  | Redis  |
               |   :5432    |  | :6379  |
               +------------+  +---+----+
                                   |
                            +------v-------+
                            | Celery Worker|
                            +--+---+---+---+
                               |   |   |
                         +-----+   |   +------+
                         |         |          |
                      MAFFT   FastTree    IQ-TREE
                  (alinhamento) (preview) (filogenia)
```

### Pipeline de analise

```
Sequencias FASTA
       |
       v
    MAFFT ──────────> Alinhamento (.fasta)
       |
       +──> FastTree ──> Arvore preview (.nwk)
       |
       +──> IQ-TREE ───> Arvore final (.treefile)
       |    (ModelFinder + UFBoot + SH-aLRT)
       |
       +──> Conservacao ──> Regioes conservadas
            (identidade + Shannon entropy)
```

## API

### Endpoints principais

| Metodo | Rota | Descricao |
|--------|------|-----------|
| `GET` | `/api/health` | Health check basico |
| `GET` | `/api/health/deep` | Health check completo (DB, Redis, ferramentas) |
| `GET` | `/api/species/search?q=` | Buscar especies no NCBI |
| `GET` | `/api/sequences/{species_id}` | Listar sequencias de uma especie |
| `POST` | `/api/collections` | Criar colecao |
| `GET` | `/api/collections/{id}` | Detalhes da colecao |
| `POST` | `/api/collections/{id}/species` | Adicionar especie a colecao |
| `DELETE` | `/api/collections/{id}/species/{sid}` | Remover especie |
| `POST` | `/api/jobs` | Iniciar analise |
| `GET` | `/api/jobs/{id}` | Status do job |
| `WS` | `/api/jobs/{id}/ws` | Progresso em tempo real |
| `GET` | `/api/exports/fasta/{job_id}` | Exportar alinhamento FASTA |
| `GET` | `/api/exports/excel/{job_id}` | Exportar dados Excel |

### Health check

```bash
# Basico
curl http://localhost:8000/api/health

# Completo (verifica PostgreSQL, Redis, MAFFT, FastTree, IQ-TREE)
curl http://localhost:8000/api/health/deep
```

## Variaveis de ambiente

| Variavel | Descricao | Default |
|----------|-----------|---------|
| `DATABASE_URL` | PostgreSQL (asyncpg) | `postgresql+asyncpg://rainman:rainman_dev@localhost:5432/rainman` |
| `DATABASE_URL_SYNC` | PostgreSQL (psycopg2, para Celery) | `postgresql+psycopg2://rainman:rainman_dev@localhost:5432/rainman` |
| `REDIS_URL` | Redis (broker Celery + pub/sub) | `redis://localhost:6379/0` |
| `NCBI_EMAIL` | Email obrigatorio para API do NCBI | `dev@timelabs.com` |
| `NCBI_API_KEY` | API key do NCBI (aumenta rate limit de 3 para 10 req/s) | — |
| `MAFFT_BIN` | Caminho do binario MAFFT | `mafft` |
| `FASTTREE_BIN` | Caminho do binario FastTree | `FastTree` |
| `IQTREE_BIN` | Caminho do binario IQ-TREE | `iqtree2` |
| `IQTREE_THREADS` | Numero de threads para IQ-TREE | `4` |
| `WORK_DIR` | Diretorio para arquivos temporarios | `/tmp/gpf_work` |
| `ALLOWED_ORIGINS` | Origens CORS permitidas (separadas por virgula) | `http://localhost:5173,http://localhost:3000` |

## Testes

```bash
# Testes unitarios Python (35 testes)
cd backend
python -m pytest tests/ -v

# Type check TypeScript
cd frontend
npx tsc --noEmit

# Build de producao
cd frontend
npm run build
```

## Modelos do banco

| Modelo | Descricao |
|--------|-----------|
| `Species` | Especie com taxon_id do NCBI e nome cientifico |
| `Sequence` | Sequencia genetica (DNA/RNA/proteina) vinculada a especie |
| `Collection` | Colecao de especies para analise comparativa, com gene-alvo |
| `CollectionSpecies` | Vinculo especie+sequencia dentro de colecao (unique constraint) |
| `AnalysisJob` | Job de analise com status, progresso, resultados e metadados |

## Estrutura do projeto

```
gene-pattern-finder/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI app, CORS, health checks, middlewares
│   │   ├── config.py            # Settings via pydantic-settings (.env)
│   │   ├── database.py          # SQLAlchemy async engine
│   │   ├── models.py            # ORM models
│   │   ├── schemas.py           # Pydantic schemas
│   │   ├── gene_targets.py      # Mapeamento de genes-alvo
│   │   ├── routers/
│   │   │   ├── species.py       # Busca NCBI
│   │   │   ├── sequences.py     # Listagem de sequencias
│   │   │   ├── collections.py   # CRUD colecoes
│   │   │   ├── jobs.py          # Jobs + WebSocket
│   │   │   └── exports.py       # Exportacao FASTA/Excel/SVG
│   │   ├── services/
│   │   │   ├── ncbi.py          # Entrez API (search + fetch)
│   │   │   ├── mafft.py         # Alinhamento multiplo
│   │   │   ├── iqtree.py        # FastTree + IQ-TREE
│   │   │   └── conservation.py  # Regioes conservadas + Shannon entropy
│   │   ├── utils/
│   │   │   └── sequence.py      # Validacao DNA/RNA/proteina
│   │   └── worker/
│   │       ├── celery_app.py    # Config Celery + beat schedule
│   │       └── tasks.py         # Task run_analysis (pipeline)
│   ├── tests/                   # Testes unitarios (pytest)
│   ├── alembic/                 # Migracoes do banco
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── workspace/       # CollectionBuilder, JobProgress, SpeciesSearch
│   │   │   ├── results/         # Dendrogram, AlignmentViewer, ConservationMap
│   │   │   ├── layout/          # Header, Layout
│   │   │   └── ui/              # GlowButton, ScanLoader, SequenceText
│   │   ├── hooks/               # useJobProgress, useElapsedTime, useDebounce
│   │   └── lib/                 # api.ts, types.ts, download.ts, utils.ts
│   ├── package.json
│   └── vite.config.ts
├── docs/                        # Documentacao e relatorios
├── docker-compose.yml           # PostgreSQL + Redis
├── CONTRIBUTING.md
├── LICENSE                      # MIT
└── CLAUDE.md                    # Contexto para Claude Code
```

## Licenca

Este projeto esta licenciado sob a [MIT License](LICENSE).

## Versao atual

**v0.4.0**
