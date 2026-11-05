'use client';

import { PERIOD_OPTIONS, PeriodKey } from '@/lib/periods';
import { CalendarDays } from 'lucide-react';

interface Props {
  period: PeriodKey;
  customFrom: string;
  customTo: string;
  onChange: (next: { period: PeriodKey; customFrom: string; customTo: string }) => void;
}

export default function PeriodSelector({ period, customFrom, customTo, onChange }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <CalendarDays className="size-4 text-zinc-400" />
      <div className="flex flex-wrap items-center gap-1">
        {PERIOD_OPTIONS.filter((p) => p.key !== 'custom').map((opt) => (
          <button
            key={opt.key}
            type="button"
            onClick={() => onChange({ period: opt.key, customFrom, customTo })}
            className={`px-2.5 py-1 rounded-[6px] font-medium transition ${
              period === opt.key
                ? 'bg-zinc-100 text-zinc-950'
                : 'bg-[#18181c] border border-white/[0.08] text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {opt.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => onChange({ period: 'custom', customFrom, customTo })}
          className={`px-2.5 py-1 rounded-[6px] font-medium transition ${
            period === 'custom'
              ? 'bg-zinc-100 text-zinc-950'
              : 'bg-[#18181c] border border-white/[0.08] text-zinc-400 hover:text-zinc-200'
          }`}
        >
          Escolher datas
        </button>
      </div>

      {period === 'custom' && (
        <div className="flex items-center gap-1.5">
          <input
            type="date"
            aria-label="Data inicial"
            value={customFrom}
            onChange={(e) =>
              onChange({ period: 'custom', customFrom: e.target.value, customTo })
            }
            className="bg-[#09090b] border border-white/[0.12] rounded-[6px] px-2 py-1 text-zinc-100"
          />
          <span className="text-zinc-500">até</span>
          <input
            type="date"
            aria-label="Data final"
            value={customTo}
            onChange={(e) =>
              onChange({ period: 'custom', customFrom, customTo: e.target.value })
            }
            className="bg-[#09090b] border border-white/[0.12] rounded-[6px] px-2 py-1 text-zinc-100"
          />
        </div>
      )}
    </div>
  );
}
