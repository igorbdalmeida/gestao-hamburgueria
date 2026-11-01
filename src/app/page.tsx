'use client';

import CustomersCrmTab from '@/components/admin/CustomersCrmTab';
import FinanceDreTab from '@/components/admin/FinanceDreTab';
import IngredientsTab from '@/components/admin/IngredientsTab';
import InvoicesTab from '@/components/admin/InvoicesTab';
import OverviewTab from '@/components/admin/OverviewTab';
import PricingTab from '@/components/admin/PricingTab';
import RecipesTab from '@/components/admin/RecipesTab';
import SalesTab from '@/components/admin/SalesTab';
import { INITIAL_STATE } from '@/lib/initial-data';
import { AppDatabaseState } from '@/lib/types';
import {
  BarChart3,
  Calculator,
  ChefHat,
  ExternalLink,
  LayoutDashboard,
  Lock,
  LogOut,
  Package,
  Receipt,
  ShoppingBag,
  Users,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

type AdminTabId =
  | 'overview'
  | 'precificacao'
  | 'fichas'
  | 'insumos'
  | 'notas'
  | 'vendas'
  | 'clientes'
  | 'financeiro';

export default function AdminManagementPage() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [pinInput, setPinInput] = useState('');
  const [authError, setAuthError] = useState('');

  const [state, setState] = useState<AppDatabaseState>(INITIAL_STATE);
  const [activeTab, setActiveTab] = useState<AdminTabId>('overview');
  const [saving, setSaving] = useState(false);
  const [hasCloudDb, setHasCloudDb] = useState(false);
  const initialLoaded = useRef(false);

  useEffect(() => {
    fetch('/api/auth')
      .then((r) => r.json())
      .then((d) => {
        setAuthenticated(Boolean(d.authenticated));
        if (d.authenticated) {
          loadServerState();
        }
      })
      .catch(() => setAuthenticated(false));
  }, []);

  async function loadServerState() {
    try {
      const res = await fetch('/api/admin/state');
      if (res.ok) {
        const data = await res.json();
        if (data.state) {
          setState(data.state);
          setHasCloudDb(Boolean(data.hasCloudDb));
          initialLoaded.current = true;
        }
      }
    } catch {
      // fallback
    }
  }

  function handleUpdateState(updater: (prev: AppDatabaseState) => AppDatabaseState) {
    setState((prev) => {
      const next = updater(prev);
      persistToServer(next);
      return next;
    });
  }

  async function persistToServer(nextState: AppDatabaseState) {
    setSaving(true);
    try {
      await fetch('/api/admin/state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: nextState }),
      });
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setAuthError('');
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: pinInput }),
      });
      const data = await res.json();
      if (res.ok && data.authenticated) {
        setAuthenticated(true);
        loadServerState();
      } else {
        setAuthError(data.error || 'PIN incorreto');
      }
    } catch {
      setAuthError('Falha de conexão');
    }
  }

  async function handleLogout() {
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
        Carregando...
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
              <h1 className="text-base font-bold text-zinc-100 tracking-tight">Monster Burger</h1>
              <p className="text-xs text-zinc-400">
                Painel de Gestão & Precificação
              </p>
            </div>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="text-xs text-zinc-400 block mb-1.5">
                PIN de acesso (Padrão: <span className="font-mono text-zinc-200">1234</span>)
              </label>
              <input
                type="password"
                required
                autoFocus
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                placeholder="••••"
                className="w-full bg-[#09090b] border border-white/[0.1] focus-visible:border-orange-500 rounded-[6px] px-3 py-2 text-center text-lg tracking-widest text-zinc-100 font-mono outline-none"
              />
            </div>

            {authError && (
              <p className="text-xs text-rose-400 text-center">{authError}</p>
            )}

            <button type="submit" className="btn-monster-primary w-full">
              Entrar no Sistema
            </button>
          </form>

          <div className="border-t border-white/[0.06] pt-3 text-center text-xs text-zinc-500">
            <a href="/cardapio" className="text-zinc-400 hover:text-orange-400 inline-flex items-center gap-1 transition-colors">
              Abrir Cardápio Delivery (/cardapio) <ExternalLink className="size-3" />
            </a>
          </div>
        </div>
      </div>
    );
  }

  const navItems: { id: AdminTabId; label: string; badge?: number; icon: React.ReactNode }[] = [
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
      label: 'Fichas Técnicas',
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
      label: 'Notas e Compras',
      badge: state.invoices.length,
      icon: <Receipt className="size-3.5" />,
    },
    {
      id: 'vendas',
      label: 'Vendas e Pedidos',
      badge: state.orders.filter((o) => o.status === 'Novo Pedido').length || undefined,
      icon: <ShoppingBag className="size-3.5" />,
    },
    {
      id: 'clientes',
      label: 'Clientes (CRM)',
      badge: state.customers.length,
      icon: <Users className="size-3.5" />,
    },
    {
      id: 'financeiro',
      label: 'Custos Fixos & DRE',
      icon: <BarChart3 className="size-3.5" />,
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
                  {state.settings.storeName}
                </span>
                <span className="px-1.5 py-0.2 rounded text-[10px] text-orange-400 bg-orange-500/10 border border-orange-500/20 font-medium">
                  {saving ? 'Salvando...' : hasCloudDb ? 'Nuvem ativa' : 'Online'}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <a
              href="/cardapio"
              target="_blank"
              rel="noreferrer"
              className="btn-saas-secondary text-xs"
            >
              <ExternalLink className="size-3.5 text-zinc-400" />
              Ver Cardápio (/cardapio)
            </a>
            <button
              type="button"
              aria-label="Encerrar sessão"
              onClick={handleLogout}
              className="p-1.5 bg-[#18181c] hover:bg-zinc-800 border border-white/[0.08] text-zinc-400 hover:text-zinc-200 rounded-[6px]"
              title="Sair"
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
                    className={`px-1 rounded-full text-[10px] font-semibold tabular-nums ${
                      active ? 'bg-zinc-300 text-zinc-900' : 'bg-white/[0.08] text-zinc-300'
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
        {activeTab === 'financeiro' && (
          <FinanceDreTab state={state} onUpdateState={handleUpdateState} />
        )}
      </main>
    </div>
  );
}
