import { Ingredient, Product } from './types';

export interface ProductCostBreakdown {
  foodCost: number;
  packagingCost: number;
  totalCmv: number;
  suggestedPrice: number;
  practicedPrice: number;
  fixedCostAmount: number;
  taxAmount: number;
  channelFeeAmount: number;
  totalDeductionsPct: number;
  totalDeductionsAmount: number;
  netProfit: number;
  realMarginPct: number;
  markupDivisor: number;
  itemsDetailed: {
    ingredientId: string;
    name: string;
    quantity: number;
    usageUnit: string;
    unitCost: number;
    subtotal: number;
    group: 'alimento' | 'embalagem';
  }[];
}

export function calculateProductMetrics(
  product: Product,
  ingredients: Ingredient[]
): ProductCostBreakdown {
  const ingMap = new Map(ingredients.map((i) => [i.id, i]));

  let foodCost = 0;
  let packagingCost = 0;
  const itemsDetailed: ProductCostBreakdown['itemsDetailed'] = [];

  for (const item of product.recipe) {
    const ing = ingMap.get(item.ingredientId);
    const unitCost = ing ? ing.packagePrice / (ing.packageContent || 1) : 0;
    const subtotal = item.quantity * unitCost;

    if (item.group === 'embalagem' || ing?.category === 'Embalagem') {
      packagingCost += subtotal;
    } else {
      foodCost += subtotal;
    }

    itemsDetailed.push({
      ingredientId: item.ingredientId,
      name: ing?.name ?? 'Insumo removido',
      quantity: item.quantity,
      usageUnit: ing?.usageUnit ?? 'un',
      unitCost,
      subtotal,
      group: item.group,
    });
  }

  const totalCmv = foodCost + packagingCost;

  // Markup Divisor = 1 - (Custos Fixos% + Impostos% + Taxa Canal% + Margem Alvo%)
  const sumPctForMarkup =
    product.fixedCostPct +
    product.taxPct +
    product.channelFeePct +
    product.targetMarginPct;

  const markupDivisor = Math.max(0.01, 1 - sumPctForMarkup);
  const suggestedPrice = totalCmv / markupDivisor;

  const practicedPrice = product.practicedPrice;
  const fixedCostAmount = practicedPrice * product.fixedCostPct;
  const taxAmount = practicedPrice * product.taxPct;
  const channelFeeAmount = practicedPrice * product.channelFeePct;

  const totalDeductionsPct =
    product.fixedCostPct + product.taxPct + product.channelFeePct;
  const totalDeductionsAmount =
    fixedCostAmount + taxAmount + channelFeeAmount;

  // Lucro Líquido (R$): Preço Praticado - Deduções Percentuais (Fixos + Impostos + Taxas) - CMV
  const netProfit = practicedPrice - totalDeductionsAmount - totalCmv;
  // Margem Real (%): Lucro Líquido ÷ Preço Praticado
  const realMarginPct = practicedPrice > 0 ? netProfit / practicedPrice : 0;

  return {
    foodCost,
    packagingCost,
    totalCmv,
    suggestedPrice,
    practicedPrice,
    fixedCostAmount,
    taxAmount,
    channelFeeAmount,
    totalDeductionsPct,
    totalDeductionsAmount,
    netProfit,
    realMarginPct,
    markupDivisor,
    itemsDetailed,
  };
}

export function formatBRL(value: number, decimals = 2): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(Number.isFinite(value) ? value : 0);
}

export function formatPct(value: number, decimals = 1): string {
  return `${((Number.isFinite(value) ? value : 0) * 100).toFixed(decimals)}%`;
}

export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '');
}

export function formatPhoneBR(phone: string): string {
  const digits = normalizePhone(phone);
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return phone;
}
