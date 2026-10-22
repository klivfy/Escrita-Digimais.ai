"""Rodada 1 do estudo de correção: um modelo de linguagem pequeno corrige ortografia, concordância e crase?

Mesma tarefa e mesmos conjuntos dos outros métodos. Mede acerto exato, correções além do esperado (alteração indevida)
e se o texto já correto permanece igual. Requer torch (CPU) e transformers; baixa o modelo da Hugging Face.
Uso: python gec_llm.py <modelo> <saida.json> gold.json [gold-novo.json]
"""
import json, re, sys, time
import torch
from transformers import AutoTokenizer, AutoModelForCausalLM

model_id, out_path, *golds = sys.argv[1:]
torch.set_num_threads(4)
tok = AutoTokenizer.from_pretrained(model_id)
m = AutoModelForCausalLM.from_pretrained(model_id, dtype=torch.bfloat16).eval()

SYSTEM = (
    "Você revisa textos curtos de um analista de Service Desk brasileiro. Corrija SOMENTE erros de ortografia, acentuação, "
    "concordância nominal e verbal, crase e uso de mas/mais, há/a e porque/porquê. Não reescreva, não troque palavras corretas, "
    "não mude o sentido, não acrescente nem remova informação. Preserve siglas, nomes de produtos, números, datas e caminhos. "
    "Se o texto já estiver correto, devolva exatamente o mesmo texto. Sem travessão. Responda somente com o texto final, sem explicação."
)
SHOTS = [
    ("os usuario relatou lentidao no sistema", "os usuários relataram lentidão no sistema"),
    ("Resetamos a senha no AD e testamos a conexão com a VPN.", "Resetamos a senha no AD e testamos a conexão com a VPN."),
]

def correct(text):
    msgs = [{"role": "system", "content": SYSTEM}]
    for a, b in SHOTS: msgs += [{"role": "user", "content": a}, {"role": "assistant", "content": b}]
    msgs.append({"role": "user", "content": text})
    ids = tok.apply_chat_template(msgs, add_generation_prompt=True, return_tensors='pt', return_dict=True, enable_thinking=False)
    with torch.no_grad():
        o = m.generate(**ids, max_new_tokens=90, do_sample=False)
    return tok.decode(o[0][ids['input_ids'].shape[1]:], skip_special_tokens=True).strip().split('\n')[0].strip()

WORD = re.compile(r"[\w'’-]+", re.U)
def dist(a, b):
    a, b = WORD.findall(a.lower()), WORD.findall(b.lower())
    d = list(range(len(b) + 1))
    for i in range(1, len(a) + 1):
        prev, d[0] = d[0], i
        for j in range(1, len(b) + 1):
            cur = d[j]
            d[j] = min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] != b[j - 1]))
            prev = cur
    return d[-1]

res = []
for gpath in golds:
    g = json.load(open(gpath, encoding='utf8'))
    items = [(e['cat'], e['entrada'], e['esperado']) for e in g['erros']] + [('limpo', t, t) for t in g['limpos']]
    for cat, entrada, esperado in items:
        t0 = time.time()
        out = correct(entrada)
        res.append({'conjunto': gpath.split('/')[-1], 'cat': cat, 'entrada': entrada, 'esperado': esperado, 'saida': out,
                    'exato': out.strip() == esperado.strip(), 'palavras_de_diferenca_para_o_esperado': dist(out, esperado),
                    'segundos': round(time.time() - t0, 1)})
        json.dump({'modelo': model_id, 'resultados': res}, open(out_path, 'w', encoding='utf8'), ensure_ascii=False, indent=1)
        print(len(res), cat, round(time.time() - t0, 1), 's', flush=True)
