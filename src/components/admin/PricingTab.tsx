'use client';

import { calculateProductMetrics, formatBRL, formatPct } from '@/lib/pricing';
import { AppDatabaseState, Product } from '@/lib/types';
import { ArrowDownRight, ArrowUpRight, SlidersHorizontal } from 'lucide-react';
import { useMemo, useState } from 'react';

interface Props {
  state: AppDatabaseState;
  onUpdateState: (updater: (prev: AppDatabaseState) => AppDatabaseState) => void;
}

export default function PricingTab({ state, onUpdateState }: Props) {
  const [selectedProductId, setSelectedProductId] = useState<string>(
    state.products[0]?.id || ''
  );

  const selectedProduct = useMemo(
    () => state.products.find((p) => p.id === selectedProductId) || state.products[0],
    [state.products, selectedProductId]
  );

  const [simPaymentMode, setSimPaymentMode] = useState<
    'credito_infinite' | 'debito_infinite' | 'padrao'
  >('credito_infinite');

  const rows = useMemo(() => {
    return state.products.map((product) => {
      const metrics = calculateProductMetrics(product, state.ingredients);
      return { product, metrics };
    });
  }, [state.products, state.ingredients]);

  const averages = useMemo(() => {
    if (rows.length === 0) return null;
    const count = rows.length;
    return {
      avgCmv: rows.reduce((acc, r) => acc + r.metrics.totalCmv, 0) / count,
      avgFixed: rows.reduce((acc, r) => acc + r.product.fixedCostPct, 0) / count,
      avgTax: rows.reduce((acc, r) => acc + r.product.taxPct, 0) / count,
      avgFee: rows.reduce((acc, r) => acc + r.product.channelFeePct, 0) / count,
      avgTarget: rows.reduce((acc, r) => acc + r.product.targetMarginPct, 0) / count,
      avgSuggested: rows.reduce((acc, r) => acc + r.metrics.suggestedPrice, 0) / count,
      avgPracticed: rows.reduce((acc, r) => acc + r.metrics.practicedPrice, 0) / count,
      avgNetProfit: rows.reduce((acc, r) => acc + r.metrics.netProfit, 0) / count,
      avgRealMargin: rows.reduce((acc, r) => acc + r.metrics.realMarginPct, 0) / count,
    };
  }, [rows]);

  function updateProductField<K extends keyof Product>(
    productId: string,
    field: K,
    value: Product[K]
  ) {
    onUpdateState((prev) => ({
      ...prev,
      products: prev.products.map((p) =>
        p.id === productId ? { ...p, [field]: value } : p
      ),
    }));
  }

  const simResult = useMemo(() => {
    if (!selectedProduct) return null;
    const base = calculateProductMetrics(selectedProduct, state.ingredients);
    // Na tabela, product.taxPct já representa a taxa de Cartão de Crédito da InfinitePay (ex: 3,15%).
    // No simulador, comparamos o Crédito (padrão da tabela) com Débito (1,37%) ou PIX/Dinheiro (0%).
    let appliedCardFeePct = selectedProduct.taxPct;
    if (simPaymentMode === 'padrao') {
      appliedCardFeePct = state.settings.pixFeePct || 0;
    } else if (simPaymentMode === 'debito_infinite') {
      appliedCardFeePct = state.settings.debitCardFeePct || 0.0137;
    }

    const appliedCardFeeAmount = base.practicedPrice * appliedCardFeePct;
    const netProfitForMode =
      base.practicedPrice -
      base.totalCmv -
      base.fixedCostAmount -
      base.channelFeeAmount -
      appliedCardFeeAmount;
    const realMarginForMode =
      base.practicedPrice > 0 ? netProfitForMode / base.practicedPrice : 0;

    return {
      ...base,
      appliedCardFeePct,
      appliedCardFeeAmount,
      netProfit: netProfitForMode,
      realMarginPct: realMarginForMode,
    };
  }, [selectedProduct, simPaymentMode, state.ingredients, state.settings]);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-white/[0.08]">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100">Precificação e Margem</h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            Cálculo por Markup Divisor com Despesas Fixas (c/ MEI), Taxa Cartão Crédito InfinitePay e Taxa do Entregador.
          </p>
        </div>
        <div className="text-xs text-zinc-400 bg-[#121215] border border-white/[0.08] rounded-[6px] px-3 py-1.5 tabular-nums">
          Fórmula: CMV ÷ [1 - (Fixos c/ MEI + Cartão Créd. + Taxa Entrega + Margem Alvo)]
        </div>
      </div>

      {/* Main Pricing Table */}
      <div className="bg-[#121215] border border-white/[0.08] rounded-[10px] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-[#18181c] text-zinc-400 border-b border-white/[0.08]">
                <th className="py-3 px-4 font-medium">Produto</th>
                <th className="py-3 px-3 font-medium">Canal</th>
                <th className="py-3 px-3 font-medium text-right">CMV</th>
                <th className="py-3 px-3 font-medium text-center" title="Rateio das Despesas Fixas Mensais + Guia MEI">
                  Fixos + MEI (%)
                </th>
                <th className="py-3 px-3 font-medium text-center text-sky-300" title="Taxa da maquininha InfinitePay no Cartão de Crédito">
                  Cartão Créd. (%)
                </th>
                <th className="py-3 px-3 font-medium text-center text-orange-300" title="Reserva por lanche para pagar a diária do entregador">
                  Taxa Entrega (%)
                </th>
                <th className="py-3 px-3 font-medium text-center">Meta (%)</th>
                <th className="py-3 px-3 font-medium text-right">Sugerido</th>
                <th className="py-3 px-3 font-medium text-right">Praticado</th>
                <th className="py-3 px-3 font-medium text-right">Lucro Líq.</th>
                <th className="py-3 px-4 font-medium text-right">Margem Real</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06] tabular-nums">
              {rows.map(({ product, metrics }) => {
                const isSelected = product.id === selectedProduct?.id;
                const marginHealthy = metrics.realMarginPct >= product.targetMarginPct;
                const marginWarning =
                  metrics.realMarginPct >= 0.15 && metrics.realMarginPct < product.targetMarginPct;

                return (
                  <tr
                    key={product.id}
                    onClick={() => setSelectedProductId(product.id)}
                    className={`cursor-pointer ${
                      isSelected ? 'bg-white/[0.04]' : 'hover:bg-white/[0.02]'
                    }`}
                  >
                    <td className="py-2.5 px-4 font-medium text-zinc-100">
                      {product.name}
                    </td>
                    <td className="py-2.5 px-3 text-zinc-400">{product.channel}</td>
                    <td className="py-2.5 px-3 text-right text-zinc-300">
                      {formatBRL(metrics.totalCmv)}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <input
                        type="number"
                        step="0.1"
                        aria-label="Custos Fixos mais MEI Percentual"
                        value={Number((product.fixedCostPct * 100).toFixed(2))}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) =>
                          updateProductField(
                            product.id,
                            'fixedCostPct',
                            (parseFloat(e.target.value) || 0) / 100
                          )
                        }
                        className="w-16 bg-[#09090b] border border-white/[0.1] focus-visible:border-zinc-400 rounded-[6px] px-2 py-1 text-center text-zinc-200 outline-none"
                      />
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <input
                        type="number"
                        step="0.05"
                        aria-label="Taxa Cartão de Crédito InfinitePay Percentual"
                        value={Number((product.taxPct * 100).toFixed(2))}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) =>
                          updateProductField(
                            product.id,
                            'taxPct',
                            (parseFloat(e.target.value) || 0) / 100
                          )
                        }
                        className="w-16 bg-[#09090b] border border-sky-500/30 focus-visible:border-sky-400 rounded-[6px] px-2 py-1 text-center text-sky-200 outline-none"
                      />
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <input
                        type="number"
                        step="0.1"
                        aria-label="Taxa de Entrega Percentual"
                        value={Number((product.channelFeePct * 100).toFixed(2))}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) =>
                          updateProductField(
                            product.id,
                            'channelFeePct',
                            (parseFloat(e.target.value) || 0) / 100
                          )
                        }
                        className="w-16 bg-[#09090b] border border-orange-500/30 focus-visible:border-orange-400 rounded-[6px] px-2 py-1 text-center text-orange-200 outline-none"
                      />
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <input
                        type="number"
                        step="1"
                        aria-label="Margem Alvo Percentual"
                        value={Number((product.targetMarginPct * 100).toFixed(2))}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) =>
                          updateProductField(
                            product.id,
                            'targetMarginPct',
                            (parseFloat(e.target.value) || 0) / 100
                          )
                        }
                        className="w-16 bg-[#09090b] border border-white/[0.1] focus-visible:border-zinc-400 rounded-[6px] px-2 py-1 text-center text-zinc-200 outline-none"
                      />
                    </td>
                    <td className="py-2.5 px-3 text-right text-zinc-400">
                      {formatBRL(metrics.suggestedPrice)}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <input
                        type="number"
                        step="0.10"
                        aria-label="Preço Praticado"
                        value={product.practicedPrice}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) =>
                          updateProductField(
                            product.id,
                            'practicedPrice',
                            parseFloat(e.target.value) || 0
                          )
                        }
                        className="w-24 bg-[#09090b] border border-white/[0.16] focus-visible:border-zinc-300 rounded-[6px] px-2.5 py-1 text-right text-zinc-100 font-semibold outline-none"
                      />
                    </td>
                    <td className="py-2.5 px-3 text-right font-semibold text-zinc-100">
                      {formatBRL(metrics.netProfit)}
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-[6px] font-medium text-xs ${
                          marginHealthy
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : marginWarning
                            ? 'bg-amber-500/10 text-amber-300 border border-amber-500/20'
                            : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                        }`}
                      >
                        {marginHealthy ? (
                          <ArrowUpRight className="size-3.5" />
                        ) : (
                          <ArrowDownRight className="size-3.5" />
                        )}
                        {formatPct(metrics.realMarginPct, 1)}
                      </span>
                    </td>
                  </tr>
                );
              })}

              {averages && (
                <tr className="bg-[#18181c] border-t border-white/[0.12] font-semibold text-zinc-200">
                  <td className="py-3 px-4" colSpan={2}>
                    Média dos Produtos ({rows.length})
                  </td>
                  <td className="py-3 px-3 text-right">{formatBRL(averages.avgCmv)}</td>
                  <td className="py-3 px-3 text-center">{formatPct(averages.avgFixed, 1)}</td>
                  <td className="py-3 px-3 text-center">{formatPct(averages.avgTax, 1)}</td>
                  <td className="py-3 px-3 text-center">{formatPct(averages.avgFee, 1)}</td>
                  <td className="py-3 px-3 text-center">{formatPct(averages.avgTarget, 1)}</td>
                  <td className="py-3 px-3 text-right">{formatBRL(averages.avgSuggested)}</td>
                  <td className="py-3 px-3 text-right">{formatBRL(averages.avgPracticed)}</td>
                  <td className="py-3 px-3 text-right">{formatBRL(averages.avgNetProfit)}</td>
                  <td className="py-3 px-4 text-right text-emerald-400">
                    {formatPct(averages.avgRealMargin, 1)}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Simulator Panel */}
      {selectedProduct && simResult && (
        <div className="bg-[#121215] border border-white/[0.08] rounded-[10px] p-5 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-3 border-b border-white/[0.08]">
            <div className="flex items-center gap-2.5">
              <SlidersHorizontal className="size-4 text-zinc-400" />
              <div>
                <h2 className="text-sm font-semibold text-zinc-100">
                  Simulador por Meio de Recebimento — {selectedProduct.name}
                </h2>
                <p className="text-xs text-zinc-400">
                  Compare o lucro líquido conforme a forma de pagamento do cliente
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  {
                    id: 'credito_infinite',
                    label: `Cartão Crédito InfinitePay (${formatPct(selectedProduct.taxPct, 2)})`,
                  },
                  {
                    id: 'debito_infinite',
                    label: `Cartão Débito InfinitePay (${formatPct(state.settings.debitCardFeePct, 2)})`,
                  },
                  { id: 'padrao', label: 'PIX / Dinheiro (0% Maquininha)' },
                ] as const
              ).map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => setSimPaymentMode(mode.id)}
                  className={`px-3 py-1.5 rounded-[6px] text-xs font-medium transition ${
                    simPaymentMode === mode.id
                      ? 'bg-zinc-100 text-zinc-950'
                      : 'bg-[#18181c] text-zinc-300 hover:bg-zinc-800 border border-white/[0.08]'
                  }`}
                >
                  {mode.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 tabular-nums">
            <div className="bg-[#18181c] border border-white/[0.06] rounded-[8px] p-3">
              <p className="text-[11px] text-zinc-400">Preço Praticado</p>
              <p className="text-base font-semibold text-zinc-100 mt-1">
                {formatBRL(simResult.practicedPrice)}
              </p>
              <p className="text-[11px] text-zinc-500 mt-0.5">
                Sugerido: {formatBRL(simResult.suggestedPrice)}
              </p>
            </div>

            <div className="bg-[#18181c] border border-white/[0.06] rounded-[8px] p-3">
              <p className="text-[11px] text-zinc-400">CMV (Reposição)</p>
              <p className="text-base font-semibold text-rose-400 mt-1">
                -{formatBRL(simResult.totalCmv)}
              </p>
              <p className="text-[11px] text-zinc-500 mt-0.5">
                Alim: {formatBRL(simResult.foodCost)} | Emb: {formatBRL(simResult.packagingCost)}
              </p>
            </div>

            <div className="bg-[#18181c] border border-white/[0.06] rounded-[8px] p-3">
              <p className="text-[11px] text-zinc-400">
                Fixos + MEI ({formatPct(selectedProduct.fixedCostPct, 2)})
              </p>
              <p className="text-base font-semibold text-zinc-200 mt-1">
                -{formatBRL(simResult.fixedCostAmount)}
              </p>
              <p className="text-[11px] text-zinc-500 mt-0.5">Vira lucro após quitar o mês</p>
            </div>

            <div className="bg-[#18181c] border border-sky-500/25 rounded-[8px] p-3">
              <p className="text-[11px] text-sky-300 font-medium">
                Taxa Maquininha ({formatPct(simResult.appliedCardFeePct, 2)})
              </p>
              <p className="text-base font-semibold text-sky-300 mt-1">
                -{formatBRL(simResult.appliedCardFeeAmount)}
              </p>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                {simPaymentMode === 'padrao'
                  ? 'PIX/Dinheiro: vira lucro!'
                  : 'Taxa InfinitePay aplicada'}
              </p>
            </div>

            <div className="bg-[#18181c] border border-orange-500/25 rounded-[8px] p-3">
              <p className="text-[11px] text-orange-300 font-medium">
                Taxa Entrega ({formatPct(selectedProduct.channelFeePct, 1)})
              </p>
              <p className="text-base font-semibold text-orange-400 mt-1">
                -{formatBRL(simResult.channelFeeAmount)}
              </p>
              <p className="text-[11px] text-zinc-400 mt-0.5">Verba do entregador</p>
            </div>

            <div className="bg-[#18181c] border border-emerald-500/30 rounded-[8px] p-3">
              <p className="text-[11px] text-emerald-400 font-medium">Lucro Líquido</p>
              <p className="text-base font-semibold text-emerald-400 mt-1">
                {formatBRL(simResult.netProfit)}
              </p>
              <p className="text-[11px] text-zinc-300 mt-0.5">
                Margem: {formatPct(simResult.realMarginPct, 1)}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
