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
    'padrao' | 'pix' | 'debito_infinite' | 'credito_infinite'
  >('padrao');
  const [targetDailyBurgers, setTargetDailyBurgers] = useState<number>(30);
  const [targetMonthlyDays, setTargetMonthlyDays] = useState<number>(8);

  const rows = useMemo(() => {
    return state.products.map((product) => {
      const metrics = calculateProductMetrics(product, state.ingredients);
      return { product, metrics };
    });
  }, [state.products, state.ingredients]);

  const burgerPlanner = useMemo(() => {
    const burgerRows = rows.filter((r) => r.product.category === 'Hambúrgueres');
    const list = burgerRows.length > 0 ? burgerRows : rows;
    if (list.length === 0) return null;
    const count = list.length;
    const avgPrice = list.reduce((a, r) => a + r.product.practicedPrice, 0) / count;
    const avgDeliveryPct = list.reduce((a, r) => a + r.product.channelFeePct, 0) / count;
    const avgFixedPct = list.reduce((a, r) => a + r.product.fixedCostPct, 0) / count;
    const avgTaxPct = list.reduce((a, r) => a + r.product.taxPct, 0) / count;
    const avgDeliveryPerBurger =
      list.reduce((a, r) => a + r.metrics.channelFeeAmount, 0) / count;
    const avgProfitPerBurger = list.reduce((a, r) => a + r.metrics.netProfit, 0) / count;
    const avgFixedPerBurger =
      list.reduce((a, r) => a + r.metrics.fixedCostAmount, 0) / count;
    const avgTaxPerBurger =
      list.reduce((a, r) => a + r.metrics.taxAmount, 0) / count;

    const dailyRevenue = avgPrice * targetDailyBurgers;
    const monthlyRevenue = dailyRevenue * targetMonthlyDays;
    const dailyDeliveryPool = avgDeliveryPerBurger * targetDailyBurgers;
    const dailyNetProfit = avgProfitPerBurger * targetDailyBurgers;
    const dailyFixedPool = avgFixedPerBurger * targetDailyBurgers;
    const dailyTaxPool = avgTaxPerBurger * targetDailyBurgers;

    // Separa MEI (R$ 80) dos demais custos fixos operacionais (R$ 519,90)
    const meiItems = state.fixedCosts.filter(
      (fc) => fc.category === 'Impostos Fixos (MEI)' || fc.id === 'fc-mei'
    );
    const opFixedItems = state.fixedCosts.filter(
      (fc) => fc.category !== 'Impostos Fixos (MEI)' && fc.id !== 'fc-mei'
    );
    const monthlyMeiTarget =
      meiItems.length > 0
        ? meiItems.reduce((a, b) => a + b.monthlyAmount, 0)
        : state.settings.meiMonthlyDas || 80;
    const monthlyOpFixedTarget = opFixedItems.reduce((a, b) => a + b.monthlyAmount, 0);

    // Percentuais exatos para pagar Custos Fixos e MEI dentro dos dias de funcionamento do mês (ex: 8 dias)
    const exactFixedPctForMonth =
      monthlyRevenue > 0 ? monthlyOpFixedTarget / monthlyRevenue : 0.0955;
    const exactTaxPctForMonth =
      monthlyRevenue > 0 ? monthlyMeiTarget / monthlyRevenue : 0.0147;

    // Percentual sugerido para juntar R$ 35/dia ou R$ 40/dia para o entregador
    const pctFor30 = dailyRevenue > 0 ? 30 / dailyRevenue : 0;
    const pctFor35 = dailyRevenue > 0 ? 35 / dailyRevenue : 0;
    const pctFor40 = dailyRevenue > 0 ? 40 / dailyRevenue : 0;

    return {
      avgPrice,
      avgDeliveryPct,
      avgFixedPct,
      avgTaxPct,
      avgDeliveryPerBurger,
      avgProfitPerBurger,
      dailyRevenue,
      monthlyRevenue,
      dailyDeliveryPool,
      dailyNetProfit,
      dailyFixedPool,
      dailyTaxPool,
      monthlyMeiTarget,
      monthlyOpFixedTarget,
      exactFixedPctForMonth,
      exactTaxPctForMonth,
      pctFor30,
      pctFor35,
      pctFor40,
    };
  }, [rows, targetDailyBurgers, targetMonthlyDays, state.fixedCosts, state.settings]);

  function applyFullCalibrationForSchedule(deliveryPctDecimal?: number) {
    if (!burgerPlanner) return;
    const cleanFixed = Number(burgerPlanner.exactFixedPctForMonth.toFixed(4));
    const cleanTax = Number(burgerPlanner.exactTaxPctForMonth.toFixed(4));
    onUpdateState((prev) => ({
      ...prev,
      settings: {
        ...prev.settings,
        defaultFixedCostPct: cleanFixed,
        estimatedTaxPct: cleanTax,
      },
      products: prev.products.map((p) => ({
        ...p,
        fixedCostPct: cleanFixed,
        taxPct: cleanTax,
        channelFeePct:
          deliveryPctDecimal !== undefined
            ? Number(deliveryPctDecimal.toFixed(4))
            : p.channelFeePct,
      })),
    }));
  }

  function applyDeliveryPctToBurgers(pctDecimal: number) {
    const cleanPct = Number(pctDecimal.toFixed(4));
    onUpdateState((prev) => ({
      ...prev,
      products: prev.products.map((p) =>
        p.category === 'Hambúrgueres' ? { ...p, channelFeePct: cleanPct } : p
      ),
    }));
  }

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
    let cardFeePct = 0;
    if (simPaymentMode === 'pix') cardFeePct = state.settings.pixFeePct;
    else if (simPaymentMode === 'debito_infinite') cardFeePct = state.settings.debitCardFeePct;
    else if (simPaymentMode === 'credito_infinite') cardFeePct = state.settings.creditCardFeePct;

    const cardFeeAmount = base.practicedPrice * cardFeePct;
    const netProfitAfterCard = base.netProfit - cardFeeAmount;
    const realMarginAfterCard =
      base.practicedPrice > 0 ? netProfitAfterCard / base.practicedPrice : 0;

    return {
      ...base,
      cardFeePct,
      cardFeeAmount,
      netProfit: netProfitAfterCard,
      realMarginPct: realMarginAfterCard,
    };
  }, [selectedProduct, simPaymentMode, state.ingredients, state.settings]);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-white/[0.08]">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100">Precificação e Margem</h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            Cálculo por Markup Divisor conectado às fichas técnicas e à provisão do entregador.
          </p>
        </div>
        <div className="text-xs text-zinc-400 bg-[#121215] border border-white/[0.08] rounded-[6px] px-3 py-1.5 tabular-nums">
          Fórmula: CMV ÷ [1 - (Fixos + Impostos + Taxa Entrega + Margem Alvo)]
        </div>
      </div>

      {/* Planejador Rápido: Meta Diária de Lanches, 8 Dias no Mês & Diária do Entregador */}
      {burgerPlanner && (
        <div className="bg-[#121215] border border-orange-500/25 rounded-[10px] p-4 space-y-3">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-orange-400">
                Planejador de Produção (Finais de Semana: {targetMonthlyDays} dias/mês • {targetDailyBurgers} lanches/dia)
              </h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                Calibrado para quitar os <strong className="text-zinc-200">{formatBRL(burgerPlanner.monthlyOpFixedTarget)} de Custos Fixos</strong> + <strong className="text-zinc-200">{formatBRL(burgerPlanner.monthlyMeiTarget)} do MEI</strong> em {targetMonthlyDays} dias e tirar a diária do entregador todo dia.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs">
              <label className="text-zinc-300 font-medium flex items-center gap-1.5 bg-[#18181c] border border-white/[0.08] rounded-[6px] px-2.5 py-1.5">
                <span>Meta/dia:</span>
                <input
                  type="number"
                  min={1}
                  max={500}
                  value={targetDailyBurgers}
                  onChange={(e) =>
                    setTargetDailyBurgers(Math.max(1, parseInt(e.target.value, 10) || 1))
                  }
                  className="w-12 bg-[#09090b] border border-white/[0.12] rounded px-1.5 py-0.5 text-center text-zinc-100 font-semibold tabular-nums"
                />
              </label>

              <label className="text-zinc-300 font-medium flex items-center gap-1.5 bg-[#18181c] border border-white/[0.08] rounded-[6px] px-2.5 py-1.5">
                <span>Dias/mês:</span>
                <input
                  type="number"
                  min={1}
                  max={31}
                  value={targetMonthlyDays}
                  onChange={(e) =>
                    setTargetMonthlyDays(
                      Math.min(31, Math.max(1, parseInt(e.target.value, 10) || 1))
                    )
                  }
                  className="w-12 bg-[#09090b] border border-white/[0.12] rounded px-1.5 py-0.5 text-center text-zinc-100 font-semibold tabular-nums"
                />
              </label>

              <button
                type="button"
                onClick={() => applyFullCalibrationForSchedule(0.06)}
                className="px-2.5 py-1.5 rounded-[6px] bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 font-medium transition"
                title="Ajusta Fixos (%), Impostos (%) e Taxa Entrega (6%) exatamente para os dias e lanches escolhidos"
              >
                Calibrar Tudo p/ {targetMonthlyDays} Dias ({formatPct(burgerPlanner.exactFixedPctForMonth, 2)} Fixo • {formatPct(burgerPlanner.exactTaxPctForMonth, 2)} MEI • 6% Entregador)
              </button>
              <button
                type="button"
                onClick={() => applyDeliveryPctToBurgers(burgerPlanner.pctFor35)}
                className="px-2.5 py-1.5 rounded-[6px] bg-[#18181c] hover:bg-zinc-800 text-zinc-200 border border-white/[0.08] font-medium transition"
              >
                Entregador R$ 35/dia ({formatPct(burgerPlanner.pctFor35, 1)})
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs tabular-nums pt-1">
            <div className="bg-[#18181c] border border-white/[0.06] rounded-[8px] p-3">
              <span className="text-zinc-400">
                Faturamento ({targetDailyBurgers} un/dia • {targetDailyBurgers * targetMonthlyDays} un/mês)
              </span>
              <p className="text-base font-semibold text-zinc-100 mt-0.5">
                {formatBRL(burgerPlanner.dailyRevenue)}/dia
              </p>
              <span className="text-[11px] text-zinc-500">
                No mês ({targetMonthlyDays} dias): {formatBRL(burgerPlanner.monthlyRevenue)}
              </span>
            </div>

            <div className="bg-[#18181c] border border-orange-500/25 rounded-[8px] p-3">
              <span className="text-orange-300 font-medium">
                Verba do Entregador ({formatPct(burgerPlanner.avgDeliveryPct, 1)})
              </span>
              <p className="text-base font-semibold text-orange-400 mt-0.5">
                {formatBRL(burgerPlanner.dailyDeliveryPool)}/dia
              </p>
              <span className="text-[11px] text-zinc-400">
                {formatBRL(burgerPlanner.avgDeliveryPerBurger)}/lanche • {formatBRL(burgerPlanner.dailyDeliveryPool * targetMonthlyDays)} nos {targetMonthlyDays} dias
              </span>
            </div>

            <div className="bg-[#18181c] border border-white/[0.06] rounded-[8px] p-3">
              <span className="text-zinc-400">
                Custos Fixos ({formatPct(burgerPlanner.avgFixedPct, 2)}) + MEI ({formatPct(burgerPlanner.avgTaxPct, 2)})
              </span>
              <p className="text-base font-semibold text-zinc-200 mt-0.5">
                {formatBRL(burgerPlanner.dailyFixedPool)}/dia + {formatBRL(burgerPlanner.dailyTaxPool)}/dia MEI
              </p>
              <span className="text-[11px] text-zinc-500">
                Junta {formatBRL(burgerPlanner.dailyFixedPool * targetMonthlyDays)} Fixos + {formatBRL(burgerPlanner.dailyTaxPool * targetMonthlyDays)} MEI nos {targetMonthlyDays} dias
              </span>
            </div>

            <div className="bg-[#18181c] border border-emerald-500/25 rounded-[8px] p-3">
              <span className="text-emerald-400 font-medium">Lucro Líquido Limpo</span>
              <p className="text-base font-semibold text-emerald-400 mt-0.5">
                {formatBRL(burgerPlanner.dailyNetProfit)}/dia
              </p>
              <span className="text-[11px] text-zinc-400">
                {formatBRL(burgerPlanner.dailyNetProfit * targetMonthlyDays)} líquidos nos {targetMonthlyDays} dias (+refrigerantes/batatas!)
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Main Pricing Table */}
      <div className="bg-[#121215] border border-white/[0.08] rounded-[10px] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-[#18181c] text-zinc-400 border-b border-white/[0.08]">
                <th className="py-3 px-4 font-medium">Produto</th>
                <th className="py-3 px-3 font-medium">Canal</th>
                <th className="py-3 px-3 font-medium text-right">CMV</th>
                <th className="py-3 px-3 font-medium text-center">Fixos (%)</th>
                <th className="py-3 px-3 font-medium text-center">Impostos (%)</th>
                <th className="py-3 px-3 font-medium text-center text-orange-300">Taxa Entrega (%)</th>
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
                        step="0.5"
                        aria-label="Custos Fixos Percentual"
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
                        step="0.1"
                        aria-label="Impostos Percentual"
                        value={Number((product.taxPct * 100).toFixed(2))}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) =>
                          updateProductField(
                            product.id,
                            'taxPct',
                            (parseFloat(e.target.value) || 0) / 100
                          )
                        }
                        className="w-16 bg-[#09090b] border border-white/[0.1] focus-visible:border-zinc-400 rounded-[6px] px-2 py-1 text-center text-zinc-200 outline-none"
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
                  { id: 'padrao', label: 'PIX / Dinheiro (0% maq.)' },
                  { id: 'debito_infinite', label: `Cartão Débito (+${formatPct(state.settings.debitCardFeePct, 2)} maq.)` },
                  { id: 'credito_infinite', label: `Cartão Crédito (+${formatPct(state.settings.creditCardFeePct, 2)} maq.)` },
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
                Custos Fixos ({formatPct(selectedProduct.fixedCostPct, 1)})
              </p>
              <p className="text-base font-semibold text-zinc-200 mt-1">
                -{formatBRL(simResult.fixedCostAmount)}
              </p>
              <p className="text-[11px] text-zinc-500 mt-0.5">Vira lucro após quitar o mês</p>
            </div>

            <div className="bg-[#18181c] border border-white/[0.06] rounded-[8px] p-3">
              <p className="text-[11px] text-zinc-400">
                Impostos ({formatPct(selectedProduct.taxPct, 1)})
              </p>
              <p className="text-base font-semibold text-zinc-200 mt-1">
                -{formatBRL(simResult.taxAmount)}
              </p>
              <p className="text-[11px] text-zinc-500 mt-0.5">Reserva MEI / Fiscal</p>
            </div>

            <div className="bg-[#18181c] border border-orange-500/25 rounded-[8px] p-3">
              <p className="text-[11px] text-orange-300 font-medium">
                Taxa Entrega ({formatPct(selectedProduct.channelFeePct, 1)})
              </p>
              <p className="text-base font-semibold text-orange-400 mt-1">
                -{formatBRL(simResult.channelFeeAmount)}
              </p>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                {simResult.cardFeeAmount > 0
                  ? `+Maq: -${formatBRL(simResult.cardFeeAmount)}`
                  : 'Verba do entregador'}
              </p>
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
