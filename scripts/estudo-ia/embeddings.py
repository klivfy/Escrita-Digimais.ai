"""Rodada 2 do estudo de IA embarcada: um encoder pequeno melhora a interpretação dos trechos do rascunho livre?

Compara, nos mesmos trechos, (a) o pipeline atual (regras + Naive Bayes), (b) encoder + regressão logística treinada no
mesmo corpus fictício e (c) fusão: pipeline quando a confiança é alta, encoder quando é baixa.
Requer: numpy, scikit-learn, onnxruntime, tokenizers, huggingface_hub. Modelos baixados da Hugging Face (fora do pacote).
Entrada: /tmp/.../eval.json gerado pelo teste de despejo (ver docs/ESTUDO-IA-EMBARCADA.md, seção 6).
"""
import json, sys, time, collections
import numpy as np
import onnxruntime as ort
from tokenizers import Tokenizer
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import StratifiedKFold, cross_val_predict

MODELS = sys.argv[1]
EVAL = sys.argv[2]
CORPUS = sys.argv[3]
CLASSES = ['summary', 'action', 'result', 'pending', 'expected', 'question']

class Encoder:
    def __init__(self, folder, prefix=''):
        self.tok = Tokenizer.from_file(f'{MODELS}/{folder}/tokenizer.json')
        self.tok.enable_truncation(max_length=64)
        self.tok.enable_padding()
        so = ort.SessionOptions(); so.intra_op_num_threads = 1
        self.sess = ort.InferenceSession(f'{MODELS}/{folder}/onnx/model_quantized.onnx', so, providers=['CPUExecutionProvider'])
        self.names = {i.name for i in self.sess.get_inputs()}
        self.prefix = prefix
    def __call__(self, texts):
        out = []
        for i in range(0, len(texts), 16):
            enc = self.tok.encode_batch([self.prefix + t for t in texts[i:i+16]])
            ids = np.array([e.ids for e in enc], dtype=np.int64)
            mask = np.array([e.attention_mask for e in enc], dtype=np.int64)
            feed = {'input_ids': ids, 'attention_mask': mask}
            if 'token_type_ids' in self.names: feed['token_type_ids'] = np.zeros_like(ids)
            h = self.sess.run(None, feed)[0]
            m = mask[..., None].astype(np.float32)
            v = (h * m).sum(1) / m.sum(1)
            out.append(v / np.linalg.norm(v, axis=1, keepdims=True))
        return np.vstack(out)

corpus = json.load(open(CORPUS, encoding='utf8'))
Xt_text, yt = [], []
for c in CLASSES:
    for t in corpus[c]: Xt_text.append(t); yt.append(c)
ev = json.load(open(EVAL, encoding='utf8'))
sets = collections.OrderedDict((s, [x for x in ev if x['set'] == s]) for s in ['facil', 'bagunçado', 'deslocado'])

def acc(pred, items): return sum(p == x['expected'] for p, x in zip(pred, items))

report = {}
probs_out = {}

def evaluate(name, featurize, Cs, extra=None):
    Xt = featurize(Xt_text)
    best, bestC = -1, None
    for C in Cs:
        cv = cross_val_predict(LogisticRegression(C=C, max_iter=3000), Xt, yt, cv=StratifiedKFold(5, shuffle=True, random_state=0))
        a = np.mean(np.array(cv) == np.array(yt))
        if a > best: best, bestC = a, C
    clf = LogisticRegression(C=bestC, max_iter=3000).fit(Xt, yt)
    r = {'C': bestC, 'cv_corpus': round(best, 3)}
    for st, items in sets.items():
        X = featurize([x['text'] for x in items]); pred = clf.predict(X)
        r[st] = {'n': len(items), 'pipeline': acc([x['pipeline'] for x in items], items), 'modelo': acc(pred, items)}
        if extra == 'save':
            for x, pr in zip(items, clf.predict_proba(X)): probs_out[x['text']] = {c: float(v) for c, v in zip(clf.classes_, pr)}
    report[name] = r

# Controle 1: n-gramas de caracteres (sem rede neural). Mostra quanto do ganho vem só de subpalavras.
from sklearn.feature_extraction.text import TfidfVectorizer
tf = TfidfVectorizer(analyzer='char_wb', ngram_range=(2, 5), sublinear_tf=True).fit(Xt_text)
evaluate('controle_char_ngram_tfidf', lambda t: tf.transform(t), [1, 8, 64, 512])

# Controle 2: embeddings estáticos (sem transformer), muito mais leves de embarcar.
try:
    from model2vec import StaticModel
    sm = StaticModel.from_pretrained('minishlab/potion-multilingual-128M')
    evaluate('estatico_potion_multilingual_128M', lambda t: sm.encode(t), [1, 8, 64, 512])
except Exception as e:
    report['estatico_potion_multilingual_128M'] = {'erro': str(e)[:200]}
for name, folder, prefix in [('multilingual-e5-small', 'multilingual-e5-small', 'query: '), ('paraphrase-multilingual-MiniLM-L12-v2', 'paraphrase-multilingual-MiniLM-L12-v2', '')]:
    enc = Encoder(folder, prefix)
    t0 = time.time(); Xt = enc(Xt_text); dt = (time.time() - t0) / len(Xt_text) * 1000
    # C escolhido só por validação cruzada dentro do corpus de treino
    best, bestC = -1, None
    for C in [0.5, 2, 8, 32, 128]:
        cv = cross_val_predict(LogisticRegression(C=C, max_iter=2000), Xt, yt, cv=StratifiedKFold(5, shuffle=True, random_state=0))
        a = np.mean(np.array(cv) == np.array(yt))
        if a > best: best, bestC = a, C
    clf = LogisticRegression(C=bestC, max_iter=2000).fit(Xt, yt)
    r = {'ms_por_trecho_1_thread': round(dt, 1), 'C': bestC, 'cv_corpus': round(best, 3)}
    for s, items in sets.items():
        X = enc([x['text'] for x in items]); proba = clf.predict_proba(X); pred = [clf.classes_[i] for i in proba.argmax(1)]
        pipe = [x['pipeline'] for x in items]
        fused = [x['pipeline'] if x['conf'] >= 0.6 else p for x, p in zip(items, pred)]
        # encoder só decide quando muito seguro; senão mantém o pipeline
        guard = [p if pr.max() >= 0.6 else x['pipeline'] for x, p, pr in zip(items, pred, proba)]
        if name == 'multilingual-e5-small':
            for x, pr in zip(items, proba): probs_out[x['text']] = {c: float(v) for c, v in zip(clf.classes_, pr)}
        r[s] = {'n': len(items), 'pipeline': acc(pipe, items), 'encoder': acc(pred, items), 'fusao_conf_baixa': acc(fused, items), 'fusao_encoder_seguro': acc(guard, items)}
    report[name] = r
json.dump(probs_out, open(sys.argv[4], 'w', encoding='utf8'), ensure_ascii=False)
print(json.dumps(report, ensure_ascii=False, indent=1))
