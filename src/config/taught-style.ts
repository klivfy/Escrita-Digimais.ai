import { FORMALITIES, RECIPIENTS } from '../domain/types';
import type { LanguageProfile, Recipient } from '../domain/types';

/**
 * Estilo que o analista ensinou: saudação, fecho e assinatura. São só três linhas de texto simples, aplicadas por cima
 * do perfil (ver applyTaughtStyle). Nunca altera alertas, termos proibidos, textos obrigatórios nem política.
 */
export interface TaughtStyle {
  version: 1;
  /** Saudação, por exemplo "Bom dia, {nome},". O {nome} é trocado pelo primeiro nome informado e some se não houver nome. */
  greeting?: string;
  /** Destinatários a que a saudação se aplica; vazio ou ausente vale para todos. */
  recipients?: Recipient[];
  closing?: string;
  signature?: string;
}

export const MAX_STYLE_GREETING = 60;
export const MAX_STYLE_CLOSING = 120;
export const MAX_STYLE_SIGNATURE = 160;

// eslint-disable-next-line no-control-regex
const BAD_TEXT = /[\u0000-\u001F\u007F{}<>]|https?:\/\/|www\./iu;
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Marcador do nome do destinatário, permitido só na saudação. */
export const NAME_SLOT = '{nome}';

function line(value: unknown, max: number, allowNameSlot = false): string | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  const checked = allowNameSlot ? text.split(NAME_SLOT).join('') : text;
  return text && text.length <= max && !BAD_TEXT.test(checked) ? text : undefined;
}

/** Forma segura de um estilo vindo do armazenamento: só as três linhas e a lista de destinatários, ou null se nada sobra. */
export function sanitizeTaughtStyle(raw: unknown): TaughtStyle | null {
  if (!isObject(raw) || raw.version !== 1) return null;
  const style: TaughtStyle = { version: 1 };
  const greeting = line(raw.greeting, MAX_STYLE_GREETING, true);
  const closing = line(raw.closing, MAX_STYLE_CLOSING);
  const signature = line(raw.signature, MAX_STYLE_SIGNATURE);
  if (greeting) style.greeting = greeting;
  if (closing) style.closing = closing;
  if (signature) style.signature = signature;
  if (Array.isArray(raw.recipients)) {
    const list = RECIPIENTS.filter((r) => (raw.recipients as unknown[]).includes(r));
    if (list.length > 0 && list.length < RECIPIENTS.length) style.recipients = list;
  }
  return style.greeting || style.closing || style.signature ? style : null;
}

/** Perfil com o estilo ensinado por cima. Não altera o perfil recebido. */
export function applyTaughtStyle(profile: LanguageProfile, style: TaughtStyle | null): LanguageProfile {
  if (!style) return profile;
  const next = structuredClone(profile);
  if (style.greeting) {
    for (const f of FORMALITIES) for (const r of style.recipients ?? RECIPIENTS) next.greetings[f][r] = style.greeting;
  }
  if (style.closing) {
    for (const f of FORMALITIES) next.closings[f] = [style.closing, ...next.closings[f].filter((c) => c !== style.closing)];
  }
  if (style.signature) next.signature = style.signature;
  return next;
}
