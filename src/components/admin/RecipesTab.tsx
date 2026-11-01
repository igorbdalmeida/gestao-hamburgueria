'use client';

import { calculateProductMetrics, formatBRL, formatPct } from '@/lib/pricing';
import { AppDatabaseState, Product, RecipeItem } from '@/lib/types';
import { Package, Plus, Trash2, Utensils, X } from 'lucide-react';
import { useState } from 'react';

interface Props {
  state: AppDatabaseState;
  onUpdateState: (updater: (prev: AppDatabaseState) => AppDatabaseState) => void;
}

export default function RecipesTab({ state, onUpdateState }: Props) {
  const [selectedId, setSelectedId] = useState<string>(state.products[0]?.id || '');
  const [showNewModal, setShowNewModal] = useState(false);

  const [newName, setNewName] = useState('');
  const [newShortName, setNewShortName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newCategory, setNewCategory] = useState<Product['category']>('Hambúrgueres');
  const [newPrice, setNewPrice] = useState('24.90');

  const [addIngId, setAddIngId] = useState<string>(state.ingredients[0]?.id || '');
  const [addQty, setAddQty] = useState<string>('30');

  const selectedProduct =
    state.products.find((p) => p.id === selectedId) || state.products[0];

  function handleAddIngredientToRecipe(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedProduct || !addIngId) return;
    const ing = state.ingredients.find((i) => i.id === addIngId);
    if (!ing) return;

    const qty = parseFloat(addQty) || 1;
    const group: RecipeItem['group'] =
      ing.category === 'Embalagem' ? 'embalagem' : 'alimento';

    onUpdateState((prev) => ({
      ...prev,
      products: prev.products.map((p) => {
        if (p.id !== selectedProduct.id) return p;
        const existingIdx = p.recipe.findIndex((r) => r.ingredientId === addIngId);
        if (existingIdx >= 0) {
          const updated = [...p.recipe];
          updated[existingIdx] = {
            ...updated[existingIdx],
            quantity: updated[existingIdx].quantity + qty,
          };
          return { ...p, recipe: updated };
        }
        return {
          ...p,
          recipe: [...p.recipe, { ingredientId: addIngId, quantity: qty, group }],
        };
      }),
    }));
  }

  function handleUpdateRecipeQty(ingredientId: string, newQuantity: number) {
    if (!selectedProduct) return;
    onUpdateState((prev) => ({
      ...prev,
      products: prev.products.map((p) => {
        if (p.id !== selectedProduct.id) return p;
        return {
          ...p,
          recipe: p.recipe.map((r) =>
            r.ingredientId === ingredientId ? { ...r, quantity: Math.max(0, newQuantity) } : r
          ),
        };
      }),
    }));
  }

  function handleRemoveRecipeItem(ingredientId: string) {
    if (!selectedProduct) return;
    onUpdateState((prev) => ({
      ...prev,
      products: prev.products.map((p) => {
        if (p.id !== selectedProduct.id) return p;
        return {
          ...p,
          recipe: p.recipe.filter((r) => r.ingredientId !== ingredientId),
        };
      }),
    }));
  }

  function handleAddStandardPackagingKit() {
    if (!selectedProduct) return;
    const papel = state.ingredients.find((i) =>
      i.name.toLowerCase().includes('papel acoplado')
    );
    const saco = state.ingredients.find((i) =>
      i.name.toLowerCase().includes('saco kraft')
    );

    onUpdateState((prev) => ({
      ...prev,
      products: prev.products.map((p) => {
        if (p.id !== selectedProduct.id) return p;
        const nextRecipe = [...p.recipe];
        if (papel && !nextRecipe.some((r) => r.ingredientId === papel.id)) {
          nextRecipe.push({ ingredientId: papel.id, quantity: 1, group: 'embalagem' });
        }
        if (saco && !nextRecipe.some((r) => r.ingredientId === saco.id)) {
          nextRecipe.push({ ingredientId: saco.id, quantity: 1, group: 'embalagem' });
        }
        return { ...p, recipe: nextRecipe };
      }),
    }));
  }

  function handleCreateNewProduct(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;

    const papel = state.ingredients.find((i) =>
      i.name.toLowerCase().includes('papel acoplado')
    );
    const saco = state.ingredients.find((i) =>
      i.name.toLowerCase().includes('saco kraft')
    );

    const defaultRecipe: RecipeItem[] = [];
    if (newCategory === 'Hambúrgueres') {
      if (papel) defaultRecipe.push({ ingredientId: papel.id, quantity: 1, group: 'embalagem' });
      if (saco) defaultRecipe.push({ ingredientId: saco.id, quantity: 1, group: 'embalagem' });
    }

    const created: Product = {
      id: `prod-${Date.now()}`,
      name: newName.trim(),
      shortName: newShortName.trim() || newName.trim(),
      description: newDesc.trim() || '',
      category: newCategory,
      channel: newCategory === 'Bebidas' ? 'geral' : 'delivery',
      imageEmoji: newCategory === 'Bebidas' ? '🥤' : '🍔',
      availableInMenu: true,
      featured: false,
      fixedCostPct: state.settings.defaultFixedCostPct,
      taxPct: state.settings.estimatedTaxPct,
      channelFeePct: state.settings.defaultChannelFeePct,
      targetMarginPct: state.settings.defaultTargetMarginPct,
      practicedPrice: parseFloat(newPrice) || 24.9,
      recipe: defaultRecipe,
    };

    onUpdateState((prev) => ({
      ...prev,
      products: [...prev.products, created],
    }));
    setSelectedId(created.id);
    setShowNewModal(false);
    setNewName('');
    setNewShortName('');
    setNewDesc('');
  }

  function handleDeleteProduct(productId: string) {
    if (!confirm('Confirmar exclusão deste produto?')) return;
    onUpdateState((prev) => {
      const remaining = prev.products.filter((p) => p.id !== productId);
      if (selectedId === productId && remaining[0]) {
        setSelectedId(remaining[0].id);
      }
      return { ...prev, products: remaining };
    });
  }

  const metrics = selectedProduct
    ? calculateProductMetrics(selectedProduct, state.ingredients)
    : null;

  const foodItems = metrics?.itemsDetailed.filter((i) => i.group === 'alimento') || [];
  const packagingItems = metrics?.itemsDetailed.filter((i) => i.group === 'embalagem') || [];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-white/[0.08]">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100">Fichas Técnicas</h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            Composição de insumos alimentícios e embalagens por unidade vendida.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowNewModal(true)}
          className="btn-saas-primary"
        >
          <Plus className="size-4" /> Novo Produto
        </button>
      </div>

      {/* Product Selector Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {state.products.map((prod) => {
          const m = calculateProductMetrics(prod, state.ingredients);
          const active = prod.id === selectedProduct?.id;
          return (
            <button
              key={prod.id}
              type="button"
              onClick={() => setSelectedId(prod.id)}
              className={`px-3.5 py-2 rounded-[8px] border text-left transition shrink-0 ${
                active
                  ? 'bg-[#18181c] border-zinc-400 text-zinc-100'
                  : 'bg-[#121215] border-white/[0.08] text-zinc-400 hover:border-white/[0.16]'
              }`}
            >
              <div className="text-xs font-medium text-zinc-100">{prod.name}</div>
              <div className="text-[11px] text-zinc-400 tabular-nums mt-0.5">
                CMV: {formatBRL(m.totalCmv)} • Venda: {formatBRL(prod.practicedPrice)}
              </div>
            </button>
          );
        })}
      </div>

      {selectedProduct && metrics && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left 2 Columns: Recipe Tables */}
          <div className="lg:col-span-2 bg-[#121215] border border-white/[0.08] rounded-[10px] p-5 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-white/[0.08]">
              <div>
                <h2 className="text-base font-semibold text-zinc-100">
                  {selectedProduct.name}
                </h2>
                <label className="inline-flex items-center gap-2 text-xs text-zinc-400 mt-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedProduct.availableInMenu}
                    onChange={(e) =>
                      onUpdateState((prev) => ({
                        ...prev,
                        products: prev.products.map((p) =>
                          p.id === selectedProduct.id
                            ? { ...p, availableInMenu: e.target.checked }
                            : p
                        ),
                      }))
                    }
                    className="accent-zinc-200"
                  />
                  Exibir no Cardápio Online (/cardapio)
                </label>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleAddStandardPackagingKit}
                  className="btn-saas-secondary text-xs"
                >
                  <Package className="size-3.5 text-zinc-400" /> + Kit Embalagem
                </button>
                <button
                  type="button"
                  aria-label="Excluir Produto"
                  onClick={() => handleDeleteProduct(selectedProduct.id)}
                  className="p-2 bg-[#18181c] hover:bg-rose-500/10 text-zinc-400 hover:text-rose-400 border border-white/[0.08] rounded-[6px]"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            </div>

            {/* Add Ingredient Form */}
            <form
              onSubmit={handleAddIngredientToRecipe}
              className="bg-[#18181c] border border-white/[0.06] rounded-[8px] p-3.5 flex flex-col sm:flex-row items-end gap-3"
            >
              <div className="w-full sm:flex-1">
                <label className="text-xs text-zinc-400 block mb-1">
                  Insumo ou Embalagem
                </label>
                <select
                  value={addIngId}
                  onChange={(e) => setAddIngId(e.target.value)}
                  className="w-full bg-[#09090b] border border-white/[0.1] rounded-[6px] px-3 py-1.5 text-xs text-zinc-100"
                >
                  {state.ingredients.map((ing) => (
                    <option key={ing.id} value={ing.id}>
                      {ing.name} ({formatBRL(ing.packagePrice / (ing.packageContent || 1), 4)}/{ing.usageUnit})
                    </option>
                  ))}
                </select>
              </div>
              <div className="w-full sm:w-32">
                <label className="text-xs text-zinc-400 block mb-1">
                  Quantidade ({state.ingredients.find((i) => i.id === addIngId)?.usageUnit || 'un'})
                </label>
                <input
                  type="number"
                  step="any"
                  required
                  value={addQty}
                  onChange={(e) => setAddQty(e.target.value)}
                  className="w-full bg-[#09090b] border border-white/[0.1] rounded-[6px] px-3 py-1.5 text-xs text-zinc-100 tabular-nums"
                />
              </div>
              <button type="submit" className="btn-saas-primary w-full sm:w-auto">
                <Plus className="size-3.5" /> Adicionar
              </button>
            </form>

            {/* Food Table */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-medium text-zinc-300">
                <span className="flex items-center gap-1.5">
                  <Utensils className="size-3.5 text-zinc-400" /> Alimentos
                </span>
                <span className="tabular-nums">Subtotal: {formatBRL(metrics.foodCost)}</span>
              </div>
              <div className="overflow-x-auto border border-white/[0.08] rounded-[8px]">
                <table className="w-full text-left text-xs tabular-nums">
                  <thead className="bg-[#18181c] text-zinc-400 border-b border-white/[0.08]">
                    <tr>
                      <th className="py-2 px-3 font-medium">Insumo</th>
                      <th className="py-2 px-3 font-medium text-center">Qtd</th>
                      <th className="py-2 px-3 font-medium text-center">Unid.</th>
                      <th className="py-2 px-3 font-medium text-right">Custo Unit.</th>
                      <th className="py-2 px-3 font-medium text-right">Subtotal</th>
                      <th className="py-2 px-2 text-center" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.06]">
                    {foodItems.map((item) => (
                      <tr key={item.ingredientId} className="hover:bg-white/[0.02]">
                        <td className="py-2 px-3 text-zinc-200">{item.name}</td>
                        <td className="py-2 px-3 text-center">
                          <input
                            type="number"
                            step="any"
                            aria-label={`Quantidade de ${item.name}`}
                            value={item.quantity}
                            onChange={(e) =>
                              handleUpdateRecipeQty(
                                item.ingredientId,
                                parseFloat(e.target.value) || 0
                              )
                            }
                            className="w-20 bg-[#09090b] border border-white/[0.1] rounded-[6px] px-2 py-1 text-center text-zinc-100"
                          />
                        </td>
                        <td className="py-2 px-3 text-center text-zinc-500">{item.usageUnit}</td>
                        <td className="py-2 px-3 text-right text-zinc-400">
                          {formatBRL(item.unitCost, 4)}
                        </td>
                        <td className="py-2 px-3 text-right font-medium text-zinc-200">
                          {formatBRL(item.subtotal)}
                        </td>
                        <td className="py-2 px-2 text-center">
                          <button
                            type="button"
                            aria-label="Remover item"
                            onClick={() => handleRemoveRecipeItem(item.ingredientId)}
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

            {/* Packaging Table */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-medium text-zinc-300">
                <span className="flex items-center gap-1.5">
                  <Package className="size-3.5 text-zinc-400" /> Embalagens
                </span>
                <span className="tabular-nums">Subtotal: {formatBRL(metrics.packagingCost)}</span>
              </div>
              <div className="overflow-x-auto border border-white/[0.08] rounded-[8px]">
                <table className="w-full text-left text-xs tabular-nums">
                  <thead className="bg-[#18181c] text-zinc-400 border-b border-white/[0.08]">
                    <tr>
                      <th className="py-2 px-3 font-medium">Embalagem</th>
                      <th className="py-2 px-3 font-medium text-center">Qtd</th>
                      <th className="py-2 px-3 font-medium text-center">Unid.</th>
                      <th className="py-2 px-3 font-medium text-right">Custo Unit.</th>
                      <th className="py-2 px-3 font-medium text-right">Subtotal</th>
                      <th className="py-2 px-2 text-center" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.06]">
                    {packagingItems.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-4 text-center text-zinc-500">
                          Nenhuma embalagem vinculada.
                        </td>
                      </tr>
                    ) : (
                      packagingItems.map((item) => (
                        <tr key={item.ingredientId} className="hover:bg-white/[0.02]">
                          <td className="py-2 px-3 text-zinc-200">{item.name}</td>
                          <td className="py-2 px-3 text-center">
                            <input
                              type="number"
                              step="any"
                              aria-label={`Quantidade de ${item.name}`}
                              value={item.quantity}
                              onChange={(e) =>
                                handleUpdateRecipeQty(
                                  item.ingredientId,
                                  parseFloat(e.target.value) || 0
                                )
                              }
                              className="w-20 bg-[#09090b] border border-white/[0.1] rounded-[6px] px-2 py-1 text-center text-zinc-100"
                            />
                          </td>
                          <td className="py-2 px-3 text-center text-zinc-500">
                            {item.usageUnit}
                          </td>
                          <td className="py-2 px-3 text-right text-zinc-400">
                            {formatBRL(item.unitCost, 2)}
                          </td>
                          <td className="py-2 px-3 text-right font-medium text-zinc-200">
                            {formatBRL(item.subtotal)}
                          </td>
                          <td className="py-2 px-2 text-center">
                            <button
                              type="button"
                              aria-label="Remover embalagem"
                              onClick={() => handleRemoveRecipeItem(item.ingredientId)}
                              className="text-zinc-500 hover:text-rose-400 p-1"
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Right Column: Summary & Cardápio Details */}
          <div className="space-y-4">
            <div className="bg-[#121215] border border-white/[0.08] rounded-[10px] p-5 space-y-4 tabular-nums">
              <h3 className="text-sm font-semibold text-zinc-100">Resumo de Custos</h3>

              <div className="space-y-2 text-xs border-b border-white/[0.08] pb-4">
                <div className="flex justify-between text-zinc-400">
                  <span>Subtotal Alimentos</span>
                  <span className="text-zinc-200">{formatBRL(metrics.foodCost)}</span>
                </div>
                <div className="flex justify-between text-zinc-400">
                  <span>Subtotal Embalagens</span>
                  <span className="text-zinc-200">{formatBRL(metrics.packagingCost)}</span>
                </div>
                <div className="flex justify-between text-sm font-semibold text-zinc-100 pt-1">
                  <span>CMV Total</span>
                  <span>{formatBRL(metrics.totalCmv)}</span>
                </div>
              </div>

              <div className="space-y-2.5 text-xs">
                <div className="flex justify-between text-zinc-400">
                  <span>Preço Sugerido</span>
                  <span className="text-zinc-200 font-medium">
                    {formatBRL(metrics.suggestedPrice)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-zinc-300 font-medium">Preço Praticado</span>
                  <input
                    type="number"
                    step="0.10"
                    value={selectedProduct.practicedPrice}
                    onChange={(e) =>
                      onUpdateState((prev) => ({
                        ...prev,
                        products: prev.products.map((p) =>
                          p.id === selectedProduct.id
                            ? { ...p, practicedPrice: parseFloat(e.target.value) || 0 }
                            : p
                        ),
                      }))
                    }
                    className="w-28 bg-[#09090b] border border-white/[0.16] rounded-[6px] px-3 py-1.5 text-right font-semibold text-zinc-100 text-sm"
                  />
                </div>
              </div>

              <div className="bg-[#18181c] border border-white/[0.06] rounded-[8px] p-3.5 flex items-center justify-between">
                <div>
                  <p className="text-[11px] text-zinc-400">Lucro por Unidade</p>
                  <p className="text-lg font-semibold text-emerald-400">
                    {formatBRL(metrics.netProfit)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[11px] text-zinc-400">Margem Real</p>
                  <p className="text-base font-semibold text-zinc-100">
                    {formatPct(metrics.realMarginPct, 1)}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-[#121215] border border-white/[0.08] rounded-[10px] p-5 space-y-3">
              <h3 className="text-sm font-semibold text-zinc-100">Dados no Cardápio Online</h3>
              <div>
                <label className="text-xs text-zinc-400 block mb-1">Título Comercial</label>
                <input
                  type="text"
                  value={selectedProduct.shortName}
                  onChange={(e) =>
                    onUpdateState((prev) => ({
                      ...prev,
                      products: prev.products.map((p) =>
                        p.id === selectedProduct.id ? { ...p, shortName: e.target.value } : p
                      ),
                    }))
                  }
                  className="w-full bg-[#09090b] border border-white/[0.1] rounded-[6px] px-3 py-2 text-xs text-zinc-100"
                />
              </div>
              <div>
                <label className="text-xs text-zinc-400 block mb-1">Descrição dos Ingredientes</label>
                <textarea
                  rows={3}
                  value={selectedProduct.description}
                  onChange={(e) =>
                    onUpdateState((prev) => ({
                      ...prev,
                      products: prev.products.map((p) =>
                        p.id === selectedProduct.id ? { ...p, description: e.target.value } : p
                      ),
                    }))
                  }
                  className="w-full bg-[#09090b] border border-white/[0.1] rounded-[6px] px-3 py-2 text-xs text-zinc-100"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {showNewModal && (
        <div className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-4">
          <div className="bg-[#121215] border border-white/[0.12] rounded-[12px] max-w-md w-full p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
              <h3 className="text-sm font-semibold text-zinc-100">Novo Produto</h3>
              <button
                type="button"
                aria-label="Fechar"
                onClick={() => setShowNewModal(false)}
                className="text-zinc-400 hover:text-zinc-200"
              >
                <X className="size-4" />
              </button>
            </div>
            <form onSubmit={handleCreateNewProduct} className="space-y-3 text-xs">
              <div>
                <label className="text-zinc-400 block mb-1">Nome Interno (Ficha Técnica)</label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Ex: Lanche 6 (Duplo Bacon) - Delivery"
                  className="w-full bg-[#09090b] border border-white/[0.1] rounded-[6px] px-3 py-2 text-zinc-100"
                />
              </div>
              <div>
                <label className="text-zinc-400 block mb-1">Nome no Cardápio Online</label>
                <input
                  type="text"
                  value={newShortName}
                  onChange={(e) => setNewShortName(e.target.value)}
                  placeholder="Ex: Duplo Bacon Artesanal"
                  className="w-full bg-[#09090b] border border-white/[0.1] rounded-[6px] px-3 py-2 text-zinc-100"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-zinc-400 block mb-1">Categoria</label>
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value as Product['category'])}
                    className="w-full bg-[#09090b] border border-white/[0.1] rounded-[6px] px-3 py-2 text-zinc-100"
                  >
                    <option value="Hambúrgueres">Hambúrgueres</option>
                    <option value="Porções & Combos">Porções & Combos</option>
                    <option value="Bebidas">Bebidas</option>
                    <option value="Sobremesas">Sobremesas</option>
                  </select>
                </div>
                <div>
                  <label className="text-zinc-400 block mb-1">Preço de Venda (R$)</label>
                  <input
                    type="number"
                    step="0.10"
                    value={newPrice}
                    onChange={(e) => setNewPrice(e.target.value)}
                    className="w-full bg-[#09090b] border border-white/[0.1] rounded-[6px] px-3 py-2 text-zinc-100 tabular-nums"
                  />
                </div>
              </div>
              <div>
                <label className="text-zinc-400 block mb-1">Descrição</label>
                <textarea
                  rows={2}
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  className="w-full bg-[#09090b] border border-white/[0.1] rounded-[6px] px-3 py-2 text-zinc-100"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewModal(false)}
                  className="btn-saas-secondary"
                >
                  Cancelar
                </button>
                <button type="submit" className="btn-saas-primary">
                  Salvar Produto
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
