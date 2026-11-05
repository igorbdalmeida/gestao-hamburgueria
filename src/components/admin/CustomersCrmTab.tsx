'use client';

import { formatBRL, formatPhoneBR, normalizePhone } from '@/lib/pricing';
import { todayLocal } from '@/lib/periods';
import { AppDatabaseState, CustomerProfile } from '@/lib/types';
import {
  Download,
  Gift,
  MessageCircle,
  Phone,
  Plus,
  Search,
  Trash2,
  User,
  Users,
} from 'lucide-react';
import { useMemo, useState } from 'react';

interface Props {
  state: AppDatabaseState;
  onUpdateState: (updater: (prev: AppDatabaseState) => AppDatabaseState) => void;
}

export default function CustomersCrmTab({ state, onUpdateState }: Props) {
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string>(state.customers[0]?.id || '');
  const [newGiftDesc, setNewGiftDesc] = useState('');

  const filteredCustomers = useMemo(() => {
    return state.customers.filter((c) => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        c.name.toLowerCase().includes(q) ||
        c.phone.includes(q) ||
        c.tags.some((t) => t.toLowerCase().includes(q))
      );
    });
  }, [state.customers, search]);

  const selectedCustomer =
    state.customers.find((c) => c.id === selectedId) || filteredCustomers[0];

  function handleUpdateNotes(customerId: string, adminNotes: string) {
    onUpdateState((prev) => ({
      ...prev,
      customers: prev.customers.map((c) =>
        c.id === customerId ? { ...c, adminNotes } : c
      ),
    }));
  }

  function handleDeleteCustomer(customerId: string, customerName: string) {
    if (!confirm(`Deseja realmente excluir o cliente "${customerName}" do CRM?`)) return;
    onUpdateState((prev) => {
      const remaining = prev.customers.filter((c) => c.id !== customerId);
      if (selectedId === customerId) {
        setSelectedId(remaining[0]?.id || '');
      }
      return {
        ...prev,
        customers: remaining,
      };
    });
  }

  // Pedidos válidos (não cancelados) de um cliente, pelo id ou telefone
  function ordersOfCustomer(c: CustomerProfile) {
    const digits = normalizePhone(c.phone);
    return state.orders.filter(
      (o) =>
        o.customerId === c.id ||
        (digits.length >= 8 && normalizePhone(o.customerPhone || '') === digits)
    );
  }

  const orphanCustomers = useMemo(
    () => state.customers.filter((c) => ordersOfCustomer(c).length === 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.customers, state.orders]
  );

  // Remove clientes sem nenhum pedido e recalcula as métricas dos demais a partir dos pedidos reais
  function handlePruneAndResync() {
    const orphanIds = new Set(orphanCustomers.map((c) => c.id));
    const msg =
      orphanCustomers.length > 0
        ? `Remover ${orphanCustomers.length} cliente(s) sem nenhum pedido e recalcular os totais dos demais com base nos pedidos existentes?`
        : 'Todos os clientes têm pedidos. Recalcular os totais (pedidos, gasto e ticket médio) com base nos pedidos existentes?';
    if (!confirm(msg)) return;

    onUpdateState((prev) => {
      const digitsOf = (v: string) => normalizePhone(v || '');
      const customers = prev.customers
        .filter((c) => !orphanIds.has(c.id))
        .map((c) => {
          const d = digitsOf(c.phone);
          const own = prev.orders.filter(
            (o) =>
              o.status !== 'Cancelado' &&
              (o.customerId === c.id || (d.length >= 8 && digitsOf(o.customerPhone) === d))
          );
          const totalSpent = own.reduce((a, o) => a + o.totalAmount, 0);
          const last = own.map((o) => o.createdAt).sort().pop();
          return {
            ...c,
            totalOrders: own.length,
            totalSpent,
            averageTicket: own.length > 0 ? totalSpent / own.length : 0,
            lastOrderAt: last || c.lastOrderAt,
          };
        });
      return { ...prev, customers };
    });
    if (orphanIds.has(selectedId)) setSelectedId('');
  }

  function handleClearAllCustomers() {
    if (state.customers.length === 0) return;
    if (!confirm('Deseja zerar toda a lista de clientes cadastrados no CRM?')) return;
    setSelectedId('');
    onUpdateState((prev) => ({
      ...prev,
      customers: [],
    }));
  }

  function handleRegisterGift(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedCustomer || !newGiftDesc.trim()) return;
    const today = todayLocal();

    onUpdateState((prev) => ({
      ...prev,
      customers: prev.customers.map((c) => {
        if (c.id !== selectedCustomer.id) return c;
        return {
          ...c,
          giftHistory: [
            { date: today, giftDescription: newGiftDesc.trim() },
            ...c.giftHistory,
          ],
          activities: [
            {
              id: `act-${Date.now()}`,
              timestamp: new Date().toISOString(),
              type: 'observacao_admin',
              description: `Ação de fidelidade: ${newGiftDesc.trim()}`,
            },
            ...c.activities,
          ],
        };
      }),
    }));

    setNewGiftDesc('');
  }

  function handleExportCsvForMassMessaging() {
    const headers = [
      'Nome',
      'Telefone_WhatsApp',
      'Total_Pedidos',
      'Total_Gasto_BRL',
      'Ticket_Medio_BRL',
      'Lanche_Favorito',
      'Ultimo_Pedido',
      'Tags',
    ];

    const rows = state.customers.map((c) => {
      const fav = Object.values(c.itemFrequency || {}).sort((a, b) => b.count - a.count)[0];
      return [
        `"${c.name}"`,
        `55${normalizePhone(c.phone)}`,
        c.totalOrders,
        c.totalSpent.toFixed(2),
        c.averageTicket.toFixed(2),
        `"${fav ? `${fav.productName} (${fav.count}x)` : 'Nenhum'}"`,
        c.lastOrderAt ? c.lastOrderAt.slice(0, 10) : '',
        `"${c.tags.join('; ')}"`,
      ].join(',');
    });

    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `clientes_delivery_${todayLocal()}.csv`;
    a.click();
  }

  function getCustomerFavoriteItem(c: CustomerProfile) {
    const sorted = Object.values(c.itemFrequency || {}).sort((a, b) => b.count - a.count);
    return sorted[0] || null;
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-white/[0.08]">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100">Clientes (CRM)</h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            Histórico de pedidos, ticket médio e preferências para ações de fidelização.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {state.customers.length > 0 && (
            <button
              type="button"
              onClick={handlePruneAndResync}
              className="btn-saas-secondary text-xs"
              title="Remove clientes que não têm mais pedidos (ex: clientes de teste) e corrige os totais"
            >
              <Trash2 className="size-3.5 text-amber-400" /> Limpar clientes sem pedidos
              {orphanCustomers.length > 0 && (
                <span className="ml-1 px-1.5 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-semibold">
                  {orphanCustomers.length}
                </span>
              )}
            </button>
          )}
          {state.customers.length > 0 && (
            <button
              type="button"
              onClick={handleClearAllCustomers}
              className="px-3 py-1.5 rounded-[6px] bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-400 text-xs font-medium inline-flex items-center gap-1.5 transition"
            >
              <Trash2 className="size-3.5" /> Zerar Clientes
            </button>
          )}
          <button
            type="button"
            onClick={handleExportCsvForMassMessaging}
            disabled={state.customers.length === 0}
            className="btn-saas-secondary disabled:opacity-40"
          >
            <Download className="size-3.5 text-zinc-400" /> Exportar CSV para WhatsApp
          </button>
        </div>
      </div>

      {state.customers.length === 0 ? (
        <div className="bg-[#121215] border border-white/[0.08] rounded-[12px] p-10 text-center space-y-2">
          <Users className="size-8 text-zinc-500 mx-auto" />
          <h2 className="text-sm font-semibold text-zinc-200">
            Nenhum cliente registrado ainda
          </h2>
          <p className="text-xs text-zinc-400 max-w-md mx-auto">
            Assim que o primeiro cliente fizer um pedido pelo Cardápio Virtual ou você lançar uma venda com telefone no PDV, a ficha completa dele será criada automaticamente aqui.
          </p>
        </div>
      ) : (
        /* Main Grid: Customer List (Left) + Dossier (Right) */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column: List */}
          <div className="bg-[#121215] border border-white/[0.08] rounded-[10px] p-4 space-y-3">
            <div className="flex items-center justify-between text-xs text-zinc-400">
              <span className="flex items-center gap-1.5 font-medium text-zinc-200">
                <Users className="size-3.5 text-zinc-400" /> Base de Clientes
              </span>
              <span className="tabular-nums">{state.customers.length} cadastros</span>
            </div>

            <div className="relative">
              <Search className="size-3.5 text-zinc-500 absolute left-3 top-2.5" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nome, telefone..."
                className="w-full pl-8 pr-3 py-1.5 bg-[#09090b] border border-white/[0.08] rounded-[6px] text-xs text-zinc-100"
              />
            </div>

            <div className="space-y-1.5 max-h-[580px] overflow-y-auto pr-1">
              {filteredCustomers.map((c) => {
                const active = c.id === selectedCustomer?.id;
                const fav = getCustomerFavoriteItem(c);
                return (
                  <div
                    key={c.id}
                    onClick={() => setSelectedId(c.id)}
                    className={`p-3 rounded-[8px] border cursor-pointer transition space-y-1.5 ${
                      active
                        ? 'bg-[#18181c] border-zinc-300'
                        : 'bg-[#09090b] border-white/[0.06] hover:border-white/[0.14]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-xs font-semibold text-zinc-100">{c.name}</p>
                        <p className="text-[11px] text-zinc-400 font-mono mt-0.5 flex items-center gap-1">
                          <Phone className="size-3 text-zinc-500" /> {formatPhoneBR(c.phone)}
                        </p>
                      </div>
                      <div className="flex items-start gap-2">
                        <div className="text-right tabular-nums">
                          <span className="text-[11px] text-zinc-400">
                            {c.totalOrders} {c.totalOrders === 1 ? 'pedido' : 'pedidos'}
                          </span>
                          <p className="text-xs font-semibold text-zinc-100 mt-0.5">
                            {formatBRL(c.totalSpent)}
                          </p>
                        </div>
                        <button
                          type="button"
                          title="Excluir cliente"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteCustomer(c.id, c.name);
                          }}
                          className="p-1 text-zinc-500 hover:text-rose-400 transition"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </div>

                    {fav && (
                      <p className="text-[11px] text-zinc-400 truncate">
                        Preferência:{' '}
                        <span className="text-zinc-200">{fav.productName.split('-')[0]}</span> (
                        {fav.count}x)
                      </p>
                    )}

                    {c.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 pt-0.5">
                        {c.tags.map((t, i) => (
                          <span
                            key={i}
                            className="px-1.5 py-0.5 rounded-[4px] bg-[#18181c] border border-white/[0.08] text-zinc-400 text-[10px]"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right 2 Columns: Customer Details */}
          {selectedCustomer && (
            <div className="lg:col-span-2 space-y-5">
              <div className="bg-[#121215] border border-white/[0.08] rounded-[10px] p-5 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/[0.08]">
                  <div className="flex items-center gap-3">
                    <div className="size-11 rounded-[8px] bg-[#18181c] border border-white/[0.1] text-zinc-200 font-semibold text-sm flex items-center justify-center">
                      <User className="size-5 text-zinc-400" />
                    </div>
                    <div>
                      <h2 className="text-base font-semibold text-zinc-100">
                        {selectedCustomer.name}
                      </h2>
                      <p className="text-xs text-zinc-400 font-mono">
                        {formatPhoneBR(selectedCustomer.phone)} • Cadastrado em{' '}
                        {selectedCustomer.createdAt.slice(0, 10)}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {(() => {
                      const fav = getCustomerFavoriteItem(selectedCustomer);
                      const promoMsg = `Olá ${selectedCustomer.name}! Aqui é da ${
                        state.settings.storeName
                      }. Vimos que você costuma pedir o nosso *${
                        fav ? fav.productName.split('-')[0].trim() : 'hambúrguer'
                      }*. Estamos com pedidos abertos hoje!`;
                      const waUrl = `https://api.whatsapp.com/send?phone=55${normalizePhone(
                        selectedCustomer.phone
                      )}&text=${encodeURIComponent(promoMsg)}`;
                      return (
                        <a
                          href={waUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="btn-saas-secondary text-xs"
                        >
                          <MessageCircle className="size-3.5 text-zinc-400" /> Mensagem WhatsApp
                        </a>
                      );
                    })()}
                    <button
                      type="button"
                      onClick={() =>
                        handleDeleteCustomer(selectedCustomer.id, selectedCustomer.name)
                      }
                      className="px-3 py-1.5 rounded-[6px] bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-400 text-xs font-medium inline-flex items-center gap-1.5 transition"
                    >
                      <Trash2 className="size-3.5" /> Excluir Cliente
                    </button>
                  </div>
                </div>

                {/* Metrics */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs tabular-nums">
                  <div className="bg-[#18181c] border border-white/[0.06] rounded-[8px] p-3">
                    <p className="text-zinc-400">Total de Pedidos</p>
                    <p className="text-base font-semibold text-zinc-100 mt-1">
                      {selectedCustomer.totalOrders}
                    </p>
                  </div>
                  <div className="bg-[#18181c] border border-white/[0.06] rounded-[8px] p-3">
                    <p className="text-zinc-400">Total Gasto</p>
                    <p className="text-base font-semibold text-emerald-400 mt-1">
                      {formatBRL(selectedCustomer.totalSpent)}
                    </p>
                  </div>
                  <div className="bg-[#18181c] border border-white/[0.06] rounded-[8px] p-3">
                    <p className="text-zinc-400">Ticket Médio</p>
                    <p className="text-base font-semibold text-zinc-100 mt-1">
                      {formatBRL(selectedCustomer.averageTicket)}
                    </p>
                  </div>
                  <div className="bg-[#18181c] border border-white/[0.06] rounded-[8px] p-3">
                    <p className="text-zinc-400">Pagamento Habitual</p>
                    <p className="text-xs font-medium text-zinc-200 mt-1 truncate">
                      {selectedCustomer.preferredPaymentMethod || 'PIX'}
                    </p>
                  </div>
                </div>

                {/* Top Products */}
                <div className="space-y-2">
                  <h3 className="text-xs font-semibold text-zinc-300">
                    Itens Mais Pedidos por {selectedCustomer.name}
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    {Object.values(selectedCustomer.itemFrequency || {})
                      .sort((a, b) => b.count - a.count)
                      .map((item, idx) => (
                        <div
                          key={idx}
                          className="bg-[#18181c] border border-white/[0.06] rounded-[8px] p-3 flex items-center justify-between text-xs tabular-nums"
                        >
                          <div className="truncate mr-2">
                            <p className="font-medium text-zinc-200 truncate">{item.productName}</p>
                            <p className="text-[11px] text-zinc-500">{formatBRL(item.totalSpent)}</p>
                          </div>
                          <span className="px-2 py-0.5 rounded bg-[#09090b] border border-white/[0.08] text-zinc-200 font-semibold text-[11px]">
                            {item.count}x
                          </span>
                        </div>
                      ))}
                  </div>
                </div>

                {/* Notes & Loyalty Actions */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                  <div className="space-y-2 text-xs">
                    <label className="text-zinc-300 font-medium block">
                      Observações Internas do Cliente
                    </label>
                    <textarea
                      rows={3}
                      value={selectedCustomer.adminNotes || ''}
                      onChange={(e) => handleUpdateNotes(selectedCustomer.id, e.target.value)}
                      placeholder="Adicione anotações sobre preferências, endereço alternativo ou rotina..."
                      className="w-full bg-[#09090b] border border-white/[0.1] rounded-[6px] p-2.5 text-zinc-100"
                    />
                  </div>

                  <div className="space-y-2 text-xs">
                    <label className="text-zinc-300 font-medium block">
                      Ações de Fidelidade / Cortesias
                    </label>
                    <form onSubmit={handleRegisterGift} className="flex gap-2">
                      <input
                        type="text"
                        value={newGiftDesc}
                        onChange={(e) => setNewGiftDesc(e.target.value)}
                        placeholder="Ex: Porção de cebola cortesia"
                        className="flex-1 bg-[#09090b] border border-white/[0.1] rounded-[6px] px-3 py-1.5 text-zinc-100"
                      />
                      <button type="submit" className="btn-saas-secondary">
                        <Plus className="size-3.5" /> Registrar
                      </button>
                    </form>
                    <div className="space-y-1 max-h-24 overflow-y-auto">
                      {selectedCustomer.giftHistory.map((g, i) => (
                        <div
                          key={i}
                          className="bg-[#18181c] border border-white/[0.06] rounded-[6px] px-2.5 py-1 text-zinc-300 flex justify-between text-[11px]"
                        >
                          <span className="flex items-center gap-1.5">
                            <Gift className="size-3 text-zinc-400" /> {g.giftDescription}
                          </span>
                          <span className="text-zinc-500 font-mono">{g.date}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Timeline */}
              <div className="bg-[#121215] border border-white/[0.08] rounded-[10px] p-5 space-y-3">
                <h3 className="text-xs font-semibold text-zinc-300">
                  Histórico de Interações e Pedidos
                </h3>
                <div className="space-y-2 max-h-60 overflow-y-auto text-xs tabular-nums">
                  {selectedCustomer.activities.map((act) => (
                    <div
                      key={act.id}
                      className="bg-[#18181c] border border-white/[0.06] rounded-[6px] p-3 flex items-center justify-between"
                    >
                      <div>
                        <p className="text-zinc-200">{act.description}</p>
                        <p className="text-[11px] text-zinc-500">
                          {new Date(act.timestamp).toLocaleString('pt-BR')}
                        </p>
                      </div>
                      {act.totalValue && (
                        <span className="font-semibold text-zinc-100">
                          {formatBRL(act.totalValue)}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
