/**
 * Limites da correção ortográfica por lista de frequência (camada 1). Medidos em scripts/estudo-correcao
 * (ortografia_freq.py): 0 sinalizações indevidas em 55 frases corretas e em 10 textos gerados pelo produto.
 * Mexeu em um limite? Rode src/tests/proofread.test.ts e atualize docs/ESTUDO-CORRECAO-TEXTO.md.
 */
export const PROOFREAD_LIMITS = {
  /** Camada A (só acento): a variante com acento precisa ter pelo menos este zipf e superar a palavra digitada por DELTA_A. */
  minZipfA: 3.0,
  deltaA: 1.5,
  /** Camada B (grafia): só para palavras raras (zipf até maxZipfB) com pelo menos minLenB letras. O candidato precisa ser comum. */
  maxZipfB: 1.8,
  minZipfB: 3.5,
  deltaB: 1.5,
  minLenB: 5,
} as const;

/** Termos de TI e produtos que a lista geral não conhece. Nunca são sinalizados. Minúsculas. */
export const PROOFREAD_DOMAIN_TERMS: ReadonlySet<string> = new Set([
  'spooler', 'proxy', 'firewall', 'driver', 'drivers', 'login', 'logs', 'log', 'reboot', 'plugin', 'plugins', 'toner',
  'notebook', 'notebooks', 'antivírus', 'wi-fi', 'e-mail', 'switch', 'backup', 'backups', 'token', 'tokens', 'windows',
  'outlook', 'teams', 'onedrive', 'sharepoint', 'defender', 'office', 'edge', 'chrome', 'vpn', 'dns', 'dhcp', 'erp', 'ssd',
  'ad', 'resetamos', 'resetadas', 'resetado', 'resetada', 'resetados', 'reiniciados', 'reiniciamos', 'reinstalamos',
  'reinstalado', 'reinstalada', 'reinstalados', 'reinstaladas', 'desbloqueamos', 'sincronizamos', 'desinstalamos',
  'formatamos', 'printscreen', 'print', 'prints', 'screenshot', 'ticket', 'tickets', 'chamado', 'chamados',
]);
