"""Compara as camadas da extensão com o LanguageTool 6.6 (servidor local, pt-BR, sem n-gramas) nos três conjuntos.
Aplica a primeira sugestão de cada regra; ignora maiúscula inicial e categorias de estilo, tipografia e pontuação.

Pré-requisitos: saida-camadas.json (gerado por dump_camadas.test.ts) e o servidor do LanguageTool em 127.0.0.1:8081
(java -cp languagetool-server.jar org.languagetool.server.HTTPServer --port 8081).
Uso: python comparar_languagetool.py scripts/estudo-ia-aprendizado"""
import json, sys, urllib.request, urllib.parse, collections
S = sys.argv[1]
items = json.load(open(f'{S}/saida-camadas.json', encoding='utf8'))
SKIP_CAT = {'CASING', 'TYPOGRAPHY', 'STYLE', 'REDUNDANCY', 'PUNCTUATION'}

def lt(text):
    data = urllib.parse.urlencode({'text': text, 'language': 'pt-BR'}).encode()
    r = json.load(urllib.request.urlopen('http://127.0.0.1:8081/v2/check', data))
    out = []
    for m in r['matches']:
        if m['rule']['category']['id'] in SKIP_CAT or not m['replacements']: continue
        out.append({'start': m['offset'], 'end': m['offset'] + m['length'], 'replacement': m['replacements'][0]['value'], 'rule': m['rule']['id'], 'cat': m['rule']['category']['id']})
    return out

def apply(t, sugs):
    for s in sorted(sugs, key=lambda s: -s['start']): t = t[:s['start']] + s['replacement'] + t[s['end']:]
    return t

def union(ours, lts):
    keep = list(ours)
    for s in lts:
        if not any(s['start'] < o['end'] and o['start'] < s['end'] for o in keep): keep.append(s)
    return keep

res = collections.defaultdict(lambda: collections.Counter())
fps = collections.defaultdict(list); misses = collections.defaultdict(list)
for it in items:
    lts = lt(it['entrada'])
    for name, sugs in (('extensao', it['sug']), ('languagetool', lts), ('uniao', union(it['sug'], lts))):
        out = apply(it['entrada'], sugs)
        key = (it['f'], 'erros' if it['cat'] not in ('limpo', 'produto') else it['cat'])
        c = res[(name,) + key]
        c['n'] += 1
        if key[1] == 'erros':
            if out == it['esperado']: c['exato'] += 1
            elif out != it['entrada']: c['piorou_ou_parcial'] += 1; misses[name].append((it['entrada'], out, it['esperado']))
            else: misses[name].append((it['entrada'], '(nada)', it['esperado']))
        else:
            if sugs: c['com_sugestao'] += 1; fps[name].append((it['entrada'][:80], [(it['entrada'][s['start']:s['end']], s['replacement'], s.get('rule')) for s in sugs]))
for k in sorted(res): print(k, dict(res[k]))
print('\nFALSOS POSITIVOS do LanguageTool:')
for x in fps['languagetool']: print('  ', x)
print('\nERROS que o LanguageTool não resolve (amostra):')
for x in misses['languagetool'][:40]: print('  ', x)
print('\nERROS que a união não resolve:')
for x in misses['uniao']: print('  ', x)
