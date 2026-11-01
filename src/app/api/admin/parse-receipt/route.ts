import { isAdminAuthenticated } from '@/lib/auth';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const isAuth = await isAdminAuthenticated();
  if (!isAuth) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { rawText, imageBase64, mimeType, apiKey } = body as {
      rawText?: string;
      imageBase64?: string;
      mimeType?: string;
      apiKey?: string;
    };

    const geminiKey = apiKey || process.env.GEMINI_API_KEY;

    // If user provided a Gemini API key (free tier on Google AI Studio) or env var exists, call Gemini 2.5 Flash
    if (geminiKey) {
      const prompt = `Você é um leitor contábil especialista em Notas Fiscais e Cupons Fiscais de supermercados e atacadistas para uma hamburgueria.
Extraia os dados da nota fiscal enviada e retorne APENAS um JSON válido com este formato exato:
{
  "supplier": "Nome do Mercado / Atacadista",
  "date": "YYYY-MM-DD",
  "invoiceNumber": "Número do cupom ou nota",
  "paymentMethod": "PIX" | "Boleto" | "Cartão de Crédito" | "Cartão de Débito" | "Dinheiro",
  "items": [
    {
      "name": "Nome do Produto",
      "category": "Proteína" | "Panificação" | "Queijos e Frios" | "Molhos" | "Hortifrúti e Conservas" | "Acompanhamentos" | "Bebidas" | "Embalagem" | "Óleos e Gorduras" | "Outros",
      "packageDescription": "Ex: Pacote 1kg, Bisnaga 1kg, Pack 12 un",
      "quantity": 1,
      "contentPerPackage": 1000,
      "usageUnit": "g" | "un" | "ml" | "l",
      "unitPrice": 34.00,
      "totalPrice": 34.00
    }
  ]
}`;

      const parts: Record<string, unknown>[] = [{ text: prompt }];
      if (rawText) {
        parts.push({ text: `Texto da nota/cupom:\n${rawText}` });
      }
      if (imageBase64 && mimeType) {
        parts.push({
          inline_data: {
            mime_type: mimeType,
            data: imageBase64.replace(/^data:[^;]+;base64,/, ''),
          },
        });
      }

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts }],
            generationConfig: {
              responseMimeType: 'application/json',
              temperature: 0.1,
            },
          }),
        }
      );

      if (response.ok) {
        const data = await response.json();
        const textOut = data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
        const parsed = JSON.parse(textOut);
        return NextResponse.json({ ok: true, mode: 'gemini-flash', invoice: parsed });
      }
    }

    // Intelligent local heuristic parser for pasted receipt text / WhatsApp supplier list (100% free without API key)
    const lines = (rawText || '')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    const extractedItems = [];
    let supplier = 'Atacadão / Fornecedor Local';
    const date = new Date().toISOString().slice(0, 10);

    for (const line of lines) {
      if (/^(FORNECEDOR|MERCADO|ATACADAO|ASSAI|DISTRIBUIDORA)[:\s-]/i.test(line)) {
        supplier = line.replace(/^(FORNECEDOR|MERCADO|ATACADAO|ASSAI|DISTRIBUIDORA)[:\s-]*/i, '').trim();
        continue;
      }

      // Pattern e.g.: "2x Blend de Carne 1kg R$ 34,00" or "Queijo Cheddar 1kg - 54,90"
      const priceMatch = line.match(/(?:R\$\s*)?(\d+[.,]\d{2})\s*$/);
      if (!priceMatch) continue;

      const priceVal = parseFloat(priceMatch[1].replace(',', '.'));
      const withoutPrice = line.slice(0, priceMatch.index).replace(/[-–—:\s]+$/, '').trim();
      const qtyPrefix = withoutPrice.match(/^(\d+(?:[.,]\d+)?)\s*[xX*]\s*(.+)$/);

      const quantity = qtyPrefix ? parseFloat(qtyPrefix[1].replace(',', '.')) : 1;
      const itemName = qtyPrefix ? qtyPrefix[2].trim() : withoutPrice;

      const upper = itemName.toUpperCase();
      const isKg = /(\d+)\s*KG/i.test(upper);
      const isPack = /PACK|FARDO|CAIXA|LATA/i.test(upper);

      extractedItems.push({
        name: itemName,
        category: upper.includes('CARNE') || upper.includes('FRANGO') || upper.includes('COSTELA')
          ? 'Proteína'
          : upper.includes('QUEIJO') || upper.includes('CHEDDAR') || upper.includes('BACON')
          ? 'Queijos e Frios'
          : upper.includes('COCA') || upper.includes('GUARANA') || upper.includes('CAJUINA')
          ? 'Bebidas'
          : upper.includes('KRAFT') || upper.includes('PAPEL')
          ? 'Embalagem'
          : 'Molhos',
        packageDescription: isKg ? 'Pacote 1kg' : isPack ? 'Pack 12 un' : 'Unidade / Pacote',
        quantity,
        contentPerPackage: isKg ? 1000 : isPack ? 12 : 1000,
        usageUnit: isPack ? 'un' : 'g',
        unitPrice: priceVal,
        totalPrice: Number((quantity * priceVal).toFixed(2)),
      });
    }

    return NextResponse.json({
      ok: true,
      mode: 'smart-local-parser',
      invoice: {
        supplier,
        date,
        invoiceNumber: `CUPOM-${Math.floor(1000 + Math.random() * 9000)}`,
        paymentMethod: 'PIX',
        items: extractedItems,
      },
    });
  } catch (err) {
    console.error('Parse receipt error:', err);
    return NextResponse.json({ error: 'Não foi possível interpretar o cupom.' }, { status: 400 });
  }
}
