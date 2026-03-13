import re

# IUPAC: R=AG, Y=CT, S=GC, W=AT, K=GT, M=AC, B=CGT, D=AGT, H=ACT, V=ACG
def validate_dna(seq: str) -> bool:
    return bool(re.match(r'^[ATCGNRYSWKMBDHVatcgnryswkmbdhv\s]+$', seq))

def validate_rna(seq: str) -> bool:
    return bool(re.match(r'^[AUCGNRYSWKMBDHVaucgnryswkmbdhv\s]+$', seq))

def validate_protein(seq: str) -> bool:
    return bool(re.match(r'^[ACDEFGHIKLMNPQRSTVWY*acdefghiklmnpqrstvwy\s]+$', seq))

def clean_sequence(seq: str) -> str:
    return re.sub(r'\s+', '', seq).upper()

def write_fasta(sequences: list[dict], filepath: str) -> None:
    with open(filepath, "w") as f:
        for seq in sequences:
            f.write(f">{seq['accession']} {seq.get('title', '')}\n")
            s = seq["sequence"]
            for i in range(0, len(s), 80):
                f.write(s[i:i+80] + "\n")
