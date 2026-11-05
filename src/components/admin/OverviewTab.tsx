'use client';

import { calculateProductMetrics, formatBRL, formatPct } from '@/lib/pricing';
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

    const grossRevenue = validOrders.reduce((acc, o) => acc + o.totalAmount, 0);
    const totalSalesCmv = validOrders.reduce((acc, o) => acc + o.totalCmv, 0);
    const totalFees = validOrders.reduce((acc, o) => acc + o.paymentFeeAmount, 0);
    const totalTax = validOrders.reduce((acc, o) => acc + o.taxReserveAmount, 0);
    const netOperatingProfit = validOrders.reduce((acc, o) => acc + o.netProfit, 0);

    const totalPurchases = periodInvoices.reduce((acc, inv) => acc + inv.totalAmount, 0);
    const totalFixedCosts = state.fixedCosts.reduce((acc, fc) => acc + fc.monthlyAmount, 0);

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
      avgTicket: validOrders.length > 0 ? grossRevenue / validOrders.length : 0,
      topItems,
      paymentSeries,
      recentOrders,
      periodInvoices,
      grossRevenue,
      totalSalesCmv,
      totalFees,
      totalTax,
      netOperatingProfit,
      totalPurchases,
      totalFixedCosts,
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
            <span>Impostos + Taxas retidos</span>
            <span className="tabular-nums text-zinc-300 font-medium">
              {formatBRL(analytics.totalTax + analytics.totalFees)}
            </span>
          </div>
        </div>

        <div className="bg-[#121215] border border-white/[0.08] rounded-[10px] p-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>Margem Real Média (Cardápio)</span>
            <Percent className="size-4 text-zinc-500" />
          </div>
          <div className="text-2xl font-semibold text-zinc-100 tabular-nums">
            {formatPct(analytics.avgRealMargin, 1)}
          </div>
          <div className="flex items-center justify-between text-xs text-zinc-500 pt-1 border-t border-white/[0.05]">
            <span>Meta padrão</span>
            <span className="tabular-nums text-zinc-300 font-medium">
              {formatPct(state.settings.defaultTargetMarginPct, 0)}
            </span>
          </div>
        </div>

        <div className="bg-[#121215] border border-white/[0.08] rounded-[10px] p-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>Compras (Notas Fiscais)</span>
            <ShoppingBag className="size-4 text-zinc-500" />
          </div>
          <div className="text-2xl font-semibold text-zinc-100 tabular-nums">
            {formatBRL(analytics.totalPurchases)}
          </div>
          <div className="flex items-center justify-between text-xs text-zinc-500 pt-1 border-t border-white/[0.05]">
            <span>Custos fixos (mensal)</span>
            <span className="tabular-nums text-zinc-300 font-medium">
              {formatBRL(analytics.totalFixedCosts)}
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
            <h2 className="text-sm font-semibold text-zinc-100">
              Provisões sobre as Vendas do Período
            </h2>
            <div className="divide-y divide-white/[0.06] text-xs">
              <div className="py-2 flex items-center justify-between">
                <span className="text-zinc-400">Reposição de Estoque (CMV)</span>
                <span className="tabular-nums font-medium text-zinc-200">
                  {formatBRL(analytics.totalSalesCmv)}
                </span>
              </div>
              <div className="py-2 flex items-center justify-between">
                <span className="text-zinc-400">Reserva de Impostos (MEI)</span>
                <span className="tabular-nums font-medium text-zinc-200">
                  {formatBRL(analytics.totalTax)}
                </span>
              </div>
              <div className="py-2 flex items-center justify-between">
                <span className="text-zinc-400">Taxas da Maquininha</span>
                <span className="tabular-nums font-medium text-zinc-200">
                  {formatBRL(analytics.totalFees)}
                </span>
              </div>
              <div className="pt-2.5 flex items-center justify-between font-semibold text-emerald-400">
                <span>Lucro Líquido do Período</span>
                <span className="tabular-nums">
                  {formatBRL(analytics.netOperatingProfit)}
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
            {analytics.recentOrders.slice(0, 8).map((ord) => (
              <div key={ord.id} className="px-4 py-2.5 flex items-center justify-between">
                <div>
                  <span className="font-medium text-zinc-200">
                    #{ord.orderNumber} {ord.customerName}
                  </span>
                  <p className="text-[11px] text-zinc-500">
                    {ord.items.map((i) => `${i.quantity}x ${i.productName.split('-')[0].trim()}`).join(', ')}
                  </p>
                </div>
                <div className="text-right tabular-nums">
                  <div className="font-medium text-zinc-200">{formatBRL(ord.totalAmount)}</div>
                  <div className="text-[11px] text-emerald-400">
                    Lucro: {formatBRL(ord.netProfit)}
                  </div>
                </div>
              </div>
            ))}
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
