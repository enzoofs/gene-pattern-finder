# Gene Pattern Finder

**TimeLabs** - Plataforma de Analise Comparativa de Sequencias Geneticas

Ferramenta web para pesquisadores realizarem analise filogenetica comparativa entre multiplas especies. Busca sequencias no NCBI, alinha com MAFFT, gera arvores filogeneticas com FastTree (preview) e IQ-TREE (definitiva com bootstrap), e detecta regioes conservadas.

## Stack

**Backend:** FastAPI + SQLAlchemy (async) + PostgreSQL + Celery + Redis
**Frontend:** React 18 + TypeScript + Vite + Tailwind CSS v4 + Framer Motion + D3.js
**Bioinformatica:** MAFFT (alinhamento) + FastTree (arvore rapida) + IQ-TREE (filogenia com bootstrap) + Biopython (NCBI Entrez)

## Requisitos

- Python 3.11+
- Node.js 18+
- Docker (para PostgreSQL e Redis)
- Ferramentas de bioinformatica (ver secao abaixo)

## Setup

### 1. Infraestrutura (PostgreSQL + Redis)

```bash
docker compose up -d
```

### 2. Backend

```bash
cd backend
pip install -r requirements.txt
cp .env.example .env  # editar com seus caminhos
```

Rodar migracao:
```bash
cd backend
alembic upgrade head
```

Iniciar API:
```bash
cd backend
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

Iniciar worker Celery (em outro terminal):
```bash
cd backend
python -m celery -A app.worker.celery_app worker --loglevel=info --pool=solo
```

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

Acesse: http://localhost:5173

### 4. Ferramentas de Bioinformatica

Baixe e coloque em `tools/` (gitignored):

| Ferramenta | Versao | Download |
|---|---|---|
| MAFFT | v7.526+ | https://mafft.cbrc.jp/alignment/software/ |
| FastTree | 2.1.11+ | http://www.microbesonline.org/fasttree/ |
| IQ-TREE | 2.3.6+ | http://www.iqtree.org/ |

Configure os caminhos no `.env`:

```env
MAFFT_BIN=C:\caminho\para\tools\mafft-win
FASTTREE_BIN=C:\caminho\para\tools\fasttree.exe
IQTREE_BIN=C:\caminho\para\tools\iqtree-2.3.6-Windows\bin\iqtree2.exe
WORK_DIR=C:\caminho\para\tools\work
```

No Linux/Mac, use os paths dos binarios instalados via package manager.

## Arquitetura

```
Pesquisador
    |
    v
[React Frontend :5173]
    |  /api proxy
    v
[FastAPI Backend :8000]
    |           |
    v           v
[PostgreSQL]  [Redis]
                |
                v
            [Celery Worker]
                |
    +-----------+-----------+
    |           |           |
  MAFFT     FastTree    IQ-TREE
(alinhamento) (preview)  (filogenia)
```

### Pipeline de Analise

1. **Busca NCBI** - Pesquisador busca especies por nome, seleciona sequencias
2. **Colecao** - Monta colecao com 4+ especies (1 sequencia por especie)
3. **Alinhamento (MAFFT)** - Alinha multiplas sequencias
4. **Arvore Preview (FastTree)** - Gera arvore rapida para visualizacao imediata
5. **Arvore Final (IQ-TREE)** - ModelFinder + ultrafast bootstrap (1000 replicatas)
6. **Conservacao** - Detecta regioes conservadas por identidade posicional
7. **Resultados** - Dendrograma interativo (D3.js) + mapa de conservacao

### Modelos do Banco

- `Species` - Especie com taxon_id do NCBI
- `Sequence` - Sequencia genetica (DNA/RNA/protein) vinculada a especie
- `Collection` - Colecao de especies para analise comparativa
- `CollectionSpecies` - Vinculo especie+sequencia dentro de uma colecao
- `AnalysisJob` - Job de analise com status, progresso, e resultados

### Progresso em Tempo Real

O Celery worker publica progresso via Redis pub/sub. O frontend conecta via WebSocket (`/api/jobs/{id}/ws`) com fallback para polling HTTP.

## Variaveis de Ambiente

| Variavel | Descricao | Default |
|---|---|---|
| `DATABASE_URL` | PostgreSQL (async) | `postgresql+asyncpg://rainman:rainman_dev@localhost:5432/rainman` |
| `DATABASE_URL_SYNC` | PostgreSQL (sync, Celery) | `postgresql+psycopg2://rainman:rainman_dev@localhost:5432/rainman` |
| `REDIS_URL` | Redis para Celery e pub/sub | `redis://localhost:6379/0` |
| `NCBI_EMAIL` | Email para API do NCBI | `dev@timelabs.com` |
| `NCBI_API_KEY` | API key do NCBI (opcional, aumenta rate limit) | |
| `MAFFT_BIN` | Caminho do MAFFT (diretorio no Windows) | `mafft` |
| `FASTTREE_BIN` | Caminho do FastTree | `FastTree` |
| `IQTREE_BIN` | Caminho do IQ-TREE | `iqtree2` |
| `WORK_DIR` | Diretorio de trabalho para arquivos temporarios | `/tmp/gpf_work` |

## Versao Atual

**v0.2.2**
