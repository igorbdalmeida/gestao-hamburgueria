'use client';

import { compressImageFile } from '@/lib/image-utils';
import { calculateProductMetrics, formatBRL, formatPct } from '@/lib/pricing';
import { AppDatabaseState, Product, RecipeItem } from '@/lib/types';
import {
  ArrowDown,
  ArrowUp,
  Camera,
  Copy,
  GripVertical,
  Image as ImageIcon,
  Package,
  Plus,
  Star,
  Trash2,
  Utensils,
  X,
} from 'lucide-react';
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
  const [newImageUrl, setNewImageUrl] = useState<string>('');
  const [newFeatured, setNewFeatured] = useState(false);

  const [addIngId, setAddIngId] = useState<string>(state.ingredients[0]?.id || '');
  const [addQty, setAddQty] = useState<string>('30');
  const [addGroupMode, setAddGroupMode] = useState<'auto' | 'alimento' | 'embalagem'>('auto');
  const [draggedIngId, setDraggedIngId] = useState<string | null>(null);
  const [dragOverIngId, setDragOverIngId] = useState<string | null>(null);

  const selectedProduct =
    state.products.find((p) => p.id === selectedId) || state.products[0];

  async function handleProductPhotoUpload(
    e: React.ChangeEvent<HTMLInputElement>,
    target: 'existing' | 'new'
  ) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImageFile(file, {
        maxWidth: 800,
        maxHeight: 800,
        quality: 0.86,
        squareCrop: false,
      });
      if (target === 'new') {
        setNewImageUrl(compressed.dataUrl);
      } else if (selectedProduct) {
        onUpdateState((prev) => ({
          ...prev,
          products: prev.products.map((p) =>
            p.id === selectedProduct.id ? { ...p, imageUrl: compressed.dataUrl } : p
          ),
        }));
      }
    } catch {
      alert('Não foi possível processar esta imagem. Tente outro arquivo JPG/PNG/WebP.');
    }
  }

  function handleAddIngredientToRecipe(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedProduct || !addIngId) return;
    const ing = state.ingredients.find((i) => i.id === addIngId);
    if (!ing) return;

    const qty = parseFloat(addQty) || 1;
    const isPotinhoOrPackaging =
      ing.category === 'Embalagem' ||
      ing.name.toLowerCase().includes('potinho') ||
      ing.name.toLowerCase().includes('maionese da casa');
    const group: RecipeItem['group'] =
      addGroupMode === 'embalagem'
        ? 'embalagem'
        : addGroupMode === 'alimento'
        ? 'alimento'
        : isPotinhoOrPackaging
        ? 'embalagem'
        : 'alimento';

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
            group,
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

  function handleReorderRecipeItem(
    sourceIngId: string,
    targetIngId: string,
    group: 'alimento' | 'embalagem'
  ) {
    if (!selectedProduct || sourceIngId === targetIngId) return;
    const ingMap = new Map(state.ingredients.map((i) => [i.id, i]));
    const getGroup = (r: RecipeItem): 'alimento' | 'embalagem' => {
      const ing = ingMap.get(r.ingredientId);
      return r.group === 'embalagem' || ing?.category === 'Embalagem'
        ? 'embalagem'
        : 'alimento';
    };

    onUpdateState((prev) => ({
      ...prev,
      products: prev.products.map((p) => {
        if (p.id !== selectedProduct.id) return p;
        const foodList = p.recipe.filter((r) => getGroup(r) === 'alimento');
        const packList = p.recipe.filter((r) => getGroup(r) === 'embalagem');
        const activeList = group === 'alimento' ? [...foodList] : [...packList];

        const fromIdx = activeList.findIndex((r) => r.ingredientId === sourceIngId);
        const toIdx = activeList.findIndex((r) => r.ingredientId === targetIngId);
        if (fromIdx < 0 || toIdx < 0) return p;

        const [moved] = activeList.splice(fromIdx, 1);
        activeList.splice(toIdx, 0, moved);

        return {
          ...p,
          recipe:
            group === 'alimento'
              ? [...activeList, ...packList]
              : [...foodList, ...activeList],
        };
      }),
    }));
  }

  function handleMoveRecipeStep(
    ingredientId: string,
    direction: -1 | 1,
    group: 'alimento' | 'embalagem'
  ) {
    if (!selectedProduct) return;
    const list = group === 'alimento' ? foodItems : packagingItems;
    const idx = list.findIndex((i) => i.ingredientId === ingredientId);
    const targetIdx = idx + direction;
    if (idx < 0 || targetIdx < 0 || targetIdx >= list.length) return;
    handleReorderRecipeItem(ingredientId, list[targetIdx].ingredientId, group);
  }

  function handleAddStandardPackagingKit() {
    if (!selectedProduct) return;
    const papel = state.ingredients.find((i) =>
      i.name.toLowerCase().includes('papel acoplado')
    );
    const saco = state.ingredients.find((i) =>
      i.name.toLowerCase().includes('saco kraft')
    );
    const potinhos = state.ingredients.filter(
      (i) =>
        i.name.toLowerCase().includes('potinho') ||
        i.name.toLowerCase().includes('maionese da casa')
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
        for (const pot of potinhos) {
          if (!nextRecipe.some((r) => r.ingredientId === pot.id)) {
            nextRecipe.push({ ingredientId: pot.id, quantity: 1, group: 'embalagem' });
          }
        }
        return { ...p, recipe: nextRecipe };
      }),
    }));
  }

  function handleReplicatePackagingToAllBurgers() {
    if (!selectedProduct) return;
    const ingMap = new Map(state.ingredients.map((i) => [i.id, i]));
    const isPack = (r: RecipeItem) => {
      const ing = ingMap.get(r.ingredientId);
      return r.group === 'embalagem' || ing?.category === 'Embalagem';
    };
    const currentPackItems = selectedProduct.recipe
      .filter((r) => isPack(r))
      .map((r) => ({ ...r, group: 'embalagem' as const }));

    onUpdateState((prev) => ({
      ...prev,
      products: prev.products.map((p) => {
        if (p.category !== 'Hambúrgueres') return p;
        const foodOnly = p.recipe.filter((r) => !isPack(r));
        return {
          ...p,
          recipe: [...foodOnly, ...currentPackItems.map((item) => ({ ...item }))],
        };
      }),
    }));
  }

  function handleDuplicateProduct() {
    if (!selectedProduct) return;
    const copy: Product = {
      ...structuredClone(selectedProduct),
      id: `prod-${Date.now()}`,
      name: `${selectedProduct.name} (Cópia)`,
      shortName: `${selectedProduct.shortName} (Novo)`,
    };
    onUpdateState((prev) => ({
      ...prev,
      products: [...prev.products, copy],
    }));
    setSelectedId(copy.id);
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
      imageEmoji:
        newCategory === 'Bebidas'
          ? '🥤'
          : newCategory === 'Porções & Combos'
          ? '🍟'
          : newCategory === 'Sobremesas'
          ? '🍫'
          : '🍔',
      imageUrl: newImageUrl.trim() || undefined,
      availableInMenu: true,
      featured: newFeatured,
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
    setNewImageUrl('');
    setNewFeatured(false);
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
          <h1 className="text-xl font-semibold text-zinc-100">
            Fichas Técnicas & Fotos do Cardápio
          </h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            Composição de insumos, embalagens e fotos exibidas para os clientes no Cardápio Virtual.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowNewModal(true)}
          className="btn-monster-primary"
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
              className={`px-3 py-2 rounded-[8px] border text-left transition shrink-0 flex items-center gap-2.5 ${
                active
                  ? 'bg-[#18181c] border-orange-500/60 text-zinc-100'
                  : 'bg-[#121215] border-white/[0.08] text-zinc-400 hover:border-white/[0.16]'
              }`}
            >
              {prod.imageUrl ? (
                <img
                  src={prod.imageUrl}
                  alt={prod.shortName}
                  className="size-9 rounded-[6px] object-cover border border-white/[0.1] shrink-0"
                />
              ) : (
                <div className="size-9 rounded-[6px] bg-[#09090b] border border-white/[0.08] flex items-center justify-center text-base shrink-0">
                  {prod.imageEmoji}
                </div>
              )}
              <div>
                <div className="text-xs font-medium text-zinc-100">{prod.shortName || prod.name}</div>
                <div className="text-[11px] text-zinc-400 tabular-nums mt-0.5">
                  CMV: {formatBRL(m.totalCmv)} • Venda: {formatBRL(prod.practicedPrice)}
                </div>
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
                <div className="flex flex-wrap items-center gap-4 mt-1.5">
                  <label className="inline-flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
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
                      className="accent-orange-500"
                    />
                    Visível no Cardápio Online
                  </label>

                  <label className="inline-flex items-center gap-2 text-xs text-amber-400 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(selectedProduct.featured)}
                      onChange={(e) =>
                        onUpdateState((prev) => ({
                          ...prev,
                          products: prev.products.map((p) =>
                            p.id === selectedProduct.id
                              ? { ...p, featured: e.target.checked }
                              : p
                          ),
                        }))
                      }
                      className="accent-amber-500"
                    />
                    <Star className="size-3.5 fill-amber-400" /> Destacar como &ldquo;Mais Pedido&rdquo;
                  </label>
                </div>
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
                  onClick={handleDuplicateProduct}
                  className="btn-saas-secondary text-xs"
                  title="Duplicar Ficha Técnica"
                >
                  <Copy className="size-3.5 text-zinc-400" /> Duplicar
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
              <div className="w-full sm:w-44">
                <label className="text-xs text-zinc-400 block mb-1">
                  Seção na Ficha
                </label>
                <select
                  value={addGroupMode}
                  onChange={(e) =>
                    setAddGroupMode(e.target.value as 'auto' | 'alimento' | 'embalagem')
                  }
                  className="w-full bg-[#09090b] border border-white/[0.1] rounded-[6px] px-2.5 py-1.5 text-xs text-zinc-100"
                >
                  <option value="auto">Automático</option>
                  <option value="alimento">Alimentos (Receita)</option>
                  <option value="embalagem">Embalagens & Fixos</option>
                </select>
              </div>
              <div className="w-full sm:w-28">
                <label className="text-xs text-zinc-400 block mb-1">
                  Qtd ({state.ingredients.find((i) => i.id === addIngId)?.usageUnit || 'un'})
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
                <Plus className="size-3.5" /> Adicionar Insumo
              </button>
            </form>

            {/* Food Table */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-medium text-zinc-300">
                <span className="flex items-center gap-1.5">
                  <Utensils className="size-3.5 text-zinc-400" /> Alimentos
                  <span className="text-[11px] font-normal text-zinc-500">
                    (Arraste as linhas para organizar a ordem)
                  </span>
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
                    {foodItems.map((item, idx) => {
                      const isDragging = draggedIngId === item.ingredientId;
                      const isDragOver =
                        dragOverIngId === item.ingredientId &&
                        draggedIngId !== item.ingredientId;

                      return (
                        <tr
                          key={item.ingredientId}
                          draggable
                          onDragStart={(e) => {
                            setDraggedIngId(item.ingredientId);
                            e.dataTransfer.effectAllowed = 'move';
                          }}
                          onDragOver={(e) => {
                            e.preventDefault();
                            e.dataTransfer.dropEffect = 'move';
                            if (dragOverIngId !== item.ingredientId) {
                              setDragOverIngId(item.ingredientId);
                            }
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            if (draggedIngId) {
                              handleReorderRecipeItem(
                                draggedIngId,
                                item.ingredientId,
                                'alimento'
                              );
                            }
                            setDraggedIngId(null);
                            setDragOverIngId(null);
                          }}
                          onDragEnd={() => {
                            setDraggedIngId(null);
                            setDragOverIngId(null);
                          }}
                          className={`transition-colors ${
                            isDragging
                              ? 'opacity-40 bg-orange-500/10'
                              : isDragOver
                              ? 'bg-orange-500/15 border-t border-orange-500'
                              : 'hover:bg-white/[0.02]'
                          }`}
                        >
                          <td className="py-2 px-3 text-zinc-200">
                            <div className="flex items-center gap-2">
                              <span
                                className="cursor-grab active:cursor-grabbing text-zinc-500 hover:text-zinc-300"
                                title="Arraste para cima ou para baixo"
                              >
                                <GripVertical className="size-4" />
                              </span>
                              <span>{item.name}</span>
                            </div>
                          </td>
                          <td className="py-2 px-3 text-center">
                            <input
                              type="number"
                              step="any"
                              aria-label={`Quantidade de ${item.name}`}
                              value={item.quantity}
                              onMouseDown={(e) => e.stopPropagation()}
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
                            {formatBRL(item.unitCost, 4)}
                          </td>
                          <td className="py-2 px-3 text-right font-medium text-zinc-200">
                            {formatBRL(item.subtotal)}
                          </td>
                          <td className="py-2 px-2 text-center">
                            <div className="inline-flex items-center gap-0.5">
                              <button
                                type="button"
                                aria-label="Mover para cima"
                                disabled={idx === 0}
                                onClick={() =>
                                  handleMoveRecipeStep(item.ingredientId, -1, 'alimento')
                                }
                                className="text-zinc-500 hover:text-zinc-200 disabled:opacity-25 p-1"
                                title="Subir item"
                              >
                                <ArrowUp className="size-3.5" />
                              </button>
                              <button
                                type="button"
                                aria-label="Mover para baixo"
                                disabled={idx === foodItems.length - 1}
                                onClick={() =>
                                  handleMoveRecipeStep(item.ingredientId, 1, 'alimento')
                                }
                                className="text-zinc-500 hover:text-zinc-200 disabled:opacity-25 p-1"
                                title="Descer item"
                              >
                                <ArrowDown className="size-3.5" />
                              </button>
                              <button
                                type="button"
                                aria-label="Remover item"
                                onClick={() => handleRemoveRecipeItem(item.ingredientId)}
                                className="text-zinc-500 hover:text-rose-400 p-1"
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

            {/* Packaging Table */}
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-medium text-zinc-300">
                <span className="flex items-center gap-1.5">
                  <Package className="size-3.5 text-zinc-400" /> Embalagens & Itens Fixos (ex: Potinho Maionese)
                </span>
                <div className="flex items-center gap-3">
                  {selectedProduct.category === 'Hambúrgueres' && packagingItems.length > 0 && (
                    <button
                      type="button"
                      onClick={handleReplicatePackagingToAllBurgers}
                      className="text-[11px] px-2 py-0.5 rounded bg-orange-500/15 hover:bg-orange-500/25 text-orange-300 border border-orange-500/30 transition"
                      title="Copia esta lista de embalagens e acompanhamentos fixos para todos os hambúrgueres do cardápio"
                    >
                      Aplicar em Todos os Lanches
                    </button>
                  )}
                  <span className="tabular-nums">Subtotal: {formatBRL(metrics.packagingCost)}</span>
                </div>
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
                      packagingItems.map((item, idx) => {
                        const isDragging = draggedIngId === item.ingredientId;
                        const isDragOver =
                          dragOverIngId === item.ingredientId &&
                          draggedIngId !== item.ingredientId;

                        return (
                          <tr
                            key={item.ingredientId}
                            draggable
                            onDragStart={(e) => {
                              setDraggedIngId(item.ingredientId);
                              e.dataTransfer.effectAllowed = 'move';
                            }}
                            onDragOver={(e) => {
                              e.preventDefault();
                              e.dataTransfer.dropEffect = 'move';
                              if (dragOverIngId !== item.ingredientId) {
                                setDragOverIngId(item.ingredientId);
                              }
                            }}
                            onDrop={(e) => {
                              e.preventDefault();
                              if (draggedIngId) {
                                handleReorderRecipeItem(
                                  draggedIngId,
                                  item.ingredientId,
                                  'embalagem'
                                );
                              }
                              setDraggedIngId(null);
                              setDragOverIngId(null);
                            }}
                            onDragEnd={() => {
                              setDraggedIngId(null);
                              setDragOverIngId(null);
                            }}
                            className={`transition-colors ${
                              isDragging
                                ? 'opacity-40 bg-orange-500/10'
                                : isDragOver
                                ? 'bg-orange-500/15 border-t border-orange-500'
                                : 'hover:bg-white/[0.02]'
                            }`}
                          >
                            <td className="py-2 px-3 text-zinc-200">
                              <div className="flex items-center gap-2">
                                <span
                                  className="cursor-grab active:cursor-grabbing text-zinc-500 hover:text-zinc-300"
                                  title="Arraste para cima ou para baixo"
                                >
                                  <GripVertical className="size-4" />
                                </span>
                                <span>{item.name}</span>
                              </div>
                            </td>
                            <td className="py-2 px-3 text-center">
                              <input
                                type="number"
                                step="any"
                                aria-label={`Quantidade de ${item.name}`}
                                value={item.quantity}
                                onMouseDown={(e) => e.stopPropagation()}
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
                              <div className="inline-flex items-center gap-0.5">
                                <button
                                  type="button"
                                  aria-label="Mover para cima"
                                  disabled={idx === 0}
                                  onClick={() =>
                                    handleMoveRecipeStep(item.ingredientId, -1, 'embalagem')
                                  }
                                  className="text-zinc-500 hover:text-zinc-200 disabled:opacity-25 p-1"
                                  title="Subir item"
                                >
                                  <ArrowUp className="size-3.5" />
                                </button>
                                <button
                                  type="button"
                                  aria-label="Mover para baixo"
                                  disabled={idx === packagingItems.length - 1}
                                  onClick={() =>
                                    handleMoveRecipeStep(item.ingredientId, 1, 'embalagem')
                                  }
                                  className="text-zinc-500 hover:text-zinc-200 disabled:opacity-25 p-1"
                                  title="Descer item"
                                >
                                  <ArrowDown className="size-3.5" />
                                </button>
                                <button
                                  type="button"
                                  aria-label="Remover embalagem"
                                  onClick={() => handleRemoveRecipeItem(item.ingredientId)}
                                  className="text-zinc-500 hover:text-rose-400 p-1"
                                >
                                  <Trash2 className="size-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Right Column: Product Photo, Cardápio Details & Cost Summary */}
          <div className="space-y-4">
            {/* Photo & Cardápio Presentation Card */}
            <div className="bg-[#121215] border border-white/[0.08] rounded-[10px] p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-1.5">
                  <ImageIcon className="size-4 text-orange-400" /> Foto e Dados no Cardápio
                </h3>
              </div>

              {/* Photo Upload Box */}
              <div className="bg-[#18181c] border border-white/[0.08] rounded-[10px] p-3.5 flex items-center gap-4">
                {selectedProduct.imageUrl ? (
                  <img
                    src={selectedProduct.imageUrl}
                    alt={selectedProduct.shortName}
                    className="size-20 rounded-[10px] object-contain border border-orange-500/40 shrink-0 bg-[#09090b]"
                  />
                ) : (
                  <div className="size-20 rounded-[10px] bg-[#09090b] border border-dashed border-white/[0.15] flex flex-col items-center justify-center text-2xl shrink-0">
                    <span>{selectedProduct.imageEmoji}</span>
                    <span className="text-[10px] text-zinc-500 mt-0.5">Sem foto</span>
                  </div>
                )}

                <div className="space-y-2 flex-1 text-xs">
                  <label className="btn-monster-primary w-full cursor-pointer text-xs py-1.5">
                    <Camera className="size-3.5" />
                    <span>{selectedProduct.imageUrl ? 'Trocar Foto' : 'Enviar Foto do Lanche'}</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleProductPhotoUpload(e, 'existing')}
                      className="hidden"
                    />
                  </label>

                  {selectedProduct.imageUrl && (
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateState((prev) => ({
                          ...prev,
                          products: prev.products.map((p) =>
                            p.id === selectedProduct.id ? { ...p, imageUrl: undefined } : p
                          ),
                        }))
                      }
                      className="w-full py-1 text-[11px] text-rose-400 hover:underline text-center"
                    >
                      Remover foto atual
                    </button>
                  )}
                  <p className="text-[11px] text-zinc-500 leading-snug">
                    A foto é exibida inteira no cardápio e amplia quando o cliente toca nela.
                  </p>
                </div>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="text-zinc-400 block mb-1">Nome Comercial (Exibido no Cardápio)</label>
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
                    className="w-full bg-[#09090b] border border-white/[0.1] rounded-[6px] px-3 py-2 text-zinc-100"
                  />
                </div>

                <div>
                  <label className="text-zinc-400 block mb-1">Categoria no Cardápio</label>
                  <select
                    value={selectedProduct.category}
                    onChange={(e) =>
                      onUpdateState((prev) => ({
                        ...prev,
                        products: prev.products.map((p) =>
                          p.id === selectedProduct.id
                            ? { ...p, category: e.target.value as Product['category'] }
                            : p
                        ),
                      }))
                    }
                    className="w-full bg-[#09090b] border border-white/[0.1] rounded-[6px] px-3 py-2 text-zinc-100"
                  >
                    <option value="Hambúrgueres">Hambúrgueres</option>
                    <option value="Porções & Combos">Porções & Combos</option>
                    <option value="Bebidas">Bebidas</option>
                    <option value="Sobremesas">Sobremesas</option>
                  </select>
                </div>

                <div>
                  <label className="text-zinc-400 block mb-1">Descrição dos Ingredientes</label>
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
                    className="w-full bg-[#09090b] border border-white/[0.1] rounded-[6px] px-3 py-2 text-zinc-100"
                  />
                </div>
              </div>
            </div>

            {/* Financial Summary Card */}
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
                  <span className="text-zinc-300 font-medium">Preço Praticado (Cardápio)</span>
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
                  <p className="text-[11px] text-zinc-400">Lucro Líquido / Unid.</p>
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
          </div>
        </div>
      )}

      {/* New Product Modal with Photo Upload */}
      {showNewModal && (
        <div className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-4">
          <div className="bg-[#121215] border border-white/[0.12] rounded-[12px] max-w-md w-full p-5 space-y-4 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
              <h3 className="text-sm font-semibold text-zinc-100">Cadastrar Novo Produto</h3>
              <button
                type="button"
                aria-label="Fechar"
                onClick={() => setShowNewModal(false)}
                className="text-zinc-400 hover:text-zinc-200"
              >
                <X className="size-4" />
              </button>
            </div>
            <form onSubmit={handleCreateNewProduct} className="space-y-3.5 text-xs">
              {/* Photo Upload inside New Product Modal */}
              <div className="bg-[#18181c] border border-white/[0.08] rounded-[8px] p-3 flex items-center gap-3.5">
                {newImageUrl ? (
                  <img
                    src={newImageUrl}
                    alt="Prévia"
                    className="size-16 rounded-[8px] object-cover border border-orange-500/40 shrink-0"
                  />
                ) : (
                  <div className="size-16 rounded-[8px] bg-[#09090b] border border-dashed border-white/[0.15] flex items-center justify-center text-2xl shrink-0">
                    🍔
                  </div>
                )}
                <div className="space-y-1.5 flex-1">
                  <label className="btn-saas-secondary w-full cursor-pointer text-xs py-1.5">
                    <Camera className="size-3.5 text-orange-400" />
                    <span>{newImageUrl ? 'Trocar Foto do Produto' : 'Adicionar Foto do Produto'}</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleProductPhotoUpload(e, 'new')}
                      className="hidden"
                    />
                  </label>
                  <p className="text-[11px] text-zinc-500">
                    Tire foto ou escolha da galeria para exibir no cardápio.
                  </p>
                </div>
              </div>

              <div>
                <label className="text-zinc-400 block mb-1">Nome Interno (Ficha Técnica) *</label>
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
                <label className="text-zinc-400 block mb-1">Nome Comercial no Cardápio Online</label>
                <input
                  type="text"
                  value={newShortName}
                  onChange={(e) => setNewShortName(e.target.value)}
                  placeholder="Ex: Monster Duplo Bacon"
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
                <label className="text-zinc-400 block mb-1">Descrição dos Ingredientes</label>
                <textarea
                  rows={2}
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="Pão brioche selado na manteiga, 2 blends de 100g, queijo cheddar e bacon crocante..."
                  className="w-full bg-[#09090b] border border-white/[0.1] rounded-[6px] px-3 py-2 text-zinc-100"
                />
              </div>
              <label className="inline-flex items-center gap-2 text-xs text-amber-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={newFeatured}
                  onChange={(e) => setNewFeatured(e.target.checked)}
                  className="accent-amber-500"
                />
                Destacar como &ldquo;Mais Pedido&rdquo; no Cardápio
              </label>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewModal(false)}
                  className="btn-saas-secondary"
                >
                  Cancelar
                </button>
                <button type="submit" className="btn-monster-primary">
                  Criar Produto
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
