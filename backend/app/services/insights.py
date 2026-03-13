"""Automated biological hypothesis generation.

Cross-references conservation, motifs, clustering, and network analysis
to generate structured biological insights with confidence levels.
"""
import logging
import numpy as np

logger = logging.getLogger(__name__)


def generate_insights(
    conservation: dict | None,
    motifs: dict | None,
    clustering: dict | None,
    network: dict | None,
    seq_type: str = "dna",
) -> dict:
    """Generate biological hypotheses from combined analysis results."""
    insights = []

    if conservation:
        insights.extend(_conservation_insights(conservation))

    if motifs:
        insights.extend(_motif_insights(motifs))

    if conservation and motifs:
        insights.extend(_conserved_motif_insights(conservation, motifs))

    if clustering:
        insights.extend(_clustering_insights(clustering))

    if network:
        insights.extend(_network_insights(network))

    if clustering and network:
        insights.extend(_cluster_network_insights(clustering, network))

    # Sort by confidence (high first)
    confidence_order = {"high": 0, "medium": 1, "low": 2}
    insights.sort(key=lambda x: confidence_order.get(x["confidence"], 3))

    logger.info("Generated %d insights across %d categories",
                len(insights), len({i["category"] for i in insights}))

    return {
        "insights": insights,
        "n_insights": len(insights),
        "categories": sorted({i["category"] for i in insights}),
        "seq_type": seq_type,
    }


def _conservation_insights(conservation: dict) -> list[dict]:
    insights = []
    pct = conservation.get("conservation_pct", 0)
    n_seqs = conservation.get("n_sequences", 0)
    regions = conservation.get("regions", [])

    # Low conservation warning
    if pct < 20:
        insights.append({
            "category": "conservation_warning",
            "confidence": "high",
            "text": (
                f"Apenas {pct:.1f}% das posicoes do alinhamento sao conservadas acima do threshold. "
                f"Isso pode indicar sequencias altamente divergentes, artefatos de alinhamento, "
                f"ou que estas sequencias nao sao ortologos verdadeiros."
            ),
            "supporting_data": {"conservation_pct": pct, "n_sequences": n_seqs},
        })

    # High conservation
    if pct > 80:
        insights.append({
            "category": "high_conservation",
            "confidence": "high",
            "text": (
                f"{pct:.1f}% das posicoes sao conservadas — indicando forte pressao seletiva purificadora. "
                f"Este gene provavelmente possui funcao essencial mantida ao longo da evolucao."
            ),
            "supporting_data": {"conservation_pct": pct},
        })

    # Significant regions
    sig_regions = [r for r in regions if r.get("p_value", 1.0) < 0.001]
    if sig_regions:
        best = min(sig_regions, key=lambda r: r.get("p_value", 1.0))
        insights.append({
            "category": "significant_conservation",
            "confidence": "high",
            "text": (
                f"Regiao {best['start']}-{best['end']} ({best['length']} posicoes) "
                f"e altamente conservada ({best['avg_identity'] * 100:.0f}% identidade, "
                f"p={best.get('p_value', 'N/A'):.2e}). "
                f"Total de {len(sig_regions)} regioes com significancia p<0.001."
            ),
            "supporting_data": {"region": best, "n_significant": len(sig_regions)},
        })

    return insights


def _motif_insights(motifs: dict) -> list[dict]:
    insights = []
    motif_list = motifs.get("motifs", [])

    # Highly significant motifs
    sig_motifs = [m for m in motif_list if m.get("e_value", float('inf')) < 0.01]
    if sig_motifs:
        best = min(sig_motifs, key=lambda m: m.get("e_value", float('inf')))
        insights.append({
            "category": "significant_motif",
            "confidence": "high",
            "text": (
                f"Motif '{best.get('consensus', best['sequence'])}' "
                f"(suporte {best['support'] * 100:.0f}%, E-value={best.get('e_value', 'N/A'):.2e}) "
                f"e estatisticamente significativo. "
                f"Total de {len(sig_motifs)} motifs com E-value < 0.01."
            ),
            "supporting_data": {"motif": best["consensus"], "e_value": best.get("e_value"),
                                "n_significant": len(sig_motifs)},
        })

    # High IC motifs (possible functional elements)
    for m in motif_list[:5]:
        ic = m.get("information_content", [])
        if ic:
            avg_ic = sum(ic) / len(ic)
            if avg_ic > 1.5:  # > 1.5 bits is highly informative for DNA
                insights.append({
                    "category": "high_ic_motif",
                    "confidence": "medium",
                    "text": (
                        f"Motif '{m.get('consensus', m['sequence'])}' possui alto conteudo "
                        f"informacional ({avg_ic:.2f} bits/posicao). Padroes com alto IC "
                        f"frequentemente correspondem a sitios de ligacao ou elementos regulatorios."
                    ),
                    "supporting_data": {"motif": m["consensus"], "avg_ic": avg_ic},
                })
                break  # Only report the best one

    # No significant motifs
    if not motif_list:
        insights.append({
            "category": "no_motifs",
            "confidence": "medium",
            "text": (
                "Nenhum motif recorrente encontrado. Isso pode indicar alta divergencia entre as "
                "sequencias ou que os padroes conservados sao muito curtos para deteccao."
            ),
            "supporting_data": {},
        })

    return insights


def _conserved_motif_insights(conservation: dict, motifs: dict) -> list[dict]:
    """Cross-reference conserved regions with significant motifs."""
    insights = []
    regions = conservation.get("regions", [])
    motif_list = motifs.get("motifs", [])

    sig_motifs = [m for m in motif_list if m.get("p_value", 1.0) < 0.05]
    sig_regions = [r for r in regions if r.get("p_value", 1.0) < 0.05]

    if sig_motifs and sig_regions:
        # Check overlap between conserved regions and motif support
        for motif in sig_motifs[:3]:
            for region in sig_regions[:3]:
                # Motifs in gap-stripped coords can't directly map to alignment coords,
                # but if a highly supported motif and a conserved region both exist,
                # it suggests functional importance
                if motif["support"] > 0.7 and region["avg_identity"] > 0.9:
                    insights.append({
                        "category": "conserved_functional_element",
                        "confidence": "high" if region.get("p_value", 1.0) < 0.001 else "medium",
                        "text": (
                            f"Motif '{motif.get('consensus', motif['sequence'])}' "
                            f"(suporte {motif['support'] * 100:.0f}%, p={motif.get('p_value', 'N/A'):.2e}) "
                            f"coexiste com regiao conservada {region['start']}-{region['end']} "
                            f"({region['avg_identity'] * 100:.0f}% identidade). "
                            f"Provavel elemento funcional ou regulatorio sob pressao seletiva."
                        ),
                        "supporting_data": {
                            "motif": motif.get("consensus"),
                            "region_start": region["start"],
                            "region_end": region["end"],
                        },
                    })
                    return insights  # One cross-reference is enough

    return insights


def _clustering_insights(clustering: dict) -> list[dict]:
    insights = []
    n_clusters = clustering.get("n_clusters", 0)
    silhouette = clustering.get("silhouette_score", 0)
    cophenetic = clustering.get("cophenetic_r", 0)
    labels = clustering.get("labels", {})
    bootstrap = clustering.get("bootstrap_stability", {})
    dist_matrix = clustering.get("distance_matrix", [])
    seq_labels = clustering.get("sequence_labels", [])

    # Cluster quality
    if silhouette > 0.5:
        insights.append({
            "category": "cluster_quality",
            "confidence": "high",
            "text": (
                f"Agrupamento em {n_clusters} clusters com silhouette score={silhouette:.3f} (bom) "
                f"e correlacao cofenetica={cophenetic:.3f}. "
                f"As sequencias formam grupos naturais bem definidos."
            ),
            "supporting_data": {"silhouette": silhouette, "cophenetic_r": cophenetic},
        })
    elif silhouette > 0.25:
        insights.append({
            "category": "cluster_quality",
            "confidence": "medium",
            "text": (
                f"Agrupamento em {n_clusters} clusters com silhouette score={silhouette:.3f} (moderado). "
                f"Os grupos tem alguma sobreposicao, sugerindo divergencia gradual."
            ),
            "supporting_data": {"silhouette": silhouette},
        })

    # Bootstrap stability
    if bootstrap:
        avg_stability = np.mean(list(bootstrap.values()))
        unstable = [s for s, v in bootstrap.items() if v < 0.5]
        if avg_stability > 0.8:
            insights.append({
                "category": "bootstrap_validation",
                "confidence": "high",
                "text": (
                    f"Bootstrap stability medio de {avg_stability * 100:.0f}% ({clustering.get('n_bootstrap', 100)} replicas). "
                    f"Os agrupamentos sao robustos e reprodutiveis."
                ),
                "supporting_data": {"avg_stability": round(avg_stability, 4)},
            })
        if unstable:
            insights.append({
                "category": "unstable_sequences",
                "confidence": "medium",
                "text": (
                    f"{len(unstable)} sequencia(s) com baixa estabilidade de bootstrap (<50%): "
                    f"{', '.join(unstable[:3])}{'...' if len(unstable) > 3 else ''}. "
                    f"Estas sequencias podem ser intermediarias entre grupos ou ter sinal filogenetico ambiguo."
                ),
                "supporting_data": {"unstable_sequences": unstable[:5]},
            })

    # Inter-cluster divergence
    if len(dist_matrix) > 0 and n_clusters >= 2:
        dist_arr = np.array(dist_matrix)
        cluster_ids = sorted(set(labels.values()))

        for i, ci in enumerate(cluster_ids):
            members_i = [seq_labels.index(s) for s, c in labels.items() if c == ci]
            for cj in cluster_ids[i + 1:]:
                members_j = [seq_labels.index(s) for s, c in labels.items() if c == cj]
                inter = [dist_arr[a][b] for a in members_i for b in members_j]
                intra_i = [dist_arr[a][b] for a in members_i for b in members_i if a != b]
                intra_j = [dist_arr[a][b] for a in members_j for b in members_j if a != b]

                avg_inter = float(np.mean(inter)) if inter else 0
                avg_intra = float(np.mean(intra_i + intra_j)) if (intra_i or intra_j) else 0

                if avg_inter > 0 and avg_intra > 0 and avg_inter > 2 * avg_intra:
                    insights.append({
                        "category": "cluster_divergence",
                        "confidence": "high",
                        "text": (
                            f"Cluster {ci} ({len(members_i)} seq) e Cluster {cj} ({len(members_j)} seq) "
                            f"sao bem separados (distancia inter={avg_inter:.3f} vs intra={avg_intra:.3f}). "
                            f"Razao de divergencia: {avg_inter / avg_intra:.1f}x."
                        ),
                        "supporting_data": {
                            "cluster_a": ci, "cluster_b": cj,
                            "avg_inter": round(avg_inter, 4),
                            "avg_intra": round(avg_intra, 4),
                        },
                    })

    return insights


def _network_insights(network: dict) -> list[dict]:
    insights = []
    stats = network.get("stats", {})
    nodes = network.get("nodes", [])

    hub_nodes = stats.get("hub_nodes", [])
    n_components = stats.get("n_components", 1)

    # Hub nodes
    if hub_nodes:
        dc = stats.get("degree_centrality", {})
        hub_info = [(h, dc.get(h, 0)) for h in hub_nodes[:3]]
        insights.append({
            "category": "network_hub",
            "confidence": "medium",
            "text": (
                f"{len(hub_nodes)} no(s) hub identificado(s): "
                f"{', '.join(f'{h} (centralidade={d:.2f})' for h, d in hub_info)}. "
                f"Hubs de rede podem representar haplotipos ancestrais ou sequencias intermediarias "
                f"que conectam multiplas linhagens."
            ),
            "supporting_data": {"hub_nodes": hub_nodes, "centrality": dict(hub_info)},
        })

    # Disconnected components
    if n_components > 1:
        insights.append({
            "category": "network_fragmented",
            "confidence": "high",
            "text": (
                f"A rede possui {n_components} componentes desconectados. "
                f"Isso indica grupos de sequencias altamente divergentes com "
                f"distancia superior ao threshold ({stats.get('threshold', 0.1)})."
            ),
            "supporting_data": {"n_components": n_components},
        })

    # Dense network (many extra edges)
    n_extra = stats.get("n_extra_edges", 0)
    n_mst = stats.get("n_mst_edges", 0)
    if n_extra > 2 * n_mst:
        insights.append({
            "category": "network_dense",
            "confidence": "medium",
            "text": (
                f"Rede densa com {n_extra} arestas extras alem do MST ({n_mst} arestas). "
                f"Muitas sequencias sao proximamente relacionadas, sugerindo baixa divergencia "
                f"ou radiacao evolutiva recente."
            ),
            "supporting_data": {"n_extra": n_extra, "n_mst": n_mst},
        })

    return insights


def _cluster_network_insights(clustering: dict, network: dict) -> list[dict]:
    """Cross-reference clustering and network analysis."""
    insights = []
    hub_nodes = network.get("stats", {}).get("hub_nodes", [])
    labels = clustering.get("labels", {})

    # Check if hubs are at cluster boundaries
    if hub_nodes and labels:
        for hub in hub_nodes[:2]:
            hub_cluster = labels.get(hub)
            if hub_cluster is not None:
                # Check if hub connects to nodes in other clusters via network edges
                edges = network.get("edges", [])
                neighbor_clusters = set()
                for edge in edges:
                    if edge["source"] == hub:
                        nc = labels.get(edge["target"])
                        if nc and nc != hub_cluster:
                            neighbor_clusters.add(nc)
                    elif edge["target"] == hub:
                        nc = labels.get(edge["source"])
                        if nc and nc != hub_cluster:
                            neighbor_clusters.add(nc)

                if neighbor_clusters:
                    insights.append({
                        "category": "hub_bridging",
                        "confidence": "medium",
                        "text": (
                            f"Hub '{hub}' (cluster {hub_cluster}) conecta-se a sequencias dos "
                            f"clusters {', '.join(str(c) for c in sorted(neighbor_clusters))}. "
                            f"Possivel sequencia intermediaria ou ancestral compartilhado."
                        ),
                        "supporting_data": {
                            "hub": hub,
                            "hub_cluster": hub_cluster,
                            "connected_clusters": sorted(neighbor_clusters),
                        },
                    })
                    break

    return insights
