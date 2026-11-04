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
  Copy,
  ExternalLink,
  MessageCircle,
  PhoneCall,
  Plus,
  QrCode,
  ShoppingBag,
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
  const [paymentMethod, setPaymentMethod] = useState<OrderPaymentMethod>('PIX');
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
        productName: prod.shortName || prod.name,
        quantity: qty,
        unitPrice: prod.practicedPrice,
        unitCmv: m.totalCmv,
      });
      subtotal += prod.practicedPrice * qty;
      totalCmv += m.totalCmv * qty;
    }

    let feePct = 0;
    if (paymentMethod === 'PIX' || paymentMethod === 'PIX (Mercado Pago / Chave)') {
      feePct = state.settings.pixFeePct;
    } else if (
      paymentMethod === 'Cartão de Crédito (Na Entrega)' ||
      paymentMethod === 'Cartão na Entrega (Maquininha InfinitePay)'
    ) {
      feePct = state.settings.creditCardFeePct;
    } else if (paymentMethod === 'Cartão de Débito (Na Entrega)') {
      feePct = state.settings.debitCardFeePct;
    }

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

  function handleClearAllOrders() {
    if (state.orders.length === 0) return;
    if (!confirm('Deseja zerar todo o histórico de vendas e fila de pedidos?')) return;
    onUpdateState((prev) => ({
      ...prev,
      orders: [],
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

  // Fila ativa em tempo real: apenas pedidos que ainda não foram entregues nem cancelados
  const activeQueueOrders = useMemo(() => {
    return state.orders.filter(
      (o) => o.status === 'Novo Pedido' || o.status === 'Em Preparo' || o.status === 'Saiu para Entrega'
    );
  }, [state.orders]);

  // Histórico de pedidos finalizados (Entregues ou Cancelados)
  const completedHistoryOrders = useMemo(() => {
    return state.orders.filter((o) => o.status === 'Entregue' || o.status === 'Cancelado');
  }, [state.orders]);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-white/[0.08]">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100">Vendas e Pedidos</h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            Fila de produção com alerta sonoro, destino do WhatsApp da loja e registro de caixa.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {state.orders.length > 0 && (
            <button
              type="button"
              onClick={handleClearAllOrders}
              className="px-3 py-1.5 rounded-[6px] bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-400 text-xs font-medium inline-flex items-center gap-1.5 transition"
            >
              <Trash2 className="size-3.5" /> Zerar Histórico de Vendas
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText('https://monsterburger.vercel.app');
            }}
            className="btn-saas-secondary text-xs"
            title="Copiar link oficial do cardápio para enviar aos clientes"
          >
            <Copy className="size-3.5 text-orange-400" />
            Copiar Link: monsterburger.vercel.app
          </button>
          <a
            href="https://monsterburger.vercel.app"
            target="_blank"
            rel="noreferrer"
            className="btn-saas-secondary text-xs"
          >
            <ExternalLink className="size-3.5 text-zinc-400" />
            Abrir Cardápio Oficial
          </a>
        </div>
      </div>

      {/* Quick Store Reception Settings (WhatsApp, PIX Key & Tempo de Entrega) */}
      <div className="bg-[#121215] border border-orange-500/25 rounded-[10px] p-4 grid grid-cols-1 md:grid-cols-4 gap-4 items-end text-xs">
        <div>
          <label className="text-zinc-300 font-medium flex items-center gap-1.5 mb-1">
            <PhoneCall className="size-3.5 text-emerald-400" />
            WhatsApp da Loja
          </label>
          <input
            type="tel"
            value={state.settings.whatsappNumber}
            onChange={(e) =>
              onUpdateState((prev) => ({
                ...prev,
                settings: { ...prev.settings, whatsappNumber: e.target.value },
              }))
            }
            placeholder="Ex: 5586999999999"
            className="w-full bg-[#09090b] border border-white/[0.12] rounded-[6px] px-3 py-1.5 text-zinc-100 font-mono"
          />
        </div>
        <div>
          <label className="text-zinc-300 font-medium flex items-center gap-1.5 mb-1">
            <QrCode className="size-3.5 text-orange-400" />
            Chave PIX Oficial
          </label>
          <input
            type="text"
            value={state.settings.pixKey}
            onChange={(e) =>
              onUpdateState((prev) => ({
                ...prev,
                settings: { ...prev.settings, pixKey: e.target.value },
              }))
            }
            placeholder="CPF, CNPJ, Celular, E-mail ou Chave Aleatória"
            className="w-full bg-[#09090b] border border-white/[0.12] rounded-[6px] px-3 py-1.5 text-zinc-100 font-mono"
          />
        </div>
        <div>
          <label className="text-zinc-300 font-medium block mb-1">
            Nome Favorecido PIX
          </label>
          <input
            type="text"
            value={state.settings.pixBeneficiary}
            onChange={(e) =>
              onUpdateState((prev) => ({
                ...prev,
                settings: { ...prev.settings, pixBeneficiary: e.target.value },
              }))
            }
            placeholder="Seu Nome ou Razão Social"
            className="w-full bg-[#09090b] border border-white/[0.12] rounded-[6px] px-3 py-1.5 text-zinc-100"
          />
        </div>
        <div>
          <label className="text-zinc-300 font-medium block mb-1">
            Tempo Estimado no Cardápio
          </label>
          <input
            type="text"
            value={state.settings.estimatedDeliveryMinutes || ''}
            onChange={(e) =>
              onUpdateState((prev) => ({
                ...prev,
                settings: { ...prev.settings, estimatedDeliveryMinutes: e.target.value },
              }))
            }
            placeholder="Ex: 40-50 min ou 60-80 min"
            className="w-full bg-[#09090b] border border-orange-500/40 focus-visible:border-orange-500 rounded-[6px] px-3 py-1.5 text-zinc-100 font-medium"
            title="Altere aqui quando o movimento estiver alto para avisar os clientes no cardápio"
          />
        </div>
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
          <p className="text-xs text-zinc-400">Taxas de Maquininha</p>
          <p className="text-xl font-semibold text-zinc-200 mt-1">
            {formatBRL(totals.totalFees)}
          </p>
          <p className="text-[11px] text-zinc-500 mt-0.5">Crédito / Débito</p>
        </div>

        <div className="bg-[#121215] border border-white/[0.08] rounded-[10px] p-4 col-span-2 sm:col-span-1">
          <p className="text-xs text-emerald-400 font-medium">Lucro Líquido</p>
          <p className="text-xl font-semibold text-emerald-400 mt-1">
            {formatBRL(totals.netProfit)}
          </p>
          <p className="text-[11px] text-zinc-400 mt-0.5">Livre após deduções</p>
        </div>
      </div>

      {/* Fila de Pedidos Principal em Tempo Real (Posicionada no Topo da Gestão) */}
      <div className="bg-[#121215] border border-orange-500/35 rounded-[10px] overflow-hidden shadow-lg shadow-black/50">
        <div className="px-4 py-3 bg-gradient-to-r from-[#18181c] via-[#141418] to-[#121215] border-b border-white/[0.08] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="size-2.5 rounded-full bg-[#ff5400] animate-pulse" />
            <h2 className="text-sm font-bold text-zinc-100 tracking-wide uppercase">
              Fila de Pedidos em Produção / Entrega
            </h2>
          </div>
          <span className="px-2.5 py-0.5 rounded-full bg-orange-500/15 border border-orange-500/30 text-orange-400 text-xs font-bold tabular-nums">
            {activeQueueOrders.length} na fila
          </span>
        </div>

        {activeQueueOrders.length === 0 ? (
          <div className="p-8 text-center space-y-2">
            <ShoppingBag className="size-7 text-zinc-500 mx-auto" />
            <p className="text-xs font-medium text-zinc-300">
              Nenhum pedido em aberto na fila neste momento
            </p>
            <p className="text-[11px] text-zinc-500 max-w-md mx-auto">
              Todos os pedidos foram entregues! Novos pedidos que chegarem do cardápio entrarão aqui automaticamente.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-white/[0.06] text-xs">
            {activeQueueOrders.map((ord) => {
              const itemsText = ord.items
                .map((i) => `${i.quantity}x ${i.productName}${i.notes ? ` (${i.notes})` : ''}`)
                .join(', ');
              const statusMessage =
                ord.status === 'Em Preparo'
                  ? `Olá *${ord.customerName}*! Aqui é da *${state.settings.storeName}*.\n\nSeu *Pedido #${ord.orderNumber}* (${itemsText}) já foi confirmado e *está sendo preparado*!`
                  : ord.status === 'Saiu para Entrega'
                  ? `Olá *${ord.customerName}*! Aqui é da *${state.settings.storeName}*.\n\nBoa notícia: seu *Pedido #${ord.orderNumber}* (${itemsText}) *acabou de sair para entrega* no seu endereço!`
                  : `Olá *${ord.customerName}*! Aqui é da *${state.settings.storeName}*.\n\nSeu *Pedido #${ord.orderNumber}* (${itemsText}) no valor de *${formatBRL(ord.totalAmount)}* está com status: *${ord.status}*!`;
              const waLink = `https://api.whatsapp.com/send?phone=55${normalizePhone(
                ord.customerPhone
              )}&text=${encodeURIComponent(statusMessage)}`;

              return (
                <div
                  key={ord.id}
                  className={`p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4 ${
                    ord.status === 'Novo Pedido'
                      ? 'bg-orange-500/[0.08] border-l-4 border-l-[#ff5400]'
                      : ord.status === 'Saiu para Entrega'
                      ? 'bg-blue-500/[0.04] border-l-4 border-l-blue-500'
                      : 'hover:bg-white/[0.01]'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-zinc-100 text-sm">
                        #{ord.orderNumber}
                      </span>
                      <span className="text-zinc-100 font-semibold">{ord.customerName}</span>
                      {ord.customerPhone && ord.customerPhone !== '00000000000' && (
                        <span className="text-zinc-400 font-mono">
                          {formatPhoneBR(ord.customerPhone)}
                        </span>
                      )}
                      <span className="px-2 py-0.5 rounded-[4px] bg-[#18181c] border border-white/[0.08] text-zinc-300 text-[10px]">
                        {ord.paymentMethod}
                        {ord.changeFor ? ` (Troco p/ ${ord.changeFor})` : ''}
                      </span>
                      <span className="text-zinc-500 tabular-nums">{ord.date}</span>
                    </div>

                    <div className="text-zinc-200 font-medium space-y-0.5 pt-0.5">
                      {ord.items.map((i, idx) => (
                        <div key={idx}>
                          • <strong className="text-zinc-100">{i.quantity}x</strong> {i.productName} ({formatBRL(i.unitPrice * i.quantity)})
                          {i.notes && (
                            <span className="text-orange-400 italic ml-1.5 font-normal">
                              [Obs: {i.notes}]
                            </span>
                          )}
                        </div>
                      ))}
                    </div>

                    {ord.deliveryAddress?.street && (
                      <p className="text-zinc-400 text-[11px] pt-0.5">
                        📍 {ord.deliveryAddress.street}, {ord.deliveryAddress.number} —{' '}
                        {ord.deliveryAddress.neighborhood}
                        {ord.deliveryAddress.complement ? ` (${ord.deliveryAddress.complement})` : ''}
                      </p>
                    )}

                    {ord.customerNotes && (
                      <p className="text-amber-300 text-[11px]">
                        📝 Obs da entrega: {ord.customerNotes}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <div className="bg-[#18181c] border border-white/[0.06] rounded-[6px] px-3 py-1.5 text-right tabular-nums">
                      <div className="font-semibold text-zinc-100">{formatBRL(ord.totalAmount)}</div>
                      <div className="text-[11px] text-emerald-400 font-medium">
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
                        className="bg-[#09090b] border border-white/[0.12] rounded-[6px] px-2.5 py-1.5 text-zinc-100 text-xs font-semibold focus-visible:border-orange-500"
                      >
                        <option value="Novo Pedido">Novo Pedido</option>
                        <option value="Em Preparo">Em Preparo</option>
                        <option value="Saiu para Entrega">Em Entrega</option>
                        <option value="Entregue">✓ Marcar como Entregue</option>
                        <option value="Cancelado">Cancelado</option>
                      </select>

                      {ord.customerPhone && ord.customerPhone !== '00000000000' && (
                        <a
                          href={waLink}
                          target="_blank"
                          rel="noreferrer"
                          aria-label="Avisar cliente no WhatsApp"
                          className="px-2.5 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-400 rounded-[6px] inline-flex items-center gap-1 text-xs font-medium transition"
                          title="Avisar cliente no WhatsApp"
                        >
                          <MessageCircle className="size-3.5" /> WhatsApp Cliente
                        </a>
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
        )}
      </div>

      {/* POS Quick Launch Box (Abaixo da Fila de Pedidos) */}
      <div className="bg-[#121215] border border-white/[0.08] rounded-[10px] p-5 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
          <h2 className="text-sm font-semibold text-zinc-100">Lançamento de Venda Rápida (PDV Balcão / WhatsApp)</h2>
          <span className="text-xs text-zinc-400">Selecione os itens e informe a forma de pagamento</span>
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
              <option value="PIX">PIX</option>
              <option value="Cartão de Crédito (Na Entrega)">Cartão de Crédito</option>
              <option value="Cartão de Débito (Na Entrega)">Cartão de Débito</option>
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

      {/* Histórico de Pedidos Concluídos / Entregues */}
      {completedHistoryOrders.length > 0 && (
        <div className="bg-[#121215] border border-white/[0.08] rounded-[10px] overflow-hidden">
          <div className="px-4 py-3 bg-[#18181c]/60 border-b border-white/[0.08] flex items-center justify-between">
            <h3 className="text-xs font-semibold text-zinc-300">
              Histórico de Vendas Concluídas ({completedHistoryOrders.length})
            </h3>
            <span className="text-[11px] text-zinc-500">Pedidos já entregues ou finalizados</span>
          </div>

          <div className="divide-y divide-white/[0.06] text-xs">
            {completedHistoryOrders.map((ord) => {
              return (
                <div
                  key={ord.id}
                  className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-zinc-300 hover:bg-white/[0.01]"
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-zinc-200">#{ord.orderNumber}</span>
                      <span className="text-zinc-100 font-medium">{ord.customerName}</span>
                      <span className="px-2 py-0.2 rounded text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        {ord.status}
                      </span>
                      <span className="text-zinc-500 tabular-nums">{ord.date}</span>
                    </div>
                    <p className="text-[11px] text-zinc-400">
                      {ord.items.map((i) => `${i.quantity}x ${i.productName}`).join(', ')}
                    </p>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right tabular-nums">
                      <span className="font-semibold text-zinc-200">{formatBRL(ord.totalAmount)}</span>
                      <span className="block text-[10px] text-emerald-400">
                        Lucro: {formatBRL(ord.netProfit)}
                      </span>
                    </div>

                    <select
                      value={ord.status}
                      aria-label="Reabrir status do pedido"
                      onChange={(e) =>
                        handleUpdateOrderStatus(ord.id, e.target.value as OrderStatus)
                      }
                      className="bg-[#09090b] border border-white/[0.1] rounded-[6px] px-2 py-1 text-zinc-300 text-[11px]"
                      title="Mudar status caso queira reabrir"
                    >
                      <option value="Entregue">Entregue</option>
                      <option value="Em Preparo">Reabrir: Em Preparo</option>
                      <option value="Saiu para Entrega">Reabrir: Em Entrega</option>
                      <option value="Cancelado">Cancelado</option>
                    </select>

                    <button
                      type="button"
                      aria-label="Remover do histórico"
                      onClick={() => handleDeleteOrder(ord.id)}
                      className="p-1 text-zinc-500 hover:text-rose-400"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
