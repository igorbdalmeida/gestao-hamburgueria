import { IngredientCategory, UsageUnit } from './types';

export interface ParsedXmlInvoiceItem {
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  rawUnit: string;
  suggestedCategory: IngredientCategory;
  suggestedContentPerPackage: number;
  suggestedUsageUnit: UsageUnit;
  packageDescription: string;
}

export interface ParsedXmlInvoice {
  supplier: string;
  date: string;
  invoiceNumber: string;
  accessKey?: string;
  paymentMethod: 'PIX' | 'Boleto' | 'Cartão de Crédito' | 'Cartão de Débito' | 'Dinheiro';
  totalAmount: number;
  items: ParsedXmlInvoiceItem[];
}

function extractTag(xml: string, tag: string): string {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const match = xml.match(regex);
  return match ? match[1].trim() : '';
}

function guessCategoryAndPackaging(name: string, rawUnit: string): {
  category: IngredientCategory;
  content: number;
  usageUnit: UsageUnit;
  packageDesc: string;
} {
  const upper = name.toUpperCase();

  let category: IngredientCategory = 'Outros';
  if (/CARNE|ACEM|PEITO|COSTELA|FRANGO|LINGUICA|HAMBURGUER|BLEND/.test(upper)) {
    category = 'Proteína';
  } else if (/PAO|BRIOCHE|AUSTRALIANO|TRIGO/.test(upper)) {
    category = 'Panificação';
  } else if (/QUEIJO|CHEDDAR|MUSSARELA|PRATO|BACON|PRESUNTO|CATUPIRY/.test(upper)) {
    category = 'Queijos e Frios';
  } else if (/MAIONESE|MOSTARDA|KETCHUP|CATCHUP|MOLHO|BARBECUE|CREME DE CHEDDAR/.test(upper)) {
    category = 'Molhos';
  } else if (/CEBOLA|TOMATE|ALFACE|PICLES|ALHO|BATATA|ANEIS/.test(upper)) {
    category = upper.includes('BATATA') || upper.includes('ANEIS') ? 'Acompanhamentos' : 'Hortifrúti e Conservas';
  } else if (/COCA|GUARANA|CAJUINA|REFRIG|SUCO|AGUA|LATA/.test(upper)) {
    category = 'Bebidas';
  } else if (/SACO|KRAFT|PAPEL|ACOPLADO|CAIXA|EMBALAGEM|LACRE|GUARDANAPO/.test(upper)) {
    category = 'Embalagem';
  } else if (/OLEO|AZEITE|MARGARINA|MANTEIGA|GORDURA/.test(upper)) {
    category = 'Óleos e Gorduras';
  }

  // Detect weight or count in product name e.g. "2KG", "1KG", "500G", "12 UN", "200 UN", "350ML"
  const kgMatch = upper.match(/(\d+(?:[.,]\d+)?)\s*KG/);
  const gMatch = upper.match(/(\d+)\s*G\b/);
  const unMatch = upper.match(/(\d+)\s*(?:UN|UNID|UND|LATAS)/);
  const lMatch = upper.match(/(\d+(?:[.,]\d+)?)\s*L\b/);

  if (category === 'Bebidas') {
    const packCount = unMatch ? parseInt(unMatch[1], 10) : 12;
    return {
      category,
      content: packCount,
      usageUnit: 'un',
      packageDesc: `Pack (${packCount} un)`,
    };
  }

  if (kgMatch) {
    const kg = parseFloat(kgMatch[1].replace(',', '.'));
    return {
      category,
      content: Math.round(kg * 1000),
      usageUnit: 'g',
      packageDesc: `Pacote (${kg} kg)`,
    };
  }

  if (gMatch) {
    const g = parseInt(gMatch[1], 10);
    return {
      category,
      content: g,
      usageUnit: 'g',
      packageDesc: `Embalagem (${g}g)`,
    };
  }

  if (unMatch) {
    const un = parseInt(unMatch[1], 10);
    return {
      category,
      content: un,
      usageUnit: 'un',
      packageDesc: `Pacote (${un} un)`,
    };
  }

  if (lMatch) {
    const l = parseFloat(lMatch[1].replace(',', '.'));
    return {
      category,
      content: l,
      usageUnit: 'l',
      packageDesc: `Garrafa (${l}L)`,
    };
  }

  if (rawUnit.toUpperCase() === 'KG') {
    return {
      category,
      content: 1000,
      usageUnit: 'g',
      packageDesc: 'Quilo (1 kg)',
    };
  }

  return {
    category,
    content: 1,
    usageUnit: 'un',
    packageDesc: `Unidade (${rawUnit || 'un'})`,
  };
}

export function parseNfeXml(xmlContent: string): ParsedXmlInvoice {
  const emitBlock = extractTag(xmlContent, 'emit');
  const ideBlock = extractTag(xmlContent, 'ide');
  const totalBlock = extractTag(xmlContent, 'ICMSTot');
  const pagBlock = extractTag(xmlContent, 'pag');

  const supplier =
    extractTag(emitBlock, 'xFant') ||
    extractTag(emitBlock, 'xNome') ||
    'Fornecedor Nota Fiscal XML';

  const rawDate = extractTag(ideBlock, 'dhEmi') || extractTag(ideBlock, 'dEmi');
  const date = rawDate ? rawDate.slice(0, 10) : new Date().toISOString().slice(0, 10);

  const nNF = extractTag(ideBlock, 'nNF') || '0001';
  const serie = extractTag(ideBlock, 'serie') || '1';
  const invoiceNumber = `NF-e ${nNF} (Série ${serie})`;

  const chNFe = extractTag(xmlContent, 'chNFe');

  const tPag = extractTag(pagBlock, 'tPag');
  let paymentMethod: ParsedXmlInvoice['paymentMethod'] = 'PIX';
  if (tPag === '15') paymentMethod = 'Boleto';
  else if (tPag === '03') paymentMethod = 'Cartão de Crédito';
  else if (tPag === '04') paymentMethod = 'Cartão de Débito';
  else if (tPag === '01') paymentMethod = 'Dinheiro';
  else if (tPag === '17') paymentMethod = 'PIX';

  const detRegex = /<det[^>]*>([\s\S]*?)<\/det>/gi;
  const items: ParsedXmlInvoiceItem[] = [];
  let match: RegExpExecArray | null;

  while ((match = detRegex.exec(xmlContent)) !== null) {
    const detContent = match[1];
    const prodContent = extractTag(detContent, 'prod');
    const name = extractTag(prodContent, 'xProd') || 'Item Nota Fiscal';
    const qCom = parseFloat(extractTag(prodContent, 'qCom') || '1');
    const vUnCom = parseFloat(extractTag(prodContent, 'vUnCom') || '0');
    const vProd = parseFloat(extractTag(prodContent, 'vProd') || String(qCom * vUnCom));
    const uCom = extractTag(prodContent, 'uCom') || 'UN';

    const guessed = guessCategoryAndPackaging(name, uCom);

    items.push({
      name,
      quantity: qCom,
      unitPrice: vUnCom,
      totalPrice: vProd,
      rawUnit: uCom,
      suggestedCategory: guessed.category,
      suggestedContentPerPackage: guessed.content,
      suggestedUsageUnit: guessed.usageUnit,
      packageDescription: guessed.packageDesc,
    });
  }

  const vNF = parseFloat(extractTag(totalBlock, 'vNF') || '0');
  const calculatedTotal = items.reduce((acc, i) => acc + i.totalPrice, 0);

  return {
    supplier,
    date,
    invoiceNumber,
    accessKey: chNFe || undefined,
    paymentMethod,
    totalAmount: vNF > 0 ? vNF : calculatedTotal,
    items,
  };
}

export const SAMPLE_NFE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
  <NFe>
    <infNFe Id="NFe22261100123456000199550010000184921000184925" versao="4.00">
      <ide>
        <serie>1</serie>
        <nNF>18492</nNF>
        <dhEmi>2026-11-01T10:15:00-03:00</dhEmi>
      </ide>
      <emit>
        <xNome>ATACADAO DISTRIBUIDOR DE ALIMENTOS LTDA</xNome>
        <xFant>Atacadão Autosserviço</xFant>
      </emit>
      <det nItem="1">
        <prod>
          <xProd>BLEND CARNE BOVINA SMASH 1KG</xProd>
          <uCom>PCT</uCom>
          <qCom>3.0000</qCom>
          <vUnCom>33.5000</vUnCom>
          <vProd>100.50</vProd>
        </prod>
      </det>
      <det nItem="2">
        <prod>
          <xProd>QUEIJO CHEDDAR BARRA 1KG</xProd>
          <uCom>UN</uCom>
          <qCom>1.0000</qCom>
          <vUnCom>52.9000</vUnCom>
          <vProd>52.90</vProd>
        </prod>
      </det>
      <det nItem="3">
        <prod>
          <xProd>ANEIS DE CEBOLA BEM BRASIL 1KG</xProd>
          <uCom>PCT</uCom>
          <qCom>2.0000</qCom>
          <vUnCom>26.9000</vUnCom>
          <vProd>53.80</vProd>
        </prod>
      </det>
      <total>
        <ICMSTot>
          <vNF>207.20</vNF>
        </ICMSTot>
      </total>
      <pag>
        <detPag>
          <tPag>17</tPag>
          <vPag>207.20</vPag>
        </detPag>
      </pag>
    </infNFe>
  </NFe>
</nfeProc>`;
