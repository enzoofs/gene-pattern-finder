# Gene Pattern Finder — Relatório de Análise Técnica e Científica

**Versão:** 0.3.0
**Data:** 2026-03-13
**Autor:** Análise automatizada (PhD Biotecnologia/Bioinformática)
**Escopo:** Pipeline bioinformático, UX para pesquisadores, redundâncias e melhorias

---

## Sumário Executivo

O Gene Pattern Finder implementa um pipeline filogenético sólido (NCBI → MAFFT → FastTree → IQ-TREE → conservação) com uma interface moderna e funcional. A arquitetura técnica (FastAPI + Celery + React) é adequada para o escopo. No entanto, existem lacunas científicas importantes — especialmente na validação de sequências, na detecção de conservação, e na ausência de exportações fundamentais para publicação científica (Newick, PDF). Abaixo estão 18 problemas identificados, organizados por categoria e severidade.

---

## 1. Lógica Biomédica / Bioinformática

### [BIOINFORMÁTICA] Ausência de validação de tipo de sequência no pipeline

**Severidade:** Alta
**Descrição:** O arquivo `utils/sequence.py` define funções `validate_dna()`, `validate_rna()` e `validate_protein()`, mas elas **nunca são chamadas** no pipeline de análise. O worker em `tasks.py` confia cegamente que as sequências vindas do NCBI são do tipo declarado na coleção. Se o usuário adicionar manualmente sequências via endpoint `/collections/{id}/species` (que aceita qualquer `sequence_id` já no banco), pode misturar DNA com proteína na mesma coleção. O MAFFT vai alinhar sem erros aparentes, mas o IQ-TREE vai aplicar modelos de substituição completamente errados (modelos de nucleotídeo em proteínas ou vice-versa), gerando árvores biologicamente sem sentido.

**Impacto:** Resultados filogenéticos incorretos sem nenhum aviso ao pesquisador. Artigos baseados nesses dados seriam cientificamente inválidos.

**Sugestão com código:**
```python
# backend/app/worker/tasks.py — adicionar após carregar as sequências (linha ~60)

from app.utils.sequence import validate_dna, validate_rna, validate_protein

# Validar consistência de tipo de sequência
validators = {
    SeqType.dna: validate_dna,
    SeqType.rna: validate_rna,
    SeqType.protein: validate_protein,
}

expected_type = collection.seq_type
validator = validators.get(expected_type)

if validator:
    for seq in sequences:
        clean = seq.sequence.replace("-", "").replace(".", "")
        if not validator(clean):
            _update_job(db, job_uuid,
                status=JobStatus.failed,
                error_msg=f"Sequência {seq.accession} não é {expected_type.value} válida. "
                          f"Verifique se todas as sequências são do mesmo tipo.")
            _publish_progress(job_id, -1, "Tipo de sequência incompatível")
            return
```

---

### [BIOINFORMÁTICA] Detecção de conservação limitada a identidade posicional simples

**Severidade:** Média
**Descrição:** O algoritmo em `conservation.py` calcula conservação como a frequência do caractere mais comum em cada posição do alinhamento. Este método é a abordagem mais básica possível e ignora:

1. **Propriedades bioquímicas:** Substituições conservativas (e.g., Leucina→Isoleucina em proteínas) são tratadas como divergência total, quando na verdade preservam função.
2. **Matrizes de substituição:** Não usa BLOSUM62 (proteínas) ou scoring ponderado para nucleotídeos.
3. **Gaps informativos:** Gaps são simplesmente ignorados (`total_non_gap_chars`), mas gaps sistemáticos em regiões específicas podem indicar inserções/deleções funcionalmente relevantes.
4. **Entropia de Shannon:** Método padrão na literatura para quantificar variabilidade posicional, mais informativo que simples identidade.

**Impacto:** Pesquisadores podem subestimar regiões conservadas em análises de proteínas (onde substituições conservativas são comuns) ou perder padrões de indels funcionais.

**Sugestão com código:**
```python
# backend/app/services/conservation.py — adicionar método de entropia de Shannon

import math
from collections import Counter

def shannon_entropy(column: list[str]) -> float:
    """Calcula entropia de Shannon para uma coluna do alinhamento.

    H = -Σ(pi * log2(pi))
    Quanto menor a entropia, mais conservada a posição.
    H = 0 → totalmente conservada
    H = log2(n) → máxima variabilidade
    """
    non_gap = [c for c in column if c not in ('-', '.')]
    if not non_gap:
        return 0.0

    counts = Counter(non_gap)
    total = len(non_gap)
    entropy = 0.0

    for count in counts.values():
        p = count / total
        if p > 0:
            entropy -= p * math.log2(p)

    return entropy


def detect_conserved_regions(aligned_fasta: str, threshold: float = 0.9,
                              min_length: int = 5,
                              method: str = "identity") -> dict:
    """
    method: "identity" (original) ou "entropy" (Shannon)
    """
    alignment = AlignIO.read(StringIO(aligned_fasta), "fasta")
    n_seqs = len(alignment)
    aln_len = alignment.get_alignment_length()

    position_identity = []
    position_entropy = []

    for i in range(aln_len):
        column = [str(rec.seq[i]).upper() for rec in alignment]
        non_gap = [c for c in column if c not in ('-', '.')]

        if not non_gap:
            position_identity.append(0.0)
            position_entropy.append(0.0)
            continue

        counts = Counter(non_gap)
        most_common = counts.most_common(1)[0][1]
        identity = most_common / len(non_gap)
        position_identity.append(round(identity, 4))
        position_entropy.append(round(shannon_entropy(column), 4))

    # Usar identidade ou entropia para definir regiões
    if method == "entropy":
        # Entropia baixa = conservado; normalizar para 0-1 onde 1 = conservado
        max_entropy = math.log2(4)  # DNA: 4 bases; proteína seria log2(20)
        scores = [1.0 - (e / max_entropy) if max_entropy > 0 else 1.0
                  for e in position_entropy]
    else:
        scores = position_identity

    # ... resto da lógica de detecção de regiões usando `scores` ...

    result = {
        "position_identity": position_identity,
        "position_entropy": position_entropy,  # NOVO
        "regions": regions,
        "total_positions": aln_len,
        "total_conserved": total_conserved,
        "conservation_pct": round(100 * total_conserved / aln_len, 2) if aln_len else 0,
        "threshold": threshold,
        "method": method,
        "n_sequences": n_seqs,
    }
    return result
```

---

### [BIOINFORMÁTICA] Parâmetros do IQ-TREE são adequados, mas falta suporte a modelos particionados

**Severidade:** Baixa
**Descrição:** Os parâmetros atuais — `-m MFP` (ModelFinder Plus) com `-bb 1000` (ultrafast bootstrap) — são a configuração padrão recomendada pela documentação oficial do IQ-TREE e amplamente aceita em publicações. No entanto, para análises multi-gene (que o sistema pode suportar no futuro), seria necessário suporte a **modelos particionados** (`-p partition_file`), onde cada gene tem seu próprio modelo de substituição.

Além disso, o IQ-TREE oferece o parâmetro `-alrt 1000` (SH-aLRT) como complemento ao ultrafast bootstrap. A combinação `-bb 1000 -alrt 1000` é considerada best practice para avaliação de suporte de ramos, pois os dois métodos capturam aspectos diferentes da incerteza.

**Impacto:** Para o caso de uso atual (gene único por coleção), não há problema prático. Mas pesquisadores mais exigentes podem preferir a dupla validação de suporte.

**Sugestão com código:**
```python
# backend/app/services/iqtree.py — adicionar SH-aLRT

if n_seqs >= 4:
    cmd.extend(["-bb", "1000", "-alrt", "1000"])
    # Resultado na Newick: (A:0.1,B:0.2)95/87:0.3
    # Onde 95 = UFBoot, 87 = SH-aLRT
```

---

### [BIOINFORMÁTICA] Determinação nucleotídeo/proteína usa apenas a primeira sequência

**Severidade:** Média
**Descrição:** Em `tasks.py` linha ~70:
```python
is_nucleotide = sequences[0].seq_type in (SeqType.dna, SeqType.rna) if sequences else True
```
Se por alguma razão a primeira sequência tiver tipo incorreto (bug no banco, importação manual), todo o pipeline usará os modelos errados. Além disso, o fallback `True` quando `sequences` está vazio significa que um alinhamento vazio seria processado como nucleotídeo.

**Impacto:** Edge case, mas com consequências graves se ocorrer — modelos completamente errados.

**Sugestão com código:**
```python
# backend/app/worker/tasks.py — verificar consistência de todas as sequências

seq_types = set(s.seq_type for s in sequences)
if len(seq_types) > 1:
    _update_job(db, job_uuid,
        status=JobStatus.failed,
        error_msg=f"Coleção contém tipos mistos de sequência: {', '.join(t.value for t in seq_types)}. "
                  f"Todas devem ser do mesmo tipo.")
    _publish_progress(job_id, -1, "Tipos de sequência incompatíveis")
    return

is_nucleotide = sequences[0].seq_type in (SeqType.dna, SeqType.rna)
```

---

### [BIOINFORMÁTICA] Mínimo de 4 espécies é justificável, mas a mensagem de erro é imprecisa

**Severidade:** Baixa
**Descrição:** O mínimo de 4 sequências é tecnicamente correto — o IQ-TREE ultrafast bootstrap requer pelo menos 4 taxa para gerar topologias alternativas significativas. Porém, a mensagem de erro diz "Need at least 4 sequences for bootstrap analysis", o que pode confundir o usuário: ele pode pensar que sem bootstrap a análise funcionaria com 3 sequências. Na verdade, árvores com 3 taxa têm topologia única (sem ramificação interna informativa), tornando a análise filogenética trivial.

Uma alternativa seria permitir 3 taxa sem bootstrap (árvore sem suporte estatístico), útil como visualização básica, mas cientificamente limitada.

**Impacto:** Frustração do pesquisador que tem apenas 3 espécies e recebe um erro sem explicação biológica.

**Sugestão com código:**
```python
# backend/app/worker/tasks.py — melhorar mensagem e permitir 3 taxa sem bootstrap

if len(links) < 3:
    _update_job(db, job_uuid,
        status=JobStatus.failed,
        error_msg="Mínimo de 3 espécies necessário. Com 3 espécies, a árvore é gerada "
                  "sem suporte de bootstrap. Para análise com bootstrap, adicione pelo "
                  "menos 4 espécies.")
    return

# Mais tarde, no IQ-TREE:
# O check de n_seqs >= 4 para bootstrap já existe e funciona corretamente
```

---

### [BIOINFORMÁTICA] Ausência de outgroup explícito na análise filogenética

**Severidade:** Média
**Descrição:** O pipeline não oferece opção para o pesquisador designar um **outgroup** (grupo externo) para enraizar a árvore. Árvores sem raiz (unrooted) são válidas, mas dificulam a interpretação de relações evolutivas. O IQ-TREE suporta enraizamento via `-o taxon_name`. Sem outgroup, o midpoint rooting (padrão do IQ-TREE) pode posicionar a raiz incorretamente quando as taxas de evolução são heterogêneas.

**Impacto:** Pesquisadores experientes vão querer especificar outgroup. Iniciantes podem interpretar incorretamente a topologia de uma árvore não enraizada.

**Sugestão com código:**
```python
# backend/app/schemas.py — adicionar outgroup ao job

class JobCreate(BaseModel):
    collection_id: UUID
    outgroup_accession: str | None = None  # accession da sequência outgroup


# backend/app/services/iqtree.py — usar outgroup se fornecido

def run_iqtree(aligned_fasta: str, is_nucleotide: bool = True,
               outgroup: str | None = None) -> dict:
    cmd = [settings.iqtree_bin, "-s", aligned_fasta, "-m", "MFP", "-nt", "AUTO",
           "-pre", prefix, "--quiet"]

    if outgroup:
        cmd.extend(["-o", outgroup])

    # ... resto do código
```

---

### [BIOINFORMÁTICA] Filtro de tamanho de sequência pode excluir genes legítimos

**Severidade:** Baixa
**Descrição:** Em `ncbi.py`, o filtro de tamanho para nucleotídeos é `100:10000[SLEN]` e para proteínas `50:5000[SLEN]`. Esses intervalos cobrem a maioria dos genes individuais, mas podem excluir:
- **Genes mitocondriais curtos** (<100 bp, e.g., tRNAs ~70 bp)
- **Genes de histonas** muito curtos em proteínas
- **Sequências genômicas longas** que o pesquisador pode querer incluir por conter o gene de interesse

O filtro `refseq[filter]` com fallback é uma boa prática.

**Impacto:** Baixo para o caso de uso principal (genes como COX1, 16S, rbcL). Pode frustrar pesquisadores buscando genes atípicos.

**Sugestão com código:**
```python
# backend/app/services/ncbi.py — tornar limites configuráveis

def fetch_sequences(taxon_id: int, seq_type: SeqType, max_results: int = 50,
                    gene: str = "", min_length: int | None = None,
                    max_length: int | None = None) -> list[dict]:
    if seq_type == SeqType.protein:
        min_len = min_length or 50
        max_len = max_length or 5000
    else:
        min_len = min_length or 100
        max_len = max_length or 10000

    size_filter = f"{min_len}:{max_len}[SLEN]"
    # ... usar size_filter na query
```

---

## 2. Experiência do Usuário (UX)

### [UX] Falta exportação Newick — formato essencial para pesquisadores

**Severidade:** Alta
**Descrição:** O sistema gera árvores em formato Newick (armazenadas em `job.tree` e `job.preview_tree`) mas **não oferece download direto do arquivo Newick**. Para pesquisadores, o Newick é o formato universal de árvores filogenéticas — é importado em softwares como FigTree, iTOL, MEGA, e é exigido como material suplementar em publicações. Atualmente só é possível exportar FASTA (alinhamento), SVG (imagem da árvore), e Excel (dados tabulares).

**Impacto:** Pesquisadores não conseguem reutilizar a árvore em outros softwares ou incluí-la em publicações no formato padrão da área.

**Sugestão com código:**
```tsx
// frontend/src/components/workspace/AnalysisWorkspace.tsx — ExportBar

// Adicionar botão de exportação Newick junto aos existentes
<GlowButton
  variant="ghost"
  size="sm"
  onClick={() => {
    if (jobResults?.tree) {
      downloadBlob(jobResults.tree, `arvore_${jobId}.nwk`, "text/plain");
    }
  }}
  disabled={!jobResults?.tree}
>
  <Download className="w-3.5 h-3.5" />
  Newick
</GlowButton>
```

---

### [UX] Feedback de progresso mapeia percentuais a estados de forma rígida

**Severidade:** Média
**Descrição:** O hook `useJobProgress.ts` infere o estado do pipeline a partir do percentual de progresso usando faixas fixas:
- 0-10% → queued
- 10-30% → aligning
- 30-50% → preview_tree
- 50-75% → full_tree
- 75-100% → conservation

Porém, o backend publica o **status real** junto com o percentual via WebSocket. O frontend ignora o campo `status` do job e recalcula a partir do percentual, o que pode causar dessincronização. Por exemplo, se o MAFFT terminar rápido (10%) mas o progresso já estiver em 40%, o frontend mostra "preview_tree" quando na verdade ainda está alinhando.

**Impacto:** Confusão visual — o pesquisador vê etapas que não correspondem ao que está realmente acontecendo.

**Sugestão com código:**
```typescript
// frontend/src/hooks/useJobProgress.ts — usar status real do backend

// O WebSocket já envia { pct, msg }
// Sugestão: backend enviar também { pct, msg, status }
// E o frontend usar diretamente:

// backend/app/worker/tasks.py — incluir status no publish
def _publish_progress(job_id: str, pct: int, msg: str, status: str = ""):
    data = json.dumps({"pct": pct, "msg": msg, "status": status})
    r.publish(f"job:{job_id}", data)

// frontend — usar status diretamente
const onMessage = (data: { pct: number; msg: string; status?: string }) => {
  setProgress(data.pct);
  setMessage(data.msg);
  if (data.status) {
    setStatus(data.status);  // usar direto ao invés de inferir do percentual
  }
};
```

---

### [UX] Ausência de exportação PNG/PDF para publicação

**Severidade:** Média
**Descrição:** A exportação SVG é útil para edição em softwares vetoriais (Illustrator, Inkscape), mas a maioria dos pesquisadores precisa de **PNG** (para apresentações e Word) ou **PDF** (para submissão de artigos). Atualmente o pesquisador precisa abrir o SVG em outro programa e converter manualmente.

**Impacto:** Fricção no workflow de publicação — etapa extra desnecessária para um público que geralmente não domina ferramentas de design.

**Sugestão com código:**
```tsx
// frontend/src/components/workspace/AnalysisWorkspace.tsx — exportação PNG

const exportPng = () => {
  const svgString = exportSvgRef.current?.();
  if (!svgString) return;

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  const img = new Image();

  // Escala 2x para alta resolução (300 DPI equivalente)
  const scaleFactor = 2;

  img.onload = () => {
    canvas.width = img.width * scaleFactor;
    canvas.height = img.height * scaleFactor;

    if (ctx) {
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.scale(scaleFactor, scaleFactor);
      ctx.drawImage(img, 0, 0);
    }

    canvas.toBlob((blob) => {
      if (blob) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `arvore_${jobId}.png`;
        a.click();
        URL.revokeObjectURL(url);
      }
    }, "image/png");
  };

  const blob = new Blob([svgString], { type: "image/svg+xml" });
  img.src = URL.createObjectURL(blob);
};
```

---

### [UX] Dendrograma não exibe valores de bootstrap nos nós

**Severidade:** Alta
**Descrição:** O IQ-TREE embute valores de bootstrap na árvore Newick (e.g., `(A:0.1,B:0.2)95:0.3` onde 95 é o suporte). O parser Newick em `Dendrogram.tsx` **parseia corretamente** esses labels internos, mas eles são renderizados como texto genérico junto ao nó, sem destaque visual ou interpretação. Para um pesquisador, os valores de bootstrap são a informação mais importante da árvore — eles indicam a confiança estatística de cada agrupamento.

Na prática: os labels internos são renderizados, mas sem formatação especial (cor, tamanho, posição) que os diferencie dos nomes das espécies. Além disso, `bootstrap_data` no backend é sempre `None` (nunca populado).

**Impacto:** Pesquisadores não conseguem avaliar a confiabilidade dos clados, o que é essencial para qualquer interpretação filogenética.

**Sugestão com código:**
```tsx
// frontend/src/components/results/Dendrogram.tsx
// Na renderização de nós internos, destacar valores de bootstrap

// Ao renderizar labels de nós internos (não-folhas):
nodeEnter.filter(d => !d.data.children || d.data.children.length === 0 ? false : true)
  .append("text")
  .attr("class", "bootstrap-label")
  .attr("dy", "-8px")
  .attr("text-anchor", "middle")
  .attr("font-size", "9px")
  .attr("fill", d => {
    const val = parseFloat(d.data.name || "0");
    if (isNaN(val)) return "transparent";
    // Colorir por nível de suporte
    if (val >= 95) return "#10B981";  // verde — forte
    if (val >= 70) return "#F59E0B";  // amarelo — moderado
    return "#EF4444";                  // vermelho — fraco
  })
  .text(d => {
    const val = parseFloat(d.data.name || "");
    return isNaN(val) ? "" : val.toFixed(0);
  });
```

---

### [UX] Fluxo de busca em lote não mostra progresso individual claro

**Severidade:** Baixa
**Descrição:** No modo batch do `CollectionBuilder`, o usuário cola uma lista de espécies e o sistema processa sequencialmente. O status por item (pending → loading → found → not_found → error) é exibido, mas não há indicação global de progresso (e.g., "3/10 espécies processadas") nem estimativa de tempo restante.

**Impacto:** Com listas longas (20+ espécies), o pesquisador não sabe quanto tempo falta e pode achar que o sistema travou.

**Sugestão com código:**
```tsx
// frontend/src/components/workspace/CollectionBuilder.tsx
// Adicionar barra de progresso no modo batch

// No JSX, acima da lista de resultados batch:
{isBatchMode && batchItems.length > 0 && (
  <div className="px-3 py-2 border-b border-border">
    <div className="flex justify-between text-xs text-text-muted mb-1">
      <span>
        {batchItems.filter(i => i.status !== "pending").length}/{batchItems.length} processadas
      </span>
      <span>
        {batchItems.filter(i => i.status === "found").length} encontradas
      </span>
    </div>
    <div className="h-1 bg-panel rounded-full overflow-hidden">
      <div
        className="h-full bg-cyan transition-all duration-300"
        style={{
          width: `${(batchItems.filter(i => i.status !== "pending").length / batchItems.length) * 100}%`
        }}
      />
    </div>
  </div>
)}
```

---

### [UX] Visualização do alinhamento não indica regiões conservadas

**Severidade:** Baixa
**Descrição:** O `AlignmentViewer` e o `ConservationMap` são componentes separados em abas diferentes. O pesquisador precisa alternar entre abas para correlacionar regiões conservadas com o alinhamento. Idealmente, as regiões conservadas deveriam ser sobrepostas no viewer de alinhamento (como uma faixa colorida acima ou abaixo).

**Impacto:** Inconveniência na análise — o pesquisador perde contexto ao alternar abas.

**Sugestão com código:**
```tsx
// frontend/src/components/results/AlignmentViewer.tsx
// Adicionar faixa de conservação acima do alinhamento

// Receber conservation como prop opcional
interface Props {
  alignmentFasta: string;
  conservation?: { position_identity: number[] } | null;
}

// No canvas, antes de desenhar sequências, desenhar faixa de conservação:
if (conservation?.position_identity) {
  const barHeight = 12;
  ctx.fillStyle = "#1E293B";
  ctx.fillRect(labelWidth, 0, canvas.width - labelWidth, barHeight);

  conservation.position_identity.forEach((val, i) => {
    const x = labelWidth + i * charWidth - scrollX;
    if (x < labelWidth || x > canvas.width) return;

    // Gradiente vermelho → amarelo → ciano
    const r = val < 0.5 ? 239 : Math.round(239 - (val - 0.5) * 2 * (239 - 6));
    const g = val < 0.5 ? Math.round(68 + val * 2 * (179 - 68)) : Math.round(179 - (val - 0.5) * 2 * (179 - 182));
    const b = val < 0.5 ? Math.round(68 + val * 2 * (8 - 68)) : Math.round(8 + (val - 0.5) * 2 * (212 - 8));

    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(x, 0, charWidth, barHeight);
  });
}
```

---

## 3. Funções Desnecessárias ou Redundantes

### [REDUNDÂNCIA] SequencePanel.tsx não é utilizado

**Severidade:** Baixa
**Descrição:** O componente `SequencePanel.tsx` em `components/workspace/` é um componente completo e funcional, mas **não é importado em nenhum lugar** do projeto. Toda a funcionalidade de exibição e seleção de sequências foi incorporada diretamente no `CollectionBuilder.tsx`.

**Impacto:** Código morto que aumenta o tamanho do bundle e confunde desenvolvedores.

**Sugestão com código:**
```bash
# Remover o arquivo não utilizado
rm frontend/src/components/workspace/SequencePanel.tsx
```

---

### [REDUNDÂNCIA] FastTree e IQ-TREE compartilham lógica de execução de subprocess

**Severidade:** Baixa
**Descrição:** Ambas as funções `run_fasttree()` e `run_iqtree()` em `iqtree.py` implementam padrões idênticos: escrita de arquivo temporário, execução de subprocess com timeout, captura de stdout/stderr, tratamento de erros, e limpeza de diretório. Esse padrão poderia ser abstraído em um helper comum sem over-engineering.

**Impacto:** Duplicação de ~30 linhas. Não é crítico, mas facilita manutenção.

**Sugestão com código:**
```python
# backend/app/services/iqtree.py — extrair helper comum

import subprocess
import tempfile
from pathlib import Path

def _run_external_tool(cmd: list[str], input_file: str | None = None,
                        timeout: int = 3600, capture_stdout: bool = False) -> str:
    """Executa ferramenta externa com tratamento de erros padronizado."""
    result = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        timeout=timeout,
    )

    if result.returncode != 0:
        stderr_preview = (result.stderr or "")[:500]
        raise RuntimeError(
            f"Comando falhou (code {result.returncode}): {' '.join(cmd[:2])}...\n"
            f"Stderr: {stderr_preview}"
        )

    return result.stdout if capture_stdout else ""


def run_fasttree(aligned_fasta: str, is_nucleotide: bool = True) -> str:
    cmd = [settings.fasttree_bin]
    if is_nucleotide:
        cmd.append("-nt")
    cmd.append(aligned_fasta)

    return _run_external_tool(cmd, timeout=120, capture_stdout=True)
```

---

### [REDUNDÂNCIA] bootstrap_data no modelo é sempre None

**Severidade:** Baixa
**Descrição:** O campo `AnalysisJob.bootstrap_data` (JSON) existe no modelo, no schema, e é retornado pela API, mas **nunca é populado**. Os valores de bootstrap ficam embutidos na string Newick do campo `tree`. O campo ocupa espaço no banco e na resposta da API sem utilidade.

**Impacto:** Poluição da API e confusão para consumidores que esperam encontrar dados de bootstrap nesse campo.

**Sugestão com código:**
```python
# Opção A: Remover o campo (preferível se não houver planos de uso)
# Criar migração Alembic para remover bootstrap_data

# Opção B: Popular o campo parseando a Newick (mais útil)
# backend/app/services/iqtree.py — após ler o treefile

import re

def _extract_bootstrap_values(newick: str) -> list[dict]:
    """Extrai valores de bootstrap da string Newick do IQ-TREE."""
    # Pattern: )valor: onde valor é o suporte do nó interno
    pattern = r'\)(\d+(?:\.\d+)?(?:/\d+(?:\.\d+)?)?):'
    matches = re.findall(pattern, newick)

    values = []
    for match in matches:
        parts = match.split("/")
        entry = {"ufboot": float(parts[0])}
        if len(parts) > 1:
            entry["sh_alrt"] = float(parts[1])
        values.append(entry)

    return values

# No run_iqtree, após ler treefile:
bootstrap_values = _extract_bootstrap_values(newick)
return {
    "newick": newick,
    "model": model,
    "bootstrap_data": bootstrap_values,  # Agora populado
}
```

---

### [REDUNDÂNCIA] Dependência scipy instalada mas potencialmente subutilizada

**Severidade:** Baixa
**Descrição:** `scipy==1.15.1` está no `requirements.txt` mas não aparece importada diretamente no código do backend. Pode estar sendo usada indiretamente por Biopython ou NumPy, mas se não for necessária, é uma dependência pesada (~40MB) que pode ser removida.

**Impacto:** Aumento no tamanho da imagem Docker e tempo de instalação.

**Sugestão com código:**
```bash
# Verificar se scipy é realmente usada
cd backend && grep -r "scipy" app/ --include="*.py"
# Se não houver resultados diretos, testar remoção:
# pip uninstall scipy && python -c "from app.main import app"
```

---

## 4. Melhorias de Infraestrutura e Robustez

### [INFRA] WebSocket não tem mecanismo de reconexão automática

**Severidade:** Média
**Descrição:** O hook `useJobProgress.ts` tenta WebSocket e cai para polling se falhar, mas **não tenta reconectar o WebSocket** se a conexão cair durante a análise (e.g., instabilidade de rede momentânea). Uma vez no modo polling, não retorna ao WebSocket. Considerando que análises IQ-TREE podem levar 10+ minutos, desconexões são prováveis.

**Impacto:** Perda de atualizações em tempo real — o fallback polling a cada 3s é funcional mas menos responsivo.

**Sugestão com código:**
```typescript
// frontend/src/hooks/useJobProgress.ts — adicionar reconexão

const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_DELAY_MS = 2000;

let reconnectAttempts = 0;

const connectWs = () => {
  const ws = connectJobProgress(jobId, onMessage);

  ws.onclose = (event) => {
    if (!isComplete && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      reconnectAttempts++;
      console.log(`WebSocket fechou, tentando reconexão ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}...`);
      setTimeout(connectWs, RECONNECT_DELAY_MS * reconnectAttempts);
    } else if (!isComplete) {
      console.log("WebSocket: máximo de tentativas atingido, usando polling");
      startPolling();
    }
  };

  ws.onopen = () => {
    reconnectAttempts = 0;  // Reset no sucesso
  };

  return ws;
};
```

---

### [INFRA] Limpeza de arquivos temporários não é garantida em caso de crash

**Severidade:** Média
**Descrição:** O pipeline cria arquivos em `WORK_DIR` (`/tmp/gpf_work`) durante a análise. Se o worker Celery crashar (OOM, kill signal, etc.), os arquivos temporários ficam órfãos. Não há mecanismo de limpeza periódica nem no startup do worker.

**Impacto:** Acúmulo de arquivos em disco, especialmente com alinhamentos grandes (10MB+ por job).

**Sugestão com código:**
```python
# backend/app/worker/tasks.py — usar context manager para limpeza

import shutil
from contextlib import contextmanager

@contextmanager
def job_workdir(job_id: str):
    """Cria diretório de trabalho e garante limpeza."""
    work_path = Path(settings.work_dir) / str(job_id)
    work_path.mkdir(parents=True, exist_ok=True)
    try:
        yield work_path
    finally:
        shutil.rmtree(work_path, ignore_errors=True)

# Uso no run_analysis:
@celery_app.task(bind=True)
def run_analysis(self, job_id: str):
    with job_workdir(job_id) as work_dir:
        input_fasta = str(work_dir / "input.fasta")
        aligned_fasta = str(work_dir / "aligned.fasta")
        # ... pipeline usa work_dir ...
    # Limpeza automática ao sair do context manager
```

---

### [INFRA] Ausência de rate limiting no endpoint de busca

**Severidade:** Média
**Descrição:** O endpoint `GET /api/species/search` faz chamadas diretas ao NCBI Entrez a cada requisição. Se um usuário (ou bot) fizer muitas buscas rápidas, pode esgotar o rate limit do NCBI (3 req/s sem API key, 10 req/s com key), bloqueando o IP do servidor para todos os usuários.

**Impacto:** Bloqueio temporário do NCBI afeta todos os usuários da instância.

**Sugestão com código:**
```python
# backend/app/routers/species.py — adicionar rate limiting simples com Redis

from datetime import datetime
import redis

r = redis.from_url(settings.redis_url)

async def check_ncbi_rate_limit(key: str = "ncbi_requests", max_per_second: int = 3):
    """Limita chamadas ao NCBI usando contador Redis com TTL."""
    current = r.get(key)
    if current and int(current) >= max_per_second:
        raise HTTPException(
            status_code=429,
            detail="Muitas buscas simultâneas. Aguarde 1 segundo e tente novamente."
        )
    pipe = r.pipeline()
    pipe.incr(key)
    pipe.expire(key, 1)  # TTL de 1 segundo
    pipe.execute()
```

---

## Resumo por Severidade

| Severidade | Qtd | Itens |
|:---|:---:|:---|
| **Alta** | 3 | Validação de tipo de sequência, exportação Newick, exibição de bootstrap |
| **Média** | 7 | Conservação limitada, tipo da 1ª sequência, outgroup, progresso WebSocket, PNG/PDF, reconexão WS, rate limiting NCBI, limpeza de temp files |
| **Baixa** | 8 | SH-aLRT, mínimo 3 taxa, filtro de tamanho, batch progress, alinhamento+conservação, SequencePanel morto, abstração subprocess, bootstrap_data/scipy |

---

## Prioridade de Implementação Sugerida

1. **Validação de sequências no pipeline** — previne resultados incorretos
2. **Exibição de valores de bootstrap no dendrograma** — essencial para interpretação
3. **Exportação Newick** — 5 min de implementação, alto valor para pesquisadores
4. **Outgroup support** — diferencial científico importante
5. **Exportação PNG** — conveniência para publicação
6. **Entropia de Shannon na conservação** — melhora qualidade científica
7. **Reconexão WebSocket** — robustez em análises longas
8. **Limpeza de arquivos temporários** — manutenção operacional
9. **Rate limiting NCBI** — proteção contra bloqueio
10. **Demais itens baixa severidade** — conforme disponibilidade
