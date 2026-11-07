import {
  FixedCostItem,
  Ingredient,
  PaymentFeeConfig,
  Product,
  SaleOrder,
} from './types';

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

export interface OrderFinancialBreakdown {
  totalAmount: number;
  totalCmv: number;
  taxReserveAmount: number;
  deliveryFeeReserveAmount: number;
  cardMachineFeeAmount: number;
  fixedCostAllocationAmount: number;
  baseNetProfit: number;
}

export function calculateOrderFinancials(
  order: Pick<
    SaleOrder,
    'items' | 'subtotal' | 'deliveryFee' | 'totalAmount' | 'totalCmv' | 'paymentMethod'
  >,
  products: Product[],
  ingredients: Ingredient[],
  settings: PaymentFeeConfig
): OrderFinancialBreakdown {
  const prodMap = new Map(products.map((p) => [p.id, p]));
  let itemsCmv = 0;
  let taxReserveAmount = 0;
  let deliveryFeeReserveAmount = 0;
  let fixedCostAllocationAmount = 0;

  for (const item of order.items) {
    const product = prodMap.get(item.productId);
    const qty = Number(item.quantity) || 0;
    const itemRev = (Number(item.unitPrice) || 0) * qty;

    const unitCmv =
      item.unitCmv !== undefined && item.unitCmv > 0
        ? item.unitCmv
        : product
        ? calculateProductMetrics(product, ingredients).totalCmv
        : 0;
    itemsCmv += unitCmv * qty;

    const taxPct = product ? product.taxPct : settings.estimatedTaxPct;
    const deliveryFeePct = product ? product.channelFeePct : settings.defaultChannelFeePct;
    const fixedPct = product ? product.fixedCostPct : settings.defaultFixedCostPct;

    taxReserveAmount += itemRev * taxPct;
    deliveryFeeReserveAmount += itemRev * deliveryFeePct;
    fixedCostAllocationAmount += itemRev * fixedPct;
  }

  // Se houver taxa de entrega avulsa cobrada no pedido, ela também compõe a verba do entregador
  if ((order.deliveryFee || 0) > 0) {
    deliveryFeeReserveAmount += order.deliveryFee;
  }

  let cardFeePct = 0;
  if (
    order.paymentMethod === 'PIX' ||
    order.paymentMethod === 'PIX (Mercado Pago / Chave)'
  ) {
    cardFeePct = settings.pixFeePct || 0;
  } else if (
    order.paymentMethod === 'Cartão de Crédito (Na Entrega)' ||
    order.paymentMethod === 'Cartão na Entrega (Maquininha InfinitePay)'
  ) {
    cardFeePct = settings.creditCardFeePct || 0;
  } else if (order.paymentMethod === 'Cartão de Débito (Na Entrega)') {
    cardFeePct = settings.debitCardFeePct || 0;
  }

  const totalAmount = order.totalAmount || order.subtotal || 0;
  const cardMachineFeeAmount = totalAmount * cardFeePct;
  const totalCmv = itemsCmv > 0 ? itemsCmv : order.totalCmv || 0;

  const baseNetProfit =
    totalAmount -
    totalCmv -
    taxReserveAmount -
    deliveryFeeReserveAmount -
    cardMachineFeeAmount -
    fixedCostAllocationAmount;

  return {
    totalAmount,
    totalCmv,
    taxReserveAmount,
    deliveryFeeReserveAmount,
    cardMachineFeeAmount,
    fixedCostAllocationAmount,
    baseNetProfit,
  };
}

export interface PeriodFinancialSummary {
  grossRevenue: number;
  totalSalesCmv: number;
  totalTaxReserve: number;
  totalDeliveryDriverReserve: number;
  totalCardMachineFee: number;
  rawFixedCostReserve: number;
  effectiveFixedCost: number;
  fixedCostOverflowToProfit: number;
  baseNetProfit: number;
  realNetProfit: number;
  totalMonthlyFixedTarget: number;
  totalMonthFixedAccumulated: number;
  fixedCostCoveragePct: number;
  isFixedCostFullyPaid: boolean;
  missingToPayFixedCosts: number;
}

export function calculatePeriodFinancialSummary(
  periodOrders: SaleOrder[],
  products: Product[],
  ingredients: Ingredient[],
  fixedCosts: FixedCostItem[],
  settings: PaymentFeeConfig,
  priorFixedCostAccumulated = 0
): PeriodFinancialSummary {
  const validOrders = periodOrders.filter((o) => o.status !== 'Cancelado');

  let grossRevenue = 0;
  let totalSalesCmv = 0;
  let totalTaxReserve = 0;
  let totalDeliveryDriverReserve = 0;
  let totalCardMachineFee = 0;
  let rawFixedCostReserve = 0;
  let baseNetProfit = 0;

  for (const ord of validOrders) {
    const fin = calculateOrderFinancials(ord, products, ingredients, settings);
    grossRevenue += fin.totalAmount;
    totalSalesCmv += fin.totalCmv;
    totalTaxReserve += fin.taxReserveAmount;
    totalDeliveryDriverReserve += fin.deliveryFeeReserveAmount;
    totalCardMachineFee += fin.cardMachineFeeAmount;
    rawFixedCostReserve += fin.fixedCostAllocationAmount;
    baseNetProfit += fin.baseNetProfit;
  }

  const totalMonthlyFixedTarget = fixedCosts.reduce(
    (acc, fc) => acc + (Number(fc.monthlyAmount) || 0),
    0
  );

  const remainingTargetBeforePeriod = Math.max(
    0,
    totalMonthlyFixedTarget - priorFixedCostAccumulated
  );

  const effectiveFixedCost =
    totalMonthlyFixedTarget > 0
      ? Math.min(rawFixedCostReserve, remainingTargetBeforePeriod)
      : rawFixedCostReserve;

  const fixedCostOverflowToProfit =
    totalMonthlyFixedTarget > 0
      ? Math.max(0, rawFixedCostReserve - remainingTargetBeforePeriod)
      : 0;

  const realNetProfit = baseNetProfit + fixedCostOverflowToProfit;

  const totalMonthFixedAccumulated = priorFixedCostAccumulated + rawFixedCostReserve;
  const fixedCostCoveragePct =
    totalMonthlyFixedTarget > 0
      ? Math.min(1, totalMonthFixedAccumulated / totalMonthlyFixedTarget)
      : 1;
  const isFixedCostFullyPaid =
    totalMonthlyFixedTarget > 0 && totalMonthFixedAccumulated >= totalMonthlyFixedTarget;
  const missingToPayFixedCosts = Math.max(
    0,
    totalMonthlyFixedTarget - totalMonthFixedAccumulated
  );

  return {
    grossRevenue,
    totalSalesCmv,
    totalTaxReserve,
    totalDeliveryDriverReserve,
    totalCardMachineFee,
    rawFixedCostReserve,
    effectiveFixedCost,
    fixedCostOverflowToProfit,
    baseNetProfit,
    realNetProfit,
    totalMonthlyFixedTarget,
    totalMonthFixedAccumulated,
    fixedCostCoveragePct,
    isFixedCostFullyPaid,
    missingToPayFixedCosts,
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
