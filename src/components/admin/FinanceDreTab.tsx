'use client';

import { calculateProductMetrics, formatBRL } from '@/lib/pricing';
import { AppDatabaseState, FixedCostItem } from '@/lib/types';
import {
  CheckCircle2,
  Download,
  KeyRound,
  Lock,
  Plus,
  ShieldCheck,
  Trash2,
  Upload,
} from 'lucide-react';
import { useMemo, useState } from 'react';

interface Props {
  state: AppDatabaseState;
  onUpdateState: (updater: (prev: AppDatabaseState) => AppDatabaseState) => void;
}

export default function FinanceDreTab({ state, onUpdateState }: Props) {
  const [costName, setCostName] = useState('');
  const [costCat, setCostCat] = useState<FixedCostItem['category']>('Utilidades');
  const [costAmount, setCostAmount] = useState('100.00');

  // Security password change state
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordStatus, setPasswordStatus] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [savingPassword, setSavingPassword] = useState(false);

  function handleAddFixedCost(e: React.FormEvent) {
    e.preventDefault();
    if (!costName.trim()) return;
    const item: FixedCostItem = {
      id: `fc-${Date.now()}`,
      name: costName.trim(),
      category: costCat,
      monthlyAmount: parseFloat(costAmount) || 0,
      paid: false,
    };
    onUpdateState((prev) => ({
      ...prev,
      fixedCosts: [...prev.fixedCosts, item],
    }));
    setCostName('');
  }

  function handleDeleteFixedCost(id: string) {
    onUpdateState((prev) => ({
      ...prev,
      fixedCosts: prev.fixedCosts.filter((f) => f.id !== id),
    }));
  }

  async function handleChangeAdminPassword(e: React.FormEvent) {
    e.preventDefault();
    setPasswordStatus(null);
    setPasswordError(null);

    if (newPassword.trim().length < 4) {
      setPasswordError('A nova senha/PIN deve ter no mínimo 4 caracteres.');
      return;
    }
    if (newPassword.trim() !== confirmPassword.trim()) {
      setPasswordError('A confirmação da senha não confere.');
      return;
    }

    setSavingPassword(true);
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'change_password',
          newPassword: newPassword.trim(),
        }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setPasswordStatus('Senha de acesso da gestão atualizada com sucesso!');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        setPasswordError(data.error || 'Erro ao atualizar senha.');
      }
    } catch {
      setPasswordError('Falha de conexão ao salvar nova senha.');
    } finally {
      setSavingPassword(false);
    }
  }

  function handleExportBackupJson() {
    const json = JSON.stringify(state, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `monster-burger-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  }

  function handleImportBackupJson(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as AppDatabaseState;
        if (Array.isArray(parsed.products) && Array.isArray(parsed.ingredients)) {
          onUpdateState(() => parsed);
          alert('Backup restaurado com sucesso!');
        } else {
          alert('Arquivo de backup inválido.');
        }
      } catch {
        alert('Não foi possível ler o arquivo de backup.');
      }
    };
    reader.readAsText(file);
  }

  const summary = useMemo(() => {
    const totalMonthlyFixed = state.fixedCosts.reduce((a, b) => a + b.monthlyAmount, 0);
    const totalPaidFixed = state.fixedCosts
      .filter((f) => f.paid)
      .reduce((a, b) => a + b.monthlyAmount, 0);
    const totalInvoicesPurchases = state.invoices.reduce((a, b) => a + b.totalAmount, 0);

    const activeOrders = state.orders.filter((o) => o.status !== 'Cancelado');
    const totalSalesRevenue = activeOrders.reduce((a, b) => a + b.totalAmount, 0);
    const totalSalesCmv = activeOrders.reduce((a, b) => a + b.totalCmv, 0);
    const totalSalesFees = activeOrders.reduce((a, b) => a + b.paymentFeeAmount, 0);
    const totalSalesTaxReserve = activeOrders.reduce((a, b) => a + b.taxReserveAmount, 0);

    const burgers = state.products.filter((p) => p.category === 'Hambúrgueres');
    const avgBurgerContribution =
      burgers.length > 0
        ? burgers.reduce((acc, b) => {
            const m = calculateProductMetrics(b, state.ingredients);
            const variableDeductions =
              b.practicedPrice * (b.taxPct + b.channelFeePct);
            return acc + (b.practicedPrice - m.totalCmv - variableDeductions);
          }, 0) / burgers.length
        : 12;

    const breakEvenBurgersMonth =
      avgBurgerContribution > 0 ? Math.ceil(totalMonthlyFixed / avgBurgerContribution) : 0;
    const breakEvenBurgersDay = Math.ceil(breakEvenBurgersMonth / 30);

    const grossProfitAfterCmvAndFees =
      totalSalesRevenue - totalSalesCmv - totalSalesFees - totalSalesTaxReserve;

    return {
      totalMonthlyFixed,
      totalPaidFixed,
      totalInvoicesPurchases,
      totalSalesRevenue,
      totalSalesCmv,
      totalSalesFees,
      totalSalesTaxReserve,
      grossProfitAfterCmvAndFees,
      avgBurgerContribution,
      breakEvenBurgersMonth,
      breakEvenBurgersDay,
    };
  }, [state]);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-white/[0.08]">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100">
            Custos Fixos, DRE & Segurança
          </h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            Ponto de equilíbrio operacional, despesas recorrentes, parâmetros do delivery e proteção do painel.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExportBackupJson}
            className="btn-saas-secondary text-xs"
          >
            <Download className="size-3.5 text-zinc-400" /> Exportar Backup (.json)
          </button>
          <label className="btn-saas-secondary text-xs cursor-pointer">
            <Upload className="size-3.5 text-zinc-400" /> Restaurar Backup
            <input
              type="file"
              accept=".json,application/json"
              onChange={handleImportBackupJson}
              className="hidden"
            />
          </label>
        </div>
      </div>

      {/* Break-Even & Financial Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 tabular-nums">
        <div className="bg-[#121215] border border-white/[0.08] rounded-[10px] p-5 space-y-1.5">
          <p className="text-xs text-zinc-400 font-medium">Ponto de Equilíbrio Operacional</p>
          <p className="text-2xl font-semibold text-zinc-100">
            {summary.breakEvenBurgersMonth} un / mês
          </p>
          <p className="text-xs text-zinc-400">
            Média de <strong className="text-zinc-200">~{summary.breakEvenBurgersDay} lanches/dia</strong> para cobrir custos fixos ({formatBRL(summary.totalMonthlyFixed)}).
          </p>
        </div>

        <div className="bg-[#121215] border border-white/[0.08] rounded-[10px] p-5 space-y-1.5">
          <p className="text-xs text-zinc-400 font-medium">Margem Operacional de Vendas</p>
          <p className="text-2xl font-semibold text-emerald-400">
            {formatBRL(summary.grossProfitAfterCmvAndFees)}
          </p>
          <p className="text-xs text-zinc-400">
            Receita ({formatBRL(summary.totalSalesRevenue)}) deduzindo insumos ({formatBRL(summary.totalSalesCmv)}) e taxas.
          </p>
        </div>

        <div className="bg-[#121215] border border-white/[0.08] rounded-[10px] p-5 space-y-1.5">
          <p className="text-xs text-zinc-400 font-medium">Compras de Estoque Acumuladas</p>
          <p className="text-2xl font-semibold text-zinc-100">
            {formatBRL(summary.totalInvoicesPurchases)}
          </p>
          <p className="text-xs text-zinc-400">
            Total de notas fiscais de reposição registradas no período.
          </p>
        </div>
      </div>

      {/* Two Columns: Fixed Costs & Store Settings */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Monthly Fixed Costs */}
        <div className="bg-[#121215] border border-white/[0.08] rounded-[10px] p-5 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
            <div>
              <h2 className="text-sm font-semibold text-zinc-100">Despesas Fixas Mensais</h2>
              <p className="text-xs text-zinc-400">
                Pago no mês: {formatBRL(summary.totalPaidFixed)} de {formatBRL(summary.totalMonthlyFixed)}
              </p>
            </div>
            <span className="text-base font-semibold text-zinc-100 tabular-nums">
              {formatBRL(summary.totalMonthlyFixed)}/mês
            </span>
          </div>

          <form onSubmit={handleAddFixedCost} className="grid grid-cols-1 sm:grid-cols-5 gap-2 text-xs">
            <input
              type="text"
              required
              value={costName}
              onChange={(e) => setCostName(e.target.value)}
              placeholder="Ex: Gasolina, Água..."
              className="sm:col-span-2 bg-[#09090b] border border-white/[0.1] rounded-[6px] px-3 py-1.5 text-zinc-100"
            />
            <select
              value={costCat}
              onChange={(e) => setCostCat(e.target.value as FixedCostItem['category'])}
              className="bg-[#09090b] border border-white/[0.1] rounded-[6px] px-2 py-1.5 text-zinc-200"
            >
              <option value="Utilidades">Utilidades</option>
              <option value="Logística / Gasolina">Logística / Gasolina</option>
              <option value="Impostos Fixos (MEI)">Impostos Fixos (MEI)</option>
              <option value="Sistemas / Telefonia">Sistemas / Telefonia</option>
              <option value="Outros">Outros</option>
            </select>
            <input
              type="number"
              step="0.01"
              required
              value={costAmount}
              onChange={(e) => setCostAmount(e.target.value)}
              placeholder="Valor"
              className="bg-[#09090b] border border-white/[0.1] rounded-[6px] px-3 py-1.5 text-zinc-100 tabular-nums"
            />
            <button type="submit" className="btn-saas-primary">
              <Plus className="size-3.5" /> Incluir
            </button>
          </form>

          <div className="divide-y divide-white/[0.06] text-xs tabular-nums">
            {state.fixedCosts.map((fc) => (
              <div key={fc.id} className="py-2.5 flex items-center justify-between gap-2">
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(fc.paid)}
                    onChange={(e) =>
                      onUpdateState((prev) => ({
                        ...prev,
                        fixedCosts: prev.fixedCosts.map((item) =>
                          item.id === fc.id ? { ...item, paid: e.target.checked } : item
                        ),
                      }))
                    }
                    className="accent-emerald-500"
                  />
                  <div>
                    <p
                      className={`font-medium ${
                        fc.paid ? 'line-through text-zinc-500' : 'text-zinc-200'
                      }`}
                    >
                      {fc.name}
                    </p>
                    <p className="text-[11px] text-zinc-500">{fc.category}</p>
                  </div>
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    step="1"
                    aria-label={`Valor mensal de ${fc.name}`}
                    value={fc.monthlyAmount}
                    onChange={(e) =>
                      onUpdateState((prev) => ({
                        ...prev,
                        fixedCosts: prev.fixedCosts.map((item) =>
                          item.id === fc.id
                            ? { ...item, monthlyAmount: parseFloat(e.target.value) || 0 }
                            : item
                        ),
                      }))
                    }
                    className="w-24 bg-[#09090b] border border-white/[0.1] rounded-[6px] px-2 py-1 text-right text-zinc-100"
                  />
                  <button
                    type="button"
                    aria-label={`Remover ${fc.name}`}
                    onClick={() => handleDeleteFixedCost(fc.id)}
                    className="text-zinc-500 hover:text-rose-400"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Store Settings & Security */}
        <div className="space-y-6">
          <div className="bg-[#121215] border border-white/[0.08] rounded-[10px] p-5 space-y-4">
            <div className="pb-3 border-b border-white/[0.08]">
              <h2 className="text-sm font-semibold text-zinc-100">Parâmetros de Taxas e Loja</h2>
              <p className="text-xs text-zinc-400">Configuração das maquininhas, PIX e delivery</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="text-zinc-400 block mb-1">Nome do Estabelecimento</label>
                <input
                  type="text"
                  value={state.settings.storeName}
                  onChange={(e) =>
                    onUpdateState((prev) => ({
                      ...prev,
                      settings: { ...prev.settings, storeName: e.target.value },
                    }))
                  }
                  className="w-full bg-[#09090b] border border-white/[0.1] rounded-[6px] px-3 py-1.5 text-zinc-100"
                />
              </div>
              <div>
                <label className="text-zinc-400 block mb-1">Subtítulo do Cardápio</label>
                <input
                  type="text"
                  value={state.settings.storeSubtitle}
                  onChange={(e) =>
                    onUpdateState((prev) => ({
                      ...prev,
                      settings: { ...prev.settings, storeSubtitle: e.target.value },
                    }))
                  }
                  placeholder="Ex: Burger Artesanal na Brasa • Delivery Rápido"
                  className="w-full bg-[#09090b] border border-white/[0.1] rounded-[6px] px-3 py-1.5 text-zinc-100"
                />
              </div>
              <div>
                <label className="text-zinc-400 block mb-1">WhatsApp para Receber Pedidos</label>
                <input
                  type="text"
                  value={state.settings.whatsappNumber}
                  onChange={(e) =>
                    onUpdateState((prev) => ({
                      ...prev,
                      settings: { ...prev.settings, whatsappNumber: e.target.value },
                    }))
                  }
                  className="w-full bg-[#09090b] border border-white/[0.1] rounded-[6px] px-3 py-1.5 text-zinc-100 font-mono"
                />
              </div>
              <div>
                <label className="text-zinc-400 block mb-1">Chave PIX (Mercado Pago / Conta)</label>
                <input
                  type="text"
                  value={state.settings.pixKey}
                  onChange={(e) =>
                    onUpdateState((prev) => ({
                      ...prev,
                      settings: { ...prev.settings, pixKey: e.target.value },
                    }))
                  }
                  className="w-full bg-[#09090b] border border-white/[0.1] rounded-[6px] px-3 py-1.5 text-zinc-100 font-mono"
                />
              </div>
              <div>
                <label className="text-zinc-400 block mb-1">Tempo Estimado de Entrega (Cardápio)</label>
                <input
                  type="text"
                  value={state.settings.estimatedDeliveryMinutes}
                  onChange={(e) =>
                    onUpdateState((prev) => ({
                      ...prev,
                      settings: { ...prev.settings, estimatedDeliveryMinutes: e.target.value },
                    }))
                  }
                  placeholder="Ex: 40 - 55 min ou 60 - 80 min"
                  className="w-full bg-[#09090b] border border-white/[0.1] rounded-[6px] px-3 py-1.5 text-zinc-100"
                />
              </div>
              <div>
                <label className="text-zinc-400 block mb-1">Taxa de Entrega Padrão (R$)</label>
                <input
                  type="number"
                  step="0.50"
                  value={state.settings.deliveryFeeDefault}
                  onChange={(e) =>
                    onUpdateState((prev) => ({
                      ...prev,
                      settings: {
                        ...prev.settings,
                        deliveryFeeDefault: parseFloat(e.target.value) || 0,
                      },
                    }))
                  }
                  className="w-full bg-[#09090b] border border-white/[0.1] rounded-[6px] px-3 py-1.5 text-zinc-100 tabular-nums"
                />
              </div>

              <div>
                <label className="text-zinc-400 block mb-1">
                  Taxa Maquininha Crédito (%)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={Number((state.settings.creditCardFeePct * 100).toFixed(2))}
                  onChange={(e) =>
                    onUpdateState((prev) => ({
                      ...prev,
                      settings: {
                        ...prev.settings,
                        creditCardFeePct: (parseFloat(e.target.value) || 0) / 100,
                      },
                    }))
                  }
                  className="w-full bg-[#09090b] border border-white/[0.1] rounded-[6px] px-3 py-1.5 text-zinc-100 tabular-nums"
                />
              </div>
              <div>
                <label className="text-zinc-400 block mb-1">
                  Taxa Maquininha Débito (%)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={Number((state.settings.debitCardFeePct * 100).toFixed(2))}
                  onChange={(e) =>
                    onUpdateState((prev) => ({
                      ...prev,
                      settings: {
                        ...prev.settings,
                        debitCardFeePct: (parseFloat(e.target.value) || 0) / 100,
                      },
                    }))
                  }
                  className="w-full bg-[#09090b] border border-white/[0.1] rounded-[6px] px-3 py-1.5 text-zinc-100 tabular-nums"
                />
              </div>
            </div>

            <div className="bg-[#18181c] border border-white/[0.06] rounded-[8px] p-3.5 flex items-center justify-between text-xs">
              <span className="text-zinc-300">Status da Loja no Cardápio Virtual</span>
              <button
                type="button"
                onClick={() =>
                  onUpdateState((prev) => ({
                    ...prev,
                    settings: { ...prev.settings, storeOpen: !prev.settings.storeOpen },
                  }))
                }
                className={`px-3 py-1.5 rounded-[6px] font-medium text-xs transition ${
                  state.settings.storeOpen
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                }`}
              >
                {state.settings.storeOpen ? 'Aberto para Pedidos' : 'Fechado no Momento'}
              </button>
            </div>
          </div>

          {/* Security & Password Configuration Card */}
          <div className="bg-[#121215] border border-white/[0.08] rounded-[10px] p-5 space-y-4">
            <div className="pb-3 border-b border-white/[0.08] flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-zinc-100 flex items-center gap-1.5">
                  <ShieldCheck className="size-4 text-orange-400" /> Segurança e Senha da Gestão
                </h2>
                <p className="text-xs text-zinc-400">
                  O painel fica oculto na rota exclusiva <code className="text-zinc-200">/gestao</code> e bloqueado no domínio público do cardápio.
                </p>
              </div>
            </div>

            <form onSubmit={handleChangeAdminPassword} className="space-y-3 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-zinc-400 block mb-1">Nova Senha ou PIN de Acesso</label>
                  <div className="relative">
                    <Lock className="size-3.5 text-zinc-500 absolute left-3 top-2.5" />
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Nova senha..."
                      className="w-full pl-8 pr-3 py-1.5 bg-[#09090b] border border-white/[0.1] rounded-[6px] text-zinc-100"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-zinc-400 block mb-1">Confirmar Nova Senha</label>
                  <div className="relative">
                    <KeyRound className="size-3.5 text-zinc-500 absolute left-3 top-2.5" />
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Repita a senha..."
                      className="w-full pl-8 pr-3 py-1.5 bg-[#09090b] border border-white/[0.1] rounded-[6px] text-zinc-100"
                    />
                  </div>
                </div>
              </div>

              {passwordStatus && (
                <p className="text-emerald-400 flex items-center gap-1.5">
                  <CheckCircle2 className="size-3.5" /> {passwordStatus}
                </p>
              )}
              {passwordError && <p className="text-rose-400">{passwordError}</p>}

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={savingPassword}
                  className="btn-monster-primary"
                >
                  {savingPassword ? 'Salvando...' : 'Atualizar Senha do Painel'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
