import json, sys, time, torch
from transformers import AutoTokenizer, AutoModelForCausalLM
model_id = sys.argv[1]; out = sys.argv[2]
torch.set_num_threads(4)
tok = AutoTokenizer.from_pretrained(model_id)
t0=time.time()
m = AutoModelForCausalLM.from_pretrained(model_id, dtype=torch.bfloat16)
m.eval()
load = time.time()-t0
SYSTEM = ("Você escreve o corpo de mensagens de um analista de Service Desk brasileiro para o usuário do chamado. "
 "Escreva em português do Brasil, em parágrafos curtos e naturais, tom humano e cordial, falando em nome da equipe ('nós') e com a pessoa em segunda pessoa ('você', 'seu'). "
 "Use SOMENTE os fatos listados. Nunca invente prazos, causas, promessas ou ações. Preserve nomes, siglas, números, datas e horários exatamente. "
 "Não escreva saudação nem despedida nem assinatura (elas são adicionadas depois). Sem travessão, sem emoji, sem listas com marcadores, sem letras maiúsculas para ênfase. "
 "Se houver perguntas, mantenha cada pergunta como linha numerada. Responda somente com o corpo da mensagem.")
SHOTS = [
 ("Tipo: atualização de andamento\nSituação: impressora do 2º andar não imprime em cores\nFeito: reinstalamos o driver; limpamos a fila de impressão\nResultado: a impressão em preto e branco voltou; em cores segue sem imprimir\nPendente: troca do cartucho colorido pelo fornecedor\nPróximo passo: validar a impressão assim que o cartucho chegar",
  "Atualizamos o seu chamado sobre a impressora do 2º andar. Reinstalamos o driver e limpamos a fila de impressão, e com isso a impressão em preto e branco voltou a funcionar. Em cores, porém, ela continua sem imprimir.\n\nO que falta é a troca do cartucho colorido, que depende do fornecedor. Assim que o cartucho chegar, vamos validar a impressão com você."),
 ("Tipo: pedido de informações\nSituação: erro ao abrir o sistema de pedidos\nPerguntas: 1. Qual mensagem aparece na tela? 2. O erro acontece em outro computador?\nPrazo: 15/10/2026 às 16h",
  "Para continuar a análise do erro ao abrir o sistema de pedidos, precisamos de duas informações suas:\n\n1. Qual mensagem aparece na tela?\n2. O erro acontece em outro computador?\n\nSe puder responder até 15/10/2026 às 16h, conseguimos seguir com a análise."),
]
FACTS = json.load(open('fatos.json'))
res=[]
for f in FACTS:
    msgs=[{"role":"system","content":SYSTEM}]
    for u,a in SHOTS: msgs += [{"role":"user","content":u},{"role":"assistant","content":a}]
    msgs.append({"role":"user","content":f['facts']})
    ids = tok.apply_chat_template(msgs, add_generation_prompt=True, return_tensors='pt', return_dict=True, enable_thinking=False)
    t=time.time()
    with torch.no_grad():
        o = m.generate(**ids, max_new_tokens=300, do_sample=False, repetition_penalty=1.05)
    gen = o[0][ids['input_ids'].shape[1]:]
    dt=time.time()-t
    text = tok.decode(gen, skip_special_tokens=True).strip()
    res.append({'type':f['type'],'facts':f['facts'],'draft':f['draft'],'rewrite':text,'sec':round(dt,1),'tokens':int(gen.shape[0])})
    print(f['type'], round(dt,1),'s', int(gen.shape[0]),'tok', flush=True)
json.dump({'model':model_id,'load_sec':round(load,1),'results':res}, open(out,'w'), ensure_ascii=False, indent=1)
