"""Gera src/config/proofread/freq-pt.json a partir do pacote wordfreq (lista de frequência do português).

Uso: python scripts/gerar-lista-frequencia.py   (requer wordfreq==3.1.1)
Formato: cada item de "grupos" é "<zipf x 100> palavra palavra ...", palavras que têm a mesma frequência.
Só entram palavras formadas por letras (sem hífen, dígito ou apóstrofo). Os dados vêm do wordfreq e
seguem a licença CC BY-SA 4.0 (veja public/licenses/lista-frequencia-AVISO.txt).
"""
import json, re, sys
from collections import defaultdict
from importlib.metadata import version
from wordfreq import top_n_list, zipf_frequency

N = 120000
assert version('wordfreq') == '3.1.1', 'use wordfreq 3.1.1 para reproduzir a lista'
grupos = defaultdict(list)
for w in top_n_list('pt', N):
    if re.fullmatch(r'[a-zà-ú]+', w):
        grupos[round(zipf_frequency(w, 'pt') * 100)].append(w)
linhas = [f"{z} {' '.join(sorted(ws))}" for z, ws in sorted(grupos.items(), reverse=True)]
saida = {
    'fonte': 'wordfreq 3.1.1 (Robyn Speer), lista pt, top 120000, só letras',
    'licenca': 'CC BY-SA 4.0',
    'palavras': sum(len(ws) for ws in grupos.values()),
    'grupos': linhas,
}
destino = 'src/config/proofread/freq-pt.json'
with open(destino, 'w', encoding='utf8') as f:
    json.dump(saida, f, ensure_ascii=False, separators=(',', ':'))
    f.write('\n')
print(destino, saida['palavras'], 'palavras', len(linhas), 'grupos', file=sys.stderr)
