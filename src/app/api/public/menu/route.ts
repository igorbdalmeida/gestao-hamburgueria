import { checkRateLimit, getClientIp, loadAppState, saveAppState } from '@/lib/db';
import {
  calculateOrderFinancials,
  calculateProductMetrics,
  normalizePhone,
} from '@/lib/pricing';
import {
  CUSTOMER_COOKIE_NAME,
  CUSTOMER_SESSION_MAX_AGE,
  signSession,
  verifySession,
} from '@/lib/session';
import { OrderItem, OrderItemAddon, OrderPaymentMethod, SaleOrder } from '@/lib/types';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { toLocalDate } from '@/lib/periods';

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

    const activeCoupons = (customer.coupons || []).filter((cp) => !cp.used);

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
        activeCoupons,
      },
    });
  }

  const globalBurgerLimit =
    typeof state.settings.dailyBurgerLimit === 'number'
      ? state.settings.dailyBurgerLimit
      : null;

  const getCategoryPriority = (cat?: string) => {
    const c = (cat || '').toLowerCase();
    if (c.includes('hamb') || c.includes('burger') || c.includes('lanche')) return 1;
    if (c.includes('porç') || c.includes('porc') || c.includes('combo') || c.includes('batata')) return 2;
    if (c.includes('sobremesa') || c.includes('doce')) return 3;
    if (c.includes('bebida') || c.includes('refrig')) return 4;
    if (c.includes('acréscimo') || c.includes('acrescimo') || c.includes('adicion')) return 6;
    return 5;
  };

  const getStatusPriority = (status?: string) => {
    if (!status || status === 'disponivel') return 1;
    if (status === 'em_breve') return 2;
    return 3;
  };

  // Public Menu Response — NO CMV, NO MARGINS, NO SUPPLIERS, NO FINANCIAL DATA
  const publicMenu = state.products
    .filter((p) => p.availableInMenu)
    .map((p) => {
      let effectiveStatus = p.menuStatus || 'disponivel';
      if (effectiveStatus === 'disponivel') {
        if (p.trackStock && typeof p.stockQty === 'number' && p.stockQty <= 0) {
          effectiveStatus = 'esgotado';
        } else if (
          p.category === 'Hambúrgueres' &&
          globalBurgerLimit !== null &&
          globalBurgerLimit <= 0
        ) {
          effectiveStatus = 'esgotado';
        }
      }
      return {
        id: p.id,
        name: p.shortName || p.name,
        description: p.description,
        category: p.category,
        imageEmoji: p.imageEmoji,
        imageUrl: p.imageUrl || null,
        price: p.practicedPrice,
        featured: Boolean(p.featured),
        menuStatus: effectiveStatus,
        trackStock: Boolean(p.trackStock),
        stockQty: p.trackStock && typeof p.stockQty === 'number' ? p.stockQty : null,
      };
    })
    .sort((a, b) => {
      const catDiff = getCategoryPriority(a.category) - getCategoryPriority(b.category);
      if (catDiff !== 0) return catDiff;
      return getStatusPriority(a.menuStatus) - getStatusPriority(b.menuStatus);
    });

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
      dailyBurgerLimit: globalBurgerLimit,
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
      useCouponId,
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
      items: {
        productId: string;
        quantity: number;
        notes?: string;
        addons?: { productId: string; quantity: number }[];
      }[];
      paymentMethod: OrderPaymentMethod;
      changeFor?: string;
      customerNotes?: string;
      useCouponId?: string;
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
    const todayDate = toLocalDate(nowIso);

    // Calculate internal CMV & profit metrics silently on server
    const orderItems: OrderItem[] = [];
    let subtotal = 0;
    let totalCmv = 0;
    let totalBurgersInOrder = 0;

    // Aggregate quantities per productId to validate stock accurately
    const requestedProductQty: Record<string, number> = {};

    for (const cartItem of items) {
      const product = state.products.find((p) => p.id === cartItem.productId);
      if (!product || !product.availableInMenu) continue;

      const status = product.menuStatus || 'disponivel';
      if (status === 'em_breve') {
        return NextResponse.json(
          { error: `O item "${product.shortName || product.name}" estará disponível em breve e ainda não pode ser pedido.` },
          { status: 400 }
        );
      }
      if (status === 'esgotado') {
        return NextResponse.json(
          { error: `O item "${product.shortName || product.name}" acabou de esgotar hoje.` },
          { status: 400 }
        );
      }

      const qty = Math.min(50, Math.max(1, Number(cartItem.quantity) || 1));
      requestedProductQty[product.id] = (requestedProductQty[product.id] || 0) + qty;

      if (
        product.trackStock &&
        typeof product.stockQty === 'number' &&
        requestedProductQty[product.id] > product.stockQty
      ) {
        return NextResponse.json(
          {
            error:
              product.stockQty <= 0
                ? `O item "${product.shortName || product.name}" esgotou hoje.`
                : `Restam apenas ${product.stockQty} unidade(s) de "${product.shortName || product.name}" hoje.`,
          },
          { status: 400 }
        );
      }

      if (product.category === 'Hambúrgueres') {
        totalBurgersInOrder += qty;
      }

      const metrics = calculateProductMetrics(product, state.ingredients);

      // Process optional burger add-ons
      const orderItemAddons: OrderItemAddon[] = [];
      if (Array.isArray(cartItem.addons)) {
        for (const addonInput of cartItem.addons) {
          const addonQty = Math.min(10, Math.max(0, Number(addonInput.quantity) || 0));
          if (addonQty <= 0) continue;
          const addonProd = state.products.find(
            (p) => p.id === addonInput.productId && p.category === 'Acréscimos / Adicionais'
          );
          if (!addonProd || !addonProd.availableInMenu) continue;
          const addonStatus = addonProd.menuStatus || 'disponivel';
          if (addonStatus !== 'disponivel') continue;

          const totalAddonNeeded = addonQty * qty;
          requestedProductQty[addonProd.id] =
            (requestedProductQty[addonProd.id] || 0) + totalAddonNeeded;

          if (
            addonProd.trackStock &&
            typeof addonProd.stockQty === 'number' &&
            requestedProductQty[addonProd.id] > addonProd.stockQty
          ) {
            return NextResponse.json(
              {
                error: `O acréscimo "${addonProd.shortName || addonProd.name}" está sem estoque suficiente hoje.`,
              },
              { status: 400 }
            );
          }

          const addonMetrics = calculateProductMetrics(addonProd, state.ingredients);
          orderItemAddons.push({
            addonId: addonProd.id,
            productId: addonProd.id,
            name: addonProd.shortName || addonProd.name,
            quantity: addonQty,
            unitPrice: addonProd.practicedPrice,
            unitCmv: addonMetrics.totalCmv,
          });
        }
      }

      const addonsUnitPrice = orderItemAddons.reduce(
        (sum, a) => sum + a.unitPrice * a.quantity,
        0
      );
      const addonsUnitCmv = orderItemAddons.reduce(
        (sum, a) => sum + a.unitCmv * a.quantity,
        0
      );

      const unitPriceWithAddons = product.practicedPrice + addonsUnitPrice;
      const unitCmvWithAddons = metrics.totalCmv + addonsUnitCmv;

      orderItems.push({
        productId: product.id,
        productName: product.shortName || product.name,
        quantity: qty,
        unitPrice: unitPriceWithAddons,
        unitCmv: unitCmvWithAddons,
        notes: cartItem.notes ? String(cartItem.notes).slice(0, 200) : undefined,
        addons: orderItemAddons.length > 0 ? orderItemAddons : undefined,
      });

      subtotal += unitPriceWithAddons * qty;
      totalCmv += unitCmvWithAddons * qty;
    }

    if (
      typeof state.settings.dailyBurgerLimit === 'number' &&
      totalBurgersInOrder > 0 &&
      totalBurgersInOrder > state.settings.dailyBurgerLimit
    ) {
      return NextResponse.json(
        {
          error:
            state.settings.dailyBurgerLimit <= 0
              ? 'Nossos hambúrgueres artesanais esgotaram por hoje!'
              : `Restam apenas ${state.settings.dailyBurgerLimit} hambúrguer(es) disponíveis na fornada de hoje.`,
        },
        { status: 400 }
      );
    }

    if (orderItems.length === 0) {
      return NextResponse.json(
        { error: 'Nenhum item válido selecionado.' },
        { status: 400 }
      );
    }

    // Automatically deduct stock quantities for ordered products & add-ons
    for (const [prodId, usedQty] of Object.entries(requestedProductQty)) {
      const prod = state.products.find((p) => p.id === prodId);
      if (prod && prod.trackStock && typeof prod.stockQty === 'number') {
        prod.stockQty = Math.max(0, prod.stockQty - usedQty);
        if (prod.stockQty === 0) {
          prod.menuStatus = 'esgotado';
        }
      }
    }
    if (typeof state.settings.dailyBurgerLimit === 'number' && totalBurgersInOrder > 0) {
      state.settings.dailyBurgerLimit = Math.max(
        0,
        state.settings.dailyBurgerLimit - totalBurgersInOrder
      );
    }

    // Find or create customer profile ("Investigator CRM")
    let customer = state.customers.find(
      (c) => normalizePhone(c.phone) === cleanPhone || normalizePhone(c.phone).endsWith(cleanPhone)
    );

    // Check if the customer has a valid unused coupon to apply
    let discountAmount = 0;
    let appliedCouponCode: string | undefined;
    let appliedCouponObj: NonNullable<typeof customer>['coupons'] extends (infer U)[] | undefined ? U | undefined : never;

    if (useCouponId && customer?.coupons) {
      const foundCoupon = customer.coupons.find((cp) => cp.id === useCouponId && !cp.used);
      if (foundCoupon && foundCoupon.discountPct > 0) {
        appliedCouponObj = foundCoupon;
        discountAmount = Number(((subtotal * foundCoupon.discountPct) / 100).toFixed(2));
        appliedCouponCode = `${foundCoupon.code} (${foundCoupon.discountPct}% OFF)`;
      }
    }

    const discountedSubtotal = Math.max(0, Number((subtotal - discountAmount).toFixed(2)));
    const deliveryFee = state.settings.deliveryFeeDefault || 0;
    const totalAmount = Number((discountedSubtotal + deliveryFee).toFixed(2));

    const fin = calculateOrderFinancials(
      {
        items: orderItems,
        subtotal: discountedSubtotal,
        deliveryFee,
        totalAmount,
        totalCmv,
        paymentMethod,
      },
      state.products,
      state.ingredients,
      state.settings
    );

    const paymentFeeAmount = fin.deliveryFeeReserveAmount + fin.cardMachineFeeAmount;
    const taxReserveAmount = fin.taxReserveAmount;
    const fixedCostAllocationAmount = fin.fixedCostAllocationAmount;
    const netProfit = fin.baseNetProfit;

    const nextOrderNumber =
      state.orders.reduce((max, o) => Math.max(max, o.orderNumber || 100), 100) + 1;

    const validOrdersCountSoFar = state.orders.filter((o) => o.status !== 'Cancelado').length;

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
        coupons: [],
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
    if (validOrdersCountSoFar < 50) tagsSet.add('Top 50 Inauguração');
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
      subtotal: discountedSubtotal,
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
      couponCode: appliedCouponCode,
      discountAmount: discountAmount > 0 ? discountAmount : undefined,
    };

    if (appliedCouponObj) {
      appliedCouponObj.used = true;
      appliedCouponObj.usedAt = nowIso;
      appliedCouponObj.usedOrderId = newOrder.id;
    }

    const summaryText = orderItems
      .map((i) => `${i.quantity}x ${i.productName.split('-')[0].trim()}`)
      .join(', ');
    customer.activities.unshift({
      id: `act-${Date.now()}`,
      timestamp: nowIso,
      type: 'pedido_realizado',
      description: `Pedido #${nextOrderNumber} (${summaryText}) via ${paymentMethod}${
        appliedCouponCode ? ` [Cupom: ${appliedCouponCode} -${discountAmount.toFixed(2)}]` : ''
      }`,
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
        couponCode: newOrder.couponCode,
        discountAmount: newOrder.discountAmount,
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
