'use client';

import { formatBRL } from '@/lib/pricing';
import {
  AppDatabaseState,
  IngredientCategory,
  InvoiceItem,
  PurchaseInvoice,
  UsageUnit,
} from '@/lib/types';
import { parseNfeXml, SAMPLE_NFE_XML } from '@/lib/xml-parser';
import {
  CheckCircle2,
  FileCode2,
  FilePlus2,
  FileText,
  Trash2,
  Upload,
} from 'lucide-react';
import { useMemo, useState } from 'react';

interface Props {
  state: AppDatabaseState;
  onUpdateState: (updater: (prev: AppDatabaseState) => AppDatabaseState) => void;
}

export default function InvoicesTab({ state, onUpdateState }: Props) {
  const [entryMode, setEntryMode] = useState<'manual' | 'xml' | 'ia'>('xml');

  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [supplier, setSupplier] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [paymentMethod, setPaymentMethod] =
    useState<PurchaseInvoice['paymentMethod']>('PIX');
  const [updateIngredientPrices, setUpdateIngredientPrices] = useState(true);

  const [draftItems, setDraftItems] = useState<InvoiceItem[]>([]);

  const [linkedIngId, setLinkedIngId] = useState<string>(state.ingredients[0]?.id || '');
  const [itemName, setItemName] = useState('');
  const [itemCategory, setItemCategory] = useState<IngredientCategory>('Proteína');
  const [packageDesc, setPackageDesc] = useState('Pacote (1 kg)');
  const [qty, setQty] = useState('1');
  const [contentPerPkg, setContentPerPkg] = useState('1000');
  const [usageUnit, setUsageUnit] = useState<UsageUnit>('g');
  const [unitPrice, setUnitPrice] = useState('34.00');

  const [aiRawText, setAiRawText] = useState('');
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [parsingAi, setParsingAi] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  function findBestMatchingIngredientId(rawName: string): string | undefined {
    const clean = rawName.toLowerCase();
    const match = state.ingredients.find((ing) => {
      const ingName = ing.name.toLowerCase();
      return (
        clean.includes(ingName) ||
        ingName.includes(clean) ||
        (clean.includes('blend') && clean.includes('carne') && ingName.includes('blend de carne')) ||
        (clean.includes('cheddar') && clean.includes('barra') && ingName.includes('queijo cheddar')) ||
        (clean.includes('aneis') && ingName.includes('aneis')) ||
        (clean.includes('brioche') && ingName.includes('brioche')) ||
        (clean.includes('kraft') && ingName.includes('kraft'))
      );
    });
    return match?.id;
  }

  function handleSelectIngredientPreset(ingId: string) {
    setLinkedIngId(ingId);
    const found = state.ingredients.find((i) => i.id === ingId);
    if (found) {
      setItemName(found.name);
      setItemCategory(found.category);
      setPackageDesc(found.purchasePackage);
      setContentPerPkg(String(found.packageContent));
      setUsageUnit(found.usageUnit);
      setUnitPrice(String(found.packagePrice));
    }
  }

  function handleAddDraftItem(e: React.FormEvent) {
    e.preventDefault();
    const quantityNum = parseFloat(qty) || 1;
    const priceNum = parseFloat(unitPrice) || 0;
    const contentNum = parseFloat(contentPerPkg) || 1;

    const newItem: InvoiceItem = {
      id: `ditem-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      ingredientId: linkedIngId || undefined,
      name: itemName.trim() || 'Insumo',
      category: itemCategory,
      packageDescription: packageDesc,
      quantity: quantityNum,
      contentPerPackage: contentNum,
      usageUnit,
      unitPrice: priceNum,
      totalPrice: Number((quantityNum * priceNum).toFixed(2)),
    };

    setDraftItems((prev) => [...prev, newItem]);
    setItemName('');
  }

  function handleParseXmlContent(rawXml: string) {
    if (!rawXml.trim()) return;
    const parsed = parseNfeXml(rawXml);
    setSupplier(parsed.supplier);
    setDate(parsed.date);
    setInvoiceNumber(parsed.invoiceNumber);
    setPaymentMethod(parsed.paymentMethod);

    const mapped: InvoiceItem[] = parsed.items.map((it, idx) => ({
      id: `xmlitem-${Date.now()}-${idx}`,
      ingredientId: findBestMatchingIngredientId(it.name),
      name: it.name,
      category: it.suggestedCategory,
      packageDescription: it.packageDescription,
      quantity: it.quantity,
      contentPerPackage: it.suggestedContentPerPackage,
      usageUnit: it.suggestedUsageUnit,
      unitPrice: it.unitPrice,
      totalPrice: it.totalPrice,
    }));

    setDraftItems(mapped);
    setStatusMessage(
      `XML importado: ${parsed.supplier} (${parsed.date}) — ${mapped.length} itens carregados.`
    );
  }

  function handleXmlFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const content = String(reader.result || '');
      handleParseXmlContent(content);
    };
    reader.readAsText(file);
  }

  async function handleParseWithAiOrSmartText() {
    if (!aiRawText.trim()) return;
    setParsingAi(true);
    setStatusMessage(null);
    try {
      const res = await fetch('/api/admin/parse-receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rawText: aiRawText,
          apiKey: geminiApiKey.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (data.ok && data.invoice) {
        const inv = data.invoice;
        setSupplier(inv.supplier || 'Fornecedor');
        setDate(inv.date || new Date().toISOString().slice(0, 10));
        setInvoiceNumber(inv.invoiceNumber || 'CUPOM');
        if (inv.paymentMethod) setPaymentMethod(inv.paymentMethod);

        const mapped: InvoiceItem[] = (inv.items || []).map(
          (it: Record<string, unknown>, idx: number) => ({
            id: `aiitem-${Date.now()}-${idx}`,
            ingredientId: findBestMatchingIngredientId(String(it.name || '')),
            name: String(it.name || 'Item'),
            category: (it.category as IngredientCategory) || 'Outros',
            packageDescription: String(it.packageDescription || 'Pacote'),
            quantity: Number(it.quantity) || 1,
            contentPerPackage: Number(it.contentPerPackage) || 1000,
            usageUnit: (it.usageUnit as UsageUnit) || 'g',
            unitPrice: Number(it.unitPrice) || 0,
            totalPrice: Number(it.totalPrice) || 0,
          })
        );

        setDraftItems(mapped);
        setStatusMessage(`Itens extraídos (${mapped.length}). Revise abaixo e confirme.`);
      }
    } catch {
      alert('Erro ao processar texto do cupom.');
    } finally {
      setParsingAi(false);
    }
  }

  function handleSaveInvoice() {
    if (draftItems.length === 0) {
      alert('Adicione ao menos 1 item antes de salvar.');
      return;
    }

    const totalInvoice = draftItems.reduce((acc, i) => acc + i.totalPrice, 0);
    const newInvoice: PurchaseInvoice = {
      id: `inv-${Date.now()}`,
      date,
      supplier: supplier.trim() || 'Fornecedor',
      invoiceNumber: invoiceNumber.trim() || `NF-${Math.floor(1000 + Math.random() * 9000)}`,
      paymentMethod,
      source: entryMode,
      items: draftItems,
      totalAmount: Number(totalInvoice.toFixed(2)),
    };

    onUpdateState((prev) => {
      let nextIngredients = [...prev.ingredients];

      if (updateIngredientPrices) {
        for (const item of draftItems) {
          const unitCost = item.unitPrice / (item.contentPerPackage || 1);
          if (item.ingredientId) {
            nextIngredients = nextIngredients.map((ing) => {
              if (ing.id !== item.ingredientId) return ing;
              return {
                ...ing,
                packagePrice: item.unitPrice,
                packageContent: item.contentPerPackage,
                purchasePackage: item.packageDescription || ing.purchasePackage,
                unitCost,
                priceHistory: [
                  {
                    date: newInvoice.date,
                    supplier: newInvoice.supplier,
                    packagePrice: item.unitPrice,
                    packageContent: item.contentPerPackage,
                    unitCost,
                    invoiceId: newInvoice.id,
                  },
                  ...ing.priceHistory,
                ],
              };
            });
          } else {
            const createdId = `ing-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
            item.ingredientId = createdId;
            nextIngredients.unshift({
              id: createdId,
              name: item.name,
              category: item.category,
              purchasePackage: item.packageDescription,
              packagePrice: item.unitPrice,
              packageContent: item.contentPerPackage,
              usageUnit: item.usageUnit,
              unitCost,
              priceHistory: [
                {
                  date: newInvoice.date,
                  supplier: newInvoice.supplier,
                  packagePrice: item.unitPrice,
                  packageContent: item.contentPerPackage,
                  unitCost,
                  invoiceId: newInvoice.id,
                },
              ],
            });
          }
        }
      }

      return {
        ...prev,
        ingredients: nextIngredients,
        invoices: [newInvoice, ...prev.invoices],
      };
    });

    setDraftItems([]);
    setSupplier('');
    setInvoiceNumber('');
    setStatusMessage('Nota fiscal salva e custos de insumos atualizados.');
  }

  const expenseMetrics = useMemo(() => {
    const allItems = state.invoices.flatMap((inv) =>
      inv.items.map((it) => ({
        ...it,
        date: inv.date,
        supplier: inv.supplier,
        paymentMethod: inv.paymentMethod,
        invoiceId: inv.id,
      }))
    );
    const totalSpent = allItems.reduce((acc, i) => acc + i.totalPrice, 0);
    const purchasesCount = allItems.length;
    const avgPerPurchase = purchasesCount > 0 ? totalSpent / purchasesCount : 0;
    const maxExpense = allItems.reduce((max, i) => Math.max(max, i.totalPrice), 0);

    return { allItems, totalSpent, purchasesCount, avgPerPurchase, maxExpense };
  }, [state.invoices]);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-white/[0.08]">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100">Notas Fiscais e Compras</h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            Registro de entradas com atualização automática do catálogo de insumos.
          </p>
        </div>
      </div>

      {/* 4 Summary Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 tabular-nums">
        <div className="bg-[#121215] border border-white/[0.08] rounded-[10px] p-4">
          <p className="text-xs text-zinc-400">Total Gasto</p>
          <p className="text-2xl font-semibold text-zinc-100 mt-1">
            {formatBRL(expenseMetrics.totalSpent)}
          </p>
        </div>
        <div className="bg-[#121215] border border-white/[0.08] rounded-[10px] p-4">
          <p className="text-xs text-zinc-400">Itens Lançados</p>
          <p className="text-2xl font-semibold text-zinc-100 mt-1">
            {expenseMetrics.purchasesCount}
          </p>
        </div>
        <div className="bg-[#121215] border border-white/[0.08] rounded-[10px] p-4">
          <p className="text-xs text-zinc-400">Média por Compra</p>
          <p className="text-2xl font-semibold text-zinc-100 mt-1">
            {formatBRL(expenseMetrics.avgPerPurchase)}
          </p>
        </div>
        <div className="bg-[#121215] border border-white/[0.08] rounded-[10px] p-4">
          <p className="text-xs text-zinc-400">Maior Despesa</p>
          <p className="text-2xl font-semibold text-zinc-100 mt-1">
            {formatBRL(expenseMetrics.maxExpense)}
          </p>
        </div>
      </div>

      {/* Entry Form Card */}
      <div className="bg-[#121215] border border-white/[0.08] rounded-[10px] p-5 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-white/[0.08]">
          <h2 className="text-sm font-semibold text-zinc-100">Nova Entrada</h2>

          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setEntryMode('xml')}
              className={`px-3 py-1.5 rounded-[6px] text-xs font-medium flex items-center gap-1.5 transition ${
                entryMode === 'xml'
                  ? 'bg-zinc-100 text-zinc-950'
                  : 'bg-[#18181c] text-zinc-300 border border-white/[0.08]'
              }`}
            >
              <FileCode2 className="size-3.5" /> Importar XML (NF-e / NFC-e)
            </button>
            <button
              type="button"
              onClick={() => setEntryMode('ia')}
              className={`px-3 py-1.5 rounded-[6px] text-xs font-medium flex items-center gap-1.5 transition ${
                entryMode === 'ia'
                  ? 'bg-zinc-100 text-zinc-950'
                  : 'bg-[#18181c] text-zinc-300 border border-white/[0.08]'
              }`}
            >
              <FileText className="size-3.5" /> Extrair de Texto / Cupom
            </button>
            <button
              type="button"
              onClick={() => setEntryMode('manual')}
              className={`px-3 py-1.5 rounded-[6px] text-xs font-medium flex items-center gap-1.5 transition ${
                entryMode === 'manual'
                  ? 'bg-zinc-100 text-zinc-950'
                  : 'bg-[#18181c] text-zinc-300 border border-white/[0.08]'
              }`}
            >
              <FilePlus2 className="size-3.5" /> Lançamento Manual
            </button>
          </div>
        </div>

        {statusMessage && (
          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-[8px] p-3 text-xs text-emerald-300 flex items-center gap-2">
            <CheckCircle2 className="size-4 shrink-0" />
            <span>{statusMessage}</span>
          </div>
        )}

        {entryMode === 'xml' && (
          <div className="bg-[#18181c] border border-white/[0.06] rounded-[8px] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="text-xs">
              <p className="font-medium text-zinc-200">Arquivo XML da Nota Fiscal</p>
              <p className="text-zinc-400 mt-0.5">
                Carrega fornecedor, data, itens, quantidades e valores automaticamente.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <label className="btn-saas-primary cursor-pointer">
                <Upload className="size-3.5" /> Selecionar .XML
                <input
                  type="file"
                  accept=".xml,text/xml"
                  onChange={handleXmlFileUpload}
                  className="hidden"
                />
              </label>
              <button
                type="button"
                onClick={() => handleParseXmlContent(SAMPLE_NFE_XML)}
                className="btn-saas-secondary"
              >
                Carregar XML Exemplo
              </button>
            </div>
          </div>
        )}

        {entryMode === 'ia' && (
          <div className="bg-[#18181c] border border-white/[0.06] rounded-[8px] p-4 space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-medium text-zinc-200">
                Texto do Cupom ou Lista de Compras
              </span>
              <button
                type="button"
                onClick={() =>
                  setAiRawText(
                    `FORNECEDOR: Atacadão Distribuidor\n2x Blend de Carne 1kg R$ 33,90\n1x Queijo Cheddar Barra 1kg R$ 53,50\n1x Saco Kraft Delivery 100un R$ 78,00`
                  )
                }
                className="text-zinc-400 hover:text-zinc-200 underline"
              >
                Preencher exemplo
              </button>
            </div>
            <textarea
              rows={3}
              value={aiRawText}
              onChange={(e) => setAiRawText(e.target.value)}
              placeholder="Cole aqui as linhas do cupom fiscal..."
              className="w-full bg-[#09090b] border border-white/[0.1] rounded-[6px] p-3 text-zinc-100 font-mono"
            />
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
              <input
                type="password"
                value={geminiApiKey}
                onChange={(e) => setGeminiApiKey(e.target.value)}
                placeholder="Chave API Gemini (opcional)"
                className="w-full sm:w-80 bg-[#09090b] border border-white/[0.1] rounded-[6px] px-3 py-1.5 text-zinc-300"
              />
              <button
                type="button"
                disabled={parsingAi}
                onClick={handleParseWithAiOrSmartText}
                className="btn-saas-primary w-full sm:w-auto"
              >
                {parsingAi ? 'Processando...' : 'Extrair Itens'}
              </button>
            </div>
          </div>
        )}

        {/* Header Fields */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          <div>
            <label className="text-zinc-400 block mb-1">Data da Compra</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full bg-[#09090b] border border-white/[0.1] rounded-[6px] px-3 py-1.5 text-zinc-100"
            />
          </div>
          <div>
            <label className="text-zinc-400 block mb-1">Fornecedor / Local</label>
            <input
              type="text"
              value={supplier}
              onChange={(e) => setSupplier(e.target.value)}
              placeholder="Ex: Atacadão, Distribuidora..."
              className="w-full bg-[#09090b] border border-white/[0.1] rounded-[6px] px-3 py-1.5 text-zinc-100"
            />
          </div>
          <div>
            <label className="text-zinc-400 block mb-1">Nº Documento</label>
            <input
              type="text"
              value={invoiceNumber}
              onChange={(e) => setInvoiceNumber(e.target.value)}
              placeholder="NFC-e 001490"
              className="w-full bg-[#09090b] border border-white/[0.1] rounded-[6px] px-3 py-1.5 text-zinc-100"
            />
          </div>
          <div>
            <label className="text-zinc-400 block mb-1">Forma de Pagamento</label>
            <select
              value={paymentMethod}
              onChange={(e) =>
                setPaymentMethod(e.target.value as PurchaseInvoice['paymentMethod'])
              }
              className="w-full bg-[#09090b] border border-white/[0.1] rounded-[6px] px-3 py-1.5 text-zinc-100"
            >
              <option value="PIX">PIX</option>
              <option value="Boleto">Boleto</option>
              <option value="Cartão de Crédito">Cartão de Crédito</option>
              <option value="Cartão de Débito">Cartão de Débito</option>
              <option value="Dinheiro">Dinheiro</option>
            </select>
          </div>
        </div>

        {/* Manual Item Addition */}
        <form
          onSubmit={handleAddDraftItem}
          className="bg-[#18181c] border border-white/[0.06] rounded-[8px] p-3.5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 items-end text-xs"
        >
          <div className="lg:col-span-2">
            <label className="text-zinc-400 block mb-1">Vincular ao Insumo</label>
            <select
              value={linkedIngId}
              onChange={(e) => handleSelectIngredientPreset(e.target.value)}
              className="w-full bg-[#09090b] border border-white/[0.1] rounded-[6px] px-3 py-1.5 text-zinc-100"
            >
              <option value="">+ Criar como novo insumo</option>
              {state.ingredients.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name} ({formatBRL(i.packagePrice)})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-zinc-400 block mb-1">Descrição</label>
            <input
              type="text"
              value={itemName}
              onChange={(e) => setItemName(e.target.value)}
              placeholder="Blend de Carne 1kg"
              className="w-full bg-[#09090b] border border-white/[0.1] rounded-[6px] px-3 py-1.5 text-zinc-100"
            />
          </div>
          <div>
            <label className="text-zinc-400 block mb-1">Quantidade</label>
            <input
              type="number"
              step="any"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              className="w-full bg-[#09090b] border border-white/[0.1] rounded-[6px] px-3 py-1.5 text-zinc-100 tabular-nums"
            />
          </div>
          <div>
            <label className="text-zinc-400 block mb-1">Preço Unit. (R$)</label>
            <input
              type="number"
              step="0.01"
              value={unitPrice}
              onChange={(e) => setUnitPrice(e.target.value)}
              className="w-full bg-[#09090b] border border-white/[0.1] rounded-[6px] px-3 py-1.5 text-zinc-100 tabular-nums"
            />
          </div>
          <button type="submit" className="btn-saas-secondary h-[34px]">
            + Incluir Item
          </button>
        </form>

        {/* Draft Items Table */}
        {draftItems.length > 0 && (
          <div className="space-y-3">
            <div className="overflow-x-auto border border-white/[0.1] rounded-[8px]">
              <table className="w-full text-left text-xs tabular-nums">
                <thead className="bg-[#18181c] text-zinc-400 border-b border-white/[0.08]">
                  <tr>
                    <th className="py-2 px-3 font-medium">Item</th>
                    <th className="py-2 px-3 font-medium">Insumo Vinculado</th>
                    <th className="py-2 px-3 font-medium text-center">Qtd</th>
                    <th className="py-2 px-3 font-medium text-right">Preço Unit.</th>
                    <th className="py-2 px-3 font-medium text-right">Total</th>
                    <th className="py-2 px-2 text-center" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.06]">
                  {draftItems.map((it, idx) => (
                    <tr key={it.id}>
                      <td className="py-2 px-3 text-zinc-200 font-medium">{it.name}</td>
                      <td className="py-2 px-3">
                        <select
                          value={it.ingredientId || ''}
                          onChange={(e) => {
                            const val = e.target.value || undefined;
                            setDraftItems((prev) =>
                              prev.map((row, i) =>
                                i === idx ? { ...row, ingredientId: val } : row
                              )
                            );
                          }}
                          className="bg-[#09090b] border border-white/[0.1] rounded-[6px] px-2 py-1 text-zinc-200 text-xs"
                        >
                          <option value="">Criar novo insumo</option>
                          {state.ingredients.map((ing) => (
                            <option key={ing.id} value={ing.id}>
                              {ing.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2 px-3 text-center">{it.quantity}</td>
                      <td className="py-2 px-3 text-right">{formatBRL(it.unitPrice)}</td>
                      <td className="py-2 px-3 text-right font-medium text-zinc-100">
                        {formatBRL(it.totalPrice)}
                      </td>
                      <td className="py-2 px-2 text-center">
                        <button
                          type="button"
                          aria-label="Remover item"
                          onClick={() =>
                            setDraftItems((prev) => prev.filter((_, i) => i !== idx))
                          }
                          className="text-zinc-500 hover:text-rose-400"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#18181c] border border-white/[0.08] rounded-[8px] p-3.5">
              <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={updateIngredientPrices}
                  onChange={(e) => setUpdateIngredientPrices(e.target.checked)}
                  className="accent-zinc-200"
                />
                Atualizar custo dos insumos vinculados e recalcular CMV das fichas técnicas
              </label>
              <button
                type="button"
                onClick={handleSaveInvoice}
                className="btn-saas-primary"
              >
                Salvar Nota Fiscal ({formatBRL(draftItems.reduce((a, b) => a + b.totalPrice, 0))})
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Purchase History Table */}
      <div className="bg-[#121215] border border-white/[0.08] rounded-[10px] overflow-hidden">
        <div className="px-4 py-3 border-b border-white/[0.08]">
          <h3 className="text-xs font-semibold text-zinc-200">
            Histórico de Compras Registradas
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs tabular-nums">
            <thead className="bg-[#18181c] text-zinc-400 border-b border-white/[0.08]">
              <tr>
                <th className="py-3 px-4 font-medium">Data</th>
                <th className="py-3 px-3 font-medium">Categoria</th>
                <th className="py-3 px-4 font-medium">Item / Insumo</th>
                <th className="py-3 px-4 font-medium">Fornecedor</th>
                <th className="py-3 px-3 font-medium text-center">Qtd</th>
                <th className="py-3 px-3 font-medium text-right">Preço Unit.</th>
                <th className="py-3 px-3 font-medium text-right">Total</th>
                <th className="py-3 px-4 font-medium text-center">Pagamento</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {expenseMetrics.allItems.map((item, idx) => (
                <tr key={`${item.invoiceId}-${idx}`} className="hover:bg-white/[0.02]">
                  <td className="py-2.5 px-4 text-zinc-400">{item.date}</td>
                  <td className="py-2.5 px-3 text-zinc-400">{item.category}</td>
                  <td className="py-2.5 px-4 font-medium text-zinc-100">{item.name}</td>
                  <td className="py-2.5 px-4 text-zinc-300">{item.supplier}</td>
                  <td className="py-2.5 px-3 text-center text-zinc-300">{item.quantity}</td>
                  <td className="py-2.5 px-3 text-right text-zinc-300">
                    {formatBRL(item.unitPrice)}
                  </td>
                  <td className="py-2.5 px-3 text-right font-medium text-zinc-100">
                    {formatBRL(item.totalPrice)}
                  </td>
                  <td className="py-2.5 px-4 text-center">
                    <span className="px-2 py-0.5 rounded-[4px] bg-[#18181c] border border-white/[0.08] text-zinc-300 text-[11px]">
                      {item.paymentMethod}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
