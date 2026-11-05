import { isAdminAuthenticated } from '@/lib/auth';
import { loadAppState } from '@/lib/db';
import { NextResponse } from 'next/server';
import { todayLocal } from '@/lib/periods';

export const dynamic = 'force-dynamic';

const RECEIPT_SYSTEM_PROMPT = `Você é um leitor contábil especialista em Notas Fiscais (NF-e), Cupons Fiscais (NFC-e / SAT) e listas de compras de supermercados, atacadistas e distribuidores para uma hamburgueria artesanal.
Analise os dados da nota/cupom fiscal e extraia TODOS os itens comprados.
Retorne APENAS um objeto JSON válido (sem markdown, sem blocos de código) seguindo exatamente este formato:
{
  "supplier": "Nome do Mercado / Atacadista / Fornecedor",
  "date": "YYYY-MM-DD",
  "invoiceNumber": "Número do cupom ou nota",
  "paymentMethod": "PIX" | "Boleto" | "Cartão de Crédito" | "Cartão de Débito" | "Dinheiro",
  "items": [
    {
      "name": "Nome limpo e organizado do produto",
      "category": "Proteína" | "Panificação" | "Queijos e Frios" | "Molhos" | "Hortifrúti e Conservas" | "Acompanhamentos" | "Bebidas" | "Embalagem" | "Óleos e Gorduras" | "Outros",
      "packageDescription": "Ex: Pacote 1kg, Bisnaga 1kg, Pack 12 un, Caixa",
      "quantity": 1,
      "contentPerPackage": 1000,
      "usageUnit": "g" | "un" | "ml" | "l",
      "unitPrice": 34.00,
      "totalPrice": 34.00
    }
  ]
}
Regras importantes de conversão para hamburgueria:
- Se o item é vendido em KG (ex: "1,500 kg" ou "Pacote 2kg"), converta para gramas (usageUnit: "g", contentPerPackage: 1500 ou 2000).
- Se for pão, lata de refrigerante, saco kraft ou papel acoplado, use usageUnit: "un" e informe quantas unidades vêm no pacote em contentPerPackage.
- Se a data não estiver visível, use a data de hoje.`;

function cleanJsonOutput(raw: string): string {
  const stripped = raw
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  const firstBrace = stripped.indexOf('{');
  const lastBrace = stripped.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return stripped.slice(firstBrace, lastBrace + 1);
  }
  return stripped;
}

async function extractTextFromImageOcr(base64Data: string, mimeType: string): Promise<string> {
  try {
    const form = new URLSearchParams();
    form.set('apikey', process.env.OCR_SPACE_API_KEY || 'helloworld');
    form.set('language', 'por');
    form.set('isOverlayRequired', 'false');
    form.set('isTable', 'true');
    form.set('scale', 'true');
    form.set('OCREngine', '2');
    form.set('base64Image', `data:${mimeType};base64,${base64Data}`);

    const res = await fetch('https://api.ocr.space/parse/image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
    if (!res.ok) return '';
    const data = await res.json();
    const parsedText = (data?.ParsedResults || [])
      .map((r: { ParsedText?: string }) => r?.ParsedText || '')
      .join('\n')
      .trim();
    return parsedText;
  } catch {
    return '';
  }
}

async function parseReceiptTextWithZeroKeyAi(textToAnalyze: string) {
  try {
    const res = await fetch('https://text.pollinations.ai/openai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'openai',
        temperature: 0.1,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: RECEIPT_SYSTEM_PROMPT },
          {
            role: 'user',
            content: `Extraia todos os itens e valores deste cupom/nota fiscal de compra:\n\n${textToAnalyze}`,
          },
        ],
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content || '';
    if (!content) return null;
    const parsed = JSON.parse(cleanJsonOutput(content));
    if (parsed && Array.isArray(parsed.items) && parsed.items.length > 0) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const isAuth = await isAdminAuthenticated();
  if (!isAuth) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { rawText, imageBase64, mimeType } = body as {
      rawText?: string;
      imageBase64?: string;
      mimeType?: string;
    };

    const state = await loadAppState();
    const geminiKey =
      process.env.GEMINI_API_KEY ||
      process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
      state.settings?.geminiApiKey?.trim();

    const cleanBase64 = imageBase64 ? imageBase64.replace(/^data:[^;]+;base64,/, '') : '';
    const mediaMime = mimeType || 'image/jpeg';

    // Tier 1: Google Gemini (visão + texto). Tenta modelos em ordem e guarda o motivo da falha.
    let geminiError = '';
    if (geminiKey) {
      const parts: Record<string, unknown>[] = [{ text: RECEIPT_SYSTEM_PROMPT }];
      if (rawText?.trim()) {
        parts.push({ text: `Texto complementar da nota/cupom:\n${rawText}` });
      }
      if (cleanBase64) {
        parts.push({ inline_data: { mime_type: mediaMime, data: cleanBase64 } });
      }

      for (const model of ['gemini-2.5-flash', 'gemini-2.0-flash']) {
        try {
          const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'x-goog-api-key': geminiKey },
              body: JSON.stringify({
                contents: [{ parts }],
                generationConfig: { responseMimeType: 'application/json', temperature: 0.1 },
              }),
            }
          );

          if (response.ok) {
            const data = await response.json();
            const textOut = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
            const parsed = textOut ? JSON.parse(cleanJsonOutput(textOut)) : null;
            if (parsed && Array.isArray(parsed.items) && parsed.items.length > 0) {
              return NextResponse.json({ ok: true, mode: 'gemini-flash-vision', invoice: parsed });
            }
            geminiError = 'A IA leu a imagem mas não encontrou itens de compra. Tente uma foto mais nítida e de frente.';
            break;
          }

          const errBody = await response.text().catch(() => '');
          if (response.status === 400 && /API key|API_KEY/i.test(errBody)) {
            geminiError = 'A chave do Gemini informada é inválida. Confira em Configurações.';
            break;
          }
          if (response.status === 403) {
            geminiError = 'A chave do Gemini não tem permissão. Gere uma nova chave em aistudio.google.com/apikey.';
            break;
          }
          if (response.status === 429) {
            geminiError = 'Limite gratuito do Gemini atingido por agora. Aguarde um minuto e tente novamente.';
            continue;
          }
          geminiError = `O Gemini não conseguiu processar este arquivo (erro ${response.status}).`;
        } catch (e) {
          console.error('Gemini receipt error:', e);
          geminiError = 'Falha ao conversar com o Gemini. Tente novamente.';
        }
      }
    }

    // Tier 2: Vercel AI Gateway (if token present)
    const gatewayToken = process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN;
    if (gatewayToken) {
      try {
        const userContent: Record<string, unknown>[] = [
          { type: 'text', text: RECEIPT_SYSTEM_PROMPT },
        ];
        if (rawText?.trim()) {
          userContent.push({ type: 'text', text: `Texto da nota:\n${rawText}` });
        }
        if (cleanBase64) {
          userContent.push({
            type: 'image_url',
            image_url: { url: `data:${mediaMime};base64,${cleanBase64}` },
          });
        }

        const gwRes = await fetch('https://ai-gateway.vercel.sh/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${gatewayToken}`,
          },
          body: JSON.stringify({
            model: 'google/gemini-2.5-flash',
            temperature: 0.1,
            response_format: { type: 'json_object' },
            messages: [{ role: 'user', content: userContent }],
          }),
        });

        if (gwRes.ok) {
          const gwData = await gwRes.json();
          const content = gwData?.choices?.[0]?.message?.content || '{}';
          const parsed = JSON.parse(cleanJsonOutput(content));
          return NextResponse.json({ ok: true, mode: 'ai-gateway-vision', invoice: parsed });
        }
      } catch {
        // Proceed to next tier
      }
    }

    // Tier 3: Zero-Key Built-In OCR + LLM Structuring
    let combinedText = (rawText || '').trim();
    if (cleanBase64) {
      const ocrText = await extractTextFromImageOcr(cleanBase64, mediaMime);
      if (ocrText) {
        combinedText = combinedText ? `${combinedText}\n${ocrText}` : ocrText;
      }
    }

    if (combinedText) {
      const aiParsed = await parseReceiptTextWithZeroKeyAi(combinedText);
      if (aiParsed) {
        return NextResponse.json({
          ok: true,
          mode: 'ia-integrada',
          invoice: aiParsed,
        });
      }
    }

    // Tier 4: Deterministic Heuristic Parser
    const lines = combinedText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    const extractedItems = [];
    let supplier = 'Atacadão / Fornecedor Local';
    const date = todayLocal();

    for (const line of lines) {
      if (/^(FORNECEDOR|MERCADO|ATACADAO|ATACADÃO|ASSAI|ASSAÍ|DISTRIBUIDORA)[:\s-]/i.test(line)) {
        supplier = line
          .replace(/^(FORNECEDOR|MERCADO|ATACADAO|ATACADÃO|ASSAI|ASSAÍ|DISTRIBUIDORA)[:\s-]*/i, '')
          .trim();
        continue;
      }

      const priceMatch = line.match(/(?:R\$\s*)?(\d+[.,]\d{2})\s*$/);
      if (!priceMatch) continue;

      const priceVal = parseFloat(priceMatch[1].replace(',', '.'));
      if (priceVal <= 0) continue;

      const withoutPrice = line.slice(0, priceMatch.index).replace(/[-–—:\s]+$/, '').trim();
      if (/^(TOTAL|SUBTOTAL|VALOR PAGO|TROCO|DESCONTO|TRIBUTOS)/i.test(withoutPrice)) continue;

      const qtyPrefix = withoutPrice.match(/^(\d+(?:[.,]\d+)?)\s*[xX*]\s*(.+)$/);
      const quantity = qtyPrefix ? parseFloat(qtyPrefix[1].replace(',', '.')) : 1;
      const itemName = (qtyPrefix ? qtyPrefix[2].trim() : withoutPrice).replace(/^\d{3}\s+/, '');

      const upper = itemName.toUpperCase();
      const kgMatch = upper.match(/(\d+(?:[.,]\d+)?)\s*KG/i);
      const gMatch = upper.match(/(\d+)\s*G\b/i);
      const unMatch = upper.match(/(\d+)\s*UN/i);
      const isPack = /PACK|FARDO|CAIXA|LATA|GARRAFA|REFRI/i.test(upper);
      const isPackaging = /KRAFT|PAPEL|ACOPLADO|SACOLA|EMBALAGEM|CAIXA HAMB/i.test(upper);

      let contentPerPackage = 1000;
      let usageUnit: 'g' | 'un' | 'ml' | 'l' = 'g';
      let packageDescription = 'Pacote 1kg';

      if (kgMatch) {
        const kg = parseFloat(kgMatch[1].replace(',', '.')) || 1;
        contentPerPackage = Math.round(kg * 1000);
        usageUnit = 'g';
        packageDescription = `Pacote ${kg}kg`;
      } else if (gMatch) {
        contentPerPackage = parseInt(gMatch[1], 10) || 500;
        usageUnit = 'g';
        packageDescription = `Embalagem ${contentPerPackage}g`;
      } else if (isPackaging || isPack || unMatch) {
        contentPerPackage = unMatch ? parseInt(unMatch[1], 10) || 1 : isPack ? 12 : 100;
        usageUnit = 'un';
        packageDescription = `${contentPerPackage} un`;
      }

      extractedItems.push({
        name: itemName,
        category:
          upper.includes('CARNE') || upper.includes('FRANGO') || upper.includes('COSTELA') || upper.includes('HAMB')
            ? 'Proteína'
            : upper.includes('PAO') || upper.includes('PÃO') || upper.includes('BRIOCHE')
            ? 'Panificação'
            : upper.includes('QUEIJO') || upper.includes('CHEDDAR') || upper.includes('BACON') || upper.includes('MUSSARELA')
            ? 'Queijos e Frios'
            : upper.includes('COCA') || upper.includes('GUARANA') || upper.includes('CAJUINA') || upper.includes('REFRI')
            ? 'Bebidas'
            : isPackaging
            ? 'Embalagem'
            : upper.includes('BATATA') || upper.includes('CEBOLA') || upper.includes('ANEL')
            ? 'Acompanhamentos'
            : upper.includes('PICLES') || upper.includes('ALFACE') || upper.includes('TOMATE')
            ? 'Hortifrúti e Conservas'
            : 'Molhos',
        packageDescription,
        quantity,
        contentPerPackage,
        usageUnit,
        unitPrice: priceVal,
        totalPrice: Number((quantity * priceVal).toFixed(2)),
      });
    }

    if (extractedItems.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error:
            geminiError ||
            (geminiKey
              ? 'Não foi possível identificar os itens na imagem enviada. Tente uma foto mais nítida, de frente e com boa luz.'
              : 'A leitura automática precisa de uma chave gratuita do Google Gemini. Cadastre em Configurações > Leitura de Notas Fiscais com IA (leva 1 minuto) ou cole os itens como texto.'),
        },
        { status: 422 }
      );
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
