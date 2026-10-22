"""Complementaridade: onde as camadas da extensão falham, o Phi-4-mini (modelo do Edge) com a trava acerta?

Usa a saída do Phi-4-mini gerada por scripts/estudo-correcao/gec_llm.py (gold.json e gold-novo.json) e a trava de
scripts/estudo-correcao/trava_gec.py. Requer wordfreq. "algum_ok" é um teto: supõe que se escolhe, a cada texto, o
método que acertou; a combinação real (camadas primeiro, modelo travado no que sobra) fica abaixo disso.
Uso: python complementaridade_phi.py scripts/estudo-ia-aprendizado <saida do gec_llm.py>"""
import json, sys, re, difflib, collections
S = sys.argv[1]
src = open('scripts/estudo-correcao/trava_gec.py', encoding='utf8').read()
src = src[:src.index("for conj in sorted")].replace("d = json.load(open(sys.argv[1], encoding='utf8'))", "")
ns = {}; exec(src, ns)
WORD = re.compile(r"[\w'’-]+", re.U)
def norm(t): return ' '.join(w.lower() for w in WORD.findall(t))
ours = {(o['f'], o['entrada']): o for o in json.load(open(f'{S}/saida-camadas.json', encoding='utf8'))}
def apply(t, sugs):
    for s in sorted(sugs, key=lambda s: -s['start']): t = t[:s['start']] + s['replacement'] + t[s['end']:]
    return t
def phi_trava(entrada, saida):
    a, b = WORD.findall(entrada), WORD.findall(saida)
    al, bl = [w.lower() for w in a], [w.lower() for w in b]
    out = list(a)
    for tag, i1, i2, j1, j2 in difflib.SequenceMatcher(a=al, b=bl, autojunk=False).get_opcodes():
        if tag == 'replace' and i2 - i1 == j2 - j1:
            for k in range(i2 - i1):
                if ns['passa'](al[i1 + k], bl[j1 + k]): out[i1 + k] = bl[j1 + k]
    return ' '.join(out)
d = json.load(open(sys.argv[2], encoding='utf8'))
c = collections.Counter(); ganhos = []
for r in d['resultados']:
    o = ours.get((r['conjunto'], r['entrada']))
    if not o: continue
    if r['cat'] == 'limpo':
        c['limpos'] += 1
        if norm(phi_trava(r['entrada'], r['saida'])) != norm(r['entrada']): c['limpo_alterado_phi_trava'] += 1
        continue
    c['erros'] += 1
    ours_ok = norm(apply(r['entrada'], o['sug'])) == norm(r['esperado'])
    phi_ok = norm(phi_trava(r['entrada'], r['saida'])) == norm(r['esperado'])
    phi_raw = norm(r['saida']) == norm(r['esperado'])
    c['ours_ok'] += ours_ok; c['phi_trava_ok'] += phi_ok; c['phi_cru_ok'] += phi_raw; c['algum_ok'] += (ours_ok or phi_ok)
    if phi_ok and not ours_ok: ganhos.append((r['entrada'], r['esperado']))
print(dict(c))
print('Só o Phi com trava resolve:'); [print('  ', g) for g in ganhos]
