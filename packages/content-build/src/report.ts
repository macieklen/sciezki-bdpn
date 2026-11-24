/** Zbieranie komunikatów walidacji z kontekstem (np. która ścieżka, który przystanek). */
export type Level = 'error' | 'warning' | 'info';

export interface Message {
  level: Level;
  context: string;
  text: string;
}

export class Reporter {
  constructor(
    private readonly context: string,
    readonly messages: Message[] = [],
  ) {}

  error(text: string) { this.messages.push({ level: 'error', context: this.context, text }); }
  warning(text: string) { this.messages.push({ level: 'warning', context: this.context, text }); }
  info(text: string) { this.messages.push({ level: 'info', context: this.context, text }); }

  get hasErrors() { return this.messages.some((m) => m.level === 'error'); }

  /** Reporter z węższym kontekstem, zapisujący do tej samej listy. */
  child(context: string): Reporter {
    return new Reporter(`${this.context}/${context}`, this.messages);
  }
}

const ICON: Record<Level, string> = { error: '✖', warning: '⚠', info: 'ℹ' };
const COLOR: Record<Level, string> = { error: '\x1b[31m', warning: '\x1b[33m', info: '\x1b[36m' };

export function formatMessages(messages: Message[], { color = true, showInfo = true } = {}): string {
  return messages
    .filter((m) => showInfo || m.level !== 'info')
    .map((m) => {
      const line = `${ICON[m.level]} [${m.context}] ${m.text}`;
      return color ? `${COLOR[m.level]}${line}\x1b[0m` : line;
    })
    .join('\n');
}
