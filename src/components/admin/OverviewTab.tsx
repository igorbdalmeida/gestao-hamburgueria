'use client';

import {
  calculateOrderFinancials,
  calculatePeriodFinancialSummary,
  calculateProductMetrics,
  formatBRL,
  formatPct,
} from '@/lib/pricing';
import { AppDatabaseState } from '@/lib/types';
import {
  ArrowRight,
  DollarSign,
  FileText,
  Percent,
  Plus,
  ShoppingBag,
  TrendingUp,
} from 'lucide-react';
import PeriodSelector from './PeriodSelector';
import {
  isDateInRange,
  orderLocalDate,
  PeriodKey,
  resolvePeriod,
} from '@/lib/periods';
import { useMemo, useState } from 'react';

interface Props {
  state: AppDatabaseState;
  onNavigate: (
    tab:
      | 'overview'
      | 'precificacao'
      | 'fichas'
      | 'insumos'
      | 'notas'
      | 'vendas'
      | 'clientes'
      | 'financeiro'
      | 'configuracoes'
  ) => void;
}

export default function OverviewTab({ state, onNavigate }: Props) {
  const [period, setPeriod] = useState<PeriodKey>('hoje');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const range = useMemo(
    () => resolvePeriod(period, { from: customFrom, to: customTo }),
    [period, customFrom, customTo]
  );

  const analytics = useMemo(() => {
    const periodOrders = state.orders.filter((o) => isDateInRange(orderLocalDate(o), range));
    const cancelledCount = periodOrders.filter((o) => o.status === 'Cancelado').length;
    const validOrders = periodOrders.filter((o) => o.status !== 'Cancelado');
    const periodInvoices = state.invoices.filter((inv) => isDateInRange(inv.date, range));

    // Itens mais vendidos e formas de pagamento no período
    const itemMap: Record<string, { name: string; qty: number; revenue: number }> = {};
    const payMap: Record<string, { count: number; total: number }> = {};
    for (const o of validOrders) {
      for (const it of o.items) {
        const cur = itemMap[it.productId] || { name: it.productName, qty: 0, revenue: 0 };
        cur.qty += it.quantity;
        cur.revenue += it.unitPrice * it.quantity;
        itemMap[it.productId] = cur;
      }
      const label = o.paymentMethod.replace(' (Na Entrega)', '').replace(' (Mercado Pago / Chave)', '');
      const pm = payMap[label] || { count: 0, total: 0 };
      pm.count += 1;
      pm.total += o.totalAmount;
      payMap[label] = pm;
    }
    const topItems = Object.values(itemMap).sort((a, b) => b.qty - a.qty).slice(0, 5);
    const paymentSeries = Object.entries(payMap)
      .map(([label, v]) => ({ label, ...v }))
      .sort((a, b) => b.total - a.total);
    const recentOrders = [...periodOrders].sort((a, b) =>
      (b.createdAt || '').localeCompare(a.createdAt || '')
    );

    // Acumulado de custos fixos e impostos em dias anteriores do mesmo mês (para saber se o mês já quitou os tetos)
    const refMonthPrefix = (range.from || orderLocalDate(validOrders[0] || { date: '' }) || new Date().toISOString().slice(0, 10)).slice(0, 7);
    let priorFixedCostAccumulated = 0;
    let priorTaxAccumulated = 0;
    if (range.from) {
      for (const o of state.orders) {
        if (o.status === 'Cancelado') continue;
        const d = orderLocalDate(o);
        if (d.startsWith(refMonthPrefix) && d < range.from) {
          const fin = calculateOrderFinancials(o, state.products, state.ingredients, state.settings);
          priorFixedCostAccumulated += fin.fixedCostAllocationAmount;
          priorTaxAccumulated += fin.taxReserveAmount;
        }
      }
    }

    const finSummary = calculatePeriodFinancialSummary(
      validOrders,
      state.products,
      state.ingredients,
      state.fixedCosts,
      state.settings,
      priorFixedCostAccumulated,
      priorTaxAccumulated
    );

    const totalPurchases = periodInvoices.reduce((acc, inv) => acc + inv.totalAmount, 0);

    const productRows = state.products.map((product) => {
      const metrics = calculateProductMetrics(product, state.ingredients);
      return {
        id: product.id,
        name: product.shortName || product.name,
        category: product.category,
        cmv: metrics.totalCmv,
        price: metrics.practicedPrice,
        netProfit: metrics.netProfit,
        realMarginPct: metrics.realMarginPct,
        targetMarginPct: product.targetMarginPct,
      };
    });

    const avgRealMargin =
      productRows.length > 0
        ? productRows.reduce((acc, r) => acc + r.realMarginPct, 0) / productRows.length
        : 0;

    // Expense breakdown by category from invoices
    const categoryTotals: Record<string, number> = {};
    for (const inv of periodInvoices) {
      for (const item of inv.items) {
        categoryTotals[item.category] = (categoryTotals[item.category] || 0) + item.totalPrice;
      }
    }
    const categorySeries = Object.entries(categoryTotals)
      .map(([cat, total]) => ({
        category: cat,
        total,
        pct: totalPurchases > 0 ? total / totalPurchases : 0,
      }))
      .sort((a, b) => b.total - a.total);

    return {
      ordersCount: validOrders.length,
      cancelledCount,
      avgTicket: validOrders.length > 0 ? finSummary.grossRevenue / validOrders.length : 0,
      topItems,
      paymentSeries,
      recentOrders,
      periodInvoices,
      grossRevenue: finSummary.grossRevenue,
      totalSalesCmv: finSummary.totalSalesCmv,
      totalTax: finSummary.totalTaxReserve,
      taxOverflowToProfit: finSummary.taxOverflowToProfit,
      totalMonthlyTaxTarget: finSummary.totalMonthlyTaxTarget,
      totalMonthTaxAccumulated: finSummary.totalMonthTaxAccumulated,
      taxCoveragePct: finSummary.taxCoveragePct,
      isTaxFullyPaid: finSummary.isTaxFullyPaid,
      totalDeliveryDriver: finSummary.totalDeliveryDriverReserve,
      totalCardMachineFee: finSummary.totalCardMachineFee,
      rawFixedCostReserve: finSummary.rawFixedCostReserve,
      effectiveFixedCost: finSummary.effectiveFixedCost,
      fixedCostOverflowToProfit: finSummary.fixedCostOverflowToProfit + finSummary.taxOverflowToProfit,
      baseNetProfit: finSummary.baseNetProfit,
      netOperatingProfit: finSummary.realNetProfit,
      totalFixedCosts: finSummary.totalMonthlyFixedTarget,
      totalMonthlyAllBills: finSummary.totalMonthlyAllBills,
      totalMonthFixedAccumulated: finSummary.totalMonthFixedAccumulated,
      fixedCostCoveragePct: finSummary.fixedCostCoveragePct,
      isFixedCostFullyPaid: finSummary.isFixedCostFullyPaid,
      missingToPayFixedCosts: finSummary.missingToPayFixedCosts,
      totalPurchases,
      avgRealMargin,
      productRows,
      categorySeries,
    };
  }, [state, range]);

  const maxProductPrice = Math.max(
    1,
    ...analytics.productRows.map((r) => r.price)
  );

  return (
    <div className="space-y-6">
      {/* Page-Level Control Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-white/[0.08]">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100 text-balance">
            Visão Geral
          </h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            Receita, lucro e compras de: <strong className="text-zinc-200">{range.label}</strong>. Escolha o período ao lado.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onNavigate('notas')}
            className="btn-saas-secondary"
          >
            <FileText className="size-4 text-zinc-400" />
            Lançar Nota Fiscal
          </button>
          <button
            type="button"
            onClick={() => onNavigate('vendas')}
            className="btn-saas-primary"
          >
            <Plus className="size-4" />
            Registrar Venda
          </button>
        </div>
      </div>

      <div className="bg-[#121215] border border-white/[0.08] rounded-[10px] px-4 py-3">
        <PeriodSelector
          period={period}
          customFrom={customFrom}
          customTo={customTo}
          onChange={(n) => {
            setPeriod(n.period);
            setCustomFrom(n.customFrom);
            setCustomTo(n.customTo);
          }}
        />
      </div>

      {/* Top KPI Grid (Strictly 4 columns, single row on desktop per Anti-Slop Design) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#121215] border border-white/[0.08] rounded-[10px] p-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>Receita de Vendas</span>
            <DollarSign className="size-4 text-zinc-500" />
          </div>
          <div className="text-2xl font-semibold text-zinc-100 tabular-nums">
            {formatBRL(analytics.grossRevenue)}
          </div>
          <div className="flex items-center justify-between text-xs text-zinc-500 pt-1 border-t border-white/[0.05]">
            <span>Pedidos • ticket médio</span>
            <span className="tabular-nums text-zinc-300 font-medium">
              {analytics.ordersCount} • {formatBRL(analytics.avgTicket)}
            </span>
          </div>
        </div>

        <div className="bg-[#121215] border border-white/[0.08] rounded-[10px] p-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>Lucro Líquido (Vendas)</span>
            <TrendingUp className="size-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-semibold text-emerald-400 tabular-nums">
            {formatBRL(analytics.netOperatingProfit)}
          </div>
          <div className="flex items-center justify-between text-xs text-zinc-500 pt-1 border-t border-white/[0.05]">
            <span>
              {analytics.fixedCostOverflowToProfit > 0
                ? 'Inclui sobra de fixos'
                : 'Entregador + Impostos'}
            </span>
            <span className="tabular-nums text-zinc-300 font-medium">
              {analytics.fixedCostOverflowToProfit > 0
                ? `+${formatBRL(analytics.fixedCostOverflowToProfit)}`
                : formatBRL(analytics.totalDeliveryDriver + analytics.totalTax)}
            </span>
          </div>
        </div>

        <div className="bg-[#121215] border border-white/[0.08] rounded-[10px] p-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>Taxas do Entregador (Período)</span>
            <Percent className="size-4 text-orange-400" />
          </div>
          <div className="text-2xl font-semibold text-orange-400 tabular-nums">
            {formatBRL(analytics.totalDeliveryDriver)}
          </div>
          <div className="flex items-center justify-between text-xs text-zinc-500 pt-1 border-t border-white/[0.05]">
            <span>Margem média cardápio</span>
            <span className="tabular-nums text-zinc-300 font-medium">
              {formatPct(analytics.avgRealMargin, 1)}
            </span>
          </div>
        </div>

        <div className="bg-[#121215] border border-white/[0.08] rounded-[10px] p-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>Quitação de Custos Fixos</span>
            <ShoppingBag className="size-4 text-zinc-500" />
          </div>
          <div className="text-2xl font-semibold text-zinc-100 tabular-nums">
            {formatBRL(Math.min(analytics.totalMonthFixedAccumulated, analytics.totalFixedCosts))}
            <span className="text-xs font-normal text-zinc-400">
              {' '}
              / {formatBRL(analytics.totalFixedCosts)}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs text-zinc-500 pt-1 border-t border-white/[0.05]">
            <span>Status das contas do mês</span>
            <span
              className={`tabular-nums font-medium ${
                analytics.isFixedCostFullyPaid ? 'text-emerald-400' : 'text-amber-300'
              }`}
            >
              {analytics.isFixedCostFullyPaid
                ? '100% Quitado (Sobra = Lucro)'
                : `Faltam ${formatBRL(analytics.missingToPayFixedCosts)}`}
            </span>
          </div>
        </div>
      </div>

      {/* Itens mais vendidos e formas de pagamento no período */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-[#121215] border border-white/[0.08] rounded-[10px] p-5 space-y-3">
          <h2 className="text-sm font-semibold text-zinc-100">Itens Mais Vendidos — {range.label}</h2>
          {analytics.topItems.length === 0 ? (
            <p className="text-xs text-zinc-500">Nenhuma venda neste período.</p>
          ) : (
            <div className="divide-y divide-white/[0.06] text-xs">
              {analytics.topItems.map((it) => (
                <div key={it.name} className="py-2 flex items-center justify-between">
                  <span className="text-zinc-200 truncate max-w-[60%]">{it.name}</span>
                  <span className="tabular-nums text-zinc-400">
                    <strong className="text-zinc-100">{it.qty}x</strong> • {formatBRL(it.revenue)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="bg-[#121215] border border-white/[0.08] rounded-[10px] p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-100">Formas de Pagamento</h2>
            {analytics.cancelledCount > 0 && (
              <span className="text-[11px] text-rose-400">{analytics.cancelledCount} cancelado(s)</span>
            )}
          </div>
          {analytics.paymentSeries.length === 0 ? (
            <p className="text-xs text-zinc-500">Nenhuma venda neste período.</p>
          ) : (
            <div className="divide-y divide-white/[0.06] text-xs">
              {analytics.paymentSeries.map((pm) => (
                <div key={pm.label} className="py-2 flex items-center justify-between">
                  <span className="text-zinc-200">{pm.label}</span>
                  <span className="tabular-nums text-zinc-400">
                    {pm.count} pedido(s) • <strong className="text-zinc-100">{formatBRL(pm.total)}</strong>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Split Analysis Section: 70% Primary Chart (Product Margin & Cost Structure) / 30% Expense Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left 8 cols: Product Cost vs Net Profit Chart */}
        <div className="lg:col-span-8 bg-[#121215] border border-white/[0.08] rounded-[10px] p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-zinc-100">
                Estrutura de Preço, CMV e Lucro por Produto
              </h2>
              <p className="text-xs text-zinc-400">
                Comparativo entre Custo de Insumos (CMV), Deduções e Lucro Líquido de cada item
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('precificacao')}
              className="text-xs text-zinc-300 hover:text-white flex items-center gap-1 font-medium"
            >
              Simulador de preços <ArrowRight className="size-3.5" />
            </button>
          </div>

          {/* Legend */}
          <div className="flex items-center gap-5 text-xs text-zinc-400">
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-[2px] bg-rose-500/80 inline-block" /> CMV (Insumos + Emb.)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-[2px] bg-zinc-600 inline-block" /> Fixos + Impostos + Taxas
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-[2px] bg-emerald-500 inline-block" /> Lucro Líquido
            </span>
          </div>

          <div className="space-y-3 pt-1">
            {analytics.productRows.map((row) => {
              const deductions = Math.max(0, row.price - row.cmv - row.netProfit);
              const cmvWidth = (row.cmv / maxProductPrice) * 100;
              const dedWidth = (deductions / maxProductPrice) * 100;
              const profitWidth = (Math.max(0, row.netProfit) / maxProductPrice) * 100;

              return (
                <div key={row.id} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-zinc-200 truncate max-w-[260px]">
                      {row.name}
                    </span>
                    <div className="flex items-center gap-4 tabular-nums">
                      <span className="text-zinc-400">
                        CMV: <strong className="text-zinc-200">{formatBRL(row.cmv)}</strong>
                      </span>
                      <span className="text-zinc-400">
                        Venda: <strong className="text-zinc-200">{formatBRL(row.price)}</strong>
                      </span>
                      <span className="text-emerald-400 font-medium w-28 text-right">
                        +{formatBRL(row.netProfit)} ({formatPct(row.realMarginPct, 0)})
                      </span>
                    </div>
                  </div>
                  <div className="w-full h-2.5 bg-[#18181c] rounded-[4px] overflow-hidden flex">
                    <div
                      style={{ width: `${cmvWidth}%` }}
                      className="bg-rose-500/80 h-full"
                      title={`CMV: ${formatBRL(row.cmv)}`}
                    />
                    <div
                      style={{ width: `${dedWidth}%` }}
                      className="bg-zinc-600 h-full"
                      title={`Deduções: ${formatBRL(deductions)}`}
                    />
                    <div
                      style={{ width: `${profitWidth}%` }}
                      className="bg-emerald-500 h-full"
                      title={`Lucro Líquido: ${formatBRL(row.netProfit)}`}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right 4 cols: Purchases by Category & Cash Retention Summary */}
        <div className="lg:col-span-4 space-y-4">
          <div className="bg-[#121215] border border-white/[0.08] rounded-[10px] p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-zinc-100">
                Compras por Categoria
              </h2>
              <span className="text-xs text-zinc-400 tabular-nums">
                {formatBRL(analytics.totalPurchases)}
              </span>
            </div>

            <div className="space-y-2.5">
              {analytics.categorySeries.map((cat) => (
                <div key={cat.category} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-zinc-300">{cat.category}</span>
                    <span className="text-zinc-400 tabular-nums">
                      {formatBRL(cat.total)} ({formatPct(cat.pct, 0)})
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-[#18181c] rounded-full overflow-hidden">
                    <div
                      style={{ width: `${Math.max(4, cat.pct * 100)}%` }}
                      className="h-full bg-zinc-300 rounded-full"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-[#121215] border border-white/[0.08] rounded-[10px] p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-zinc-100">
                Provisões sobre as Vendas do Período
              </h2>
              <span className="text-[11px] text-zinc-400 tabular-nums">
                Receita: {formatBRL(analytics.grossRevenue)}
              </span>
            </div>
            <p className="text-[11px] text-zinc-500">
              Quanto separar de cada venda do período para pagar cada conta do negócio:
            </p>
            <div className="divide-y divide-white/[0.06] text-xs">
              <div className="py-2 flex items-center justify-between">
                <span className="text-zinc-400">1. Reposição de Estoque (CMV)</span>
                <span className="tabular-nums font-medium text-zinc-200">
                  {formatBRL(analytics.totalSalesCmv)}{' '}
                  <span className="text-zinc-500 font-normal">
                    (
                    {formatPct(
                      analytics.grossRevenue > 0
                        ? analytics.totalSalesCmv / analytics.grossRevenue
                        : 0,
                      1
                    )}
                    )
                  </span>
                </span>
              </div>
              <div className="py-2 flex items-center justify-between">
                <span className="text-sky-300 font-medium">2. Taxa Cartão (InfinitePay)</span>
                <span className="tabular-nums font-medium text-sky-200">
                  {formatBRL(analytics.totalCardMachineFee)}{' '}
                  <span className="text-zinc-500 font-normal">
                    (
                    {formatPct(
                      analytics.grossRevenue > 0
                        ? analytics.totalCardMachineFee / analytics.grossRevenue
                        : 0,
                      1
                    )}
                    )
                  </span>
                </span>
              </div>
              <div className="py-2 flex items-center justify-between">
                <span className="text-orange-300 font-medium">3. Taxas do Entregador</span>
                <span className="tabular-nums font-semibold text-orange-400">
                  {formatBRL(analytics.totalDeliveryDriver)}{' '}
                  <span className="text-zinc-500 font-normal">
                    (
                    {formatPct(
                      analytics.grossRevenue > 0
                        ? analytics.totalDeliveryDriver / analytics.grossRevenue
                        : 0,
                      1
                    )}
                    )
                  </span>
                </span>
              </div>
              <div className="py-2 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-zinc-300 font-medium">
                    4. Despesas Fixas + MEI
                  </span>
                  <span className="tabular-nums font-medium text-zinc-200">
                    {formatBRL(analytics.effectiveFixedCost)}{' '}
                    <span className="text-zinc-500 font-normal">
                      (
                      {formatPct(
                        analytics.grossRevenue > 0
                          ? analytics.effectiveFixedCost / analytics.grossRevenue
                          : 0,
                        1
                      )}
                      )
                    </span>
                  </span>
                </div>
                <div className="w-full h-1.5 bg-[#18181c] rounded-full overflow-hidden">
                  <div
                    style={{ width: `${Math.min(100, analytics.fixedCostCoveragePct * 100)}%` }}
                    className={`h-full rounded-full ${
                      analytics.isFixedCostFullyPaid ? 'bg-emerald-500' : 'bg-amber-400'
                    }`}
                  />
                </div>
                <p className="text-[11px] text-zinc-500 flex items-center justify-between">
                  <span>
                    Contas + MEI: {formatBRL(Math.min(analytics.totalMonthFixedAccumulated, analytics.totalFixedCosts))} / {formatBRL(analytics.totalFixedCosts)}
                  </span>
                  <span className="tabular-nums">
                    {formatPct(analytics.fixedCostCoveragePct, 0)} quitado
                  </span>
                </p>
                {analytics.fixedCostOverflowToProfit > 0 && (
                  <div className="mt-1 px-2.5 py-1.5 rounded-[6px] bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-between text-[11px] text-emerald-300">
                    <span>↳ Sobra de Fixos + MEI (Quitado → Lucro)</span>
                    <span className="font-semibold tabular-nums">
                      +{formatBRL(analytics.fixedCostOverflowToProfit)}
                    </span>
                  </div>
                )}
              </div>
              <div className="pt-2.5 flex items-center justify-between font-semibold text-emerald-400">
                <span>5. Lucro Líquido do Período</span>
                <span className="tabular-nums text-sm">
                  {formatBRL(analytics.netOperatingProfit)}{' '}
                  <span className="text-xs font-normal text-emerald-300/80">
                    (
                    {formatPct(
                      analytics.grossRevenue > 0
                        ? analytics.netOperatingProfit / analytics.grossRevenue
                        : 0,
                      1
                    )}
                    )
                  </span>
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Row: Latest Orders & Latest Invoices */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-[#121215] border border-white/[0.08] rounded-[10px] overflow-hidden">
          <div className="px-4 py-3 border-b border-white/[0.08] flex items-center justify-between">
            <h3 className="text-xs font-semibold text-zinc-200">Pedidos do Período</h3>
            <button
              type="button"
              onClick={() => onNavigate('vendas')}
              className="text-xs text-zinc-400 hover:text-zinc-200"
            >
              Ver todos
            </button>
          </div>
          <div className="divide-y divide-white/[0.06] text-xs">
            {analytics.recentOrders.slice(0, 8).map((ord) => {
              const fin = calculateOrderFinancials(
                ord,
                state.products,
                state.ingredients,
                state.settings
              );
              return (
                <div key={ord.id} className="px-4 py-2.5 flex items-center justify-between">
                  <div>
                    <span className="font-medium text-zinc-200">
                      #{ord.orderNumber} {ord.customerName}
                    </span>
                    <p className="text-[11px] text-zinc-500">
                      {ord.items
                        .map((i) => `${i.quantity}x ${i.productName.split('-')[0].trim()}`)
                        .join(', ')}
                    </p>
                  </div>
                  <div className="text-right tabular-nums">
                    <div className="font-medium text-zinc-200">{formatBRL(ord.totalAmount)}</div>
                    <div className="text-[11px] text-zinc-400">
                      Entregador:{' '}
                      <span className="text-orange-400">
                        {formatBRL(fin.deliveryFeeReserveAmount)}
                      </span>{' '}
                      • Lucro:{' '}
                      <span className="text-emerald-400">{formatBRL(fin.baseNetProfit)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-[#121215] border border-white/[0.08] rounded-[10px] overflow-hidden">
          <div className="px-4 py-3 border-b border-white/[0.08] flex items-center justify-between">
            <h3 className="text-xs font-semibold text-zinc-200">Notas Fiscais e Compras do Período</h3>
            <button
              type="button"
              onClick={() => onNavigate('notas')}
              className="text-xs text-zinc-400 hover:text-zinc-200"
            >
              Ver todas
            </button>
          </div>
          <div className="divide-y divide-white/[0.06] text-xs">
            {analytics.periodInvoices.slice(0, 8).map((inv) => (
              <div key={inv.id} className="px-4 py-2.5 flex items-center justify-between">
                <div>
                  <span className="font-medium text-zinc-200">{inv.supplier}</span>
                  <p className="text-[11px] text-zinc-500">
                    {inv.date} • {inv.items.map((i) => i.name).join(', ')}
                  </p>
                </div>
                <div className="text-right tabular-nums">
                  <div className="font-medium text-zinc-200">{formatBRL(inv.totalAmount)}</div>
                  <div className="text-[11px] text-zinc-500">{inv.paymentMethod}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
