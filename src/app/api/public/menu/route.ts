import { loadAppState, saveAppState } from '@/lib/db';
import { calculateProductMetrics, normalizePhone } from '@/lib/pricing';
import { CustomerProfile, OrderItem, OrderPaymentMethod, SaleOrder } from '@/lib/types';
import { NextResponse } from 'next/server';

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

    // Record menu visit in customer history silently
    customer.lastSeenAt = new Date().toISOString();
    customer.activities.unshift({
      id: `act-${Date.now()}`,
      timestamp: new Date().toISOString(),
      type: 'acesso_cardapio',
      description: 'Acessou o Cardápio Virtual e foi reconhecido automaticamente pelo telefone',
    });
    await saveAppState(state);

    // Return ONLY what the customer needs to prefill their checkout (no internal notes or CMV!)
    const favoriteItemIds = Object.entries(customer.itemFrequency || {})
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 2)
      .map(([id]) => id);

    return NextResponse.json({
      found: true,
      customer: {
        name: customer.name,
        phone: customer.phone,
        lastAddress: customer.addresses[0] || null,
        preferredPaymentMethod: customer.preferredPaymentMethod || 'PIX (Mercado Pago / Chave)',
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
    const body = await request.json();
    const {
      customerName,
      customerPhone,
      address,
      items,
      paymentMethod,
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
      customerNotes?: string;
    };

    const cleanPhone = normalizePhone(customerPhone || '');
    if (!customerName?.trim() || cleanPhone.length < 8 || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: 'Preencha seu nome, telefone e escolha pelo menos 1 item.' },
        { status: 400 }
      );
    }

    const state = await loadAppState();
    const nowIso = new Date().toISOString();
    const todayDate = nowIso.slice(0, 10);

    // Calculate internal CMV & profit metrics silently on server
    const orderItems: OrderItem[] = [];
    let subtotal = 0;
    let totalCmv = 0;

    for (const cartItem of items) {
      const product = state.products.find((p) => p.id === cartItem.productId);
      if (!product) continue;
      const metrics = calculateProductMetrics(product, state.ingredients);
      const qty = Math.max(1, Number(cartItem.quantity) || 1);

      orderItems.push({
        productId: product.id,
        productName: product.name,
        quantity: qty,
        unitPrice: product.practicedPrice,
        unitCmv: metrics.totalCmv,
        notes: cartItem.notes,
      });

      subtotal += product.practicedPrice * qty;
      totalCmv += metrics.totalCmv * qty;
    }

    const deliveryFee = state.settings.deliveryFeeDefault || 0;
    const totalAmount = subtotal + deliveryFee;

    let feePct = 0;
    if (paymentMethod === 'PIX (Mercado Pago / Chave)') {
      feePct = state.settings.pixFeePct;
    } else if (paymentMethod === 'Cartão na Entrega (Maquininha InfinitePay)') {
      feePct = state.settings.creditCardFeePct;
    } else if (paymentMethod === 'Link de Pagamento (InfinitePay)') {
      feePct = state.settings.paymentLinkFeePct;
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
        name: customerName.trim(),
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
      customer.name = customerName.trim() || customer.name;
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

    // Update item frequencies & auto-tags
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

    // Smart auto-tags based on behavior
    const tagsSet = new Set(customer.tags.filter((t) => t !== 'Novo Cliente'));
    if (customer.totalOrders === 1) tagsSet.add('1º Pedido');
    if (customer.totalOrders >= 3) tagsSet.add('Cliente Fiel');
    if (customer.totalOrders >= 5) tagsSet.add('VIP — Merece Brinde 🎁');
    if (customer.averageTicket >= 45) tagsSet.add('Ticket Alto');
    const topItem = Object.values(customer.itemFrequency).sort((a, b) => b.count - a.count)[0];
    if (topItem && topItem.count >= 2) {
      const shortFav = topItem.productName.split('-')[0].trim();
      tagsSet.add(`Fã de ${shortFav}`);
    }
    customer.tags = Array.from(tagsSet);

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
      paymentFeeAmount,
      taxReserveAmount,
      fixedCostAllocationAmount,
      netProfit,
      status: 'Novo Pedido',
      origin: 'Cardápio Virtual',
      customerNotes,
      infinitePayLink:
        paymentMethod === 'Link de Pagamento (InfinitePay)'
          ? `https://pay.infinitepay.io/${state.settings.storeName.toLowerCase().replace(/[^a-z0-9]/g, '')}/${totalAmount.toFixed(2).replace('.', '')}`
          : undefined,
    };

    const summaryText = orderItems.map((i) => `${i.quantity}x ${i.productName.split('-')[0].trim()}`).join(', ');
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

    // Return clean public receipt to the customer
    return NextResponse.json({
      ok: true,
      order: {
        orderNumber: newOrder.orderNumber,
        createdAt: newOrder.createdAt,
        customerName: newOrder.customerName,
        totalAmount: newOrder.totalAmount,
        paymentMethod: newOrder.paymentMethod,
        infinitePayLink: newOrder.infinitePayLink,
        pixKey: state.settings.pixKey,
        pixBeneficiary: state.settings.pixBeneficiary,
        whatsappNumber: state.settings.whatsappNumber,
        estimatedDeliveryMinutes: state.settings.estimatedDeliveryMinutes,
      },
    });
  } catch (err) {
    console.error('Public order error:', err);
    return NextResponse.json({ error: 'Erro ao registrar pedido.' }, { status: 500 });
  }
}
