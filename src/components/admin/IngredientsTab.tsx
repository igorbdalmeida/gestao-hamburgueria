'use client';

import { formatBRL } from '@/lib/pricing';
import { AppDatabaseState, Ingredient, IngredientCategory, UsageUnit } from '@/lib/types';
import { History, Plus, Search, Trash2, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { todayLocal } from '@/lib/periods';

interface Props {
  state: AppDatabaseState;
  onUpdateState: (updater: (prev: AppDatabaseState) => AppDatabaseState) => void;
}

const CATEGORIES: IngredientCategory[] = [
  'Proteína',
  'Panificação',
  'Queijos e Frios',
  'Molhos',
  'Hortifrúti e Conservas',
  'Acompanhamentos',
  'Bebidas',
  'Embalagem',
  'Óleos e Gorduras',
  'Outros',
];

export default function IngredientsTab({ state, onUpdateState }: Props) {
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('Todas');
  const [selectedHistoryIng, setSelectedHistoryIng] = useState<Ingredient | null>(null);

  const [name, setName] = useState('');
  const [category, setCategory] = useState<IngredientCategory>('Proteína');
  const [purchasePackage, setPurchasePackage] = useState('Pacote (1 kg)');
  const [packagePrice, setPackagePrice] = useState('35.00');
  const [packageContent, setPackageContent] = useState('1000');
  const [usageUnit, setUsageUnit] = useState<UsageUnit>('g');

  const filteredIngredients = useMemo(() => {
    return state.ingredients.filter((i) => {
      const matchesCat = filterCategory === 'Todas' || i.category === filterCategory;
      const matchesSearch =
        !search.trim() ||
        i.name.toLowerCase().includes(search.toLowerCase()) ||
        i.category.toLowerCase().includes(search.toLowerCase());
      return matchesCat && matchesSearch;
    });
  }, [state.ingredients, filterCategory, search]);

  function handleAddIngredient(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const price = parseFloat(packagePrice) || 0;
    const content = parseFloat(packageContent) || 1;
    const unitCost = price / content;

    const newIng: Ingredient = {
      id: `ing-${Date.now()}`,
      name: name.trim(),
      category,
      purchasePackage: purchasePackage.trim() || 'Unidade',
      packagePrice: price,
      packageContent: content,
      usageUnit,
      unitCost,
      priceHistory: [
        {
          date: todayLocal(),
          supplier: 'Cadastro manual',
          packagePrice: price,
          packageContent: content,
          unitCost,
        },
      ],
    };

    onUpdateState((prev) => ({
      ...prev,
      ingredients: [newIng, ...prev.ingredients],
    }));
    setName('');
  }

  function handleUpdateIngredientField(
    id: string,
    field: 'packagePrice' | 'packageContent' | 'purchasePackage' | 'category',
    val: string | number
  ) {
    onUpdateState((prev) => ({
      ...prev,
      ingredients: prev.ingredients.map((ing) => {
        if (ing.id !== id) return ing;
        const nextPrice = field === 'packagePrice' ? Number(val) || 0 : ing.packagePrice;
        const nextContent =
          field === 'packageContent' ? Math.max(0.0001, Number(val) || 1) : ing.packageContent;
        const nextUnitCost = nextPrice / nextContent;

        return {
          ...ing,
          [field]: val,
          packagePrice: nextPrice,
          packageContent: nextContent,
          unitCost: nextUnitCost,
        };
      }),
    }));
  }

  function handleDeleteIngredient(id: string) {
    if (!confirm('Remover este insumo?')) return;
    onUpdateState((prev) => ({
      ...prev,
      ingredients: prev.ingredients.filter((i) => i.id !== id),
    }));
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-white/[0.08]">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100">Insumos e Embalagens</h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            Base de custos por unidade de medida ({state.ingredients.length} itens registrados).
          </p>
        </div>
      </div>

      {/* Add Ingredient Form */}
      <form
        onSubmit={handleAddIngredient}
        className="bg-[#121215] border border-white/[0.08] rounded-[10px] p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-3 items-end text-xs"
      >
        <div className="lg:col-span-2">
          <label className="text-zinc-400 block mb-1">Nome do Insumo</label>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex: Bacon Fatiado, Pão Australiano"
            className="w-full bg-[#09090b] border border-white/[0.1] rounded-[6px] px-3 py-1.5 text-zinc-100"
          />
        </div>
        <div>
          <label className="text-zinc-400 block mb-1">Categoria</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as IngredientCategory)}
            className="w-full bg-[#09090b] border border-white/[0.1] rounded-[6px] px-3 py-1.5 text-zinc-100"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-zinc-400 block mb-1">Embalagem Compra</label>
          <input
            type="text"
            value={purchasePackage}
            onChange={(e) => setPurchasePackage(e.target.value)}
            placeholder="Pacote 1kg"
            className="w-full bg-[#09090b] border border-white/[0.1] rounded-[6px] px-3 py-1.5 text-zinc-100"
          />
        </div>
        <div>
          <label className="text-zinc-400 block mb-1">Preço Pago (R$)</label>
          <input
            type="number"
            step="0.01"
            required
            value={packagePrice}
            onChange={(e) => setPackagePrice(e.target.value)}
            className="w-full bg-[#09090b] border border-white/[0.1] rounded-[6px] px-3 py-1.5 text-zinc-100 tabular-nums"
          />
        </div>
        <div>
          <label className="text-zinc-400 block mb-1">Conteúdo / Unid.</label>
          <div className="flex gap-1">
            <input
              type="number"
              step="any"
              required
              value={packageContent}
              onChange={(e) => setPackageContent(e.target.value)}
              className="w-full bg-[#09090b] border border-white/[0.1] rounded-[6px] px-2 py-1.5 text-zinc-100 tabular-nums"
            />
            <select
              value={usageUnit}
              onChange={(e) => setUsageUnit(e.target.value as UsageUnit)}
              className="bg-[#09090b] border border-white/[0.1] rounded-[6px] px-2 py-1.5 text-zinc-200"
            >
              <option value="g">g</option>
              <option value="un">un</option>
              <option value="ml">ml</option>
              <option value="l">l</option>
            </select>
          </div>
        </div>
        <button type="submit" className="btn-saas-primary h-[34px]">
          <Plus className="size-3.5" /> Adicionar
        </button>
      </form>

      {/* Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {['Todas', ...CATEGORIES].map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setFilterCategory(cat)}
              className={`px-3 py-1.5 rounded-[6px] text-xs font-medium whitespace-nowrap transition ${
                filterCategory === cat
                  ? 'bg-zinc-100 text-zinc-950'
                  : 'bg-[#121215] text-zinc-400 border border-white/[0.08] hover:text-zinc-200'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="size-3.5 text-zinc-500 absolute left-3 top-2.5" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filtrar insumo..."
            className="w-full pl-8 pr-3 py-1.5 bg-[#121215] border border-white/[0.08] rounded-[6px] text-xs text-zinc-100"
          />
        </div>
      </div>

      {/* Ingredients Table */}
      <div className="bg-[#121215] border border-white/[0.08] rounded-[10px] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs tabular-nums">
            <thead className="bg-[#18181c] text-zinc-400 border-b border-white/[0.08]">
              <tr>
                <th className="py-3 px-4 font-medium">Categoria</th>
                <th className="py-3 px-4 font-medium">Item / Insumo</th>
                <th className="py-3 px-3 font-medium">Embalagem</th>
                <th className="py-3 px-3 font-medium text-right">Preço Pago</th>
                <th className="py-3 px-3 font-medium text-right">Conteúdo</th>
                <th className="py-3 px-3 font-medium text-center">Unid.</th>
                <th className="py-3 px-3 font-medium text-right">Custo Unitário</th>
                <th className="py-3 px-3 font-medium text-center">Histórico</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {filteredIngredients.map((ing) => {
                const unitCost = ing.packagePrice / (ing.packageContent || 1);
                return (
                  <tr key={ing.id} className="hover:bg-white/[0.02]">
                    <td className="py-2 px-4">
                      <select
                        value={ing.category}
                        onChange={(e) =>
                          handleUpdateIngredientField(ing.id, 'category', e.target.value)
                        }
                        className="bg-[#09090b] border border-white/[0.08] rounded-[6px] px-2 py-1 text-[11px] text-zinc-300"
                      >
                        {CATEGORIES.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2 px-4 font-medium text-zinc-100">{ing.name}</td>
                    <td className="py-2 px-3">
                      <input
                        type="text"
                        aria-label={`Embalagem de ${ing.name}`}
                        value={ing.purchasePackage}
                        onChange={(e) =>
                          handleUpdateIngredientField(ing.id, 'purchasePackage', e.target.value)
                        }
                        className="w-36 bg-[#09090b] border border-white/[0.08] rounded-[6px] px-2 py-1 text-zinc-300"
                      />
                    </td>
                    <td className="py-2 px-3 text-right">
                      <input
                        type="number"
                        step="0.01"
                        aria-label={`Preço pago em ${ing.name}`}
                        value={ing.packagePrice}
                        onChange={(e) =>
                          handleUpdateIngredientField(
                            ing.id,
                            'packagePrice',
                            parseFloat(e.target.value) || 0
                          )
                        }
                        className="w-24 bg-[#09090b] border border-white/[0.14] rounded-[6px] px-2 py-1 text-right font-medium text-zinc-100"
                      />
                    </td>
                    <td className="py-2 px-3 text-right">
                      <input
                        type="number"
                        step="any"
                        aria-label={`Conteúdo de ${ing.name}`}
                        value={ing.packageContent}
                        onChange={(e) =>
                          handleUpdateIngredientField(
                            ing.id,
                            'packageContent',
                            parseFloat(e.target.value) || 1
                          )
                        }
                        className="w-20 bg-[#09090b] border border-white/[0.08] rounded-[6px] px-2 py-1 text-right text-zinc-200"
                      />
                    </td>
                    <td className="py-2 px-3 text-center text-zinc-400">
                      {ing.usageUnit}
                    </td>
                    <td className="py-2 px-3 text-right font-medium text-zinc-200">
                      {formatBRL(unitCost, unitCost < 0.1 ? 5 : 2)} / {ing.usageUnit}
                    </td>
                    <td className="py-2 px-3 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setSelectedHistoryIng(ing)}
                          className="px-2 py-1 bg-[#18181c] hover:bg-zinc-800 border border-white/[0.08] text-zinc-300 rounded-[6px] text-[11px] flex items-center gap-1"
                        >
                          <History className="size-3" /> {ing.priceHistory.length}
                        </button>
                        <button
                          type="button"
                          aria-label={`Excluir ${ing.name}`}
                          onClick={() => handleDeleteIngredient(ing.id)}
                          className="p-1 text-zinc-500 hover:text-rose-400"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {selectedHistoryIng && (
        <div className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-4">
          <div className="bg-[#121215] border border-white/[0.12] rounded-[12px] max-w-lg w-full p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
              <div>
                <h3 className="text-sm font-semibold text-zinc-100">
                  Histórico de Cotações — {selectedHistoryIng.name}
                </h3>
                <p className="text-xs text-zinc-400">
                  Evolução de preços por data e fornecedor
                </p>
              </div>
              <button
                type="button"
                aria-label="Fechar"
                onClick={() => setSelectedHistoryIng(null)}
                className="text-zinc-400 hover:text-zinc-200"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="space-y-2 max-h-80 overflow-y-auto tabular-nums">
              {selectedHistoryIng.priceHistory.map((pt, idx) => (
                <div
                  key={idx}
                  className="bg-[#18181c] border border-white/[0.06] rounded-[8px] p-3 flex items-center justify-between text-xs"
                >
                  <div>
                    <p className="font-medium text-zinc-200">{pt.supplier}</p>
                    <p className="text-zinc-500">{pt.date}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium text-zinc-100">
                      {formatBRL(pt.packagePrice)} ({pt.packageContent} {selectedHistoryIng.usageUnit})
                    </p>
                    <p className="text-zinc-400 text-[11px]">
                      {formatBRL(pt.unitCost, 4)}/{selectedHistoryIng.usageUnit}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
