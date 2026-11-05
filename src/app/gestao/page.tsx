'use client';

import CustomersCrmTab from '@/components/admin/CustomersCrmTab';
import FinanceDreTab from '@/components/admin/FinanceDreTab';
import IngredientsTab from '@/components/admin/IngredientsTab';
import InvoicesTab from '@/components/admin/InvoicesTab';
import OverviewTab from '@/components/admin/OverviewTab';
import PricingTab from '@/components/admin/PricingTab';
import RecipesTab from '@/components/admin/RecipesTab';
import SalesTab from '@/components/admin/SalesTab';
import StoreSettingsTab from '@/components/admin/StoreSettingsTab';
import { INITIAL_STATE } from '@/lib/initial-data';
import { formatBRL } from '@/lib/pricing';
import { AppDatabaseState, SaleOrder } from '@/lib/types';
import {
  BarChart3,
  Bell,
  BellOff,
  Calculator,
  Check,
  ChefHat,
  Eye,
  EyeOff,
  ExternalLink,
  LayoutDashboard,
  Lock,
  LogOut,
  Package,
  Receipt,
  RefreshCw,
  Save,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Users,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

type AdminTabId =
  | 'overview'
  | 'precificacao'
  | 'fichas'
  | 'insumos'
  | 'notas'
  | 'vendas'
  | 'clientes'
  | 'financeiro'
  | 'configuracoes';

// Campainha sonora estilo cozinha / iFood usando Web Audio API (não depende de arquivo MP3 externo)
function playKitchenBell() {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();

    const playTone = (freq: number, startTime: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, startTime);
      gain.gain.setValueAtTime(0.001, startTime);
      gain.gain.exponentialRampToValueAtTime(0.35, startTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startTime);
      osc.stop(startTime + duration);
    };

    const now = ctx.currentTime;
    playTone(880, now, 0.25);        // A5
    playTone(1174.66, now + 0.22, 0.45); // D6
    playTone(880, now + 0.75, 0.25);
    playTone(1174.66, now + 0.97, 0.5);
  } catch {
    // ignore audio block
  }
}

export default function AdminManagementPage() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [pinInput, setPinInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);

  const [state, setState] = useState<AppDatabaseState>(INITIAL_STATE);
  const [activeTab, setActiveTab] = useState<AdminTabId>('vendas');
  const [saving, setSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [hasCloudDb, setHasCloudDb] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);

  const latestStateRef = useRef<AppDatabaseState>(INITIAL_STATE);
  const savingRef = useRef(false);
  const dirtyRef = useRef(false);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deletedOrderIdsRef = useRef<Set<string>>(new Set());
  const deletedCustomerIdsRef = useRef<Set<string>>(new Set());
  const knownOrderIdsRef = useRef<Set<string>>(new Set());
  const soundEnabledRef = useRef(true);

  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
  }, [soundEnabled]);

  useEffect(() => {
    fetch('/api/auth')
      .then((r) => r.json())
      .then((d) => {
        setAuthenticated(Boolean(d.authenticated));
        if (d.authenticated) {
          loadServerState(false);
        }
      })
      .catch(() => setAuthenticated(false));
  }, []);

  const persistToServer = useCallback(async (stateToSave?: AppDatabaseState) => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    const payload = stateToSave || latestStateRef.current;
    const deletedOrderIds = Array.from(deletedOrderIdsRef.current);
    const deletedCustomerIds = Array.from(deletedCustomerIdsRef.current);

    setSaving(true);
    savingRef.current = true;
    dirtyRef.current = false;

    try {
      const res = await fetch('/api/admin/state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          state: payload,
          deletedOrderIds,
          deletedCustomerIds,
        }),
      });
      if (res.ok) {
        if (!dirtyRef.current) {
          setHasUnsavedChanges(false);
        }
        setLastSavedAt(
          new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
        );
      }
    } catch {
      setHasUnsavedChanges(true);
    } finally {
      setSaving(false);
      savingRef.current = false;
    }
  }, []);

  // Atalho Ctrl+S / Cmd+S para salvar imediatamente
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        persistToServer(latestStateRef.current);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [persistToServer]);

  // Poll silencioso a cada 10s para detectar novos pedidos em tempo real e tocar campainha
  useEffect(() => {
    if (!authenticated) return;
    const interval = setInterval(() => {
      if (!savingRef.current && !dirtyRef.current) {
        loadServerState(true);
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [authenticated]);

  function notifyNewIncomingOrder(newOrder: SaleOrder) {
    if (soundEnabledRef.current) {
      playKitchenBell();
    }
    try {
      if ('Notification' in window && Notification.permission === 'granted') {
        const summary = newOrder.items.map((i) => `${i.quantity}x ${i.productName}`).join(', ');
        new Notification(`🍔 Novo Pedido #${newOrder.orderNumber} — ${newOrder.customerName}`, {
          body: `${summary} • Total: ${formatBRL(newOrder.totalAmount)} (${newOrder.paymentMethod})`,
          icon: '/logo.jpg',
        });
      }
    } catch {
      // ignore notification error
    }
  }

  async function loadServerState(silent = false) {
    try {
      const res = await fetch('/api/admin/state', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (data.state) {
          const incomingOrders: SaleOrder[] = (data.state.orders || []).filter(
            (o: SaleOrder) => !deletedOrderIdsRef.current.has(o.id)
          );

          if (!silent) {
            knownOrderIdsRef.current = new Set(incomingOrders.map((o) => o.id));
            latestStateRef.current = data.state;
            setState(data.state);
            setHasUnsavedChanges(false);
            dirtyRef.current = false;
          } else if (!dirtyRef.current && !savingRef.current) {
            // Verifica se chegou algum pedido inédito
            const brandNewOrders = incomingOrders.filter(
              (o) => !knownOrderIdsRef.current.has(o.id)
            );
            for (const bo of brandNewOrders) {
              knownOrderIdsRef.current.add(bo.id);
            }
            if (brandNewOrders.length > 0) {
              notifyNewIncomingOrder(brandNewOrders[0]);
            }

            setState((prev) => {
              const serverCustomers = (data.state.customers || []).filter(
                (c: { id: string }) => !deletedCustomerIdsRef.current.has(c.id)
              );
              if (
                incomingOrders.length === prev.orders.length &&
                serverCustomers.length === prev.customers.length
              ) {
                return prev;
              }
              const merged = {
                ...prev,
                orders: incomingOrders,
                customers: serverCustomers,
              };
              latestStateRef.current = merged;
              return merged;
            });
          }
          setHasCloudDb(Boolean(data.hasCloudDb));
        }
      } else if (res.status === 401) {
        setAuthenticated(false);
      }
    } catch {
      // fallback
    }
  }

  function handleUpdateState(updater: (prev: AppDatabaseState) => AppDatabaseState) {
    setState((prev) => {
      const next = updater(prev);

      // Registra IDs de pedidos ou clientes excluídos para que nunca ressuscitem no servidor
      const nextOrderIds = new Set(next.orders.map((o) => o.id));
      for (const oldOrd of prev.orders) {
        if (!nextOrderIds.has(oldOrd.id)) {
          deletedOrderIdsRef.current.add(oldOrd.id);
        }
      }
      for (const ord of next.orders) {
        knownOrderIdsRef.current.add(ord.id);
      }

      const nextCustomerIds = new Set(next.customers.map((c) => c.id));
      for (const oldCust of prev.customers) {
        if (!nextCustomerIds.has(oldCust.id)) {
          deletedCustomerIdsRef.current.add(oldCust.id);
        }
      }

      const isStructuralAction =
        next.orders.length !== prev.orders.length ||
        next.customers.length !== prev.customers.length ||
        next.invoices.length !== prev.invoices.length ||
        next.products.length !== prev.products.length ||
        next.ingredients.length !== prev.ingredients.length;

      latestStateRef.current = next;
      dirtyRef.current = true;
      setHasUnsavedChanges(true);

      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      if (isStructuralAction) {
        // Exclusão ou adição de registro salva imediatamente no servidor
        setTimeout(() => persistToServer(latestStateRef.current), 50);
      } else {
        // Edição de texto aguarda 1.8s após parar de digitar
        debounceTimerRef.current = setTimeout(() => {
          persistToServer(latestStateRef.current);
        }, 1800);
      }

      return next;
    });
  }

  function handleToggleSound() {
    const next = !soundEnabled;
    setSoundEnabled(next);
    if (next) {
      playKitchenBell();
      if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission().catch(() => {});
      }
    }
  }

  function handleAcceptOrderQuick(orderId: string) {
    handleUpdateState((prev) => ({
      ...prev,
      orders: prev.orders.map((o) =>
        o.id === orderId ? { ...o, status: 'Em Preparo' } : o
      ),
    }));
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setAuthError('');
    setLoggingIn(true);
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: pinInput }),
      });
      const data = await res.json();
      if (res.ok && data.authenticated) {
        setAuthenticated(true);
        setPinInput('');
        loadServerState(false);
      } else {
        setAuthError(data.error || 'Credencial inválida.');
      }
    } catch {
      setAuthError('Falha de conexão com o servidor.');
    } finally {
      setLoggingIn(false);
    }
  }

  async function handleLogout() {
    if (dirtyRef.current) {
      await persistToServer(latestStateRef.current);
    }
    await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'logout' }),
    });
    setAuthenticated(false);
    setPinInput('');
  }

  if (authenticated === null) {
    return (
      <div className="min-h-screen bg-[#09090b] text-zinc-400 flex items-center justify-center text-xs">
        Verificando sessão segura...
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="min-h-screen bg-[#09090b] text-zinc-100 flex items-center justify-center p-4">
        <div className="max-w-sm w-full bg-[#121215] border border-white/[0.08] rounded-[14px] p-6 space-y-5 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-orange-600 via-amber-500 to-orange-600" />

          <div className="flex items-center gap-3.5 pt-1">
            <img
              src="/logo.jpg"
              alt="Monster Burger"
              className="size-12 rounded-[10px] object-cover border border-orange-500/30 shadow-md bg-black"
            />
            <div>
              <div className="flex items-center gap-1.5">
                <h1 className="text-base font-bold text-zinc-100 tracking-tight">Monster Burger</h1>
                <ShieldCheck className="size-4 text-orange-400" />
              </div>
              <p className="text-xs text-zinc-400">
                Acesso Restrito • Gestão & ERP
              </p>
            </div>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="text-xs text-zinc-400 flex items-center gap-1.5 mb-1.5">
                <Lock className="size-3.5 text-orange-400" />
                Senha / Credencial Administrativa
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoFocus
                  autoComplete="current-password"
                  value={pinInput}
                  onChange={(e) => setPinInput(e.target.value)}
                  placeholder="Digite sua senha de gestão"
                  className="w-full bg-[#09090b] border border-white/[0.1] focus-visible:border-orange-500 rounded-[8px] pl-3.5 pr-9 py-2.5 text-xs text-zinc-100 font-mono outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2.5 top-2.5 text-zinc-500 hover:text-zinc-300"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>

            {authError && (
              <div className="bg-rose-500/10 border border-rose-500/20 rounded-[6px] p-2.5 text-xs text-rose-400 text-center">
                {authError}
              </div>
            )}

            <button
              type="submit"
              disabled={loggingIn}
              className="btn-monster-primary w-full py-2.5 disabled:opacity-50"
            >
              {loggingIn ? 'Autenticando...' : 'Entrar no Painel de Gestão'}
            </button>
          </form>

          <div className="border-t border-white/[0.06] pt-3 text-center text-[11px] text-zinc-500 flex items-center justify-between">
            <span>Sessão criptografada HMAC</span>
            <a
              href="/"
              className="text-zinc-400 hover:text-orange-400 inline-flex items-center gap-1 transition-colors"
            >
              Ir para o Cardápio <ExternalLink className="size-3" />
            </a>
          </div>
        </div>
      </div>
    );
  }

  const pendingNewOrders = state.orders.filter((o) => o.status === 'Novo Pedido');
  const newOrdersCount = pendingNewOrders.length;

  const navItems: { id: AdminTabId; label: string; badge?: number; highlight?: boolean; icon: React.ReactNode }[] = [
    {
      id: 'vendas',
      label: 'Fila de Pedidos & Vendas',
      badge: newOrdersCount || undefined,
      highlight: newOrdersCount > 0,
      icon: <ShoppingBag className="size-3.5" />,
    },
    {
      id: 'overview',
      label: 'Visão Geral',
      icon: <LayoutDashboard className="size-3.5" />,
    },
    {
      id: 'precificacao',
      label: 'Precificação',
      icon: <Calculator className="size-3.5" />,
    },
    {
      id: 'fichas',
      label: 'Fichas & Cardápio',
      badge: state.products.length,
      icon: <ChefHat className="size-3.5" />,
    },
    {
      id: 'insumos',
      label: 'Insumos',
      badge: state.ingredients.length,
      icon: <Package className="size-3.5" />,
    },
    {
      id: 'notas',
      label: 'Notas e Compras (IA)',
      badge: state.invoices.length,
      icon: <Receipt className="size-3.5" />,
    },
    {
      id: 'clientes',
      label: 'Clientes (CRM)',
      badge: state.customers.length,
      icon: <Users className="size-3.5" />,
    },
    {
      id: 'financeiro',
      label: 'Custos Fixos, DRE & Senha',
      icon: <BarChart3 className="size-3.5" />,
    },
    {
      id: 'configuracoes',
      label: 'Configurações',
      icon: <Settings className="size-3.5" />,
    },
  ];

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100 pb-16">
      {/* Top Navigation Shell */}
      <header className="bg-[#121215] border-b border-white/[0.08] sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 py-2.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <img
              src="/logo.jpg"
              alt="Monster Burger"
              className="size-8 rounded-[7px] object-cover border border-orange-500/30 shadow-sm bg-black"
            />
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-zinc-100 tracking-tight">
                  {state.settings.storeName} — Gestão
                </span>
                {hasUnsavedChanges ? (
                  <span className="px-2 py-0.5 rounded text-[10px] text-amber-300 bg-amber-500/15 border border-amber-500/30 font-medium">
                    Editando...
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 font-medium inline-flex items-center gap-1">
                    <Check className="size-2.5" />
                    {saving
                      ? 'Salvando...'
                      : lastSavedAt
                      ? `Salvo às ${lastSavedAt}`
                      : hasCloudDb
                      ? 'Nuvem ativa'
                      : 'Salvo'}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleToggleSound}
              className={`px-2.5 py-1.5 rounded-[6px] text-xs font-medium flex items-center gap-1.5 border transition ${
                soundEnabled
                  ? 'bg-orange-500/10 border-orange-500/30 text-orange-400'
                  : 'bg-[#18181c] border-white/[0.08] text-zinc-500'
              }`}
              title="Alerta sonoro quando chegar novo pedido (clique para testar o som)"
            >
              {soundEnabled ? <Bell className="size-3.5" /> : <BellOff className="size-3.5" />}
              <span className="hidden md:inline">
                {soundEnabled ? 'Som de Pedidos Ativo' : 'Som Mudo'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => persistToServer(latestStateRef.current)}
              disabled={saving}
              className={`px-3 py-1.5 rounded-[6px] text-xs font-semibold flex items-center gap-1.5 transition ${
                hasUnsavedChanges
                  ? 'bg-[#ff5400] hover:bg-[#ea4b00] text-white shadow-sm shadow-orange-500/30'
                  : 'bg-[#18181c] hover:bg-zinc-800 border border-white/[0.08] text-zinc-300'
              }`}
              title="Salvar alterações (Ctrl+S)"
            >
              <Save className="size-3.5" />
              {saving ? 'Salvando...' : hasUnsavedChanges ? 'Salvar Agora' : 'Salvo'}
            </button>

            <button
              type="button"
              onClick={() => loadServerState(false)}
              className="p-1.5 bg-[#18181c] hover:bg-zinc-800 border border-white/[0.08] text-zinc-400 hover:text-zinc-200 rounded-[6px]"
              title="Recarregar pedidos do servidor"
            >
              <RefreshCw className="size-3.5" />
            </button>
            <a
              href="https://monsterburger.vercel.app"
              target="_blank"
              rel="noreferrer"
              className="btn-saas-secondary text-xs hidden sm:inline-flex"
              title="Abrir o cardápio oficial do cliente (monsterburger.vercel.app)"
            >
              <ExternalLink className="size-3.5 text-zinc-400" />
              monsterburger.vercel.app
            </a>
            <button
              type="button"
              aria-label="Encerrar sessão"
              onClick={handleLogout}
              className="p-1.5 bg-[#18181c] hover:bg-zinc-800 border border-white/[0.08] text-zinc-400 hover:text-zinc-200 rounded-[6px]"
              title="Sair da Gestão"
            >
              <LogOut className="size-3.5" />
            </button>
          </div>
        </div>

        {/* Tab Links */}
        <div className="max-w-7xl mx-auto px-4 flex items-center gap-1 overflow-x-auto py-1 border-t border-white/[0.04]">
          {navItems.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-1.5 rounded-[6px] text-xs font-medium whitespace-nowrap flex items-center gap-1.5 transition ${
                  active
                    ? 'bg-zinc-100 text-zinc-950'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]'
                }`}
              >
                {tab.icon}
                <span>{tab.label}</span>
                {tab.badge !== undefined && (
                  <span
                    className={`px-1.5 rounded-full text-[10px] font-semibold tabular-nums ${
                      tab.highlight
                        ? 'bg-[#ff5400] text-white animate-pulse'
                        : active
                        ? 'bg-zinc-300 text-zinc-900'
                        : 'bg-white/[0.08] text-zinc-300'
                    }`}
                  >
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </header>

      {/* Banner Ao Vivo de Novo Pedido (Aparece em qualquer aba até o operador aceitar!) */}
      {pendingNewOrders.length > 0 && (
        <div className="bg-gradient-to-r from-[#ff5400] via-orange-600 to-[#ff5400] text-white border-b border-orange-400/40 shadow-lg">
          <div className="max-w-7xl mx-auto px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-start sm:items-center gap-3">
              <span className="size-8 rounded-full bg-black/25 flex items-center justify-center shrink-0 animate-bounce">
                <Bell className="size-4 text-white" />
              </span>
              <div>
                <p className="font-bold text-sm">
                  🔔 {pendingNewOrders.length === 1 ? 'NOVO PEDIDO RECEBIDO!' : `${pendingNewOrders.length} NOVOS PEDIDOS AGUARDANDO!`}
                </p>
                <p className="text-white/95">
                  Último: <strong>#{pendingNewOrders[0].orderNumber} — {pendingNewOrders[0].customerName}</strong> •{' '}
                  {pendingNewOrders[0].items.map((i) => `${i.quantity}x ${i.productName}`).join(', ')} •{' '}
                  <strong>{formatBRL(pendingNewOrders[0].totalAmount)}</strong> ({pendingNewOrders[0].paymentMethod})
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => handleAcceptOrderQuick(pendingNewOrders[0].id)}
                className="px-3.5 py-2 rounded-[6px] bg-black/80 hover:bg-black text-white font-bold transition"
              >
                ✓ Aceitar e Iniciar Preparo
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('vendas')}
                className="px-3.5 py-2 rounded-[6px] bg-white text-zinc-950 font-bold hover:bg-zinc-100 transition"
              >
                Abrir Fila de Pedidos
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-4 pt-6">
        {activeTab === 'overview' && (
          <OverviewTab state={state} onNavigate={(tab) => setActiveTab(tab)} />
        )}
        {activeTab === 'precificacao' && (
          <PricingTab state={state} onUpdateState={handleUpdateState} />
        )}
        {activeTab === 'fichas' && (
          <RecipesTab state={state} onUpdateState={handleUpdateState} />
        )}
        {activeTab === 'insumos' && (
          <IngredientsTab state={state} onUpdateState={handleUpdateState} />
        )}
        {activeTab === 'notas' && (
          <InvoicesTab state={state} onUpdateState={handleUpdateState} />
        )}
        {activeTab === 'vendas' && (
          <SalesTab state={state} onUpdateState={handleUpdateState} />
        )}
        {activeTab === 'clientes' && (
          <CustomersCrmTab state={state} onUpdateState={handleUpdateState} />
        )}
        {activeTab === 'configuracoes' && (
          <StoreSettingsTab state={state} onUpdateState={handleUpdateState} />
        )}
        {activeTab === 'financeiro' && (
          <FinanceDreTab state={state} onUpdateState={handleUpdateState} />
        )}
      </main>
    </div>
  );
}
