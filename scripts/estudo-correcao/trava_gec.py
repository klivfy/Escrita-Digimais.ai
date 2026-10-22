"""Trava determinística sobre as sugestões do modelo: só passa o que é correção de acento, de terminação (flexão) ou
um par fechado de palavras funcionais. Troca de palavra, de radical ou de mais de um termo é descartada.
A trava foi desenhada olhando apenas as trocas indevidas do conjunto gold-novo; o conjunto gold.json serve de teste.

Uso: python trava_gec.py <saida de gec_llm.py>
"""
import difflib, json, re, sys, unicodedata, collections
from wordfreq import zipf_frequency

d = json.load(open(sys.argv[1], encoding='utf8'))
WORD = re.compile(r"[\w'’-]+", re.U)
PARES = {('mais', 'mas'), ('a', 'há'), ('a', 'à'), ('à', 'a'), ('porque', 'porquê'), ('ouve', 'houve'), ('houveram', 'houve'),
         ('fazem', 'faz'), ('existe', 'existem'), ('esta', 'está'), ('ate', 'até'), ('so', 'só')}
DOMINIO = {'e-mail', 'wi-fi', 'login', 'logs'}

def toks(s): return [w.lower() for w in WORD.findall(s)]
def strip(s): return ''.join(c for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) != 'Mn')
def edits(a, b):
    out = []
    for tag, i1, i2, j1, j2 in difflib.SequenceMatcher(a=a, b=b, autojunk=False).get_opcodes():
        if tag == 'equal': continue
        if tag == 'replace' and i2 - i1 == j2 - j1:
            out.extend(zip(a[i1:i2], b[j1:j2]))  # troca termo a termo
        else:
            out.append((' '.join(a[i1:i2]), ' '.join(b[j1:j2])))
    return out

def prefixo(a, b):
    n = 0
    for x, y in zip(a, b):
        if x != y: break
        n += 1
    return n

def passa(orig, novo):
    if ' ' in orig or ' ' in novo:  # troca de mais de uma palavra
        return (orig, novo) == ('a baixo', 'abaixo')
    if re.search(r'\d', orig + novo) or orig == novo: return False
    if (orig, novo) in PARES: return True
    if strip(orig) == strip(novo): return zipf_frequency(novo, 'pt') >= 1.5 or novo in DOMINIO  # só acento (palavra conhecida, mesmo rara)
    # mesma raiz, termina diferente (flexão ou grafia): prefixo comum longo e palavra nova conhecida
    curto = min(len(orig), len(novo))
    return prefixo(strip(orig), strip(novo)) >= max(3, curto - 3) and (zipf_frequency(novo, 'pt') >= 3.0 or novo in DOMINIO)

for conj in sorted({r['conjunto'] for r in d['resultados']}):
    sub = [r for r in d['resultados'] if r['conjunto'] == conj]
    antes = collections.Counter(); depois = collections.Counter(); barradas_ok = []; barradas_ruins = []; limpos_dep = 0
    for r in sub:
        a, esp = toks(r['entrada']), toks(r['esperado'])
        ge = set(edits(a, esp)); me = set(edits(a, toks(r['saida'])))
        ok = {e for e in me if passa(*e)}
        antes['tp'] += len(ge & me); antes['fp'] += len(me - ge); antes['fn'] += len(ge - me)
        depois['tp'] += len(ge & ok); depois['fp'] += len(ok - ge); depois['fn'] += len(ge - ok)
        for e in me - ok: (barradas_ok if e in ge else barradas_ruins).append(e)
        if r['cat'] == 'limpo' and ok: limpos_dep += 1
    def pr(c):
        p = c['tp'] / (c['tp'] + c['fp']) if c['tp'] + c['fp'] else 0; rv = c['tp'] / (c['tp'] + c['fn']) if c['tp'] + c['fn'] else 0
        return f"edições certas {c['tp']}, trocas indevidas {c['fp']}, perdidas {c['fn']} (precisão {p:.0%}, revocação {rv:.0%})"
    print(f'\n== {conj}')
    print('  modelo puro:', pr(antes))
    print('  com trava  :', pr(depois), '| textos corretos com sugestão:', limpos_dep)
    print('  barradas pela trava que estavam certas:', barradas_ok)
    print('  barradas pela trava que estavam erradas:', barradas_ruins)
