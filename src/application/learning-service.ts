import { emptyLedger, ledgerTexts, mergeLedgers, sanitizeLedger } from '../config/learning-ledger';
import type { BlockRole, Ledger } from '../config/learning-ledger';
import { sanitizeTaughtStyle } from '../config/taught-style';
import type { TaughtStyle } from '../config/taught-style';
import { sanitizeTrainedStyle } from '../config/trained-style';
import type { TrainedStyle } from '../config/trained-style';
import { vetModel } from '../domain/library-vetting';
import { ingestTexts } from '../domain/style-corpus';
import type { IngestEntry, IngestReport } from '../domain/style-corpus';
import { vetStyle } from '../domain/style-learn';
import { approveItems, proposeTraining, toEngineText, vetLine } from '../domain/style-train';
import type { TrainingProposal } from '../domain/style-train';
import type { CommunicationType, LanguageProfile } from '../domain/types';
import type { AppStorage } from '../infrastructure/storage';
import { assertSameVersion, decryptLearning, encryptLearning, inspectLearningFile, LearningCryptoError } from './learning-crypto';
import type { EncryptedFile, LearningPayload } from './learning-crypto';

/**
 * Aprendizado contínuo local da equipe: acumular o que se ensina, treinar (consolidar em propostas), aprovar,
 * exportar e importar cifrado. Tudo roda no navegador; nada é enviado. O treino é determinístico e leve (milissegundos
 * por centenas de trechos), então roda na hora, sob demanda, e não precisa de processo em segundo plano.
 */

export interface LearningContext {
  /** Perfil em vigor (o mesmo da geração), para a triagem. */
  profile: LanguageProfile;
  /** Versão exata da extensão (do manifest). */
  version: string;
  now: Date;
}

export interface ImportSummary {
  fromVersion: string;
  createdAt: string;
  texts: number;
  blocks: number;
  labels: number;
  trainedItems: number;
  styleItems: number;
  /** Trechos do arquivo que não passam nas regras em vigor deste analista e ficaram de fora. */
  dropped: number;
}

export interface ImportPreview {
  ledger: Ledger | null;
  trained: TrainedStyle | null;
  style: TaughtStyle | null;
  summary: ImportSummary;
}

export interface ImportReport {
  texts: number;
  trainedItems: number;
  styleItems: number;
}

const dayOf = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export class LearningService {
  constructor(private readonly store: AppStorage, private readonly context: () => LearningContext) {}

  async ledger(): Promise<Ledger> {
    return (await this.store.loadLedger()) ?? emptyLedger(dayOf(this.context().now));
  }

  /** Acumula os textos ensinados no registro. O texto original nunca é guardado. */
  async ingest(entries: readonly IngestEntry[]): Promise<IngestReport> {
    const { profile, now } = this.context();
    const { ledger, report } = ingestTexts(await this.ledger(), entries, profile, now);
    if (report.accepted > 0) await this.store.saveLedger(ledger);
    return report;
  }

  /** Treino sob demanda: consolida o registro em propostas e marca o ponto de partida para avisar de novidades. */
  async train(): Promise<TrainingProposal> {
    const ledger = await this.ledger();
    const proposal = proposeTraining(ledger, this.context().profile);
    if (ledgerTexts(ledger) > 0 && ledger.textsAtTraining !== ledgerTexts(ledger)) {
      await this.store.saveLedger({ ...ledger, textsAtTraining: ledgerTexts(ledger) });
    }
    return proposal;
  }

  async approve(proposal: TrainingProposal, ids: readonly string[]): Promise<TrainedStyle | null> {
    const trained = approveItems(proposal, ids, await this.store.loadTrained());
    await this.store.saveTrained(trained);
    return trained;
  }

  /** Esquece um trecho guardado (o analista pode revisar e remover o que a extensão guardou). */
  async forget(type: CommunicationType, role: BlockRole | 'label', text: string): Promise<void> {
    const ledger = await this.store.loadLedger();
    const bucket = ledger?.byType[type];
    if (!ledger || !bucket) return;
    if (role === 'label') bucket.labels = bucket.labels.filter((l) => l.text !== text);
    else bucket.blocks = bucket.blocks.filter((b) => !(b.role === role && b.text === text));
    await this.store.saveLedger(ledger);
  }

  /** Apaga todo o aprendizado acumulado e o estilo treinado. */
  async reset(): Promise<void> {
    await this.store.resetTeamLearning();
  }

  /** Gera o arquivo cifrado. Exige senha. Lança LearningCryptoError com o motivo. */
  async exportFile(password: string): Promise<{ filename: string; text: string }> {
    const { version, now } = this.context();
    const [ledger, trained, style] = await Promise.all([this.store.loadLedger(), this.store.loadTrained(), this.store.loadTaughtStyle()]);
    if (!ledger && !trained && !style) {
      throw new LearningCryptoError('NOTHING_TO_EXPORT', 'Ainda não há aprendizado para exportar. Ensine alguns textos primeiro.');
    }
    const payload: LearningPayload = { kind: 'learning', version: 1, ledger, trained, style };
    const text = await encryptLearning(payload, password, version, now);
    return { filename: `aprendizado-digimais-${version}-${dayOf(now)}.json`, text };
  }

  /** Confere a forma e a versão do arquivo, sem senha. Use antes de pedir a senha. */
  inspect(text: string): EncryptedFile {
    const file = inspectLearningFile(text);
    assertSameVersion(file, this.context().version);
    return file;
  }

  /**
   * Decifra, valida e tria o conteúdo do arquivo com as regras em vigor, sem gravar nada. O analista vê o resumo e só
   * então assimila. Lança LearningCryptoError (versão, senha, arquivo corrompido, conteúdo inválido).
   */
  async previewImport(text: string, password: string): Promise<ImportPreview> {
    const { profile, version } = this.context();
    const file = inspectLearningFile(text);
    const payload = await decryptLearning(text, password, version);
    const invalid = (): never => {
      throw new LearningCryptoError('INVALID_CONTENT', 'O conteúdo do arquivo não passou na validação e nada foi importado.');
    };
    let dropped = 0;

    let ledger: Ledger | null = null;
    if (payload.ledger !== null && payload.ledger !== undefined) {
      const clean = sanitizeLedger(payload.ledger);
      if (!clean) return invalid();
      for (const bucket of Object.values(clean.byType)) {
        if (!bucket) continue;
        const type = (Object.keys(clean.byType) as CommunicationType[]).find((t) => clean.byType[t] === bucket) as CommunicationType;
        const before = bucket.blocks.length;
        bucket.blocks = bucket.blocks.filter(
          (b) => vetModel({ id: 'bloco', title: 'Bloco', types: [type], recipients: [], text: b.text, keywords: [], reviewedAt: '' }, profile).reasons.length === 0,
        );
        const labelsBefore = bucket.labels.length;
        bucket.labels = bucket.labels.filter((l) => vetLine(l.text, profile).length === 0);
        dropped += before - bucket.blocks.length + (labelsBefore - bucket.labels.length);
      }
      ledger = clean;
    }

    let trained: TrainedStyle | null = null;
    if (payload.trained) {
      const clean = sanitizeTrainedStyle(payload.trained);
      if (!clean) return invalid();
      const keep: TrainedStyle = { version: 1 };
      for (const kind of ['openings', 'closings'] as const) {
        for (const [type, t] of Object.entries(clean[kind] ?? {})) {
          if (vetLine(t, profile).length === 0 && toEngineText(t)) keep[kind] = { ...keep[kind], [type]: t };
          else dropped += 1;
        }
      }
      for (const [key, t] of Object.entries(clean.labels ?? {})) {
        if (vetLine(t, profile).length === 0) keep.labels = { ...keep.labels, [key]: t };
        else dropped += 1;
      }
      trained = sanitizeTrainedStyle(keep);
    }

    let style: TaughtStyle | null = null;
    if (payload.style) {
      const clean = sanitizeTaughtStyle(payload.style);
      if (!clean) return invalid();
      const keep: Omit<TaughtStyle, 'version'> = { ...(clean.recipients ? { recipients: clean.recipients } : {}) };
      for (const field of ['greeting', 'closing', 'signature'] as const) {
        const value = clean[field];
        if (!value) continue;
        if (vetStyle({ [field]: value }, profile).ok) keep[field] = value;
        else dropped += 1;
      }
      style = sanitizeTaughtStyle({ version: 1, ...keep });
    }

    const countOf = (m: Record<string, unknown> | undefined): number => Object.keys(m ?? {}).length;
    const buckets = ledger ? Object.values(ledger.byType) : [];
    return {
      ledger,
      trained,
      style,
      summary: {
        fromVersion: file.extensionVersion,
        createdAt: file.createdAt,
        texts: ledger ? ledgerTexts(ledger) : 0,
        blocks: buckets.reduce((n, b) => n + (b?.blocks.length ?? 0), 0),
        labels: buckets.reduce((n, b) => n + (b?.labels.length ?? 0), 0),
        trainedItems: countOf(trained?.openings) + countOf(trained?.closings) + countOf(trained?.labels),
        styleItems: [style?.greeting, style?.closing, style?.signature].filter(Boolean).length,
        dropped,
      },
    };
  }

  /**
   * Assimila o que o analista aceitou ver: soma as contagens ao registro e preenche só os espaços vazios do estilo
   * treinado e do estilo ensinado (o que o analista já aprovou nunca é sobrescrito).
   */
  async assimilate(preview: ImportPreview): Promise<ImportReport> {
    const { now } = this.context();
    if (preview.ledger) {
      const merged = mergeLedgers(await this.ledger(), preview.ledger);
      merged.updatedAt = dayOf(now) > merged.updatedAt ? dayOf(now) : merged.updatedAt;
      await this.store.saveLedger(merged);
    }
    let trainedItems = 0;
    if (preview.trained) {
      const mine = (await this.store.loadTrained()) ?? { version: 1 as const };
      const next: TrainedStyle = { version: 1, openings: { ...mine.openings }, closings: { ...mine.closings }, labels: { ...mine.labels } };
      for (const kind of ['openings', 'closings', 'labels'] as const) {
        for (const [k, v] of Object.entries(preview.trained[kind] ?? {})) {
          const slot = next[kind] as Record<string, string>;
          if (slot[k] === undefined) {
            slot[k] = v;
            trainedItems += 1;
          }
        }
      }
      await this.store.saveTrained(sanitizeTrainedStyle(next));
    }
    let styleItems = 0;
    if (preview.style) {
      const mine = await this.store.loadTaughtStyle();
      const next: TaughtStyle = { version: 1, ...(mine ?? {}) } as TaughtStyle;
      for (const field of ['greeting', 'closing', 'signature'] as const) {
        const value = preview.style[field];
        if (value && !next[field]) {
          next[field] = value;
          styleItems += 1;
          if (field === 'greeting' && preview.style.recipients && !mine?.recipients) next.recipients = preview.style.recipients;
        }
      }
      if (styleItems > 0) await this.store.saveTaughtStyle(next);
    }
    return { texts: preview.summary.texts, trainedItems, styleItems };
  }
}
