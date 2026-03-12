---
name: UX feedback — loading e busca em lote
description: Pesquisador precisa de feedback visual durante buscas lentas no NCBI e quer buscar múltiplas espécies de uma vez
type: feedback
---

1. Busca NCBI é lenta e não dá feedback — pesquisador não sabe se travou. Mostrar timer/progresso.
2. Buscar espécies uma por uma é tedioso — permitir busca em lote (colar vários nomes, buscar todas em paralelo).
3. Sequências listadas são confusas para leigos — mostrar tipo (gene, plasmídeo, genoma) e permitir filtro por gene.

**Why:** Enzo testou o fluxo e ficou preso esperando NCBI sem saber se estava funcionando. Ter que repetir 3x o processo de busca é fricção desnecessária.

**How to apply:** Sempre que houver chamada ao NCBI, mostrar timer com segundos decorridos. Para coleções, oferecer textarea para múltiplas espécies. Na lista de sequências, extrair info do título para mostrar badges.
