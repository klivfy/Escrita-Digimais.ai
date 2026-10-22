"""Resume a saída de gec_llm.py por edição: quantas correções esperadas o modelo fez (revocação), quantas das trocas dele
estavam certas (precisão) e quais trocas indevidas fez. Ignora maiúscula inicial e ponto final, que não são erro de correção."""
import json, re, sys, collections, difflib
d = json.load(open(sys.argv[1], encoding='utf8'))
rs = d['resultados']
WORD = re.compile(r"[\w'’-]+", re.U)
def toks(s): return [w.lower() for w in WORD.findall(s)]
def edits(a, b):
    out = []
    for tag, i1, i2, j1, j2 in difflib.SequenceMatcher(a=a, b=b, autojunk=False).get_opcodes():
        if tag == 'equal': continue
        if tag == 'replace' and i2 - i1 == j2 - j1:
            out.extend(zip(a[i1:i2], b[j1:j2]))  # troca termo a termo
        else:
            out.append((' '.join(a[i1:i2]), ' '.join(b[j1:j2])))
    return out
print('modelo', d['modelo'], '| itens', len(rs), '| segundos por item (média)', round(sum(r['segundos'] for r in rs) / len(rs), 1))
for conj in sorted({r['conjunto'] for r in rs}):
    sub = [r for r in rs if r['conjunto'] == conj]
    tp = fp = fn = 0; completos = collections.Counter(); totais = collections.Counter(); indevidas = []; limpos_alterados = []
    for r in sub:
        a, esp, sai = toks(r['entrada']), toks(r['esperado']), toks(r['saida'])
        ge, me = set(edits(a, esp)), set(edits(a, sai))
        if r['cat'] == 'limpo':
            totais['limpo'] += 1
            if me: limpos_alterados.append((r['entrada'], r['saida']))
            else: completos['limpo'] += 1
            fp += len(me); continue
        tp += len(ge & me); fn += len(ge - me); fp += len(me - ge)
        totais[r['cat']] += 1
        if sai == esp: completos[r['cat']] += 1
        for x in me - ge: indevidas.append((r['entrada'], x))
    prec = tp / (tp + fp) if tp + fp else 0; rec = tp / (tp + fn) if tp + fn else 0
    print(f'\n== {conj}')
    print(f'  edições esperadas {tp + fn} | feitas certas {tp} (revocação {rec:.0%}) | trocas indevidas {fp} | precisão {prec:.0%}')
    print('  texto final igual ao esperado, por categoria:', {k: f'{completos[k]}/{totais[k]}' for k in totais})
    print('  textos corretos alterados:', len(limpos_alterados), 'de', totais['limpo'])
    for e in limpos_alterados[:8]: print('    ', e[0], '->', e[1])
    for e in indevidas[:12]: print('   TROCA INDEVIDA em', repr(e[0]), ':', e[1])
