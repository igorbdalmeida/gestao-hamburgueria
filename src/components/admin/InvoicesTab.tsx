'use client';

import { compressImageFile } from '@/lib/image-utils';
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
  AlertCircle,
  Camera,
  CheckCircle2,
  FileCode2,
  FilePlus2,
  Image as ImageIcon,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { todayLocal } from '@/lib/periods';

interface Props {
  state: AppDatabaseState;
  onUpdateState: (updater: (prev: AppDatabaseState) => AppDatabaseState) => void;
}

export default function InvoicesTab({ state, onUpdateState }: Props) {
  const [entryMode, setEntryMode] = useState<'ia' | 'xml' | 'manual'>('ia');

  const [date, setDate] = useState(todayLocal());
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

  // Photo & Text AI Scanner state (no API key input in UI!)
  const [receiptPhotoPreview, setReceiptPhotoPreview] = useState<string | null>(null);
  const [receiptBase64, setReceiptBase64] = useState<string>('');
  const [receiptMimeType, setReceiptMimeType] = useState<string>('image/jpeg');
  const [aiRawText, setAiRawText] = useState('');
  const [showTextInput, setShowTextInput] = useState(false);
  const [parsingAi, setParsingAi] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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
        (clean.includes('kraft') && ingName.includes('kraft')) ||
        (clean.includes('acoplado') && ingName.includes('acoplado')) ||
        (clean.includes('bacon') && ingName.includes('bacon'))
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
    setErrorMessage(null);
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

  async function handleReceiptPhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setErrorMessage(null);
    setStatusMessage(null);

    const MAX_RAW_BYTES = 3.3 * 1024 * 1024; // limite seguro do corpo da requisição (4,5 MB)
    const lowerName = file.name.toLowerCase();
    const isPdf = file.type === 'application/pdf' || lowerName.endsWith('.pdf');
    const isHeic =
      /heic|heif/.test(file.type) || lowerName.endsWith('.heic') || lowerName.endsWith('.heif');

    const readAsDataUrl = (f: File) =>
      new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('read'));
        reader.onload = () => resolve(String(reader.result));
        reader.readAsDataURL(f);
      });

    try {
      if (isPdf) {
        if (file.size > MAX_RAW_BYTES) {
          setErrorMessage('Este PDF é muito grande (máx. 3 MB). Envie uma foto da nota ou um PDF menor.');
          return;
        }
        const dataUrl = await readAsDataUrl(file);
        setReceiptPhotoPreview(
          'data:image/svg+xml;utf8,' +
            encodeURIComponent(
              '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="96"><rect width="80" height="96" fill="#18181c"/><text x="40" y="54" font-size="22" font-family="Arial" font-weight="bold" fill="#ff5400" text-anchor="middle">PDF</text></svg>'
            )
        );
        setReceiptBase64(dataUrl.replace(/^data:[^;]+;base64,/, ''));
        setReceiptMimeType('application/pdf');
        return;
      }

      try {
        // Notas/cupons são compridos: mantém resolução alta para o texto continuar legível
        let compressed = await compressImageFile(file, {
          maxWidth: 2000,
          maxHeight: 3200,
          quality: 0.8,
        });
        if (compressed.base64.length > MAX_RAW_BYTES * 1.33) {
          compressed = await compressImageFile(file, {
            maxWidth: 1600,
            maxHeight: 2600,
            quality: 0.7,
          });
        }
        setReceiptPhotoPreview(compressed.dataUrl);
        setReceiptBase64(compressed.base64);
        setReceiptMimeType(compressed.mimeType);
      } catch {
        // Se o navegador não conseguiu redimensionar, envia o arquivo original quando for compatível
        if (!isHeic && /^image\/(jpeg|png|webp)$/.test(file.type) && file.size <= MAX_RAW_BYTES) {
          const dataUrl = await readAsDataUrl(file);
          setReceiptPhotoPreview(dataUrl);
          setReceiptBase64(dataUrl.replace(/^data:[^;]+;base64,/, ''));
          setReceiptMimeType(file.type);
        } else if (isHeic) {
          setErrorMessage(
            'Fotos em formato HEIC (iPhone) não abrem aqui. No iPhone, vá em Ajustes > Câmera > Formatos e escolha "Mais Compatível", ou tire um print da nota e envie o print.'
          );
        } else {
          setErrorMessage('Não foi possível ler este arquivo. Envie uma foto JPG/PNG da nota ou um PDF.');
        }
      }
    } catch {
      setErrorMessage('Não foi possível carregar este arquivo. Tente outro.');
    }
  }

  async function handleParseWithAi() {
    if (!receiptBase64 && !aiRawText.trim()) {
      setErrorMessage('Envie uma foto da nota/cupom ou cole os itens para ler com a IA.');
      return;
    }
    setParsingAi(true);
    setStatusMessage(null);
    setErrorMessage(null);

    try {
      const res = await fetch('/api/admin/parse-receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rawText: aiRawText.trim() || undefined,
          imageBase64: receiptBase64 || undefined,
          mimeType: receiptMimeType || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok && data.ok && data.invoice) {
        const inv = data.invoice;
        setSupplier(inv.supplier || 'Fornecedor');
        setDate(inv.date || todayLocal());
        setInvoiceNumber(inv.invoiceNumber || `CUPOM-${Math.floor(1000 + Math.random() * 9000)}`);
        if (inv.paymentMethod) setPaymentMethod(inv.paymentMethod);

        const mapped: InvoiceItem[] = (inv.items || []).map(
          (it: Record<string, unknown>, idx: number) => {
            const q = Number(it.quantity) || 1;
            const up = Number(it.unitPrice) || 0;
            return {
              id: `aiitem-${Date.now()}-${idx}`,
              ingredientId: findBestMatchingIngredientId(String(it.name || '')),
              name: String(it.name || 'Item'),
              category: (it.category as IngredientCategory) || 'Outros',
              packageDescription: String(it.packageDescription || 'Pacote'),
              quantity: q,
              contentPerPackage: Number(it.contentPerPackage) || 1000,
              usageUnit: (it.usageUnit as UsageUnit) || 'g',
              unitPrice: up,
              totalPrice: Number(it.totalPrice) || Number((q * up).toFixed(2)),
            };
          }
        );

        setDraftItems(mapped);
        setStatusMessage(
          `Leitura concluída! ${mapped.length} ${
            mapped.length === 1 ? 'item identificado' : 'itens identificados'
          }. Revise na tabela abaixo e clique em Salvar Nota Fiscal.`
        );
      } else {
        setErrorMessage(
          data.error || 'Não foi possível extrair os itens automaticamente. Tente uma foto mais nítida.'
        );
      }
    } catch {
      setErrorMessage('Falha de conexão ao processar a nota fiscal.');
    } finally {
      setParsingAi(false);
    }
  }

  function handleUpdateDraftItem(
    idx: number,
    patch: Partial<Pick<InvoiceItem, 'name' | 'ingredientId' | 'quantity' | 'contentPerPackage' | 'unitPrice'>>
  ) {
    setDraftItems((prev) =>
      prev.map((row, i) => {
        if (i !== idx) return row;
        const nextQty = patch.quantity !== undefined ? patch.quantity : row.quantity;
        const nextPrice = patch.unitPrice !== undefined ? patch.unitPrice : row.unitPrice;
        return {
          ...row,
          ...patch,
          quantity: nextQty,
          unitPrice: nextPrice,
          totalPrice: Number((nextQty * nextPrice).toFixed(2)),
        };
      })
    );
  }

  function handleSaveInvoice() {
    if (draftItems.length === 0) {
      setErrorMessage('Adicione ou extraia ao menos 1 item antes de salvar.');
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
    setReceiptPhotoPreview(null);
    setReceiptBase64('');
    setAiRawText('');
    setErrorMessage(null);
    setStatusMessage('Nota fiscal salva e custos de insumos atualizados com sucesso!');
  }

  function handleDeleteInvoice(invoiceId: string) {
    if (!confirm('Deseja excluir este registro de nota fiscal do histórico?')) return;
    onUpdateState((prev) => ({
      ...prev,
      invoices: prev.invoices.filter((inv) => inv.id !== invoiceId),
    }));
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
            Envie foto do cupom para leitura por IA, importe XML ou lance manualmente com atualização automática de custos.
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
          <p className="text-xs text-zinc-400">Média por Item</p>
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
          <h2 className="text-sm font-semibold text-zinc-100">Registrar Nova Compra / Nota</h2>

          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setEntryMode('ia')}
              className={`px-3 py-1.5 rounded-[6px] text-xs font-medium flex items-center gap-1.5 transition ${
                entryMode === 'ia'
                  ? 'bg-[#ff5400] text-white'
                  : 'bg-[#18181c] text-zinc-300 border border-white/[0.08] hover:text-white'
              }`}
            >
              <Camera className="size-3.5" /> Foto da Nota / Leitura IA
            </button>
            <button
              type="button"
              onClick={() => setEntryMode('xml')}
              className={`px-3 py-1.5 rounded-[6px] text-xs font-medium flex items-center gap-1.5 transition ${
                entryMode === 'xml'
                  ? 'bg-zinc-100 text-zinc-950'
                  : 'bg-[#18181c] text-zinc-300 border border-white/[0.08] hover:text-white'
              }`}
            >
              <FileCode2 className="size-3.5" /> Importar XML (NF-e / NFC-e)
            </button>
            <button
              type="button"
              onClick={() => setEntryMode('manual')}
              className={`px-3 py-1.5 rounded-[6px] text-xs font-medium flex items-center gap-1.5 transition ${
                entryMode === 'manual'
                  ? 'bg-zinc-100 text-zinc-950'
                  : 'bg-[#18181c] text-zinc-300 border border-white/[0.08] hover:text-white'
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

        {errorMessage && (
          <div className="bg-rose-500/10 border border-rose-500/20 rounded-[8px] p-3 text-xs text-rose-300 flex items-center gap-2">
            <AlertCircle className="size-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Mode 1: Photo & AI Scanner (No API key input cluttering the page!) */}
        {entryMode === 'ia' && (
          <div className="bg-[#18181c] border border-white/[0.08] rounded-[10px] p-4 space-y-4 text-xs">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Sparkles className="size-4 text-orange-400" />
                  <span className="font-semibold text-zinc-100 text-sm">
                    Leitor Inteligente de Notas e Cupons Fiscais
                  </span>
                </div>
                <p className="text-zinc-400">
                  Tire uma foto do cupom fiscal pelo celular ou envie a imagem/PDF da nota para extrair o local, a data e todos os itens automaticamente.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <label className="btn-monster-primary cursor-pointer">
                  <Camera className="size-4" />
                  <span>{receiptPhotoPreview ? 'Trocar Foto da Nota' : 'Tirar Foto / Escolher Imagem'}</span>
                  <input
                    type="file"
                    accept="image/*,application/pdf,.pdf"
                    onChange={handleReceiptPhotoSelect}
                    className="hidden"
                  />
                </label>

                <button
                  type="button"
                  onClick={() => setShowTextInput((prev) => !prev)}
                  className="btn-saas-secondary"
                >
                  {showTextInput ? 'Ocultar Texto' : 'Colar Texto / Lista'}
                </button>
              </div>
            </div>

            {/* Receipt Photo Preview */}
            {receiptPhotoPreview && (
              <div className="bg-[#09090b] border border-white/[0.1] rounded-[8px] p-3 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <img
                    src={receiptPhotoPreview}
                    alt="Prévia da Nota Fiscal"
                    className="w-20 h-24 object-cover rounded-[6px] border border-white/[0.15]"
                  />
                  <div className="space-y-1">
                    <p className="font-medium text-zinc-100 flex items-center gap-1.5">
                      <ImageIcon className="size-3.5 text-orange-400" /> Imagem da nota pronta para leitura
                    </p>
                    <p className="text-zinc-400 text-[11px]">
                      Clique em &ldquo;Ler Nota com IA&rdquo; para extrair a lista de produtos e preços.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setReceiptPhotoPreview(null);
                        setReceiptBase64('');
                      }}
                      className="text-rose-400 hover:underline text-[11px] inline-flex items-center gap-1"
                    >
                      <X className="size-3" /> Remover foto
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={parsingAi}
                  onClick={handleParseWithAi}
                  className="btn-monster-primary w-full sm:w-auto px-5 py-2.5"
                >
                  <Sparkles className="size-4" />
                  {parsingAi ? 'Lendo Nota Fiscal...' : 'Ler Nota com IA'}
                </button>
              </div>
            )}

            {/* Optional Collapsible Text Input for pasted receipts / WhatsApp supplier lists */}
            {showTextInput && (
              <div className="space-y-2.5 pt-2 border-t border-white/[0.06]">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-zinc-300">
                    Colar linhas do cupom ou orçamento de fornecedor (WhatsApp)
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
                  placeholder="Ex: 2x Blend de Carne 1kg R$ 34,00..."
                  className="w-full bg-[#09090b] border border-white/[0.1] rounded-[6px] p-3 text-zinc-100 font-mono"
                />
                <div className="flex justify-end">
                  <button
                    type="button"
                    disabled={parsingAi}
                    onClick={handleParseWithAi}
                    className="btn-monster-primary"
                  >
                    <Sparkles className="size-3.5" />
                    {parsingAi ? 'Extraindo...' : 'Extrair Itens com IA'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Mode 2: XML Upload */}
        {entryMode === 'xml' && (
          <div className="bg-[#18181c] border border-white/[0.06] rounded-[8px] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="text-xs">
              <p className="font-medium text-zinc-200">Arquivo XML da Nota Fiscal (NF-e / NFC-e)</p>
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
              placeholder="Ex: Atacadão, Assaí, Distribuidora..."
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

        {/* Editable Draft Items Table */}
        {draftItems.length > 0 && (
          <div className="space-y-3">
            <div className="overflow-x-auto border border-white/[0.1] rounded-[8px]">
              <table className="w-full text-left text-xs tabular-nums">
                <thead className="bg-[#18181c] text-zinc-400 border-b border-white/[0.08]">
                  <tr>
                    <th className="py-2 px-3 font-medium">Item Extraído / Lançado</th>
                    <th className="py-2 px-3 font-medium">Insumo Vinculado</th>
                    <th className="py-2 px-3 font-medium text-center">Qtd</th>
                    <th className="py-2 px-3 font-medium text-center">Conteúdo</th>
                    <th className="py-2 px-3 font-medium text-right">Preço Unit.</th>
                    <th className="py-2 px-3 font-medium text-right">Total</th>
                    <th className="py-2 px-2 text-center" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.06]">
                  {draftItems.map((it, idx) => (
                    <tr key={it.id}>
                      <td className="py-2 px-3">
                        <input
                          type="text"
                          value={it.name}
                          onChange={(e) => handleUpdateDraftItem(idx, { name: e.target.value })}
                          className="w-full bg-[#09090b] border border-white/[0.1] rounded-[6px] px-2 py-1 text-zinc-100"
                        />
                      </td>
                      <td className="py-2 px-3">
                        <select
                          value={it.ingredientId || ''}
                          onChange={(e) =>
                            handleUpdateDraftItem(idx, {
                              ingredientId: e.target.value || undefined,
                            })
                          }
                          className="bg-[#09090b] border border-white/[0.1] rounded-[6px] px-2 py-1 text-zinc-200 text-xs"
                        >
                          <option value="">+ Criar novo insumo</option>
                          {state.ingredients.map((ing) => (
                            <option key={ing.id} value={ing.id}>
                              {ing.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2 px-3 text-center">
                        <input
                          type="number"
                          step="any"
                          value={it.quantity}
                          onChange={(e) =>
                            handleUpdateDraftItem(idx, {
                              quantity: parseFloat(e.target.value) || 0,
                            })
                          }
                          className="w-16 bg-[#09090b] border border-white/[0.1] rounded-[6px] px-2 py-1 text-center text-zinc-100"
                        />
                      </td>
                      <td className="py-2 px-3 text-center">
                        <div className="inline-flex items-center gap-1">
                          <input
                            type="number"
                            step="any"
                            value={it.contentPerPackage}
                            onChange={(e) =>
                              handleUpdateDraftItem(idx, {
                                contentPerPackage: parseFloat(e.target.value) || 1,
                              })
                            }
                            className="w-20 bg-[#09090b] border border-white/[0.1] rounded-[6px] px-2 py-1 text-center text-zinc-100"
                          />
                          <span className="text-zinc-500">{it.usageUnit}</span>
                        </div>
                      </td>
                      <td className="py-2 px-3 text-right">
                        <input
                          type="number"
                          step="0.01"
                          value={it.unitPrice}
                          onChange={(e) =>
                            handleUpdateDraftItem(idx, {
                              unitPrice: parseFloat(e.target.value) || 0,
                            })
                          }
                          className="w-24 bg-[#09090b] border border-white/[0.1] rounded-[6px] px-2 py-1 text-right text-zinc-100"
                        />
                      </td>
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
                  className="accent-orange-500"
                />
                Atualizar automaticamente o preço dos insumos e recalcular o CMV dos lanches
              </label>
              <button
                type="button"
                onClick={handleSaveInvoice}
                className="btn-monster-primary"
              >
                Salvar Nota Fiscal ({formatBRL(draftItems.reduce((a, b) => a + b.totalPrice, 0))})
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Purchase History Table */}
      <div className="bg-[#121215] border border-white/[0.08] rounded-[10px] overflow-hidden">
        <div className="px-4 py-3 border-b border-white/[0.08] flex items-center justify-between">
          <h3 className="text-xs font-semibold text-zinc-200">
            Histórico de Compras Registradas ({state.invoices.length} notas)
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
                <th className="py-3 px-3 font-medium text-center">Ações</th>
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
                  <td className="py-2.5 px-3 text-center">
                    <button
                      type="button"
                      title="Excluir nota fiscal"
                      onClick={() => handleDeleteInvoice(item.invoiceId)}
                      className="text-zinc-500 hover:text-rose-400 p-1"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
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
