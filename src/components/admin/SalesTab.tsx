'use client';

import {
  calculateProductMetrics,
  formatBRL,
  formatPhoneBR,
  normalizePhone,
} from '@/lib/pricing';
import {
  AppDatabaseState,
  CustomerProfile,
  OrderItem,
  OrderPaymentMethod,
  OrderStatus,
  SaleOrder,
} from '@/lib/types';
import {
  CreditCard,
  ExternalLink,
  MessageCircle,
  Plus,
  Trash2,
} from 'lucide-react';
import { useMemo, useState } from 'react';

interface Props {
  state: AppDatabaseState;
  onUpdateState: (updater: (prev: AppDatabaseState) => AppDatabaseState) => void;
}

export default function SalesTab({ state, onUpdateState }: Props) {
  const [customerName, setCustomerName] = useState('Cliente Balcão / WhatsApp');
  const [customerPhone, setCustomerPhone] = useState('');
  const [paymentMethod, setPaymentMethod] =
    useState<OrderPaymentMethod>('PIX (Mercado Pago / Chave)');
  const [posCart, setPosCart] = useState<Record<string, number>>({});

  function addPosQty(productId: string, delta: number) {
    setPosCart((prev) => {
      const next = Math.max(0, (prev[productId] || 0) + delta);
      if (next === 0) {
        const clone = { ...prev };
        delete clone[productId];
        return clone;
      }
      return { ...prev, [productId]: next };
    });
  }

  const posSummary = useMemo(() => {
    let subtotal = 0;
    let totalCmv = 0;
    const items: OrderItem[] = [];

    for (const [productId, qty] of Object.entries(posCart)) {
      const prod = state.products.find((p) => p.id === productId);
      if (!prod || qty <= 0) continue;
      const m = calculateProductMetrics(prod, state.ingredients);
      items.push({
        productId: prod.id,
        productName: prod.name,
        quantity: qty,
        unitPrice: prod.practicedPrice,
        unitCmv: m.totalCmv,
      });
      subtotal += prod.practicedPrice * qty;
      totalCmv += m.totalCmv * qty;
    }

    let feePct = 0;
    if (paymentMethod === 'PIX (Mercado Pago / Chave)') feePct = state.settings.pixFeePct;
    else if (paymentMethod === 'Cartão na Entrega (Maquininha InfinitePay)')
      feePct = state.settings.creditCardFeePct;
    else if (paymentMethod === 'Link de Pagamento (InfinitePay)')
      feePct = state.settings.paymentLinkFeePct;

    const paymentFeeAmount = subtotal * feePct;
    const taxReserveAmount = subtotal * state.settings.estimatedTaxPct;
    const fixedCostAllocationAmount = subtotal * state.settings.defaultFixedCostPct;
    const netProfit =
      subtotal - totalCmv - paymentFeeAmount - taxReserveAmount - fixedCostAllocationAmount;

    return {
      items,
      subtotal,
      totalCmv,
      paymentFeeAmount,
      taxReserveAmount,
      fixedCostAllocationAmount,
      netProfit,
    };
  }, [posCart, state.products, state.ingredients, paymentMethod, state.settings]);

  function handleRegisterQuickSale() {
    if (posSummary.items.length === 0) {
      alert('Selecione os produtos para registrar a venda.');
      return;
    }

    const nowIso = new Date().toISOString();
    const todayDate = nowIso.slice(0, 10);
    const cleanPhone = normalizePhone(customerPhone) || '00000000000';

    onUpdateState((prev) => {
      const nextOrderNumber =
        prev.orders.reduce((max, o) => Math.max(max, o.orderNumber || 100), 100) + 1;

      let customer: CustomerProfile | undefined = prev.customers.find(
        (c) => normalizePhone(c.phone) === cleanPhone && cleanPhone !== '00000000000'
      );

      const nextCustomers = [...prev.customers];
      if (!customer && cleanPhone !== '00000000000') {
        customer = {
          id: `cust-${Date.now()}`,
          phone: cleanPhone,
          name: customerName.trim() || 'Cliente Delivery',
          createdAt: nowIso,
          lastSeenAt: nowIso,
          lastOrderAt: nowIso,
          addresses: [],
          totalOrders: 1,
          totalSpent: posSummary.subtotal,
          averageTicket: posSummary.subtotal,
          preferredPaymentMethod: paymentMethod,
          itemFrequency: {},
          tags: ['Balcão / WhatsApp'],
          giftHistory: [],
          activities: [],
        };
        nextCustomers.unshift(customer);
      } else if (customer) {
        customer.totalOrders += 1;
        customer.totalSpent += posSummary.subtotal;
        customer.averageTicket = customer.totalSpent / customer.totalOrders;
        customer.lastOrderAt = nowIso;
      }

      if (customer) {
        for (const it of posSummary.items) {
          const freq = customer.itemFrequency[it.productId] || {
            productName: it.productName,
            count: 0,
            totalSpent: 0,
          };
          freq.count += it.quantity;
          freq.totalSpent += it.quantity * it.unitPrice;
          customer.itemFrequency[it.productId] = freq;
        }
      }

      const newOrder: SaleOrder = {
        id: `ord-${Date.now()}`,
        orderNumber: nextOrderNumber,
        createdAt: nowIso,
        date: todayDate,
        customerId: customer?.id || 'balcao',
        customerName: customerName.trim() || 'Venda Presencial / WhatsApp',
        customerPhone: cleanPhone,
        deliveryAddress: {
          street: 'Delivery Próprio',
          number: 'S/N',
          neighborhood: 'Centro',
        },
        items: posSummary.items,
        subtotal: posSummary.subtotal,
        deliveryFee: 0,
        totalAmount: posSummary.subtotal,
        totalCmv: posSummary.totalCmv,
        paymentMethod,
        paymentFeeAmount: posSummary.paymentFeeAmount,
        taxReserveAmount: posSummary.taxReserveAmount,
        fixedCostAllocationAmount: posSummary.fixedCostAllocationAmount,
        netProfit: posSummary.netProfit,
        status: 'Entregue',
        origin: 'Lançamento Manual PDV',
      };

      return {
        ...prev,
        customers: nextCustomers,
        orders: [newOrder, ...prev.orders],
      };
    });

    setPosCart({});
  }

  function handleUpdateOrderStatus(orderId: string, status: OrderStatus) {
    onUpdateState((prev) => ({
      ...prev,
      orders: prev.orders.map((o) => (o.id === orderId ? { ...o, status } : o)),
    }));
  }

  function handleDeleteOrder(orderId: string) {
    if (!confirm('Remover este registro de venda?')) return;
    onUpdateState((prev) => ({
      ...prev,
      orders: prev.orders.filter((o) => o.id !== orderId),
    }));
  }

  const totals = useMemo(() => {
    const valid = state.orders.filter((o) => o.status !== 'Cancelado');
    return {
      count: valid.length,
      grossRevenue: valid.reduce((a, b) => a + b.totalAmount, 0),
      totalCmv: valid.reduce((a, b) => a + b.totalCmv, 0),
      totalFees: valid.reduce((a, b) => a + b.paymentFeeAmount, 0),
      totalTaxReserve: valid.reduce((a, b) => a + b.taxReserveAmount, 0),
      netProfit: valid.reduce((a, b) => a + b.netProfit, 0),
    };
  }, [state.orders]);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-white/[0.08]">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100">Vendas e Pedidos</h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            Registro de caixa, provisões de impostos e pedidos do Cardápio Online.
          </p>
        </div>
        <a
          href="/cardapio"
          target="_blank"
          rel="noreferrer"
          className="btn-saas-secondary text-xs"
        >
          <ExternalLink className="size-3.5 text-zinc-400" />
          Acessar Cardápio Online (/cardapio)
        </a>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 tabular-nums">
        <div className="bg-[#121215] border border-white/[0.08] rounded-[10px] p-4">
          <p className="text-xs text-zinc-400">Faturamento Bruto</p>
          <p className="text-xl font-semibold text-zinc-100 mt-1">
            {formatBRL(totals.grossRevenue)}
          </p>
          <p className="text-[11px] text-zinc-500 mt-0.5">{totals.count} vendas</p>
        </div>

        <div className="bg-[#121215] border border-white/[0.08] rounded-[10px] p-4">
          <p className="text-xs text-zinc-400">Reposição Insumos (CMV)</p>
          <p className="text-xl font-semibold text-rose-400 mt-1">
            {formatBRL(totals.totalCmv)}
          </p>
          <p className="text-[11px] text-zinc-500 mt-0.5">Custo de mercadoria</p>
        </div>

        <div className="bg-[#121215] border border-white/[0.08] rounded-[10px] p-4">
          <p className="text-xs text-zinc-400">Reserva Fiscal (MEI)</p>
          <p className="text-xl font-semibold text-zinc-200 mt-1">
            {formatBRL(totals.totalTaxReserve)}
          </p>
          <p className="text-[11px] text-zinc-500 mt-0.5">Provisão estimada</p>
        </div>

        <div className="bg-[#121215] border border-white/[0.08] rounded-[10px] p-4">
          <p className="text-xs text-zinc-400">Taxas de Recebimento</p>
          <p className="text-xl font-semibold text-zinc-200 mt-1">
            {formatBRL(totals.totalFees)}
          </p>
          <p className="text-[11px] text-zinc-500 mt-0.5">InfinitePay / Link</p>
        </div>

        <div className="bg-[#121215] border border-white/[0.08] rounded-[10px] p-4 col-span-2 sm:col-span-1">
          <p className="text-xs text-emerald-400 font-medium">Lucro Líquido</p>
          <p className="text-xl font-semibold text-emerald-400 mt-1">
            {formatBRL(totals.netProfit)}
          </p>
          <p className="text-[11px] text-zinc-400 mt-0.5">Livre após deduções</p>
        </div>
      </div>

      {/* POS Quick Launch Box */}
      <div className="bg-[#121215] border border-white/[0.08] rounded-[10px] p-5 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
          <h2 className="text-sm font-semibold text-zinc-100">Lançamento de Venda Rápida</h2>
          <span className="text-xs text-zinc-400">Selecione os itens e informe o canal</span>
        </div>

        {/* Product Selection Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {state.products.map((prod) => {
            const qty = posCart[prod.id] || 0;
            const m = calculateProductMetrics(prod, state.ingredients);
            return (
              <div
                key={prod.id}
                onClick={() => addPosQty(prod.id, 1)}
                className={`p-3 rounded-[8px] border cursor-pointer transition select-none flex flex-col justify-between ${
                  qty > 0
                    ? 'bg-[#18181c] border-zinc-300 text-zinc-100'
                    : 'bg-[#09090b] border-white/[0.08] hover:border-white/[0.16] text-zinc-300'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="font-medium text-xs text-zinc-100 line-clamp-1">
                    {prod.shortName || prod.name}
                  </span>
                  {qty > 0 && (
                    <div
                      className="flex items-center gap-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        aria-label="Diminuir quantidade"
                        onClick={() => addPosQty(prod.id, -1)}
                        className="size-5 rounded bg-zinc-800 text-zinc-200 text-xs flex items-center justify-center font-bold"
                      >
                        -
                      </button>
                      <span className="px-1.5 py-0.5 bg-zinc-100 text-zinc-950 font-semibold text-[11px] rounded tabular-nums">
                        {qty}x
                      </span>
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-between text-xs mt-3 tabular-nums">
                  <span className="font-semibold text-zinc-200">
                    {formatBRL(prod.practicedPrice)}
                  </span>
                  <span className="text-zinc-500 text-[11px]">
                    Margem: +{formatBRL(m.netProfit)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Form Controls */}
        <div className="bg-[#18181c] border border-white/[0.06] rounded-[8px] p-3.5 grid grid-cols-1 md:grid-cols-4 gap-3 items-end text-xs">
          <div>
            <label className="text-zinc-400 block mb-1">Identificação do Cliente</label>
            <input
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              className="w-full bg-[#09090b] border border-white/[0.1] rounded-[6px] px-3 py-1.5 text-zinc-100"
            />
          </div>
          <div>
            <label className="text-zinc-400 block mb-1">WhatsApp (para histórico)</label>
            <input
              type="tel"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              placeholder="(86) 99999-9999"
              className="w-full bg-[#09090b] border border-white/[0.1] rounded-[6px] px-3 py-1.5 text-zinc-100 tabular-nums"
            />
          </div>
          <div>
            <label className="text-zinc-400 block mb-1">Forma de Pagamento</label>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value as OrderPaymentMethod)}
              className="w-full bg-[#09090b] border border-white/[0.1] rounded-[6px] px-3 py-1.5 text-zinc-100"
            >
              <option value="PIX (Mercado Pago / Chave)">PIX (Mercado Pago / Chave)</option>
              <option value="Cartão na Entrega (Maquininha InfinitePay)">
                Cartão na Entrega (Maquininha InfinitePay)
              </option>
              <option value="Link de Pagamento (InfinitePay)">
                Link de Pagamento (InfinitePay)
              </option>
              <option value="Dinheiro">Dinheiro</option>
            </select>
          </div>
          <button
            type="button"
            onClick={handleRegisterQuickSale}
            className="btn-saas-primary w-full h-[34px]"
          >
            <Plus className="size-3.5" /> Registrar Venda ({formatBRL(posSummary.subtotal)})
          </button>
        </div>
      </div>

      {/* Orders List */}
      <div className="bg-[#121215] border border-white/[0.08] rounded-[10px] overflow-hidden">
        <div className="px-4 py-3 border-b border-white/[0.08] flex items-center justify-between">
          <h3 className="text-xs font-semibold text-zinc-200">
            Fila de Pedidos e Histórico de Vendas
          </h3>
          <span className="text-xs text-zinc-400 tabular-nums">{state.orders.length} pedidos</span>
        </div>

        <div className="divide-y divide-white/[0.06] text-xs">
          {state.orders.map((ord) => {
            const waLink = `https://wa.me/55${normalizePhone(ord.customerPhone)}?text=${encodeURIComponent(
              `Olá ${ord.customerName}! Aqui é da ${state.settings.storeName}. Pedido #${ord.orderNumber} (${formatBRL(ord.totalAmount)}) está com status: *${ord.status}*.`
            )}`;

            return (
              <div
                key={ord.id}
                className="p-4 hover:bg-white/[0.01] flex flex-col lg:flex-row lg:items-center justify-between gap-4"
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-zinc-100">
                      #{ord.orderNumber}
                    </span>
                    <span className="text-zinc-200 font-medium">{ord.customerName}</span>
                    {ord.customerPhone && ord.customerPhone !== '00000000000' && (
                      <span className="text-zinc-500 font-mono">
                        {formatPhoneBR(ord.customerPhone)}
                      </span>
                    )}
                    <span className="px-2 py-0.5 rounded-[4px] bg-[#18181c] border border-white/[0.08] text-zinc-400 text-[10px]">
                      {ord.origin}
                    </span>
                    <span className="text-zinc-500 tabular-nums">{ord.date}</span>
                  </div>

                  <p className="text-zinc-300">
                    {ord.items.map((i) => `${i.quantity}x ${i.productName}`).join(' • ')}
                  </p>

                  {ord.deliveryAddress?.street && (
                    <p className="text-zinc-500 text-[11px]">
                      {ord.deliveryAddress.street}, {ord.deliveryAddress.number} —{' '}
                      {ord.deliveryAddress.neighborhood}
                      {ord.deliveryAddress.complement ? ` (${ord.deliveryAddress.complement})` : ''}
                    </p>
                  )}

                  {ord.customerNotes && (
                    <p className="text-zinc-400 text-[11px]">Obs: {ord.customerNotes}</p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <div className="bg-[#18181c] border border-white/[0.06] rounded-[6px] px-3 py-1.5 text-right tabular-nums">
                    <div className="font-medium text-zinc-100">{formatBRL(ord.totalAmount)}</div>
                    <div className="text-[11px] text-emerald-400">
                      Lucro: {formatBRL(ord.netProfit)}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <select
                      value={ord.status}
                      aria-label="Status do pedido"
                      onChange={(e) =>
                        handleUpdateOrderStatus(ord.id, e.target.value as OrderStatus)
                      }
                      className="bg-[#09090b] border border-white/[0.1] rounded-[6px] px-2.5 py-1.5 text-zinc-200 text-xs font-medium"
                    >
                      <option value="Novo Pedido">Novo Pedido</option>
                      <option value="Em Preparo">Em Preparo</option>
                      <option value="Saiu para Entrega">Em Entrega</option>
                      <option value="Entregue">Entregue</option>
                      <option value="Cancelado">Cancelado</option>
                    </select>

                    {ord.customerPhone && ord.customerPhone !== '00000000000' && (
                      <a
                        href={waLink}
                        target="_blank"
                        rel="noreferrer"
                        aria-label="Enviar mensagem no WhatsApp"
                        className="p-1.5 bg-[#18181c] hover:bg-zinc-800 border border-white/[0.08] text-zinc-300 rounded-[6px]"
                        title="WhatsApp"
                      >
                        <MessageCircle className="size-4" />
                      </a>
                    )}

                    {ord.infinitePayLink && (
                      <button
                        type="button"
                        aria-label="Copiar link InfinitePay"
                        onClick={() => {
                          navigator.clipboard.writeText(ord.infinitePayLink!);
                          alert('Link copiado!');
                        }}
                        className="p-1.5 bg-[#18181c] hover:bg-zinc-800 border border-white/[0.08] text-zinc-300 rounded-[6px]"
                        title="Copiar Link InfinitePay"
                      >
                        <CreditCard className="size-4" />
                      </button>
                    )}

                    <button
                      type="button"
                      aria-label="Remover pedido"
                      onClick={() => handleDeleteOrder(ord.id)}
                      className="p-1.5 text-zinc-500 hover:text-rose-400"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
