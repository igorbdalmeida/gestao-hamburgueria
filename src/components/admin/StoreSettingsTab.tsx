'use client';

import { AppDatabaseState } from '@/lib/types';
import { Bot, Eye, EyeOff, Phone, QrCode, Store } from 'lucide-react';
import { useState } from 'react';

interface Props {
  state: AppDatabaseState;
  onUpdateState: (updater: (prev: AppDatabaseState) => AppDatabaseState) => void;
}

const inputCls =
  'w-full bg-[#09090b] border border-white/[0.12] focus-visible:border-orange-500 rounded-[6px] px-3 py-1.5 text-zinc-100 outline-none';

export default function StoreSettingsTab({ state, onUpdateState }: Props) {
  const [showKey, setShowKey] = useState(false);
  const s = state.settings;

  function patch(partial: Partial<AppDatabaseState['settings']>) {
    onUpdateState((prev) => ({ ...prev, settings: { ...prev.settings, ...partial } }));
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="pb-2 border-b border-white/[0.08]">
        <h1 className="text-xl font-semibold text-zinc-100">Configurações da Loja</h1>
        <p className="text-xs text-zinc-400 mt-0.5">
          Dados que aparecem no cardápio e nos pedidos dos clientes. As alterações são salvas na nuvem
          automaticamente.
        </p>
      </div>

      {/* Recebimento de pedidos e pagamento */}
      <section className="bg-[#121215] border border-white/[0.08] rounded-[10px] p-5 space-y-4">
        <h2 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
          <Phone className="size-4 text-emerald-400" /> Recebimento de Pedidos e PIX
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div>
            <label className="text-zinc-300 font-medium block mb-1">
              WhatsApp da Loja (recebe os pedidos do cardápio)
            </label>
            <input
              type="tel"
              value={s.whatsappNumber}
              onChange={(e) => patch({ whatsappNumber: e.target.value })}
              placeholder="Ex: 5584999999999"
              className={`${inputCls} font-mono`}
            />
            <p className="text-[11px] text-zinc-500 mt-1">Formato: 55 + DDD + número, só dígitos.</p>
          </div>
          <div>
            <label className="text-zinc-300 font-medium flex items-center gap-1.5 mb-1">
              <QrCode className="size-3.5 text-orange-400" /> Chave PIX oficial
            </label>
            <input
              type="text"
              value={s.pixKey}
              onChange={(e) => patch({ pixKey: e.target.value })}
              placeholder="CPF, CNPJ, celular, e-mail ou chave aleatória"
              className={`${inputCls} font-mono`}
            />
          </div>
          <div>
            <label className="text-zinc-300 font-medium block mb-1">Nome do favorecido PIX</label>
            <input
              type="text"
              value={s.pixBeneficiary}
              onChange={(e) => patch({ pixBeneficiary: e.target.value })}
              placeholder="Seu nome ou razão social"
              className={inputCls}
            />
          </div>
        </div>
      </section>

      {/* Dados do cardápio */}
      <section className="bg-[#121215] border border-white/[0.08] rounded-[10px] p-5 space-y-4">
        <h2 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
          <Store className="size-4 text-orange-400" /> Cardápio Online
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div>
            <label className="text-zinc-300 font-medium block mb-1">Nome da loja</label>
            <input
              type="text"
              value={s.storeName}
              onChange={(e) => patch({ storeName: e.target.value })}
              className={inputCls}
            />
          </div>
          <div>
            <label className="text-zinc-300 font-medium block mb-1">Subtítulo do cardápio</label>
            <input
              type="text"
              value={s.storeSubtitle}
              onChange={(e) => patch({ storeSubtitle: e.target.value })}
              placeholder="Ex: Burger Artesanal na Brasa • Delivery Rápido"
              className={inputCls}
            />
          </div>
          <div>
            <label className="text-zinc-300 font-medium block mb-1">
              Tempo estimado de entrega (aparece para o cliente)
            </label>
            <input
              type="text"
              value={s.estimatedDeliveryMinutes}
              onChange={(e) => patch({ estimatedDeliveryMinutes: e.target.value })}
              placeholder="Ex: 40 - 55 min"
              className={`${inputCls} border-orange-500/40`}
            />
            <p className="text-[11px] text-zinc-500 mt-1">
              Aumente aqui quando a fila estiver grande (ex: 60 - 80 min).
            </p>
          </div>
          <div>
            <label className="text-zinc-300 font-medium block mb-1">Taxa de entrega padrão (R$)</label>
            <input
              type="number"
              step="0.5"
              min="0"
              value={s.deliveryFeeDefault}
              onChange={(e) => patch({ deliveryFeeDefault: parseFloat(e.target.value) || 0 })}
              className={`${inputCls} tabular-nums`}
            />
          </div>
        </div>

        <div className="bg-[#18181c] border border-white/[0.06] rounded-[8px] p-3.5 flex items-center justify-between text-xs">
          <span className="text-zinc-300">Status da loja no cardápio</span>
          <button
            type="button"
            onClick={() => patch({ storeOpen: !s.storeOpen })}
            className={`px-3 py-1.5 rounded-[6px] font-medium transition ${
              s.storeOpen
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
            }`}
          >
            {s.storeOpen ? 'Aberto para pedidos' : 'Fechado no momento'}
          </button>
        </div>
      </section>

      {/* IA de leitura de notas */}
      <section className="bg-[#121215] border border-white/[0.08] rounded-[10px] p-5 space-y-3">
        <h2 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
          <Bot className="size-4 text-sky-400" /> Leitura de Notas Fiscais com IA
        </h2>
        <p className="text-xs text-zinc-400 leading-relaxed">
          Para ler fotos de notas e cupons com precisão, cole abaixo uma chave gratuita do Google Gemini
          (crie em <strong className="text-zinc-200">aistudio.google.com/apikey</strong> — leva 1 minuto). Sem a
          chave, o sistema usa uma leitura de emergência menos precisa.
        </p>
        <div className="flex items-center gap-2 text-xs">
          <input
            type={showKey ? 'text' : 'password'}
            value={s.geminiApiKey || ''}
            onChange={(e) => patch({ geminiApiKey: e.target.value.trim() })}
            placeholder="Cole aqui sua chave (AIza...)"
            autoComplete="off"
            className={`${inputCls} font-mono`}
          />
          <button
            type="button"
            onClick={() => setShowKey((v) => !v)}
            aria-label={showKey ? 'Ocultar chave' : 'Mostrar chave'}
            className="p-2 rounded-[6px] bg-[#18181c] border border-white/[0.1] text-zinc-400 hover:text-zinc-200"
          >
            {showKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
        <p className="text-[11px] text-zinc-500">
          {s.geminiApiKey
            ? 'Chave configurada: a leitura de notas usará o Gemini.'
            : 'Nenhuma chave configurada ainda.'}
        </p>
      </section>
    </div>
  );
}
