"""Rodada 1 do estudo de correção: corretor ortográfico por lista de frequência (alternativa leve ao Hunspell).

Ideia: a lista de frequência de português traz os erros comuns como palavras (por exemplo 'nao'), então "está na lista"
não basta. Um termo é suspeito quando existe uma variante a uma edição de distância (acento conta como zero) muito mais
frequente. A sugestão é a variante mais frequente. Só sugere; nunca aplica.

Requer: wordfreq. Uso: python ortografia_freq.py gold.json AMOSTRAS-FORMATO.md
"""
import json, re, sys, unicodedata
from collections import defaultdict
from wordfreq import top_n_list, zipf_frequency

gold = json.load(open(sys.argv[1], encoding='utf8'))
amostras = open(sys.argv[2], encoding='utf8').read()
N = int(sys.argv[3]) if len(sys.argv) > 3 else 120000
# Camada A (só acento): variante com acento muito mais frequente. Camada B (grafia): só para termos raros.
MIN_ZIPF, DELTA_A = 3.0, 1.5
MAX_ZIPF_B, MIN_ZIPF_B, MIN_LEN_B = 1.8, 3.5, 5

def strip(s):
    return ''.join(c for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) != 'Mn').lower()

vocab = [w for w in top_n_list('pt', N) if re.fullmatch(r"[a-zà-ú]+", w)]
zipf = {w: zipf_frequency(w, 'pt') for w in vocab}
by_stripped = defaultdict(list)
deletes = defaultdict(set)
for w in vocab:
    s = strip(w)
    by_stripped[s].append(w)
for s in by_stripped:
    deletes[s].add(s)
    for i in range(len(s)):
        deletes[s[:i] + s[i + 1:]].add(s)

def within_one(a, b):
    if a == b: return True
    la, lb = len(a), len(b)
    if abs(la - lb) > 1: return False
    if la == lb:
        d = [i for i in range(la) if a[i] != b[i]]
        return len(d) == 1 or (len(d) == 2 and d[1] == d[0] + 1 and a[d[0]] == b[d[1]] and a[d[1]] == b[d[0]])
    if la > lb: a, b = b, a
    i = 0
    while i < len(a) and a[i] == b[i]: i += 1
    return a[i:] == b[i + 1:]

def candidates(tok):
    s = strip(tok)
    keys = {s} | {s[:i] + s[i + 1:] for i in range(len(s))}
    stripped_cands = set()
    for k in keys:
        stripped_cands |= deletes.get(k, set())
    return [w for sc in stripped_cands if within_one(s, sc) for w in by_stripped[sc]]

DOMAIN = {'spooler', 'proxy', 'firewall', 'driver', 'login', 'logs', 'log', 'reboot', 'plugin', 'toner', 'notebook', 'resetamos', 'resetadas', 'reiniciados', 'antivírus', 'wi-fi', 'e-mail', 'switch', 'backup', 'token', 'windows', 'outlook', 'teams', 'onedrive', 'defender', 'office', 'edge', 'chrome', 'vpn', 'dns', 'erp', 'ssd', 'jsilva', 'ad'}
WORD = re.compile(r"[^\W\d_][\w'’-]*", re.U)

def ignorable(w, start, text):
    if re.search(r'\d', w): return True
    if re.fullmatch(r'[A-ZÀ-Ú]{2,}', w): return True
    if re.search(r'[a-zà-ú][A-ZÀ-Ú]', w): return True
    if '-' in w and re.search(r'[A-ZÀ-Ú]', w): return True
    if w[0].isupper() and start > 0 and not re.search(r'[.!?:]\s*$', text[:start]) and not text[:start].endswith('\n'): return True
    if re.search(r'[\\/:@]', text[max(0, start - 3):start]): return True
    return w.lower() in DOMAIN

def flag(text):
    out = []
    for m in WORD.finditer(text):
        w = m.group(0)
        if ignorable(w, m.start(), text): continue
        if m.start() > 0 and text[m.start() - 1].isdigit(): continue  # 2º, 17h
        lw = w.lower()
        ft = zipf.get(lw, 0.0)
        s_ = strip(lw)
        cands = [c for c in candidates(lw) if c != lw]
        # Camada A: mesma letra, só o acento muda
        a = [c for c in cands if strip(c) == s_ and zipf[c] >= MIN_ZIPF and zipf[c] >= ft + DELTA_A]
        if a:
            out.append((w, max(a, key=lambda c: zipf[c]))); continue
        # Camada B: grafia errada de termo raro
        if len(lw) >= MIN_LEN_B and ft <= MAX_ZIPF_B:
            b = [c for c in cands if zipf[c] >= MIN_ZIPF_B and zipf[c] >= ft + 1.5]
            if b: out.append((w, max(b, key=lambda c: zipf[c])))
    return out

res = {}
detalhes = []
for e in gold['erros']:
    a = [m.group(0) for m in WORD.finditer(e['entrada'])]
    b = [m.group(0) for m in WORD.finditer(e['esperado'])]
    changed = {x.lower(): y.lower() for x, y in zip(a, b) if x.lower() != y.lower()} if len(a) == len(b) else {}
    fl = flag(e['entrada'])
    r = res.setdefault(e['cat'], {'n': 0, 'detectado': 0, 'sug1': 0, 'sinalizacoes_indevidas': 0})
    r['n'] += 1
    hit = any(w.lower() in changed for w, _ in fl)
    if hit: r['detectado'] += 1
    if any(w.lower() in changed and changed[w.lower()] == s for w, s in fl): r['sug1'] += 1
    r['sinalizacoes_indevidas'] += sum(1 for w, _ in fl if w.lower() not in changed)
    if e['cat'] == 'ortografia' and not any(w.lower() in changed and changed[w.lower()] == s for w, s in fl):
        detalhes.append({'entrada': e['entrada'], 'sinalizado': fl, 'esperado': changed})
    if e['cat'] != 'ortografia':
        for w, s in fl:
            if w.lower() not in changed: detalhes.append({'sinalizacao_indevida_em': e['entrada'], 'palavra': w, 'sugestao': s})

blocks = re.findall(r'```text\n(.*?)```', amostras, re.S)
fp_gold = [(t, flag(t)) for t in gold['limpos']]
fp_prod = [(t[:60], flag(t)) for t in blocks]
palavras_gold = sum(len(WORD.findall(t)) for t in gold['limpos'])
palavras_prod = sum(len(WORD.findall(t)) for t in blocks)
print(json.dumps({
    'vocabulario': len(vocab),
    'tamanho_estimado_kb': round(sum(len(w) + 2 for w in vocab) / 1024),
    'limites': {'zipf_minimo': MIN_ZIPF, 'delta_acento': DELTA_A, 'grafia_max_zipf': MAX_ZIPF_B, 'grafia_min_zipf_candidato': MIN_ZIPF_B},
    'por_categoria': res,
    'limpos_gold': {'frases': len(gold['limpos']), 'palavras': palavras_gold, 'sinalizacoes': sum(len(f) for _, f in fp_gold), 'detalhes': [f for _, f in fp_gold if f]},
    'textos_gerados_pelo_produto': {'blocos': len(blocks), 'palavras': palavras_prod, 'sinalizacoes': sum(len(f) for _, f in fp_prod), 'detalhes': [f for _, f in fp_prod if f]},
    'falhas_e_sinalizacoes_indevidas': detalhes,
}, ensure_ascii=False, indent=1))
