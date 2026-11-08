'use client';

import {
  calculatePeriodFinancialSummary,
  calculateProductMetrics,
  formatBRL,
  formatPct,
} from '@/lib/pricing';
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
  const [simBurgersDay, setSimBurgersDay] = useState<number>(30);
  const [simDaysMonth, setSimDaysMonth] = useState<number>(8);

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
    const totalAllListedBills = state.fixedCosts.reduce((a, b) => a + b.monthlyAmount, 0);
    const totalPaidFixed = state.fixedCosts
      .filter((f) => f.paid)
      .reduce((a, b) => a + b.monthlyAmount, 0);
    const totalInvoicesPurchases = state.invoices.reduce((a, b) => a + b.totalAmount, 0);

    const activeOrders = state.orders.filter((o) => o.status !== 'Cancelado');
    const periodSummary = calculatePeriodFinancialSummary(
      activeOrders,
      state.products,
      state.ingredients,
      state.fixedCosts,
      state.settings,
      0,
      0
    );

    const totalMonthlyFixed = periodSummary.totalMonthlyFixedTarget;
    const totalMonthlyMei = periodSummary.totalMonthlyTaxTarget;

    const burgers = state.products.filter((p) => p.category === 'Hambúrgueres');
    const burgerList = burgers.length > 0 ? burgers : state.products;

    const avgBurgerPrice =
      burgerList.length > 0
        ? burgerList.reduce((acc, b) => acc + b.practicedPrice, 0) / burgerList.length
        : 22.7;

    const avgBurgerCmv =
      burgerList.length > 0
        ? burgerList.reduce((acc, b) => {
            const m = calculateProductMetrics(b, state.ingredients);
            return acc + m.totalCmv;
          }, 0) / burgerList.length
        : 7.9;

    const avgBurgerFixedAllocation =
      burgerList.length > 0
        ? burgerList.reduce((acc, b) => acc + b.practicedPrice * b.fixedCostPct, 0) /
          burgerList.length
        : 2.17;

    const avgBurgerDeliveryAllocation =
      burgerList.length > 0
        ? burgerList.reduce((acc, b) => acc + b.practicedPrice * b.channelFeePct, 0) /
          burgerList.length
        : 1.36;

    const avgBurgerTaxAllocation =
      burgerList.length > 0
        ? burgerList.reduce((acc, b) => acc + b.practicedPrice * b.taxPct, 0) /
          burgerList.length
        : 0.33;

    const avgBurgerBaseProfit =
      avgBurgerPrice -
      avgBurgerCmv -
      avgBurgerFixedAllocation -
      avgBurgerDeliveryAllocation -
      avgBurgerTaxAllocation;

    // Quantos lanches são necessários para a provisão de Custos Fixos quitar 100% das Despesas Fixas Operacionais
    const burgersToPayFixedCosts =
      avgBurgerFixedAllocation > 0
        ? Math.ceil(totalMonthlyFixed / avgBurgerFixedAllocation)
        : 0;
    const daysToPayFixedAtSim =
      simBurgersDay > 0 ? Math.ceil(burgersToPayFixedCosts / simBurgersDay) : 0;
    const remainingBurgersForMissingFixed =
      avgBurgerFixedAllocation > 0
        ? Math.ceil(periodSummary.missingToPayFixedCosts / avgBurgerFixedAllocation)
        : 0;

    // Simulação para simBurgersDay x simDaysMonth (ex: 30 lanches/dia x 8 dias = 240 lanches/mês)
    const simTotalBurgersMonth = simBurgersDay * simDaysMonth;
    const simDailyRevenue = simBurgersDay * avgBurgerPrice;
    const simMonthlyRevenue = simTotalBurgersMonth * avgBurgerPrice;
    const simDailyCmv = simBurgersDay * avgBurgerCmv;
    const simMonthlyCmv = simTotalBurgersMonth * avgBurgerCmv;
    const simDailyDelivery = simBurgersDay * avgBurgerDeliveryAllocation;
    const simMonthlyDelivery = simTotalBurgersMonth * avgBurgerDeliveryAllocation;

    // avgBurgerFixedAllocation já inclui Despesas Fixas + MEI (totalMonthlyFixed = R$ 599,90)
    const simRawFixedGenerated = simTotalBurgersMonth * avgBurgerFixedAllocation;
    const simFixedUsed = Math.min(simRawFixedGenerated, totalMonthlyFixed);
    const simFixedOverflowToProfit = Math.max(0, simRawFixedGenerated - totalMonthlyFixed);
    const simDailyFixed = simDaysMonth > 0 ? simFixedUsed / simDaysMonth : 0;

    // Taxa do Cartão de Crédito InfinitePay considerada na precificação (3,15%)
    const simMonthlyCardFee = simTotalBurgersMonth * avgBurgerTaxAllocation;
    const simDailyCardFee = simDaysMonth > 0 ? simMonthlyCardFee / simDaysMonth : 0;

    const simBaseNetProfit = simTotalBurgersMonth * avgBurgerBaseProfit;
    const simRealNetProfit = simBaseNetProfit + simFixedOverflowToProfit;
    const simDailyRealProfit = simDaysMonth > 0 ? simRealNetProfit / simDaysMonth : 0;

    return {
      totalAllListedBills,
      totalMonthlyFixed,
      totalMonthlyMei,
      totalPaidFixed,
      totalInvoicesPurchases,
      periodSummary,
      avgBurgerPrice,
      avgBurgerCmv,
      avgBurgerFixedAllocation,
      avgBurgerDeliveryAllocation,
      avgBurgerTaxAllocation,
      avgBurgerBaseProfit,
      burgersToPayFixedCosts,
      daysToPayFixedAtSim,
      remainingBurgersForMissingFixed,
      simTotalBurgersMonth,
      simDailyRevenue,
      simMonthlyRevenue,
      simDailyCmv,
      simMonthlyCmv,
      simDailyDelivery,
      simMonthlyDelivery,
      simDailyCardFee,
      simMonthlyCardFee,
      simDailyFixed,
      simFixedUsed,
      simFixedOverflowToProfit,
      simBaseNetProfit,
      simRealNetProfit,
      simDailyRealProfit,
    };
  }, [state, simBurgersDay, simDaysMonth]);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-white/[0.08]">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100">
            Custos Fixos, DRE & Segurança
          </h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            Planejamento para {simDaysMonth} dias de funcionamento no mês (finais de semana), quitação das Despesas Fixas + MEI ({formatBRL(summary.totalMonthlyFixed)}/mês).
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

      {/* Top 3 Cards: Quitação dos Custos Fixos & Sobra para Lucro */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 tabular-nums">
        <div className="bg-[#121215] border border-white/[0.08] rounded-[10px] p-5 space-y-2">
          <p className="text-xs text-zinc-400 font-medium">
            Despesas Fixas + MEI ({formatBRL(summary.totalMonthlyFixed)}/mês)
          </p>
          <p className="text-2xl font-semibold text-zinc-100">
            {summary.burgersToPayFixedCosts} lanches / mês
          </p>
          <p className="text-xs text-zinc-400">
            Para quitar tudo em <strong className="text-zinc-200">{simDaysMonth} dias</strong> ({simBurgersDay} lanches/dia), você separa <strong className="text-zinc-200">{formatBRL(summary.simDailyFixed)}/dia</strong> (já inclui o MEI de {formatBRL(summary.totalMonthlyMei)}).
          </p>
        </div>

        <div className="bg-[#121215] border border-white/[0.08] rounded-[10px] p-5 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs text-zinc-400 font-medium">
              Acumulado p/ Fixos + MEI ({formatBRL(summary.totalMonthlyFixed)})
            </p>
            <span
              className={`text-[11px] font-semibold px-2 py-0.5 rounded ${
                summary.periodSummary.isFixedCostFullyPaid
                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                  : 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
              }`}
            >
              {formatPct(summary.periodSummary.fixedCostCoveragePct, 0)} quitado
            </span>
          </div>
          <p className="text-2xl font-semibold text-zinc-100">
            {formatBRL(summary.periodSummary.effectiveFixedCost)}
            <span className="text-sm font-normal text-zinc-500">
              {' '}
              / {formatBRL(summary.totalMonthlyFixed)}
            </span>
          </p>
          <div className="w-full h-2 bg-[#18181c] rounded-full overflow-hidden">
            <div
              style={{
                width: `${Math.min(100, summary.periodSummary.fixedCostCoveragePct * 100)}%`,
              }}
              className={`h-full rounded-full ${
                summary.periodSummary.isFixedCostFullyPaid ? 'bg-emerald-500' : 'bg-amber-400'
              }`}
            />
          </div>
          <p className="text-xs text-zinc-400">
            {summary.periodSummary.isFixedCostFullyPaid ? (
              <span className="text-emerald-400 font-medium">
                Contas + MEI 100% pagos! +{formatBRL(summary.periodSummary.fixedCostOverflowToProfit)} de sobra virou Lucro!
              </span>
            ) : (
              <span>
                Faltam <strong className="text-zinc-200">{formatBRL(summary.periodSummary.missingToPayFixedCosts)}</strong> (~{summary.remainingBurgersForMissingFixed} lanches) para quitar tudo e o excedente virar lucro.
              </span>
            )}
          </p>
        </div>

        <div className="bg-[#121215] border border-emerald-500/25 rounded-[10px] p-5 space-y-2">
          <p className="text-xs text-emerald-400 font-medium">
            Lucro Líquido Real Acumulado (c/ Sobra)
          </p>
          <p className="text-2xl font-semibold text-emerald-400">
            {formatBRL(summary.periodSummary.realNetProfit)}
          </p>
          <p className="text-xs text-zinc-400">
            Entregador:{' '}
            <strong className="text-orange-400">
              {formatBRL(summary.periodSummary.totalDeliveryDriverReserve)}
            </strong>{' '}
            • Taxa Cartão: {formatBRL(summary.periodSummary.totalCardMachineFee)}
          </p>
        </div>
      </div>

      {/* Painel de Estudo & Simulação: Volume Diário, Entregador e Sobra dos Custos Fixos */}
      <div className="bg-[#121215] border border-white/[0.08] rounded-[10px] p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-white/[0.08]">
          <div>
            <h2 className="text-sm font-semibold text-zinc-100">
              Simulador de Operação: {simDaysMonth} Dias no Mês (Sáb/Dom) • {simBurgersDay} Lanches/Dia
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              Divisão exata de quanto separar por dia e no mês para Reposição de Estoque, Entregador, Despesas Fixas + MEI ({formatBRL(summary.totalMonthlyFixed)}) e Taxa Cartão InfinitePay.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs">
            <label className="flex items-center gap-2 bg-[#18181c] border border-white/[0.08] rounded-[6px] px-3 py-1.5 text-zinc-300">
              <span>Lanches por dia:</span>
              <input
                type="number"
                min={1}
                max={500}
                value={simBurgersDay}
                onChange={(e) => setSimBurgersDay(Math.max(1, parseInt(e.target.value, 10) || 1))}
                className="w-14 bg-[#09090b] border border-white/[0.12] rounded px-1.5 py-0.5 text-center text-zinc-100 font-semibold tabular-nums"
              />
            </label>
            <label className="flex items-center gap-2 bg-[#18181c] border border-white/[0.08] rounded-[6px] px-3 py-1.5 text-zinc-300">
              <span>Dias no mês (Sáb/Dom):</span>
              <input
                type="number"
                min={1}
                max={31}
                value={simDaysMonth}
                onChange={(e) =>
                  setSimDaysMonth(Math.min(31, Math.max(1, parseInt(e.target.value, 10) || 1)))
                }
                className="w-14 bg-[#09090b] border border-white/[0.12] rounded px-1.5 py-0.5 text-center text-zinc-100 font-semibold tabular-nums"
              />
            </label>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs tabular-nums">
          <div className="bg-[#18181c] border border-white/[0.06] rounded-[8px] p-3.5 space-y-1">
            <span className="text-zinc-400">1. Faturamento ({summary.simTotalBurgersMonth} un)</span>
            <p className="text-base font-semibold text-zinc-100">
              {formatBRL(summary.simDailyRevenue)}/dia
            </p>
            <p className="text-[11px] text-zinc-400">
              Nos {simDaysMonth} dias:{' '}
              <strong className="text-zinc-200">{formatBRL(summary.simMonthlyRevenue)}</strong>
            </p>
          </div>

          <div className="bg-[#18181c] border border-white/[0.06] rounded-[8px] p-3.5 space-y-1">
            <span className="text-zinc-400">2. Reposição Estoque (CMV)</span>
            <p className="text-base font-semibold text-rose-400">
              {formatBRL(summary.simDailyCmv)}/dia
            </p>
            <p className="text-[11px] text-zinc-400">
              Nos {simDaysMonth} dias: <strong className="text-zinc-200">{formatBRL(summary.simMonthlyCmv)}</strong>
            </p>
          </div>

          <div className="bg-[#18181c] border border-orange-500/25 rounded-[8px] p-3.5 space-y-1">
            <span className="text-orange-300 font-medium">3. Diária do Entregador</span>
            <p className="text-base font-semibold text-orange-400">
              {formatBRL(summary.simDailyDelivery)}/dia
            </p>
            <p className="text-[11px] text-zinc-400">
              Nos {simDaysMonth} dias: <strong className="text-orange-300">{formatBRL(summary.simMonthlyDelivery)}</strong> ({formatBRL(summary.avgBurgerDeliveryAllocation)}/un)
            </p>
          </div>

          <div className="bg-[#18181c] border border-amber-500/25 rounded-[8px] p-3.5 space-y-1">
            <span className="text-amber-300 font-medium">4. Despesas Fixas + MEI</span>
            <p className="text-base font-semibold text-zinc-100">
              {formatBRL(summary.simDailyFixed)}/dia
            </p>
            <p className="text-[11px] text-zinc-400">
              Quitado nos {simDaysMonth} dias: <strong className="text-zinc-200">{formatBRL(summary.simFixedUsed)}</strong> (inclui R$ 80 MEI)
            </p>
          </div>

          <div className="bg-[#18181c] border border-emerald-500/30 rounded-[8px] p-3.5 space-y-1">
            <span className="text-emerald-400 font-medium">5. Lucro Líquido Limpo</span>
            <p className="text-base font-semibold text-emerald-400">
              {formatBRL(summary.simDailyRealProfit)}/dia
            </p>
            <p className="text-[11px] text-zinc-300">
              Nos {simDaysMonth} dias:{' '}
              <strong className="text-emerald-400">
                {formatBRL(summary.simRealNetProfit)}
              </strong>{' '}
              (já descontando {formatBRL(summary.simMonthlyCardFee)} de Cartão!)
            </p>
          </div>
        </div>
      </div>

      {/* Two Columns: Fixed Costs & Store Settings */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Monthly Fixed Costs */}
        <div className="bg-[#121215] border border-white/[0.08] rounded-[10px] p-5 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
            <div>
              <h2 className="text-sm font-semibold text-zinc-100">Despesas Fixas Mensais + MEI</h2>
              <p className="text-xs text-zinc-400">
                Pago no mês: {formatBRL(summary.totalPaidFixed)} de {formatBRL(summary.totalAllListedBills)} ({formatBRL(summary.periodSummary.totalMonthlyOperationalFixed)} Contas + {formatBRL(summary.totalMonthlyMei)} MEI)
              </p>
            </div>
            <span className="text-base font-semibold text-zinc-100 tabular-nums">
              {formatBRL(summary.totalAllListedBills)}/mês
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
              <h2 className="text-sm font-semibold text-zinc-100">Taxas das Maquininhas</h2>
              <p className="text-xs text-zinc-400">Taxas usadas no cálculo do lucro líquido de cada venda (dados da loja ficam na aba Configurações)</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">

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
