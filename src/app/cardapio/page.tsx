'use client';

import { formatBRL, formatPhoneBR, normalizePhone } from '@/lib/pricing';
import { OrderItem, OrderPaymentMethod } from '@/lib/types';
import {
  Banknote,
  Check,
  ChevronRight,
  Clock,
  Copy,
  CreditCard,
  Flame,
  MessageCircle,
  Minus,
  Phone,
  Plus,
  QrCode,
  Search,
  ShoppingBag,
  Sparkles,
  Star,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

interface PublicMenuItem {
  id: string;
  name: string;
  description: string;
  category: 'Hambúrgueres' | 'Bebidas' | 'Porções & Combos' | 'Sobremesas';
  imageEmoji: string;
  imageUrl?: string | null;
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

interface CompletedOrderDetails {
  orderNumber: number;
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
  paymentMethod: OrderPaymentMethod;
  changeFor?: string;
  customerNotes?: string;
  pixKey: string;
  pixBeneficiary: string;
  whatsappNumber: string;
  estimatedDeliveryMinutes: string;
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

  // Selected product modal (iFood style detail modal + drink upsell)
  const [detailItem, setDetailItem] = useState<PublicMenuItem | null>(null);
  const [detailQty, setDetailQty] = useState<number>(1);
  const [detailNotes, setDetailNotes] = useState<string>('');
  const [selectedUpsellDrinkIds, setSelectedUpsellDrinkIds] = useState<string[]>([]);

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
  const [paymentMethod, setPaymentMethod] = useState<OrderPaymentMethod>('PIX');
  const [changeFor, setChangeFor] = useState('');
  const [customerNotes, setCustomerNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Completed order
  const [completedOrder, setCompletedOrder] = useState<CompletedOrderDetails | null>(null);
  const [copiedPix, setCopiedPix] = useState(false);

  // VIP Promo & Phone Popup
  const [showPromoPopup, setShowPromoPopup] = useState(false);
  const [popupPhoneInput, setPopupPhoneInput] = useState('');
  const [popupSuccessMsg, setPopupSuccessMsg] = useState('');

  useEffect(() => {
    fetch('/api/public/menu')
      .then((r) => r.json())
      .then((data) => {
        if (data.store) setStore(data.store);
        if (data.menu) setMenu(data.menu);
      })
      .finally(() => setLoading(false));

    const savedPhone = localStorage.getItem('burger_customer_phone');
    const dismissedPopup = sessionStorage.getItem('burger_promo_popup_dismissed');

    if (savedPhone) {
      setPhone(savedPhone);
      lookupCustomerByPhone(savedPhone);
    } else if (!dismissedPopup) {
      // Exibe o pop-up acolhedor para capturar o WhatsApp ou puxar dados de compras anteriores
      const timer = setTimeout(() => {
        setShowPromoPopup(true);
      }, 1200);
      return () => clearTimeout(timer);
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

  function handleDismissPromoPopup() {
    setShowPromoPopup(false);
    sessionStorage.setItem('burger_promo_popup_dismissed', 'true');
  }

  async function handleConfirmPromoPopup(e: React.FormEvent) {
    e.preventDefault();
    const cleanDigits = normalizePhone(popupPhoneInput);
    if (cleanDigits.length < 10) {
      alert('Por favor, informe seu DDD + número do WhatsApp (ex: 84 99999-9999)');
      return;
    }

    setPhone(popupPhoneInput);
    localStorage.setItem('burger_customer_phone', cleanDigits);
    sessionStorage.setItem('burger_promo_popup_dismissed', 'true');

    // Executa busca para puxar dados caso já seja cliente
    setCheckingPhone(true);
    try {
      const res = await fetch(`/api/public/menu?phone=${encodeURIComponent(cleanDigits)}`);
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
        setPopupSuccessMsg(`Que bom ter você de volta, ${c.name}! Seus dados de entrega já foram carregados.`);
      } else {
        setPopupSuccessMsg('Número salvo com sucesso! Você receberá nossas ofertas e cupons exclusivos.');
      }
    } catch {
      setPopupSuccessMsg('Número salvo com sucesso!');
    } finally {
      setCheckingPhone(false);
      setTimeout(() => {
        setShowPromoPopup(false);
        setPopupSuccessMsg('');
      }, 1800);
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

  function addToCart(productId: string, delta: number, customNotes?: string) {
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
          notes: customNotes !== undefined ? customNotes : prev[productId]?.notes || '',
        },
      };
    });
  }

  function openProductDetail(item: PublicMenuItem) {
    setDetailItem(item);
    const existing = cart[item.id];
    setDetailQty(existing ? existing.quantity : 1);
    setDetailNotes(existing ? existing.notes : '');
    setSelectedUpsellDrinkIds([]);
  }

  function toggleUpsellDrinkInModal(drinkId: string) {
    setSelectedUpsellDrinkIds((prev) =>
      prev.includes(drinkId) ? prev.filter((id) => id !== drinkId) : [...prev, drinkId]
    );
  }

  function confirmProductDetail() {
    if (!detailItem) return;
    setCart((prev) => {
      const next = {
        ...prev,
        [detailItem.id]: {
          quantity: detailQty,
          notes: detailNotes.trim(),
        },
      };
      for (const drinkId of selectedUpsellDrinkIds) {
        next[drinkId] = {
          quantity: (next[drinkId]?.quantity || 0) + 1,
          notes: next[drinkId]?.notes || '',
        };
      }
      return next;
    });
    setDetailItem(null);
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

  // Smart Upsell Logic
  const drinksInMenu = useMemo(
    () => menu.filter((m) => m.category === 'Bebidas'),
    [menu]
  );
  const hasDrinkInCart = useMemo(
    () => cartItemsList.some((i) => i.category === 'Bebidas'),
    [cartItemsList]
  );
  const upsellSuggestionsInBag = useMemo(() => {
    const inCartIds = new Set(cartItemsList.map((i) => i.id));
    if (!hasDrinkInCart && drinksInMenu.length > 0) {
      return {
        title: '🥤 Vai uma bebida gelada para acompanhar seu lanche?',
        subtitle: 'Adicione com 1 toque:',
        items: drinksInMenu.filter((d) => !inCartIds.has(d.id)).slice(0, 3),
      };
    }
    const extraSuggestions = menu.filter((m) => !inCartIds.has(m.id));
    if (extraSuggestions.length > 0) {
      return {
        title: '🔥 Aproveite a entrega e adicione também:',
        subtitle: 'Clientes também costumam pedir junto:',
        items: extraSuggestions.slice(0, 3),
      };
    }
    return null;
  }, [cartItemsList, hasDrinkInCart, drinksInMenu, menu]);

  const featuredItems = useMemo(
    () => menu.filter((m) => m.featured),
    [menu]
  );

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

  function buildWhatsAppOrderLink(order: CompletedOrderDetails) {
    const itemsLines = order.items
      .map(
        (it) =>
          `• *${it.quantity}x ${it.productName}* — ${formatBRL(it.unitPrice * it.quantity)}${
            it.notes ? `\n   _Obs: ${it.notes}_` : ''
          }`
      )
      .join('\n');

    const addressLine = `${order.deliveryAddress.street}, ${order.deliveryAddress.number} - ${
      order.deliveryAddress.neighborhood
    }${order.deliveryAddress.complement ? ` (${order.deliveryAddress.complement})` : ''}${
      order.deliveryAddress.reference ? `\n▸ *Ponto de Ref:* ${order.deliveryAddress.reference}` : ''
    }`;

    const paymentLine =
      order.paymentMethod === 'Dinheiro'
        ? `Dinheiro (${
            order.changeFor ? `Troco para ${order.changeFor}` : 'Não precisa de troco'
          })`
        : order.paymentMethod === 'PIX'
        ? 'PIX (Enviarei o comprovante a seguir)'
        : order.paymentMethod;

    const lines = [
      `*NOVO PEDIDO #${order.orderNumber} — ${(store?.storeName || 'MONSTER BURGER').toUpperCase()}*`,
      `--------------------------------`,
      `▸ *Cliente:* ${order.customerName}`,
      `▸ *WhatsApp:* ${formatPhoneBR(order.customerPhone)}`,
      `--------------------------------`,
      `*ITENS DO PEDIDO:*`,
      itemsLines,
      `--------------------------------`,
      `▸ *Subtotal:* ${formatBRL(order.subtotal)}`,
      `▸ *Taxa de Entrega:* ${
        order.deliveryFee === 0 ? 'Grátis' : formatBRL(order.deliveryFee)
      }`,
      `▸ *TOTAL A PAGAR: ${formatBRL(order.totalAmount)}*`,
      `--------------------------------`,
      `▸ *Forma de Pagamento:* ${paymentLine}`,
      `▸ *Endereço de Entrega:* ${addressLine}`,
    ];

    if (order.customerNotes) {
      lines.push(`▸ *Observações:* ${order.customerNotes}`);
    }

    const text = lines.join('\n');
    const rawTarget = normalizePhone(order.whatsappNumber || store?.whatsappNumber || '5586999999999');
    const targetPhone = rawTarget.startsWith('55') ? rawTarget : `55${rawTarget}`;
    return `https://api.whatsapp.com/send?phone=${targetPhone}&text=${encodeURIComponent(text)}`;
  }

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
          changeFor: paymentMethod === 'Dinheiro' ? changeFor : undefined,
          customerNotes,
        }),
      });
      const data = await res.json();
      if (data.ok && data.order) {
        const orderObj = data.order as CompletedOrderDetails;
        setCompletedOrder(orderObj);
        setCart({});
        setBagOpen(false);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        alert(data.error || 'Verifique as informações preenchidas.');
      }
    } catch {
      alert('Erro ao enviar pedido.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#09090b] text-zinc-400 flex items-center justify-center text-xs">
        Carregando cardápio...
      </div>
    );
  }

  const modalUpsellTotal = selectedUpsellDrinkIds.reduce((acc, id) => {
    const d = menu.find((m) => m.id === id);
    return acc + (d ? d.price : 0);
  }, 0);

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100 pb-28">
      {/* Completed Order Receipt & WhatsApp Dispatch Banner (Exibido no Topo Absoluto da Tela quando houver pedido) */}
      {completedOrder && (
        <div id="comprovante-topo" className="bg-[#09090b] border-b-2 border-orange-500/60 sticky top-0 z-40 shadow-2xl backdrop-blur-md">
          <div className="max-w-4xl mx-auto p-4 sm:p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-orange-500/15 text-orange-400 border border-orange-500/30 uppercase tracking-wider">
                  Pedido Registrado #{completedOrder.orderNumber}
                </span>
                <h2 className="text-lg font-bold text-zinc-100 mt-1.5">
                  Quase lá, {completedOrder.customerName}! Envie sua comanda no WhatsApp:
                </h2>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Tempo médio de entrega após confirmação:{' '}
                  <strong className="text-zinc-200">
                    {completedOrder.estimatedDeliveryMinutes}
                  </strong>
                  .
                </p>
              </div>
              <button
                type="button"
                aria-label="Fechar comprovante"
                onClick={() => setCompletedOrder(null)}
                className="text-zinc-400 hover:text-zinc-200 p-1 rounded-full bg-white/[0.04] hover:bg-white/[0.08] transition"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Resumo completo dos itens que o cliente pediu */}
            <div className="bg-[#18181c] border border-white/[0.08] rounded-[10px] p-3.5 space-y-2 text-xs">
              <p className="font-semibold text-zinc-200 border-b border-white/[0.06] pb-1.5">
                Resumo do seu Pedido #{completedOrder.orderNumber}:
              </p>
              <div className="space-y-1.5 tabular-nums">
                {completedOrder.items.map((it, idx) => (
                  <div key={idx} className="flex items-start justify-between gap-2 text-zinc-300">
                    <div>
                      <span className="font-semibold text-zinc-100">{it.quantity}x</span>{' '}
                      {it.productName}
                      {it.notes && (
                        <span className="block text-[11px] text-orange-400 italic">
                          Obs: {it.notes}
                        </span>
                      )}
                    </div>
                    <span className="font-medium text-zinc-200 shrink-0">
                      {formatBRL(it.unitPrice * it.quantity)}
                    </span>
                  </div>
                ))}
              </div>
              <div className="border-t border-white/[0.08] pt-2 flex items-center justify-between font-bold text-sm text-zinc-100 tabular-nums">
                <span>Total ({completedOrder.paymentMethod})</span>
                <span className="text-orange-400">{formatBRL(completedOrder.totalAmount)}</span>
              </div>
            </div>

            {/* Instrução conforme forma de pagamento (Sem citar marca de maquininha ou link externo) */}
            {(completedOrder.paymentMethod === 'PIX' ||
              completedOrder.paymentMethod === 'PIX (Mercado Pago / Chave)') && (
              <div className="bg-[#18181c] border border-emerald-500/30 rounded-[10px] p-4 space-y-2.5 text-xs">
                <div className="flex items-center gap-2 text-emerald-400 font-semibold">
                  <QrCode className="size-4" />
                  <span>
                    Passo 1: Copie a chave PIX abaixo e transfira{' '}
                    {formatBRL(completedOrder.totalAmount)}
                  </span>
                </div>
                {completedOrder.pixBeneficiary && (
                  <p className="text-[11px] text-zinc-400">
                    Favorecido: <strong className="text-zinc-200">{completedOrder.pixBeneficiary}</strong>
                  </p>
                )}
                <div className="flex items-center gap-2">
                  <code className="flex-1 bg-[#09090b] border border-white/[0.1] px-3 py-2 rounded-[6px] text-xs font-mono text-zinc-100 truncate select-all">
                    {completedOrder.pixKey}
                  </code>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(completedOrder.pixKey);
                      setCopiedPix(true);
                      setTimeout(() => setCopiedPix(false), 2500);
                    }}
                    className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-[6px] text-xs inline-flex items-center gap-1.5 shrink-0 transition"
                  >
                    {copiedPix ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                    {copiedPix ? 'Chave Copiada!' : 'Copiar Chave PIX'}
                  </button>
                </div>
                <p className="text-[11px] text-zinc-400">
                  Passo 2: Clique no botão verde abaixo para enviar seu pedido completo e o comprovante no WhatsApp da loja.
                </p>
              </div>
            )}

            {(completedOrder.paymentMethod === 'Cartão de Crédito (Na Entrega)' ||
              completedOrder.paymentMethod === 'Cartão de Débito (Na Entrega)' ||
              completedOrder.paymentMethod === 'Cartão na Entrega (Maquininha InfinitePay)') && (
              <div className="bg-[#18181c] border border-white/[0.08] rounded-[8px] p-3 text-xs text-zinc-300 flex items-center gap-2">
                <CreditCard className="size-4 text-orange-400 shrink-0" />
                <span>
                  Tudo pronto! Levaremos a maquininha de cartão até o seu endereço para o pagamento na entrega.
                </span>
              </div>
            )}

            {completedOrder.paymentMethod === 'Dinheiro' && (
              <div className="bg-[#18181c] border border-white/[0.08] rounded-[8px] p-3 text-xs text-zinc-300 flex items-center gap-2">
                <Banknote className="size-4 text-emerald-400 shrink-0" />
                <span>
                  Pagamento em Dinheiro na entrega.{' '}
                  {completedOrder.changeFor
                    ? `Troco preparado para ${completedOrder.changeFor}.`
                    : 'Não precisa de troco.'}
                </span>
              </div>
            )}

            {/* Botão de Envio / Acompanhamento WhatsApp com Cupom 100% Detalhado */}
            <a
              href={buildWhatsAppOrderLink(completedOrder)}
              target="_blank"
              rel="noreferrer"
              className="w-full py-3.5 rounded-[8px] bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center justify-center gap-2 transition shadow-lg shadow-emerald-600/30 active:scale-[0.99]"
            >
              <MessageCircle className="size-4" />
              {completedOrder.paymentMethod === 'PIX'
                ? 'Enviar Pedido e Comprovante no WhatsApp da Loja'
                : 'Confirmar e Enviar Pedido no WhatsApp da Loja'}
            </a>
          </div>
        </div>
      )}

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
                  {store?.storeSubtitle || 'Burger Artesanal na Brasa • Delivery Suculento'}
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

            {/* Quick Recognition Status */}
            {recognized ? (
              <div className="bg-[#18181c] border border-orange-500/30 rounded-[10px] p-2.5 sm:w-72 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-zinc-100 flex items-center gap-1.5">
                    <Sparkles className="size-3 text-orange-400" />
                    Olá, {recognized.name}!
                  </p>
                  <p className="text-[10px] text-zinc-400">
                    Dados de entrega carregados automaticamente
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowPromoPopup(true)}
                  className="text-[10px] text-orange-400 hover:text-orange-300 underline font-medium"
                >
                  Alterar
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowPromoPopup(true)}
                className="bg-[#18181c] hover:bg-zinc-800 border border-white/[0.08] hover:border-orange-500/30 rounded-[10px] p-2.5 sm:w-72 text-left transition group"
              >
                <div className="flex items-center justify-between text-[11px] text-zinc-400 group-hover:text-zinc-200">
                  <span className="flex items-center gap-1.5 font-medium">
                    <Sparkles className="size-3 text-orange-400" />
                    Ganhe Promoções & Agilize seu Pedido
                  </span>
                </div>
                <p className="text-[10px] text-zinc-500 mt-0.5">
                  Clique para informar seu WhatsApp
                </p>
              </button>
            )}
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
              placeholder="Buscar hambúrguer, bebida..."
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
        {/* Vitrine de Destaque / Campeões de Venda (Estratégia Visual de Conversão) */}
        {selectedCategory === 'Todos' && !searchTerm.trim() && featuredItems.length > 0 && (
          <section className="space-y-2.5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-zinc-100 flex items-center gap-1.5">
                <Flame className="size-4 text-[#ff5400] fill-[#ff5400]" />
                Os Mais Pedidos da Monster
              </h2>
              <span className="text-[11px] text-orange-400 font-medium">
                Favoritos da galera
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {featuredItems.slice(0, 4).map((item) => {
                const qtyInCart = cart[item.id]?.quantity || 0;
                return (
                  <div
                    key={`feat-${item.id}`}
                    onClick={() => openProductDetail(item)}
                    className="bg-[#121215] border border-white/[0.08] hover:border-orange-500/40 rounded-[12px] overflow-hidden flex flex-col justify-between cursor-pointer group transition shadow-md"
                  >
                    <div>
                      <div className="h-28 bg-[#18181c] relative overflow-hidden flex items-center justify-center text-3xl">
                        {item.imageUrl ? (
                          <img
                            src={item.imageUrl}
                            alt={item.name}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                        ) : (
                          <span>{item.imageEmoji}</span>
                        )}
                        <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-[10px] font-bold bg-black/80 text-amber-400 border border-amber-500/30 backdrop-blur-sm">
                          ★ Top Vendas
                        </span>
                      </div>
                      <div className="p-3 space-y-1">
                        <h3 className="text-xs font-bold text-zinc-100 line-clamp-1 group-hover:text-orange-400 transition-colors">
                          {item.name}
                        </h3>
                        <p className="text-[11px] text-zinc-400 line-clamp-2 leading-snug">
                          {item.description}
                        </p>
                      </div>
                    </div>

                    <div
                      className="px-3 pb-3 pt-1 flex items-center justify-between gap-2"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <span className="text-xs font-bold text-zinc-100 tabular-nums">
                        {formatBRL(item.price)}
                      </span>
                      <button
                        type="button"
                        onClick={() => openProductDetail(item)}
                        className="px-2.5 py-1 rounded-[6px] bg-[#ff5400] hover:bg-[#ea4b00] text-white text-[11px] font-semibold transition"
                      >
                        {qtyInCart > 0 ? `${qtyInCart} na sacola` : '+ Pedir'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* iFood-Style Product Cards List */}
        <div className="space-y-3">
          <h2 className="text-sm font-bold text-zinc-200">
            {selectedCategory === 'Todos' ? 'Cardápio Completo' : selectedCategory}
          </h2>

          {filteredMenu.map((item) => {
            const qtyInCart = cart[item.id]?.quantity || 0;
            const itemNote = cart[item.id]?.notes || '';

            return (
              <div
                key={item.id}
                onClick={() => openProductDetail(item)}
                className="bg-[#121215] border border-white/[0.08] hover:border-orange-500/30 rounded-[12px] p-4 flex items-center justify-between gap-4 transition cursor-pointer group"
              >
                {/* Left: Product Information */}
                <div className="space-y-1.5 flex-1 pr-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold text-zinc-100 group-hover:text-orange-400 transition-colors">
                      {item.name}
                    </h3>
                    {item.featured && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-medium text-amber-400 bg-amber-500/10 border border-amber-500/20">
                        Mais Pedido
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-zinc-400 line-clamp-2 leading-relaxed">
                    {item.description}
                  </p>
                  {itemNote && (
                    <p className="text-[11px] text-orange-400/90 italic">
                      Obs: {itemNote}
                    </p>
                  )}
                  <p className="text-sm font-semibold text-zinc-100 tabular-nums pt-1">
                    {formatBRL(item.price)}
                  </p>
                </div>

                {/* Right: Product Photo Thumbnail + Quantity Selector */}
                <div
                  className="flex flex-col items-center gap-2 shrink-0"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div
                    onClick={() => openProductDetail(item)}
                    className="size-24 rounded-[10px] bg-[#18181c] border border-white/[0.08] overflow-hidden flex items-center justify-center text-3xl relative shadow-md"
                  >
                    {item.imageUrl ? (
                      <img
                        src={item.imageUrl}
                        alt={item.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <span>{item.imageEmoji}</span>
                    )}
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
                      onClick={() => openProductDetail(item)}
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

      {/* iFood-Style Product Detail Modal + Built-In Drink Upsell */}
      {detailItem && (
        <div
          className="fixed inset-0 bg-black/75 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setDetailItem(null)}
        >
          <div
            className="bg-[#121215] border border-white/[0.12] w-full max-w-md rounded-t-2xl sm:rounded-2xl max-h-[92vh] overflow-y-auto shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative h-52 bg-[#18181c] flex items-center justify-center">
              {detailItem.imageUrl ? (
                <img
                  src={detailItem.imageUrl}
                  alt={detailItem.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-6xl">{detailItem.imageEmoji}</span>
              )}
              <button
                type="button"
                aria-label="Fechar detalhes"
                onClick={() => setDetailItem(null)}
                className="absolute top-3 right-3 size-8 rounded-full bg-black/70 text-zinc-200 hover:text-white flex items-center justify-center"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-base font-bold text-zinc-100">{detailItem.name}</h3>
                  <span className="text-base font-bold text-orange-400 tabular-nums shrink-0">
                    {formatBRL(detailItem.price)}
                  </span>
                </div>
                <p className="text-xs text-zinc-400 mt-1.5 leading-relaxed">
                  {detailItem.description}
                </p>
              </div>

              {/* Estratégia de Upsell Direto ao Escolher um Lanche */}
              {detailItem.category === 'Hambúrgueres' && drinksInMenu.length > 0 && (
                <div className="bg-[#18181c] border border-orange-500/25 rounded-[10px] p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-zinc-100 flex items-center gap-1.5">
                      <Sparkles className="size-3.5 text-orange-400" />
                      Vai uma bebida gelada para acompanhar?
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-500/15 text-orange-400 font-medium">
                      Opcional
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    {drinksInMenu.map((drink) => {
                      const checked = selectedUpsellDrinkIds.includes(drink.id);
                      return (
                        <label
                          key={drink.id}
                          className={`flex items-center justify-between p-2 rounded-[8px] border cursor-pointer transition text-xs ${
                            checked
                              ? 'bg-orange-500/10 border-orange-500/50 text-zinc-100'
                              : 'bg-[#09090b] border-white/[0.06] text-zinc-300 hover:border-white/[0.15]'
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleUpsellDrinkInModal(drink.id)}
                              className="accent-[#ff5400]"
                            />
                            {drink.imageUrl ? (
                              <img
                                src={drink.imageUrl}
                                alt={drink.name}
                                className="size-7 rounded object-cover"
                              />
                            ) : (
                              <span>{drink.imageEmoji}</span>
                            )}
                            <span className="font-medium">{drink.name}</span>
                          </div>
                          <span className="font-semibold text-orange-400 tabular-nums">
                            + {formatBRL(drink.price)}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              <div>
                <label className="text-xs text-zinc-300 font-medium block mb-1.5">
                  Alguma observação neste item?
                </label>
                <input
                  type="text"
                  value={detailNotes}
                  onChange={(e) => setDetailNotes(e.target.value)}
                  placeholder="Ex: Sem cebola, ponto bem passado, maionese à parte..."
                  className="w-full bg-[#09090b] border border-white/[0.1] rounded-[8px] px-3 py-2 text-xs text-zinc-100 outline-none focus:border-orange-500"
                />
              </div>

              <div className="flex items-center gap-3 pt-1">
                <div className="flex items-center gap-2 bg-[#18181c] border border-white/[0.12] rounded-[8px] p-1">
                  <button
                    type="button"
                    onClick={() => setDetailQty((q) => Math.max(1, q - 1))}
                    className="size-8 rounded bg-[#09090b] text-zinc-200 flex items-center justify-center"
                  >
                    <Minus className="size-3.5" />
                  </button>
                  <span className="w-6 text-center text-xs font-bold text-zinc-100 tabular-nums">
                    {detailQty}
                  </span>
                  <button
                    type="button"
                    onClick={() => setDetailQty((q) => q + 1)}
                    className="size-8 rounded bg-[#09090b] text-zinc-200 flex items-center justify-center"
                  >
                    <Plus className="size-3.5" />
                  </button>
                </div>

                <button
                  type="button"
                  onClick={confirmProductDetail}
                  className="flex-1 py-2.5 bg-[#ff5400] hover:bg-[#ea4b00] text-white font-semibold rounded-[8px] text-xs flex items-center justify-between px-4 shadow-lg shadow-orange-500/25 transition"
                >
                  <span>Adicionar à Sacola</span>
                  <span className="tabular-nums font-bold">
                    {formatBRL(detailItem.price * detailQty + modalUpsellTotal)}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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
              Ver sacola e pedir
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
              <div className="space-y-2.5 border-b border-white/[0.08] pb-3 tabular-nums">
                {cartItemsList.map((item) => (
                  <div key={item.id} className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className="size-10 rounded-[6px] bg-[#18181c] border border-white/[0.08] overflow-hidden flex items-center justify-center shrink-0">
                        {item.imageUrl ? (
                          <img
                            src={item.imageUrl}
                            alt={item.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span className="text-base">{item.imageEmoji}</span>
                        )}
                      </div>
                      <div>
                        <p className="font-medium text-zinc-100">{item.name}</p>
                        <p className="text-[11px] text-zinc-400">
                          {item.quantity}x {formatBRL(item.price)}
                        </p>
                        {item.notes && (
                          <p className="text-[10px] text-orange-400 italic">Obs: {item.notes}</p>
                        )}
                      </div>
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

              {/* Smart Upsell Box Inside Checkout Bag ("Peça Também") */}
              {upsellSuggestionsInBag && upsellSuggestionsInBag.items.length > 0 && (
                <div className="bg-gradient-to-r from-orange-500/10 via-[#18181c] to-[#18181c] border border-orange-500/30 rounded-[10px] p-3 space-y-2">
                  <div>
                    <p className="text-xs font-bold text-orange-400">
                      {upsellSuggestionsInBag.title}
                    </p>
                    <p className="text-[11px] text-zinc-400">
                      {upsellSuggestionsInBag.subtitle}
                    </p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {upsellSuggestionsInBag.items.map((sug) => (
                      <div
                        key={`upsell-${sug.id}`}
                        className="bg-[#09090b] border border-white/[0.08] rounded-[8px] p-2 flex items-center justify-between gap-2"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          {sug.imageUrl ? (
                            <img
                              src={sug.imageUrl}
                              alt={sug.name}
                              className="size-8 rounded object-cover shrink-0"
                            />
                          ) : (
                            <span className="text-base">{sug.imageEmoji}</span>
                          )}
                          <div className="truncate">
                            <p className="text-[11px] font-medium text-zinc-100 truncate">
                              {sug.name}
                            </p>
                            <p className="text-[10px] text-orange-400 font-semibold tabular-nums">
                              {formatBRL(sug.price)}
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => addToCart(sug.id, 1)}
                          className="px-2 py-1 rounded bg-[#ff5400] hover:bg-[#ea4b00] text-white text-[10px] font-bold shrink-0 transition"
                        >
                          + Adicionar
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Customer Contact */}
              <div className="bg-[#18181c] border border-white/[0.06] rounded-[8px] p-3 space-y-2.5">
                <p className="font-medium text-zinc-200">1. Seus Dados</p>
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
                    Cliente reconhecido! Confira seu endereço abaixo.
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
                    <label className="text-zinc-400 block mb-1">Complemento / Ref.</label>
                    <input
                      type="text"
                      value={complement}
                      onChange={(e) => setComplement(e.target.value)}
                      placeholder="Casa, Apto, Próximo a..."
                      className="w-full bg-[#09090b] border border-white/[0.1] rounded-[6px] px-3 py-1.5 text-zinc-100"
                    />
                  </div>
                </div>
              </div>

              {/* Payment Method (Somente PIX, Cartão Crédito/Débito na Entrega e Dinheiro) */}
              <div className="bg-[#18181c] border border-white/[0.06] rounded-[8px] p-3 space-y-2">
                <p className="font-medium text-zinc-200">3. Forma de Pagamento</p>
                {(
                  [
                    {
                      value: 'PIX',
                      label: 'PIX',
                      desc: 'Chave PIX exibida na tela após confirmar',
                    },
                    {
                      value: 'Cartão de Crédito (Na Entrega)',
                      label: 'Cartão de Crédito (Na Entrega)',
                      desc: 'Levamos a maquininha até você',
                    },
                    {
                      value: 'Cartão de Débito (Na Entrega)',
                      label: 'Cartão de Débito (Na Entrega)',
                      desc: 'Levamos a maquininha até você',
                    },
                    {
                      value: 'Dinheiro',
                      label: 'Dinheiro (Na Entrega)',
                      desc: 'Pagamento em espécie ao entregador',
                    },
                  ] as const
                ).map((opt) => (
                  <label
                    key={opt.value}
                    className={`flex items-start gap-2.5 p-2 rounded-[6px] border cursor-pointer transition ${
                      paymentMethod === opt.value
                        ? 'border-orange-500/60 bg-orange-500/10'
                        : 'border-white/[0.06] bg-[#09090b]'
                    }`}
                  >
                    <input
                      type="radio"
                      name="paymentMethod"
                      checked={paymentMethod === opt.value}
                      onChange={() => setPaymentMethod(opt.value)}
                      className="mt-0.5 accent-[#ff5400]"
                    />
                    <div>
                      <p className="font-medium text-zinc-100">{opt.label}</p>
                      <p className="text-[11px] text-zinc-400">{opt.desc}</p>
                    </div>
                  </label>
                ))}

                {paymentMethod === 'Dinheiro' && (
                  <div className="pt-1.5">
                    <label className="text-zinc-300 font-medium block mb-1">
                      Precisa de troco para quanto?
                    </label>
                    <input
                      type="text"
                      value={changeFor}
                      onChange={(e) => setChangeFor(e.target.value)}
                      placeholder="Ex: R$ 50,00 (ou deixe em branco se não precisar)"
                      className="w-full bg-[#09090b] border border-white/[0.12] rounded-[6px] px-3 py-1.5 text-zinc-100"
                    />
                  </div>
                )}
              </div>

              {/* Order Notes */}
              <div>
                <label className="text-zinc-400 block mb-1">
                  Observações da entrega (ex: tocar interfone, portão preto)
                </label>
                <input
                  type="text"
                  value={customerNotes}
                  onChange={(e) => setCustomerNotes(e.target.value)}
                  placeholder="Alguma observação para o entregador?"
                  className="w-full bg-[#09090b] border border-white/[0.1] rounded-[6px] px-3 py-1.5 text-zinc-100"
                />
              </div>

              {/* Total Calculation */}
              <div className="bg-[#18181c] border border-white/[0.06] rounded-[8px] p-3 space-y-1.5 tabular-nums">
                <div className="flex justify-between text-zinc-400">
                  <span>Subtotal dos itens</span>
                  <span>{formatBRL(subtotalAmount)}</span>
                </div>
                <div className="flex justify-between text-zinc-400">
                  <span>Taxa de entrega</span>
                  <span>{deliveryFee === 0 ? 'Grátis' : formatBRL(deliveryFee)}</span>
                </div>
                <div className="border-t border-white/[0.08] pt-2 flex justify-between text-sm font-semibold text-zinc-100">
                  <span>Total a Pagar</span>
                  <span className="text-orange-400">{formatBRL(totalOrderAmount)}</span>
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3.5 bg-[#ff5400] hover:bg-[#ea4b00] text-white font-bold rounded-[8px] text-xs shadow-lg shadow-orange-500/25 transition active:scale-[0.99] disabled:opacity-50"
              >
                {submitting
                  ? 'Registrando pedido...'
                  : `Finalizar Pedido • ${formatBRL(totalOrderAmount)}`}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Pop-up de Promoções & Agilidade no Pedido */}
      {showPromoPopup && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#121215] border border-orange-500/40 rounded-[16px] max-w-sm w-full p-6 space-y-4 shadow-2xl relative">
            <button
              type="button"
              aria-label="Fechar pop-up"
              onClick={handleDismissPromoPopup}
              className="absolute top-4 right-4 p-1.5 rounded-full text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.08] transition"
            >
              <X className="size-4" />
            </button>

            <div className="text-center space-y-2 pt-1">
              <div className="size-12 rounded-full bg-gradient-to-tr from-orange-600 to-[#ff5400] text-white flex items-center justify-center mx-auto shadow-lg shadow-orange-500/30">
                <Sparkles className="size-6 text-white" />
              </div>
              <h3 className="text-lg font-bold text-zinc-100 tracking-tight">
                Fique por dentro das nossas promoções!
              </h3>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Digite seu número de WhatsApp para receber cupons exclusivos e carregar seus dados de entrega automaticamente caso já tenha pedido antes.
              </p>
            </div>

            {popupSuccessMsg ? (
              <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-[10px] p-3 text-center space-y-1">
                <p className="text-xs font-semibold text-emerald-400 flex items-center justify-center gap-1.5">
                  <Check className="size-4" /> {popupSuccessMsg}
                </p>
              </div>
            ) : (
              <form onSubmit={handleConfirmPromoPopup} className="space-y-3">
                <div className="relative">
                  <Phone className="size-4 text-zinc-500 absolute left-3.5 top-3" />
                  <input
                    type="tel"
                    autoFocus
                    value={popupPhoneInput}
                    onChange={(e) => setPopupPhoneInput(e.target.value)}
                    placeholder="Seu WhatsApp (ex: 84 99999-9999)"
                    className="w-full pl-10 pr-3 py-2.5 bg-[#09090b] border border-white/[0.12] focus-visible:border-orange-500 rounded-[8px] text-xs text-zinc-100 placeholder-zinc-500 outline-none tabular-nums font-mono"
                  />
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleDismissPromoPopup}
                    className="flex-1 py-2.5 rounded-[8px] text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04] border border-white/[0.08] transition"
                  >
                    Agora não
                  </button>
                  <button
                    type="submit"
                    disabled={checkingPhone}
                    className="flex-1 py-2.5 bg-[#ff5400] hover:bg-[#ea4b00] text-white font-bold rounded-[8px] text-xs shadow-md shadow-orange-500/30 transition disabled:opacity-50"
                  >
                    {checkingPhone ? 'Buscando...' : 'Confirmar'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
