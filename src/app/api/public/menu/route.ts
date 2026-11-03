import { checkRateLimit, getClientIp, loadAppState, saveAppState } from '@/lib/db';
import { calculateProductMetrics, normalizePhone } from '@/lib/pricing';
import {
  CUSTOMER_COOKIE_NAME,
  CUSTOMER_SESSION_MAX_AGE,
  signSession,
  verifySession,
} from '@/lib/session';
import { OrderItem, OrderPaymentMethod, SaleOrder } from '@/lib/types';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// GET: Returns ONLY public menu items, store public info, or looks up a customer by phone for 1-click checkout
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const phoneQuery = searchParams.get('phone');

  const state = await loadAppState();

  if (phoneQuery) {
    const cleanPhone = normalizePhone(phoneQuery);
    if (cleanPhone.length < 8) {
      return NextResponse.json({ found: false });
    }
    const customer = state.customers.find(
      (c) => normalizePhone(c.phone) === cleanPhone || normalizePhone(c.phone).endsWith(cleanPhone)
    );
    if (!customer) {
      return NextResponse.json({ found: false });
    }

    // Check if this browser owns a verified session cookie for this phone number
    const cookieStore = await cookies();
    const customerToken = cookieStore.get(CUSTOMER_COOKIE_NAME)?.value;
    const verifiedSession = await verifySession(customerToken, 'customer');
    const isVerifiedDevice =
      verifiedSession?.sub === normalizePhone(customer.phone) ||
      verifiedSession?.sub === cleanPhone;

    const favoriteItemIds = Object.entries(customer.itemFrequency || {})
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 2)
      .map(([id]) => id);

    // Normalize legacy payment method names to clean customer-facing labels
    let prefMethod: OrderPaymentMethod = customer.preferredPaymentMethod || 'PIX';
    if (prefMethod.includes('PIX')) prefMethod = 'PIX';
    else if (prefMethod.includes('InfinitePay') || prefMethod.includes('Link'))
      prefMethod = 'Cartão de Crédito (Na Entrega)';

    return NextResponse.json({
      found: true,
      customer: {
        name: customer.name,
        phone: customer.phone,
        // Only prefill full street address if the device holds the signed customer cookie
        lastAddress: isVerifiedDevice ? customer.addresses[0] || null : null,
        preferredPaymentMethod: prefMethod,
        totalOrders: customer.totalOrders,
        favoriteItemIds,
      },
    });
  }

  // Public Menu Response — NO CMV, NO MARGINS, NO SUPPLIERS, NO FINANCIAL DATA
  const publicMenu = state.products
    .filter((p) => p.availableInMenu)
    .map((p) => ({
      id: p.id,
      name: p.shortName || p.name,
      description: p.description,
      category: p.category,
      imageEmoji: p.imageEmoji,
      imageUrl: p.imageUrl || null,
      price: p.practicedPrice,
      featured: Boolean(p.featured),
    }));

  return NextResponse.json({
    store: {
      storeName: state.settings.storeName,
      storeSubtitle: state.settings.storeSubtitle,
      deliveryFeeDefault: state.settings.deliveryFeeDefault,
      estimatedDeliveryMinutes: state.settings.estimatedDeliveryMinutes,
      storeOpen: state.settings.storeOpen,
      pixKey: state.settings.pixKey,
      pixBeneficiary: state.settings.pixBeneficiary,
      whatsappNumber: state.settings.whatsappNumber,
    },
    menu: publicMenu,
  });
}

// POST: Customer places an order on the public virtual menu
export async function POST(request: Request) {
  try {
    const ip = getClientIp(request);
    const allowed = await checkRateLimit(`order:ip:${ip}`, 15, 10 * 60);
    if (!allowed) {
      return NextResponse.json(
        { error: 'Muitas solicitações seguidas. Aguarde um instante.' },
        { status: 429 }
      );
    }

    const body = await request.json();
    const {
      customerName,
      customerPhone,
      address,
      items,
      paymentMethod,
      changeFor,
      customerNotes,
    } = body as {
      customerName: string;
      customerPhone: string;
      address: {
        street: string;
        number: string;
        neighborhood: string;
        complement?: string;
        reference?: string;
      };
      items: { productId: string; quantity: number; notes?: string }[];
      paymentMethod: OrderPaymentMethod;
      changeFor?: string;
      customerNotes?: string;
    };

    const cleanPhone = normalizePhone(customerPhone || '');
    if (
      !customerName?.trim() ||
      cleanPhone.length < 8 ||
      !Array.isArray(items) ||
      items.length === 0
    ) {
      return NextResponse.json(
        { error: 'Preencha seu nome, telefone e escolha pelo menos 1 item.' },
        { status: 400 }
      );
    }

    const state = await loadAppState();
    if (!state.settings.storeOpen) {
      return NextResponse.json(
        { error: 'A loja está fechada para novos pedidos neste momento.' },
        { status: 403 }
      );
    }

    const nowIso = new Date().toISOString();
    const todayDate = nowIso.slice(0, 10);

    // Calculate internal CMV & profit metrics silently on server
    const orderItems: OrderItem[] = [];
    let subtotal = 0;
    let totalCmv = 0;

    for (const cartItem of items) {
      const product = state.products.find((p) => p.id === cartItem.productId);
      if (!product || !product.availableInMenu) continue;
      const metrics = calculateProductMetrics(product, state.ingredients);
      const qty = Math.min(50, Math.max(1, Number(cartItem.quantity) || 1));

      orderItems.push({
        productId: product.id,
        productName: product.shortName || product.name,
        quantity: qty,
        unitPrice: product.practicedPrice,
        unitCmv: metrics.totalCmv,
        notes: cartItem.notes ? String(cartItem.notes).slice(0, 200) : undefined,
      });

      subtotal += product.practicedPrice * qty;
      totalCmv += metrics.totalCmv * qty;
    }

    if (orderItems.length === 0) {
      return NextResponse.json(
        { error: 'Nenhum item válido selecionado.' },
        { status: 400 }
      );
    }

    const deliveryFee = state.settings.deliveryFeeDefault || 0;
    const totalAmount = subtotal + deliveryFee;

    let feePct = 0;
    if (paymentMethod === 'PIX' || paymentMethod === 'PIX (Mercado Pago / Chave)') {
      feePct = state.settings.pixFeePct;
    } else if (
      paymentMethod === 'Cartão de Crédito (Na Entrega)' ||
      paymentMethod === 'Cartão na Entrega (Maquininha InfinitePay)'
    ) {
      feePct = state.settings.creditCardFeePct;
    } else if (paymentMethod === 'Cartão de Débito (Na Entrega)') {
      feePct = state.settings.debitCardFeePct;
    }

    const paymentFeeAmount = totalAmount * feePct;
    const taxReserveAmount = totalAmount * state.settings.estimatedTaxPct;
    const fixedCostAllocationAmount = totalAmount * state.settings.defaultFixedCostPct;
    const netProfit =
      totalAmount - totalCmv - paymentFeeAmount - taxReserveAmount - fixedCostAllocationAmount;

    const nextOrderNumber =
      state.orders.reduce((max, o) => Math.max(max, o.orderNumber || 100), 100) + 1;

    // Find or create customer profile ("Investigator CRM")
    let customer = state.customers.find((c) => normalizePhone(c.phone) === cleanPhone);

    if (!customer) {
      customer = {
        id: `cust-${Date.now()}`,
        phone: cleanPhone,
        name: customerName.trim().slice(0, 80),
        createdAt: nowIso,
        lastSeenAt: nowIso,
        lastOrderAt: nowIso,
        addresses: address?.street ? [address] : [],
        totalOrders: 0,
        totalSpent: 0,
        averageTicket: 0,
        preferredPaymentMethod: paymentMethod,
        itemFrequency: {},
        tags: ['Novo Cliente'],
        adminNotes: '',
        giftHistory: [],
        activities: [],
      };
      state.customers.unshift(customer);
    } else {
      customer.name = customerName.trim().slice(0, 80) || customer.name;
      customer.lastSeenAt = nowIso;
      customer.lastOrderAt = nowIso;
      customer.preferredPaymentMethod = paymentMethod;
      if (address?.street) {
        const exists = customer.addresses.some(
          (a) =>
            a.street.toLowerCase() === address.street.toLowerCase() &&
            a.number === address.number
        );
        if (!exists) {
          customer.addresses.unshift(address);
        } else {
          customer.addresses[0] = address;
        }
      }
    }

    customer.totalOrders += 1;
    customer.totalSpent += totalAmount;
    customer.averageTicket = customer.totalSpent / customer.totalOrders;

    for (const item of orderItems) {
      const prev = customer.itemFrequency[item.productId] || {
        productName: item.productName,
        count: 0,
        totalSpent: 0,
      };
      prev.count += item.quantity;
      prev.totalSpent += item.quantity * item.unitPrice;
      customer.itemFrequency[item.productId] = prev;
    }

    const tagsSet = new Set(customer.tags.filter((t) => t !== 'Novo Cliente'));
    if (customer.totalOrders === 1) tagsSet.add('1º Pedido');
    if (customer.totalOrders >= 3) tagsSet.add('Cliente Fiel');
    if (customer.totalOrders >= 5) tagsSet.add('VIP — Merece Brinde');
    if (customer.averageTicket >= 45) tagsSet.add('Ticket Alto');
    const topItem = Object.values(customer.itemFrequency).sort((a, b) => b.count - a.count)[0];
    if (topItem && topItem.count >= 2) {
      const shortFav = topItem.productName.split('-')[0].trim();
      tagsSet.add(`Fã de ${shortFav}`);
    }
    customer.tags = Array.from(tagsSet);

    const cleanChangeFor =
      paymentMethod === 'Dinheiro' && changeFor?.trim()
        ? String(changeFor).trim().slice(0, 60)
        : undefined;

    const newOrder: SaleOrder = {
      id: `ord-${Date.now()}`,
      orderNumber: nextOrderNumber,
      createdAt: nowIso,
      date: todayDate,
      customerId: customer.id,
      customerName: customer.name,
      customerPhone: cleanPhone,
      deliveryAddress: address || {
        street: 'Retirada / A combinar',
        number: 'S/N',
        neighborhood: 'Centro',
      },
      items: orderItems,
      subtotal,
      deliveryFee,
      totalAmount,
      totalCmv,
      paymentMethod,
      changeFor: cleanChangeFor,
      paymentFeeAmount,
      taxReserveAmount,
      fixedCostAllocationAmount,
      netProfit,
      status: 'Novo Pedido',
      origin: 'Cardápio Virtual',
      customerNotes: customerNotes ? String(customerNotes).slice(0, 300) : undefined,
    };

    const summaryText = orderItems
      .map((i) => `${i.quantity}x ${i.productName.split('-')[0].trim()}`)
      .join(', ');
    customer.activities.unshift({
      id: `act-${Date.now()}`,
      timestamp: nowIso,
      type: 'pedido_realizado',
      description: `Pedido #${nextOrderNumber} (${summaryText}) via ${paymentMethod}`,
      orderId: newOrder.id,
      totalValue: totalAmount,
    });

    state.orders.unshift(newOrder);
    await saveAppState(state);

    // Issue signed customer recognition cookie on this browser for future 1-click orders
    const customerCookie = await signSession(cleanPhone, CUSTOMER_SESSION_MAX_AGE, 'customer');
    const res = NextResponse.json({
      ok: true,
      order: {
        orderNumber: newOrder.orderNumber,
        createdAt: newOrder.createdAt,
        customerName: newOrder.customerName,
        customerPhone: newOrder.customerPhone,
        deliveryAddress: newOrder.deliveryAddress,
        items: newOrder.items,
        subtotal: newOrder.subtotal,
        deliveryFee: newOrder.deliveryFee,
        totalAmount: newOrder.totalAmount,
        paymentMethod: newOrder.paymentMethod,
        changeFor: newOrder.changeFor,
        customerNotes: newOrder.customerNotes,
        pixKey: state.settings.pixKey,
        pixBeneficiary: state.settings.pixBeneficiary,
        whatsappNumber: state.settings.whatsappNumber,
        estimatedDeliveryMinutes: state.settings.estimatedDeliveryMinutes,
      },
    });
    res.cookies.set(CUSTOMER_COOKIE_NAME, customerCookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: CUSTOMER_SESSION_MAX_AGE,
    });
    return res;
  } catch (err) {
    console.error('Public order error:', err);
    return NextResponse.json({ error: 'Erro ao registrar pedido.' }, { status: 500 });
  }
}
