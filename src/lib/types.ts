export type UsageUnit = 'g' | 'ml' | 'un' | 'kg' | 'l';

export type IngredientCategory =
  | 'Proteína'
  | 'Panificação'
  | 'Queijos e Frios'
  | 'Molhos'
  | 'Hortifrúti e Conservas'
  | 'Acompanhamentos'
  | 'Bebidas'
  | 'Embalagem'
  | 'Óleos e Gorduras'
  | 'Outros';

export interface IngredientPricePoint {
  date: string;
  supplier: string;
  packagePrice: number;
  packageContent: number;
  unitCost: number;
  invoiceId?: string;
}

export interface Ingredient {
  id: string;
  name: string;
  category: IngredientCategory;
  purchasePackage: string; // ex: "Pacote 1kg", "Caixa (200 un)"
  packagePrice: number;    // ex: 34.00
  packageContent: number;  // ex: 1000
  usageUnit: UsageUnit;    // ex: "g", "un", "l"
  unitCost: number;        // packagePrice / packageContent
  priceHistory: IngredientPricePoint[];
}

export interface RecipeItem {
  ingredientId: string;
  quantity: number;
  group: 'alimento' | 'embalagem';
}

export type ProductCategory =
  | 'Hambúrgueres'
  | 'Bebidas'
  | 'Porções & Combos'
  | 'Sobremesas'
  | 'Acréscimos / Adicionais';

export type ProductMenuStatus = 'disponivel' | 'em_breve' | 'esgotado';

export interface Product {
  id: string;
  name: string;
  shortName: string;
  description: string;
  category: ProductCategory;
  channel: 'delivery' | 'geral';
  imageEmoji: string;
  imageUrl?: string;
  recipe: RecipeItem[];
  // Pricing config (% as decimal, e.g. 0.15 = 15%)
  fixedCostPct: number;
  taxPct: number;
  channelFeePct: number;
  targetMarginPct: number;
  practicedPrice: number;
  availableInMenu: boolean;
  featured?: boolean;
  menuStatus?: ProductMenuStatus;
  trackStock?: boolean;
  stockQty?: number | null;
}

export interface InvoiceItem {
  id: string;
  ingredientId?: string; // linked ingredient
  name: string;
  category: IngredientCategory;
  packageDescription: string;
  quantity: number;       // qtd de pacotes comprados
  contentPerPackage: number; // ex: 1000g por pacote
  usageUnit: UsageUnit;
  unitPrice: number;      // preço pago por pacote
  totalPrice: number;     // quantity * unitPrice
}

export interface PurchaseInvoice {
  id: string;
  date: string;           // YYYY-MM-DD
  supplier: string;       // local onde comprou
  invoiceNumber?: string;
  accessKey?: string;
  paymentMethod: 'PIX' | 'Boleto' | 'Cartão de Crédito' | 'Cartão de Débito' | 'Dinheiro';
  source: 'manual' | 'xml' | 'ia';
  items: InvoiceItem[];
  totalAmount: number;
  notes?: string;
}

export interface FixedCostItem {
  id: string;
  name: string;           // Água, Energia, Internet, Chip Celular, MEI DAS, Gasolina, Gás
  category: 'Utilidades' | 'Impostos Fixos (MEI)' | 'Logística / Gasolina' | 'Sistemas / Telefonia' | 'Outros';
  monthlyAmount: number;
  dueDay?: number;
  paid?: boolean;
}

export interface PaymentFeeConfig {
  pixFeePct: number;          // ex: 0% ou 0.0099 Mercado Pago
  debitCardFeePct: number;    // InfinitePay Débito ex: 1.37%
  creditCardFeePct: number;   // InfinitePay Crédito 1x ex: 3.15%
  paymentLinkFeePct: number;  // Link InfinitePay ex: 4.20%
  defaultChannelFeePct: number; // 3% da planilha
  meiMonthlyDas: number;      // ex: 75.60
  estimatedTaxPct: number;    // 2.5% da planilha
  defaultFixedCostPct: number;// 15% da planilha
  defaultTargetMarginPct: number; // 25% da planilha
  pixKey: string;
  pixBeneficiary: string;
  whatsappNumber: string;
  storeName: string;
  storeSubtitle: string;
  deliveryFeeDefault: number;
  estimatedDeliveryMinutes: string;
  storeOpen: boolean;
  dailyBurgerLimit?: number | null;
  adminPassword?: string;
  geminiApiKey?: string;
}

export interface OrderItemAddon {
  addonId: string;
  productId?: string;
  name: string;
  quantity: number;
  unitPrice: number;
  unitCmv: number;
}

export interface OrderItem {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  unitCmv: number;
  notes?: string;
  addons?: OrderItemAddon[];
}

export type OrderPaymentMethod =
  | 'PIX'
  | 'Cartão de Crédito (Na Entrega)'
  | 'Cartão de Débito (Na Entrega)'
  | 'Dinheiro'
  | 'PIX (Mercado Pago / Chave)'
  | 'Cartão na Entrega (Maquininha InfinitePay)';

export type OrderStatus =
  | 'Novo Pedido'
  | 'Em Preparo'
  | 'Saiu para Entrega'
  | 'Entregue'
  | 'Cancelado';

export interface SaleOrder {
  id: string;
  orderNumber: number;
  createdAt: string; // ISO string
  date: string;      // YYYY-MM-DD
  customerId: string;
  customerName: string;
  customerPhone: string;
  deliveryAddress: {
    street: string;
    number: string;
    neighborhood: string;
    complement?: string;
    reference?: string;
  };
  items: OrderItem[];
  subtotal: number;
  deliveryFee: number;
  totalAmount: number;
  totalCmv: number;
  paymentMethod: OrderPaymentMethod;
  changeFor?: string;
  paymentFeeAmount: number;
  taxReserveAmount: number;
  fixedCostAllocationAmount: number;
  netProfit: number;
  status: OrderStatus;
  origin: 'Cardápio Virtual' | 'Lançamento Manual PDV';
  customerNotes?: string;
}

export interface CustomerActivity {
  id: string;
  timestamp: string;
  type: 'acesso_cardapio' | 'pedido_realizado' | 'item_favorito' | 'observacao_admin';
  description: string;
  orderId?: string;
  totalValue?: number;
}

export interface CustomerProfile {
  id: string;
  phone: string; // normalized digits only e.g. 86999998888
  name: string;
  createdAt: string;
  lastSeenAt: string;
  lastOrderAt?: string;
  addresses: {
    street: string;
    number: string;
    neighborhood: string;
    complement?: string;
    reference?: string;
  }[];
  totalOrders: number;
  totalSpent: number;
  averageTicket: number;
  preferredPaymentMethod?: OrderPaymentMethod;
  itemFrequency: Record<string, { productName: string; count: number; totalSpent: number }>;
  tags: string[]; // ex: ["VIP", "Fã de Costela", "Pede Finais de Semana"]
  adminNotes?: string;
  giftHistory: {
    date: string;
    giftDescription: string;
  }[];
  activities: CustomerActivity[];
}

export interface AppDatabaseState {
  ingredients: Ingredient[];
  products: Product[];
  invoices: PurchaseInvoice[];
  fixedCosts: FixedCostItem[];
  orders: SaleOrder[];
  customers: CustomerProfile[];
  settings: PaymentFeeConfig;
  updatedAt: string;
}
