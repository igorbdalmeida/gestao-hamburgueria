/**
 * Utilitários de data/período no fuso horário da loja (Brasil).
 * Evita o erro de contar pedidos feitos à noite (após 21h) como se fossem do dia seguinte (UTC).
 */

export const STORE_TZ = 'America/Sao_Paulo';

const dateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: STORE_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Converte um instante (ISO ou Date) para YYYY-MM-DD no fuso da loja. */
export function toLocalDate(input: string | Date): string {
  const d = typeof input === 'string' ? new Date(input) : input;
  if (Number.isNaN(d.getTime())) return '';
  return dateFormatter.format(d);
}

export function todayLocal(): string {
  return toLocalDate(new Date());
}

export function addDaysToDate(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const base = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

export function formatDateBR(dateStr: string): string {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

/** Data (YYYY-MM-DD) em que o pedido foi feito, no fuso da loja. */
export function orderLocalDate(o: { createdAt?: string; date: string }): string {
  if (o.createdAt) {
    const local = toLocalDate(o.createdAt);
    if (local) return local;
  }
  return o.date;
}

export type PeriodKey = 'hoje' | 'ontem' | '7d' | '30d' | 'mes' | 'tudo' | 'custom';

export const PERIOD_OPTIONS: { key: PeriodKey; label: string }[] = [
  { key: 'hoje', label: 'Hoje' },
  { key: 'ontem', label: 'Ontem' },
  { key: '7d', label: 'Últimos 7 dias' },
  { key: '30d', label: 'Últimos 30 dias' },
  { key: 'mes', label: 'Este mês' },
  { key: 'tudo', label: 'Tudo' },
  { key: 'custom', label: 'Período personalizado' },
];

export interface DateRange {
  from?: string; // inclusive
  to?: string; // inclusive
  label: string;
}

export function resolvePeriod(
  key: PeriodKey,
  custom?: { from?: string; to?: string }
): DateRange {
  const today = todayLocal();
  switch (key) {
    case 'hoje':
      return { from: today, to: today, label: 'Hoje' };
    case 'ontem': {
      const y = addDaysToDate(today, -1);
      return { from: y, to: y, label: 'Ontem' };
    }
    case '7d':
      return { from: addDaysToDate(today, -6), to: today, label: 'Últimos 7 dias' };
    case '30d':
      return { from: addDaysToDate(today, -29), to: today, label: 'Últimos 30 dias' };
    case 'mes':
      return { from: `${today.slice(0, 8)}01`, to: today, label: 'Este mês' };
    case 'custom': {
      const from = custom?.from || undefined;
      const to = custom?.to || undefined;
      const label =
        from && to
          ? from === to
            ? formatDateBR(from)
            : `${formatDateBR(from)} a ${formatDateBR(to)}`
          : 'Período personalizado';
      return { from, to, label };
    }
    default:
      return { label: 'Todo o período' };
  }
}

export function isDateInRange(dateStr: string, range: DateRange): boolean {
  if (!dateStr) return false;
  if (range.from && dateStr < range.from) return false;
  if (range.to && dateStr > range.to) return false;
  return true;
}
