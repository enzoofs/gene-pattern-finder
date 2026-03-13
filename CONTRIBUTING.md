# Contribuindo com o Gene Pattern Finder

Obrigado pelo interesse em contribuir! Este guia vai te ajudar a configurar o ambiente e entender o fluxo de trabalho.

## Pre-requisitos

- Python 3.11+
- Node.js 18+
- Docker e Docker Compose
- Git

## Setup do ambiente de desenvolvimento

```bash
# 1. Clone o repositorio
git clone https://github.com/enzoofs/gene-pattern-finder.git
cd gene-pattern-finder

# 2. Suba PostgreSQL e Redis
docker compose up -d db redis

# 3. Configure o backend
cd backend
python -m venv .venv
source .venv/bin/activate  # Linux/Mac
# .venv\Scripts\activate   # Windows
pip install -r requirements.txt
cp .env.example .env
alembic upgrade head

# 4. Configure o frontend
cd ../frontend
npm install
```

## Rodando o projeto

Voce precisa de 3 terminais:

```bash
# Terminal 1 — Backend
cd backend && uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

# Terminal 2 — Celery Worker
cd backend && python -m celery -A app.worker.celery_app worker --loglevel=info --pool=solo

# Terminal 3 — Frontend
cd frontend && npm run dev
```

## Rodando testes

```bash
# Testes Python
cd backend
python -m pytest tests/ -v

# Type check TypeScript
cd frontend
npx tsc --noEmit
```

## Fluxo de contribuicao

1. Crie uma branch a partir de `main`: `git checkout -b feat/minha-feature`
2. Faca suas alteracoes
3. Rode os testes e verifique que tudo passa
4. Commit com mensagem descritiva: `git commit -m "feat: descricao da mudanca"`
5. Abra um Pull Request para `main`

## Convencoes de commit

Usamos prefixos nos commits:

| Prefixo | Uso |
|---------|-----|
| `feat:` | Nova funcionalidade |
| `fix:` | Correcao de bug |
| `docs:` | Documentacao |
| `refactor:` | Refatoracao sem mudanca funcional |
| `test:` | Adicao ou correcao de testes |
| `chore:` | Tarefas de manutencao |

## Estrutura do projeto

```
backend/          # FastAPI + SQLAlchemy + Celery
  app/
    routers/      # Endpoints da API
    services/     # Logica de bioinformatica (MAFFT, IQ-TREE, etc.)
    worker/       # Tasks async do Celery
    utils/        # Utilitarios (validacao de sequencias, etc.)
  tests/          # Testes unitarios
frontend/         # React + TypeScript + Vite
  src/
    components/   # Componentes React
    hooks/        # Custom hooks
    lib/          # API client, tipos, utilitarios
```

## Ferramentas de bioinformatica

Para rodar o pipeline completo localmente, voce precisa instalar:

- [MAFFT](https://mafft.cbrc.jp/alignment/software/) v7.526+
- [FastTree](http://www.microbesonline.org/fasttree/) 2.1.11+
- [IQ-TREE](http://www.iqtree.org/) 2.3.6+

Coloque os binarios em `tools/` (gitignored) e configure os caminhos no `.env`.

## Reportando bugs

Abra uma issue no GitHub com:
- Descricao do problema
- Passos para reproduzir
- Comportamento esperado vs obtido
- Logs relevantes (se houver)
