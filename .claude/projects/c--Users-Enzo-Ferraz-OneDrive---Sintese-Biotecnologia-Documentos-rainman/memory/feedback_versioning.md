---
name: Incrementar versão a cada atualização
description: Sempre incrementar número de versão no Header.tsx e main.py quando fizer mudanças no app
type: feedback
---

Incrementar versão a cada atualização no topo do app.

**Locais:**
- `frontend/src/components/layout/Header.tsx` — texto "vX.Y.Z" exibido no header
- `backend/app/main.py` — campo `version` do FastAPI

**Why:** Enzo quer rastrear visualmente qual versão está rodando.

**How to apply:** Ao finalizar qualquer conjunto de mudanças, incrementar patch (0.2.0 → 0.2.1). Para mudanças grandes, incrementar minor.
