'use client';

import { formatBRL, formatPhoneBR, normalizePhone } from '@/lib/pricing';
import { OrderPaymentMethod } from '@/lib/types';
import {
  Check,
  ChevronRight,
  Clock,
  Copy,
  CreditCard,
  MapPin,
  MessageCircle,
  Minus,
  Motorbike,
  Phone,
  Plus,
  QrCode,
  Search,
  ShoppingBag,
  Sparkles,
  Star,
  Store,
  UtensilsCrossed,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

interface PublicMenuItem {
  id: string;
  name: string;
  description: string;
  category: 'Hambúrgueres' | 'Bebidas' | 'Porções & Combos' | 'Sobremesas';
  imageEmoji: string;
  price: number;
  featured: boolean;
}

interface PublicStoreInfo {
  storeName: string;
  storeSubtitle: string;
  deliveryFeeDefault: number;
  estimatedDeliveryMinutes: string;
  storeOpen: boolean;
  pixKey: string;
  pixBeneficiary: string;
  whatsappNumber: string;
}

interface RecognizedCustomer {
  name: string;
  phone: string;
  lastAddress: {
    street: string;
    number: string;
    neighborhood: string;
    complement?: string;
    reference?: string;
  } | null;
  preferredPaymentMethod: OrderPaymentMethod;
  totalOrders: number;
  favoriteItemIds: string[];
}

export default function CardapioVirtualPage() {
  const [store, setStore] = useState<PublicStoreInfo | null>(null);
  const [menu, setMenu] = useState<PublicMenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string>('Todos');
  const [searchTerm, setSearchTerm] = useState('');

  // Cart: productId -> { quantity, notes }
  const [cart, setCart] = useState<Record<string, { quantity: number; notes: string }>>({});
  const [bagOpen, setBagOpen] = useState(false);

  // Customer identification
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [recognized, setRecognized] = useState<RecognizedCustomer | null>(null);
  const [checkingPhone, setCheckingPhone] = useState(false);

  // Address
  const [street, setStreet] = useState('');
  const [number, setNumber] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [complement, setComplement] = useState('');
  const [reference, setReference] = useState('');

  // Payment & notes
  const [paymentMethod, setPaymentMethod] = useState<OrderPaymentMethod>('PIX (Mercado Pago / Chave)');
  const [customerNotes, setCustomerNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Completed order
  const [completedOrder, setCompletedOrder] = useState<{
    orderNumber: number;
    customerName: string;
    totalAmount: number;
    paymentMethod: OrderPaymentMethod;
    infinitePayLink?: string;
    pixKey: string;
    pixBeneficiary: string;
    whatsappNumber: string;
    estimatedDeliveryMinutes: string;
  } | null>(null);
  const [copiedPix, setCopiedPix] = useState(false);

  useEffect(() => {
    fetch('/api/public/menu')
      .then((r) => r.json())
      .then((data) => {
        if (data.store) setStore(data.store);
        if (data.menu) setMenu(data.menu);
      })
      .finally(() => setLoading(false));

    const savedPhone = localStorage.getItem('burger_customer_phone');
    if (savedPhone) {
      setPhone(savedPhone);
      lookupCustomerByPhone(savedPhone);
    }
  }, []);

  async function lookupCustomerByPhone(rawPhone: string) {
    const digits = normalizePhone(rawPhone);
    if (digits.length < 10) {
      setRecognized(null);
      return;
    }
    setCheckingPhone(true);
    try {
      const res = await fetch(`/api/public/menu?phone=${encodeURIComponent(digits)}`);
      const data = await res.json();
      if (data.found && data.customer) {
        const c = data.customer as RecognizedCustomer;
        setRecognized(c);
        setName(c.name);
        if (c.lastAddress) {
          setStreet(c.lastAddress.street || '');
          setNumber(c.lastAddress.number || '');
          setNeighborhood(c.lastAddress.neighborhood || '');
          setComplement(c.lastAddress.complement || '');
          setReference(c.lastAddress.reference || '');
        }
        if (c.preferredPaymentMethod) {
          setPaymentMethod(c.preferredPaymentMethod);
        }
      } else {
        setRecognized(null);
      }
    } catch {
      // ignore
    } finally {
      setCheckingPhone(false);
    }
  }

  function handlePhoneChange(val: string) {
    setPhone(val);
    const digits = normalizePhone(val);
    if (digits.length >= 10) {
      lookupCustomerByPhone(digits);
    } else {
      setRecognized(null);
    }
  }

  function addToCart(productId: string, delta: number) {
    setCart((prev) => {
      const current = prev[productId]?.quantity || 0;
      const nextQty = Math.max(0, current + delta);
      if (nextQty === 0) {
        const clone = { ...prev };
        delete clone[productId];
        return clone;
      }
      return {
        ...prev,
        [productId]: {
          quantity: nextQty,
          notes: prev[productId]?.notes || '',
        },
      };
    });
  }

  const cartItemsList = useMemo(() => {
    return Object.entries(cart)
      .map(([productId, info]) => {
        const item = menu.find((m) => m.id === productId);
        if (!item) return null;
        return {
          ...item,
          quantity: info.quantity,
          notes: info.notes,
          subtotal: item.price * info.quantity,
        };
      })
      .filter(Boolean) as (PublicMenuItem & { quantity: number; notes: string; subtotal: number })[];
  }, [cart, menu]);

  const totalCartItems = cartItemsList.reduce((acc, i) => acc + i.quantity, 0);
  const subtotalAmount = cartItemsList.reduce((acc, i) => acc + i.subtotal, 0);
  const deliveryFee = store?.deliveryFeeDefault || 0;
  const totalOrderAmount = subtotalAmount + deliveryFee;

  const categories = useMemo(() => {
    const cats = Array.from(new Set(menu.map((m) => m.category)));
    return ['Todos', ...cats];
  }, [menu]);

  const filteredMenu = useMemo(() => {
    return menu.filter((m) => {
      const matchCat = selectedCategory === 'Todos' || m.category === selectedCategory;
      const matchSearch =
        !searchTerm.trim() ||
        m.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        m.description.toLowerCase().includes(searchTerm.toLowerCase());
      return matchCat && matchSearch;
    });
  }, [menu, selectedCategory, searchTerm]);

  async function handleSubmitOrder(e: React.FormEvent) {
    e.preventDefault();
    if (cartItemsList.length === 0) return;

    setSubmitting(true);
    try {
      localStorage.setItem('burger_customer_phone', normalizePhone(phone));
      const res = await fetch('/api/public/menu', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: name,
          customerPhone: phone,
          address: {
            street,
            number,
            neighborhood,
            complement,
            reference,
          },
          items: cartItemsList.map((i) => ({
            productId: i.id,
            quantity: i.quantity,
            notes: i.notes,
          })),
          paymentMethod,
          customerNotes,
        }),
      });
      const data = await res.json();
      if (data.ok && data.order) {
        setCompletedOrder(data.order);
        setCart({});
        setBagOpen(false);
      } else {
        alert(data.error || 'Verifique as informações preenchidas.');
      }
    } catch {
      alert('Erro ao enviar pedido.');
    } finally {
      setSubmitting(false);
    }
  }

  function buildWhatsAppConfirmationLink() {
    if (!completedOrder) return '#';
    const text = `🍔 *PEDIDO #${completedOrder.orderNumber}*\n*Cliente:* ${completedOrder.customerName}\n*Telefone:* ${formatPhoneBR(phone)}\n*Total:* ${formatBRL(completedOrder.totalAmount)}\n*Forma de Pagamento:* ${completedOrder.paymentMethod}\n*Endereço:* ${street}, ${number} - ${neighborhood}${complement ? ` (${complement})` : ''}\n${customerNotes ? `*Observação:* ${customerNotes}` : ''}`;
    const targetPhone = normalizePhone(completedOrder.whatsappNumber || '5586999999999');
    return `https://wa.me/${targetPhone}?text=${encodeURIComponent(text)}`;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#09090b] text-zinc-400 flex items-center justify-center text-xs">
        Carregando cardápio...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100 pb-28">
      {/* iFood-Style Store Header with Monster Burger Visual Identity */}
      <header className="border-b border-white/[0.08] bg-[#121215]">
        {/* Banner strip */}
        <div className="h-28 sm:h-36 bg-gradient-to-r from-orange-950 via-[#1c120c] to-[#09090b] relative overflow-hidden">
          <div className="absolute inset-0 opacity-25 bg-[radial-gradient(#ff5400_1px,transparent_1px)] [background-size:16px_16px]" />
          <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-gradient-to-l from-orange-500/10 to-transparent pointer-events-none" />
        </div>

        {/* Store Profile Info */}
        <div className="max-w-4xl mx-auto px-4 -mt-10 sm:-mt-12 pb-4 relative">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div className="flex items-end gap-3.5">
              <img
                src="/logo.jpg"
                alt="Monster Burger"
                className="size-20 sm:size-24 rounded-2xl bg-black border-2 border-orange-500/40 shadow-2xl object-cover shrink-0"
              />
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h1 className="text-xl sm:text-2xl font-bold text-zinc-100 tracking-tight">
                    {store?.storeName || 'Monster Burger'}
                  </h1>
                </div>
                <p className="text-xs text-zinc-400 line-clamp-1">
                  {store?.storeSubtitle || 'Smash Burger Artesanal • Delivery Rápido'}
                </p>
                <div className="flex flex-wrap items-center gap-3 text-xs pt-1">
                  <span className="flex items-center gap-1 font-semibold text-amber-400">
                    <Star className="size-3.5 fill-amber-400" /> 4.9
                  </span>
                  <span className="text-zinc-500">•</span>
                  <span className="flex items-center gap-1 text-zinc-300">
                    <Clock className="size-3.5 text-zinc-400" />
                    {store?.estimatedDeliveryMinutes || '30-45 min'}
                  </span>
                  <span className="text-zinc-500">•</span>
                  <span className="text-zinc-300">
                    {deliveryFee === 0 ? (
                      <span className="text-emerald-400 font-medium">Entrega Grátis</span>
                    ) : (
                      `Taxa: ${formatBRL(deliveryFee)}`
                    )}
                  </span>
                  <span className="text-zinc-500">•</span>
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${
                      store?.storeOpen
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                    }`}
                  >
                    <span className="size-1.5 rounded-full bg-current" />
                    {store?.storeOpen ? 'Aberto' : 'Fechado'}
                  </span>
                </div>
              </div>
            </div>

            {/* Quick Phone Recognition Chip (1-click without creating password) */}
            <div className="bg-[#18181c] border border-white/[0.08] rounded-[10px] p-2.5 sm:w-72">
              <div className="flex items-center justify-between text-[11px] text-zinc-400 mb-1">
                <span>{recognized ? `Cliente: ${recognized.name}` : 'Já pediu antes?'}</span>
                {checkingPhone && <span className="text-zinc-400">Buscando...</span>}
              </div>
              <div className="relative">
                <Phone className="size-3 text-zinc-500 absolute left-2.5 top-2" />
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => handlePhoneChange(e.target.value)}
                  placeholder="Seu WhatsApp (86) 99999-9999"
                  className="w-full pl-7 pr-2.5 py-1 bg-[#09090b] border border-white/[0.08] focus-visible:border-zinc-400 rounded-[6px] text-xs text-zinc-100 placeholder-zinc-500 outline-none tabular-nums"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Search bar inside header */}
        <div className="max-w-4xl mx-auto px-4 pb-3">
          <div className="relative">
            <Search className="size-4 text-zinc-400 absolute left-3.5 top-2.5" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar no cardápio..."
              className="w-full pl-10 pr-4 py-2 bg-[#18181c] border border-white/[0.08] focus-visible:border-zinc-300 rounded-[8px] text-xs text-zinc-100 placeholder-zinc-500 outline-none"
            />
          </div>
        </div>

        {/* Sticky iFood Categories Strip */}
        <div className="border-t border-white/[0.06] bg-[#121215]/95 sticky top-0 z-20 backdrop-blur-md">
          <div className="max-w-4xl mx-auto px-4 flex items-center gap-2 overflow-x-auto py-2.5">
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition ${
                  selectedCategory === cat
                    ? 'bg-[#ff5400] text-white shadow-sm shadow-orange-500/25'
                    : 'bg-[#18181c] text-zinc-400 hover:text-zinc-200 border border-white/[0.06]'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Main Menu Body */}
      <main className="max-w-4xl mx-auto px-4 pt-5 space-y-6">
        {/* Completed Order Notification Banner */}
        {completedOrder && (
          <div className="bg-[#121215] border-2 border-emerald-500/40 rounded-[12px] p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider">
                  Pedido Confirmado #{completedOrder.orderNumber}
                </span>
                <h2 className="text-base font-semibold text-zinc-100">
                  Tudo certo, {completedOrder.customerName}!
                </h2>
              </div>
              <button
                type="button"
                aria-label="Fechar comprovante"
                onClick={() => setCompletedOrder(null)}
                className="text-zinc-400 hover:text-zinc-200 p-1"
              >
                <X className="size-4" />
              </button>
            </div>

            <p className="text-xs text-zinc-400">
              Seu pedido já foi enviado para a cozinha. Tempo estimado:{' '}
              <strong className="text-zinc-200">{completedOrder.estimatedDeliveryMinutes}</strong>.
            </p>

            {completedOrder.paymentMethod === 'PIX (Mercado Pago / Chave)' && (
              <div className="bg-[#18181c] border border-white/[0.08] rounded-[8px] p-3 space-y-2 text-xs">
                <div className="flex items-center gap-1.5 text-zinc-200 font-medium">
                  <QrCode className="size-4 text-emerald-400" />
                  <span>Chave PIX para pagamento: {formatBRL(completedOrder.totalAmount)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <code className="flex-1 bg-[#09090b] px-3 py-1.5 rounded-[6px] text-xs font-mono text-zinc-200 truncate select-all">
                    {completedOrder.pixKey}
                  </code>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(completedOrder.pixKey);
                      setCopiedPix(true);
                      setTimeout(() => setCopiedPix(false), 2000);
                    }}
                    className="btn-saas-secondary text-xs"
                  >
                    {copiedPix ? <Check className="size-3.5 text-emerald-400" /> : <Copy className="size-3.5" />}
                    {copiedPix ? 'Copiado' : 'Copiar'}
                  </button>
                </div>
              </div>
            )}

            {completedOrder.paymentMethod === 'Link de Pagamento (InfinitePay)' && (
              <div className="bg-[#18181c] border border-white/[0.08] rounded-[8px] p-3 text-xs space-y-1">
                <span className="font-medium text-zinc-200 flex items-center gap-1.5">
                  <CreditCard className="size-4 text-zinc-400" /> Link de Pagamento InfinitePay
                </span>
                <p className="text-zinc-400 text-[11px] break-all font-mono">
                  {completedOrder.infinitePayLink}
                </p>
              </div>
            )}

            {completedOrder.paymentMethod === 'Cartão na Entrega (Maquininha InfinitePay)' && (
              <div className="bg-[#18181c] border border-white/[0.08] rounded-[8px] p-3 text-xs text-zinc-300">
                💳 <strong>Cartão na Entrega:</strong> Levamos a maquininha InfinitePay até o seu endereço. Valor: <strong>{formatBRL(completedOrder.totalAmount)}</strong>.
              </div>
            )}

            <a
              href={buildWhatsAppConfirmationLink()}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center gap-2 w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-[8px] text-xs font-semibold"
            >
              <MessageCircle className="size-4" />
              Acompanhar Pedido no WhatsApp
            </a>
          </div>
        )}

        {/* iFood-Style Product Cards List */}
        <div className="space-y-3">
          {filteredMenu.map((item) => {
            const qtyInCart = cart[item.id]?.quantity || 0;

            return (
              <div
                key={item.id}
                className="bg-[#121215] border border-white/[0.08] hover:border-white/[0.14] rounded-[10px] p-4 flex items-center justify-between gap-4 transition"
              >
                {/* Left: Product Information */}
                <div className="space-y-1.5 flex-1 pr-2">
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-semibold text-zinc-100">{item.name}</h2>
                    {item.featured && (
                      <span className="px-1.5 py-0.2 rounded text-[10px] font-medium text-amber-400 bg-amber-500/10 border border-amber-500/20">
                        Mais Pedido
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-zinc-400 line-clamp-2 leading-relaxed">
                    {item.description}
                  </p>
                  <p className="text-sm font-semibold text-zinc-100 tabular-nums pt-1">
                    {formatBRL(item.price)}
                  </p>
                </div>

                {/* Right: Thumbnail with Quantity Selector */}
                <div className="flex flex-col items-center gap-2 shrink-0">
                  <div className="size-20 rounded-[8px] bg-[#18181c] border border-white/[0.08] flex items-center justify-center text-3xl">
                    {item.imageEmoji}
                  </div>

                  {qtyInCart > 0 ? (
                    <div className="flex items-center gap-1.5 bg-[#18181c] border border-white/[0.12] rounded-[6px] p-0.5">
                      <button
                        type="button"
                        aria-label={`Diminuir ${item.name}`}
                        onClick={() => addToCart(item.id, -1)}
                        className="size-6 rounded bg-[#09090b] text-zinc-200 text-xs flex items-center justify-center"
                      >
                        <Minus className="size-3" />
                      </button>
                      <span className="w-5 text-center text-xs font-semibold text-zinc-100 tabular-nums">
                        {qtyInCart}
                      </span>
                      <button
                        type="button"
                        aria-label={`Aumentar ${item.name}`}
                        onClick={() => addToCart(item.id, 1)}
                        className="size-6 rounded bg-[#ff5400] hover:bg-[#ea4b00] text-white text-xs flex items-center justify-center transition"
                      >
                        <Plus className="size-3" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => addToCart(item.id, 1)}
                      className="px-3 py-1 bg-[#18181c] hover:bg-[#ff5400] hover:text-white border border-white/[0.1] text-zinc-200 text-xs font-medium rounded-[6px] flex items-center gap-1 transition"
                    >
                      <Plus className="size-3" /> Adicionar
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </main>

      {/* iFood-Style Sticky Bottom Bag Bar ("Ver Sacola") */}
      {totalCartItems > 0 && (
        <div className="fixed bottom-0 inset-x-0 bg-[#121215]/95 border-t border-white/[0.08] p-3 z-40 backdrop-blur-md">
          <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="size-8 rounded-full bg-[#ff5400] text-white text-xs font-bold flex items-center justify-center tabular-nums shadow-sm shadow-orange-500/30">
                {totalCartItems}
              </span>
              <div>
                <p className="text-[11px] text-zinc-400">Total com entrega</p>
                <p className="text-base font-semibold text-zinc-100 tabular-nums">
                  {formatBRL(totalOrderAmount)}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setBagOpen(true)}
              className="px-6 py-2.5 bg-[#ff5400] hover:bg-[#ea4b00] text-white font-semibold rounded-[8px] text-xs flex items-center gap-2 shadow-lg shadow-orange-500/25 transition active:scale-95"
            >
              <ShoppingBag className="size-4" />
              Ver sacola
              <ChevronRight className="size-4" />
            </button>
          </div>
        </div>
      )}

      {/* iFood-Style Bag / Checkout Drawer */}
      {bagOpen && (
        <div className="fixed inset-0 bg-black/75 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-[#121215] border border-white/[0.12] w-full max-w-lg rounded-t-2xl sm:rounded-2xl max-h-[92vh] overflow-y-auto p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
              <div className="flex items-center gap-2">
                <ShoppingBag className="size-4 text-[#ff5400]" />
                <h2 className="text-sm font-semibold text-zinc-100">Sua Sacola</h2>
              </div>
              <button
                type="button"
                aria-label="Fechar sacola"
                onClick={() => setBagOpen(false)}
                className="text-zinc-400 hover:text-zinc-200 p-1"
              >
                <X className="size-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitOrder} className="space-y-4 text-xs">
              {/* Items in cart */}
              <div className="space-y-2 border-b border-white/[0.08] pb-3 tabular-nums">
                {cartItemsList.map((item) => (
                  <div key={item.id} className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-zinc-100">{item.name}</p>
                      <p className="text-[11px] text-zinc-400">
                        {item.quantity}x {formatBRL(item.price)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        aria-label="Diminuir"
                        onClick={() => addToCart(item.id, -1)}
                        className="size-6 rounded bg-[#18181c] border border-white/[0.08] text-zinc-300 flex items-center justify-center"
                      >
                        <Minus className="size-3" />
                      </button>
                      <span className="w-4 text-center font-medium">{item.quantity}</span>
                      <button
                        type="button"
                        aria-label="Aumentar"
                        onClick={() => addToCart(item.id, 1)}
                        className="size-6 rounded bg-[#18181c] border border-white/[0.08] text-zinc-300 flex items-center justify-center"
                      >
                        <Plus className="size-3" />
                      </button>
                      <span className="font-semibold text-zinc-100 w-16 text-right">
                        {formatBRL(item.subtotal)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Customer Contact */}
              <div className="bg-[#18181c] border border-white/[0.06] rounded-[8px] p-3 space-y-2.5">
                <p className="font-medium text-zinc-200">1. Dados do Pedido</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="text-zinc-400 block mb-1">WhatsApp / Telefone *</label>
                    <input
                      type="tel"
                      required
                      value={phone}
                      onChange={(e) => handlePhoneChange(e.target.value)}
                      placeholder="(86) 99999-9999"
                      className="w-full bg-[#09090b] border border-white/[0.1] rounded-[6px] px-3 py-1.5 text-zinc-100 tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="text-zinc-400 block mb-1">Seu Nome *</label>
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Ex: João da Silva"
                      className="w-full bg-[#09090b] border border-white/[0.1] rounded-[6px] px-3 py-1.5 text-zinc-100"
                    />
                  </div>
                </div>
                {recognized && (
                  <p className="text-[11px] text-emerald-400">
                    Número reconhecido. Endereço preenchido automaticamente.
                  </p>
                )}
              </div>

              {/* Address */}
              <div className="bg-[#18181c] border border-white/[0.06] rounded-[8px] p-3 space-y-2.5">
                <p className="font-medium text-zinc-200">2. Endereço de Entrega</p>
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-2">
                    <label className="text-zinc-400 block mb-1">Rua / Avenida *</label>
                    <input
                      type="text"
                      required
                      value={street}
                      onChange={(e) => setStreet(e.target.value)}
                      placeholder="Rua..."
                      className="w-full bg-[#09090b] border border-white/[0.1] rounded-[6px] px-3 py-1.5 text-zinc-100"
                    />
                  </div>
                  <div>
                    <label className="text-zinc-400 block mb-1">Número *</label>
                    <input
                      type="text"
                      required
                      value={number}
                      onChange={(e) => setNumber(e.target.value)}
                      placeholder="123"
                      className="w-full bg-[#09090b] border border-white/[0.1] rounded-[6px] px-3 py-1.5 text-zinc-100"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-zinc-400 block mb-1">Bairro *</label>
                    <input
                      type="text"
                      required
                      value={neighborhood}
                      onChange={(e) => setNeighborhood(e.target.value)}
                      placeholder="Centro"
                      className="w-full bg-[#09090b] border border-white/[0.1] rounded-[6px] px-3 py-1.5 text-zinc-100"
                    />
                  </div>
                  <div>
                    <label className="text-zinc-400 block mb-1">Complemento</label>
                    <input
                      type="text"
                      value={complement}
                      onChange={(e) => setComplement(e.target.value)}
                      placeholder="Casa, Apto..."
                      className="w-full bg-[#09090b] border border-white/[0.1] rounded-[6px] px-3 py-1.5 text-zinc-100"
                    />
                  </div>
                </div>
              </div>

              {/* Payment Method */}
              <div className="bg-[#18181c] border border-white/[0.06] rounded-[8px] p-3 space-y-2">
                <p className="font-medium text-zinc-200">3. Forma de Pagamento</p>
                {(
                  [
                    {
                      value: 'PIX (Mercado Pago / Chave)',
                      label: 'PIX',
                      desc: 'Chave fornecida após o pedido',
                    },
                    {
                      value: 'Cartão na Entrega (Maquininha InfinitePay)',
                      label: 'Cartão na Entrega',
                      desc: 'Débito ou Crédito na maquininha',
                    },
                    {
                      value: 'Link de Pagamento (InfinitePay)',
                      label: 'Link de Pagamento Online',
                      desc: 'Cartão de crédito via link',
                    },
                    {
                      value: 'Dinheiro',
                      label: 'Dinheiro',
                      desc: 'Pagamento na entrega',
                    },
                  ] as const
                ).map((opt) => (
                  <label
                    key={opt.value}
                    className={`flex items-start gap-2.5 p-2 rounded-[6px] border cursor-pointer transition ${
                      paymentMethod === opt.value
                        ? 'border-zinc-300 bg-white/[0.04]'
                        : 'border-white/[0.06] bg-[#09090b]'
                    }`}
                  >
                    <input
                      type="radio"
                      name="paymentMethod"
                      checked={paymentMethod === opt.value}
                      onChange={() => setPaymentMethod(opt.value)}
                      className="mt-0.5 accent-zinc-200"
                    />
                    <div>
                      <p className="font-medium text-zinc-200">{opt.label}</p>
                      <p className="text-[11px] text-zinc-500">{opt.desc}</p>
                    </div>
                  </label>
                ))}
              </div>

              {/* Order Notes */}
              <div>
                <label className="text-zinc-400 block mb-1">
                  Observações (ex: ponto da carne, sem cebola, troco)
                </label>
                <input
                  type="text"
                  value={customerNotes}
                  onChange={(e) => setCustomerNotes(e.target.value)}
                  placeholder="Alguma observação especial?"
                  className="w-full bg-[#09090b] border border-white/[0.1] rounded-[6px] px-3 py-1.5 text-zinc-100"
                />
              </div>

              {/* Total Calculation */}
              <div className="bg-[#18181c] border border-white/[0.06] rounded-[8px] p-3 space-y-1.5 tabular-nums">
                <div className="flex justify-between text-zinc-400">
                  <span>Subtotal</span>
                  <span>{formatBRL(subtotalAmount)}</span>
                </div>
                <div className="flex justify-between text-zinc-400">
                  <span>Taxa de entrega</span>
                  <span>{deliveryFee === 0 ? 'Grátis' : formatBRL(deliveryFee)}</span>
                </div>
                <div className="border-t border-white/[0.08] pt-2 flex justify-between text-sm font-semibold text-zinc-100">
                  <span>Total</span>
                  <span>{formatBRL(totalOrderAmount)}</span>
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3 bg-[#ff5400] hover:bg-[#ea4b00] text-white font-semibold rounded-[8px] text-xs shadow-lg shadow-orange-500/25 transition active:scale-[0.99] disabled:opacity-50"
              >
                {submitting
                  ? 'Confirmando pedido...'
                  : `Confirmar Pedido • ${formatBRL(totalOrderAmount)}`}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
