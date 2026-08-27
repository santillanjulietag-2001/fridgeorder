import { guessCategory, type Category, type Store } from '@fridgeorder/shared';

export interface ProductFeature {
  label: string;
  value: string;
}

export interface SuperProductOption {
  store: Store;
  title: string;
  brand: string;
  price?: number;
  unitPrice: string;
  imageUrl: string;
  storeUrl: string;
  category: Category;
  source: 'live' | 'ai';
  productId?: string;
  packaging?: string;
  description?: string;
  ean?: string;
  origin?: string;
  previousPrice?: number;
  features?: ProductFeature[];
}

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

/** Algolia index de tienda.mercadona.es — bcn1 = Barcelona */
const MERCADONA_ALGOLIA = {
  appId: '7UZJKL1DJ0',
  apiKey: '9d8f2e39e90df472b4f2e559a116fe17',
  index: 'products_prod_bcn1_es',
};

function stripHtml(s: string): string {
  return s
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function pushFeature(features: ProductFeature[], label: string, value: unknown) {
  const v = String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!v) return;
  if (features.some((f) => f.label === label && f.value === v)) return;
  features.push({ label, value: v.slice(0, 500) });
}

function parsePrice(raw: unknown): number | undefined {
  if (typeof raw === 'number' && Number.isFinite(raw)) return Number(raw.toFixed(2));
  if (typeof raw === 'string') {
    const m = raw.replace(/\s/g, '').match(/(\d+[.,]\d{1,2}|\d+)/);
    return m ? Number(Number(m[1]!.replace(',', '.')).toFixed(2)) : undefined;
  }
  return undefined;
}

function normalizeSearchText(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Singulariza plurales habituales en ES (garbanzos→garbanzo, cocidos→cocido). */
function stemEs(word: string): string {
  const w = word;
  if (w.length <= 3) return w;
  if (w.endsWith('ciones')) return `${w.slice(0, -5)}cion`;
  if (w.endsWith('ces')) return `${w.slice(0, -3)}z`;
  if (w.endsWith('ques')) return w.slice(0, -3); // ... rare
  if (w.endsWith('es') && w.length > 4 && !/[aeiou]es$/.test(w)) return w.slice(0, -2);
  if (w.endsWith('s') && !w.endsWith('ss') && w.length > 3) return w.slice(0, -1);
  return w;
}

function queryTokens(query: string): string[] {
  return normalizeSearchText(query)
    .split(' ')
    .filter((t) => t.length > 1 && !['de', 'del', 'la', 'el', 'los', 'las', 'un', 'una', 'y', 'con', 'en', 'al'].includes(t));
}

/** Modificadores que mejoran ranking pero no deben tumbar el match. */
const OPTIONAL_MODIFIERS = new Set(
  [
    'fresco',
    'fresca',
    'frescos',
    'frescas',
    'fresc',
    'natural',
    'naturales',
    'entero',
    'entera',
    'enteros',
    'enteras',
    'bio',
    'eco',
    'ecologico',
    'ecologica',
    'ecologicos',
    'ecologicas',
    'integral',
    'integrales',
    'suave',
    'intenso',
    'virgen',
    'extra',
  ].map(stemEs)
);

const SEARCH_SYNONYMS: Record<string, string[]> = {
  leche: ['llet'],
  huevos: ['ous', 'ou', 'huevo'],
  huevo: ['ou', 'ous', 'huevos'],
  aceite: ['oli'],
  tomate: ['tomaquet'],
  tomaquet: ['tomate'],
  pan: ['pa'],
  pollo: ['pollastre'],
  carne: ['carn'],
  manzana: ['poma'],
  naranja: ['taronja'],
  agua: ['aigua'],
  queso: ['formatge'],
  mantequilla: ['mantega'],
  yogur: ['iogurt', 'yogurt', 'yoghurt'],
  iogurt: ['yogur', 'yogurt'],
  frito: ['fregit'],
  fregit: ['frito'],
  espinacas: ['espinaca', 'espinacs', 'espinac'],
  espinaca: ['espinacas', 'espinacs', 'espinac'],
  espinacs: ['espinacas', 'espinaca', 'espinac'],
  garbanzos: ['garbanzo', 'cigrons', 'cigro', 'cigrons'],
  garbanzo: ['garbanzos', 'cigrons', 'cigro'],
  cigrons: ['garbanzos', 'garbanzo', 'cigro'],
  cocidos: ['cocido', 'cuit', 'cuits'],
  cocido: ['cocidos', 'cuit', 'cuits'],
  cuit: ['cocido', 'cocidos', 'cuits'],
  cuits: ['cocido', 'cocidos', 'cuit'],
  frescas: ['fresca', 'frescos', 'fresco', 'fresc'],
  frescos: ['fresco', 'fresca', 'frescas', 'fresc'],
};

function expandTokenForms(tok: string): Set<string> {
  const out = new Set<string>();
  const base = stemEs(tok);
  out.add(tok);
  out.add(base);
  for (const syn of SEARCH_SYNONYMS[tok] || SEARCH_SYNONYMS[base] || []) {
    out.add(syn);
    out.add(stemEs(syn));
  }
  return out;
}

function tokenMatchesWord(tok: string, word: string): boolean {
  const forms = expandTokenForms(tok);
  const w = stemEs(word);
  return forms.has(word) || forms.has(w);
}

function splitQueryTokens(query: string): { core: string[]; optional: string[] } {
  const all = queryTokens(query);
  const core: string[] = [];
  const optional: string[] = [];
  for (const t of all) {
    if (OPTIONAL_MODIFIERS.has(stemEs(t)) || OPTIONAL_MODIFIERS.has(t)) optional.push(t);
    else core.push(t);
  }
  // Si solo había modificadores, úsalos como núcleo
  if (!core.length) return { core: all, optional: [] };
  return { core, optional };
}

function coreQuery(query: string): string {
  const { core } = splitQueryTokens(query);
  return core.join(' ') || query.trim();
}

/** Relevancia: núcleo obligatorio (con singular/plural + sinónimos); modificadores = bonus. */
function relevanceScore(title: string, query: string): number {
  const { core, optional } = splitQueryTokens(query);
  if (!core.length) return 1;
  const words = normalizeSearchText(title).split(' ').filter(Boolean);
  if (!words.length) return 0;

  let coreHit = 0;
  for (const tok of core) {
    if (words.some((w) => tokenMatchesWord(tok, w))) coreHit += 1;
  }
  if (coreHit < core.length) return 0;

  let score = coreHit * 4 + 10;
  let optHit = 0;
  for (const tok of optional) {
    if (words.some((w) => tokenMatchesWord(tok, w))) {
      optHit += 1;
      score += 5;
    }
  }
  if (optional.length && optHit === optional.length) score += 6;
  // Si el usuario pidió modificador (p.ej. natural) y el título no lo tiene, baja bastante
  if (optional.length && optHit === 0) score -= 8;

  const firstCorePos = words.findIndex((w) => tokenMatchesWord(core[0]!, w));
  // Preferir que el producto pedido lidere el título ("Espinacas…" > "Pasta … espinacas")
  if (firstCorePos === 0) score += 16;
  else if (firstCorePos === 1) score += 6;
  else if (firstCorePos > 3) score -= 10;
  else if (firstCorePos < 0) return 0;

  // Consulta de 1 núcleo sin mods: evitar ruido al final ("espumador de leche")
  if (core.length === 1 && optional.length === 0 && firstCorePos > 2) return 0;

  return score;
}

function titleHasOptional(title: string, optional: string[]): boolean {
  if (!optional.length) return true;
  const words = normalizeSearchText(title).split(' ').filter(Boolean);
  return optional.every((tok) => words.some((w) => tokenMatchesWord(tok, w)));
}

function titleLeadsWithCore(title: string, coreFirst: string): boolean {
  const words = normalizeSearchText(title).split(' ').filter(Boolean);
  return Boolean(words[0] && tokenMatchesWord(coreFirst, words[0]));
}

function cleanBrand(raw: unknown, fallback = ''): string {
  const b = String(raw ?? '')
    .replace(/^\s*-\s*$/, '')
    .trim();
  if (!b || b === '-' || b === '—') return fallback;
  return b;
}

function dedupeOptions(options: SuperProductOption[]): SuperProductOption[] {
  const seen = new Set<string>();
  const out: SuperProductOption[] = [];
  for (const o of options) {
    const key = `${o.store}|${o.productId || ''}|${normalizeSearchText(o.title)}|${o.price ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(o);
  }
  return out;
}

function pickTopRelevant(options: SuperProductOption[], query: string, limit = 4): SuperProductOption[] {
  const { core, optional } = splitQueryTokens(query);
  const scored = dedupeOptions(options)
    .map((o) => ({ o, score: relevanceScore(o.title, query) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  const core0 = core[0];
  if (core0) {
    // 1) Ideal: producto al inicio + modificadores (yogur natural, espinacas frescas…)
    if (optional.length) {
      const ideal = scored.filter(
        (x) => titleLeadsWithCore(x.o.title, core0) && titleHasOptional(x.o.title, optional)
      );
      if (ideal.length) return ideal.slice(0, limit).map((x) => x.o);

      // 2) Producto al inicio (aunque falte "frescas"/"natural")
      const leading = scored.filter((x) => titleLeadsWithCore(x.o.title, core0));
      if (leading.length) return leading.slice(0, limit).map((x) => x.o);

      // 3) Cumple modificadores aunque no lidere (mejor que pasta con espinacas)
      const withMods = scored.filter((x) => titleHasOptional(x.o.title, optional));
      if (withMods.length) return withMods.slice(0, limit).map((x) => x.o);
    } else {
      const leading = scored.filter((x) => titleLeadsWithCore(x.o.title, core0));
      if (leading.length) return leading.slice(0, limit).map((x) => x.o);
    }
  }

  return scored.slice(0, limit).map((x) => x.o);
}

/** Si la query tiene modificadores, también busca solo el núcleo (mejor recall). */
async function withCoreFallback(
  query: string,
  searchOnce: (q: string) => Promise<SuperProductOption[]>
): Promise<SuperProductOption[]> {
  const core = coreQuery(query);
  if (normalizeSearchText(core) === normalizeSearchText(query)) {
    return searchOnce(query);
  }
  const [full, narrowed] = await Promise.all([searchOnce(query), searchOnce(core)]);
  return dedupeOptions([...full, ...narrowed]);
}

/** Mercadona search via public Algolia index + product detail API */
async function searchMercadona(query: string): Promise<SuperProductOption[]> {
  const rows = await withCoreFallback(query, searchMercadonaOnce);
  return pickTopRelevant(rows, query, 4);
}

async function searchMercadonaOnce(query: string): Promise<SuperProductOption[]> {
  try {
    const url = `https://${MERCADONA_ALGOLIA.appId.toLowerCase()}-dsn.algolia.net/1/indexes/${MERCADONA_ALGOLIA.index}/query?x-algolia-application-id=${MERCADONA_ALGOLIA.appId}&x-algolia-api-key=${MERCADONA_ALGOLIA.apiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': UA },
      body: JSON.stringify({
        params: `query=${encodeURIComponent(query)}&hitsPerPage=12`,
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      hits?: {
        id?: string;
        objectID?: string;
        display_name?: string;
        brand?: string;
        thumbnail?: string;
        share_url?: string;
        packaging?: string;
        categories?: { name?: string; categories?: { name?: string }[] }[];
        price_instructions?: {
          unit_price?: string | number;
          reference_price?: string | number;
          reference_format?: string;
          size_format?: string;
          unit_size?: number;
          previous_unit_price?: string | number;
          tax_percentage?: string | number;
          bulk_price?: string | number;
        };
      }[];
    };

    const base = (data.hits || []).slice(0, 10).map((p) => {
      const id = String(p.id || p.objectID || '');
      const title = p.display_name || 'Producto Mercadona';
      const price = parsePrice(p.price_instructions?.unit_price);
      const refPrice = parsePrice(p.price_instructions?.reference_price);
      const refFmt = p.price_instructions?.reference_format;
      const features: ProductFeature[] = [];
      const cat0 = p.categories?.[0]?.name;
      const cat1 = p.categories?.[0]?.categories?.[0]?.name;
      if (cat0) pushFeature(features, 'Sección', cat1 ? `${cat0} › ${cat1}` : cat0);
      if (p.packaging) pushFeature(features, 'Envase', p.packaging);
      if (p.price_instructions?.unit_size != null && p.price_instructions?.size_format) {
        pushFeature(
          features,
          'Contenido',
          `${p.price_instructions.unit_size} ${p.price_instructions.size_format}`
        );
      }
      if (p.price_instructions?.bulk_price != null && p.price_instructions?.size_format) {
        const bp = parsePrice(p.price_instructions.bulk_price);
        if (bp != null) {
          pushFeature(features, 'Precio por unidad', `${bp.toFixed(2).replace('.', ',')} €/${p.price_instructions.size_format}`);
        }
      }
      if (p.price_instructions?.tax_percentage != null) {
        pushFeature(features, 'IVA', `${Number(p.price_instructions.tax_percentage)} %`);
      }

      return {
        store: 'mercadona' as const,
        title,
        brand: cleanBrand(p.brand) || (/\bhacendado\b/i.test(title) ? 'Hacendado' : 'Mercadona'),
        price,
        unitPrice:
          refPrice != null && refFmt
            ? `${refPrice.toFixed(2).replace('.', ',')} €/${refFmt}`
            : p.packaging || '',
        imageUrl: p.thumbnail || '',
        storeUrl: p.share_url || `https://tienda.mercadona.es/product/${id}`,
        category: guessCategory(title),
        source: 'live' as const,
        productId: id || undefined,
        packaging: p.packaging || undefined,
        previousPrice: parsePrice(p.price_instructions?.previous_unit_price),
        features,
      } satisfies SuperProductOption;
    });

    const enriched = await Promise.all(base.map((opt) => enrichMercadonaProduct(opt)));
    return enriched;
  } catch {
    return [];
  }
}

async function enrichMercadonaProduct(opt: SuperProductOption): Promise<SuperProductOption> {
  if (!opt.productId) return opt;
  try {
    const res = await fetch(`https://tienda.mercadona.es/api/products/${opt.productId}`, {
      headers: {
        'User-Agent': UA,
        Accept: 'application/json',
        'Accept-Language': 'es-ES',
      },
      signal: AbortSignal.timeout(7000),
    });
    if (!res.ok) return opt;
    const d = (await res.json()) as {
      ean?: string;
      origin?: string;
      brand?: string;
      packaging?: string;
      main_feature?: string;
      thumbnail?: string;
      photos?: { regular?: string; zoom?: string }[];
      share_url?: string;
      details?: {
        origin?: string;
        legal_name?: string;
        description?: string;
        mandatory_mentions?: string;
        storage_instructions?: string;
        usage_instructions?: string;
        suppliers?: { name?: string }[];
        alcohol_by_volume?: string | number | null;
      };
      nutrition_information?: {
        allergens?: string;
        ingredients?: string;
      };
      price_instructions?: {
        unit_price?: string | number;
        previous_unit_price?: string | number;
        reference_price?: string | number;
        reference_format?: string;
        unit_size?: number;
        size_format?: string;
        tax_percentage?: string | number;
      };
      extra_info?: string;
    };

    const features = [...(opt.features || [])];
    const details = d.details || {};
    const nutrition = d.nutrition_information || {};

    if (d.ean) pushFeature(features, 'EAN', d.ean);
    if (d.origin || details.origin) pushFeature(features, 'Origen', d.origin || details.origin);
    if (d.main_feature) pushFeature(features, 'Característica', d.main_feature);
    if (d.packaging) pushFeature(features, 'Envase', d.packaging);
    if (details.legal_name) pushFeature(features, 'Nombre legal', stripHtml(details.legal_name));
    if (details.mandatory_mentions) {
      pushFeature(features, 'Menciones', stripHtml(details.mandatory_mentions));
    }
    if (details.storage_instructions) {
      pushFeature(features, 'Conservación', stripHtml(details.storage_instructions));
    }
    if (details.usage_instructions) {
      pushFeature(features, 'Uso', stripHtml(details.usage_instructions));
    }
    if (details.alcohol_by_volume != null && details.alcohol_by_volume !== '') {
      pushFeature(features, 'Alcohol', `${details.alcohol_by_volume} %`);
    }
    if (nutrition.ingredients) {
      pushFeature(features, 'Ingredientes', stripHtml(nutrition.ingredients));
    }
    if (nutrition.allergens) {
      pushFeature(features, 'Alérgenos', stripHtml(nutrition.allergens));
    }
    if (details.suppliers?.length) {
      const names = details.suppliers
        .map((s) => s.name)
        .filter(Boolean)
        .slice(0, 4)
        .join(', ');
      if (names) pushFeature(features, 'Proveedores', names);
    }
    if (d.extra_info) pushFeature(features, 'Info extra', stripHtml(d.extra_info));

    const betterImg =
      d.photos?.[0]?.regular || d.photos?.[0]?.zoom || d.thumbnail || opt.imageUrl;
    const description = stripHtml(details.description || details.legal_name || '');

    return {
      ...opt,
      brand: cleanBrand(d.brand || opt.brand) || opt.brand,
      packaging: d.packaging || opt.packaging,
      description: description || opt.description,
      ean: d.ean || opt.ean,
      origin: d.origin || details.origin || opt.origin,
      imageUrl: betterImg,
      storeUrl: d.share_url || opt.storeUrl,
      price: parsePrice(d.price_instructions?.unit_price) ?? opt.price,
      previousPrice: parsePrice(d.price_instructions?.previous_unit_price) ?? opt.previousPrice,
      unitPrice: (() => {
        const ref = parsePrice(d.price_instructions?.reference_price);
        const fmt = d.price_instructions?.reference_format;
        if (ref != null && fmt) return `${ref.toFixed(2).replace('.', ',')} €/${fmt}`;
        return opt.unitPrice;
      })(),
      features,
    };
  } catch {
    return opt;
  }
}

/** Lidl España — API interna de búsqueda (misma que lidl.es) */
async function searchLidl(query: string): Promise<SuperProductOption[]> {
  const rows = await withCoreFallback(query, searchLidlOnce);
  return pickTopRelevant(rows, query, 4);
}

async function searchLidlOnce(query: string): Promise<SuperProductOption[]> {
  const apiUrl =
    `https://www.lidl.es/q/api/search?assortment=ES&locale=es_ES&version=v2.0.0` +
    `&q=${encodeURIComponent(query)}&offset=0&fetchsize=24`;
  try {
    const res = await fetch(apiUrl, {
      headers: {
        'User-Agent': UA,
        Accept: '*/*',
        'Accept-Language': 'es-ES,es;q=0.9',
        Referer: `https://www.lidl.es/q/search?q=${encodeURIComponent(query)}`,
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      items?: {
        resultClass?: string;
        code?: string;
        gridbox?: {
          data?: {
            fullTitle?: string;
            title?: string;
            brand?: { name?: string };
            erpNumber?: string;
            image?: string;
            canonicalUrl?: string;
            category?: string;
            price?: {
              price?: number;
              oldPrice?: number;
              packaging?: { text?: string };
            };
            image_V1?: { accessibility?: string };
          };
        };
      }[];
    };

    const options: SuperProductOption[] = [];
    for (const item of data.items || []) {
      if (item.resultClass && item.resultClass !== 'product') continue;
      const d = item.gridbox?.data;
      if (!d) continue;
      // Preferir comida/bebida del catálogo Lidl Plus cuando viene categoría
      const cat = String(d.category || '');
      if (cat && !/food|drink|grocery|aliment/i.test(cat)) continue;
      const title = String(d.fullTitle || d.title || '')
        .replace(/^\s*-\s*/, '')
        .trim();
      if (!title) continue;
      const brand = cleanBrand(d.brand?.name, 'Lidl');
      const path = d.canonicalUrl || '';
      const storeUrl = path
        ? path.startsWith('http')
          ? path
          : `https://www.lidl.es${path}`
        : `https://www.lidl.es/q/search?q=${encodeURIComponent(query)}`;
      const features: ProductFeature[] = [];
      if (d.erpNumber) pushFeature(features, 'SKU', d.erpNumber);
      if (d.category) pushFeature(features, 'Categoría', d.category);
      if (d.price?.packaging?.text) pushFeature(features, 'Envase', d.price.packaging.text);
      if (d.image_V1?.accessibility) pushFeature(features, 'Descripción', d.image_V1.accessibility);
      options.push({
        store: 'lidl',
        title,
        brand,
        price: parsePrice(d.price?.price),
        previousPrice: parsePrice(d.price?.oldPrice),
        unitPrice: d.price?.packaging?.text || '',
        imageUrl: d.image || '',
        storeUrl,
        category: guessCategory(title),
        source: 'live',
        productId: d.erpNumber || item.code,
        packaging: d.price?.packaging?.text,
        description: d.image_V1?.accessibility,
        features,
      });
    }
    return options;
  } catch {
    return [];
  }
}

/** BonÀrea — POST /es/shop/search (API interna de la tienda online) */
async function searchBonarea(query: string): Promise<SuperProductOption[]> {
  const rows = await withCoreFallback(query, searchBonareaOnce);
  return pickTopRelevant(rows, query, 4);
}

async function searchBonareaOnce(query: string): Promise<SuperProductOption[]> {
  try {
    const res = await fetch('https://www.bonarea-online.com/es/shop/search', {
      method: 'POST',
      headers: {
        'User-Agent': UA,
        Accept: 'application/json, text/javascript, */*; q=0.01',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
        Origin: 'https://www.bonarea-online.com',
        Referer: 'https://www.bonarea-online.com/es',
      },
      body: new URLSearchParams({ strQuery: query }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      success?: boolean;
      articles?: {
        description?: string;
        identifier?: string;
        priceToPay?: number;
        unitPrice?: string;
        measurementUnit?: string;
        image?: string[];
        itsOnStock?: boolean;
      }[];
    };
    if (!data.success || !data.articles?.length) return [];

    const options: SuperProductOption[] = [];
    for (const a of data.articles.slice(0, 40)) {
      const title = String(a.description || '').replace(/\s+/g, ' ').trim();
      if (!title) continue;
      const img = a.image?.[0];
      const imageUrl = img
        ? `https://images.bonarea.com/${img}?width=200&height=200`
        : '';
      const id = String(a.identifier || '').replace(/\*/g, '-');
      options.push({
        store: 'bonarea',
        title,
        brand: 'BonÀrea',
        price: parsePrice(a.priceToPay),
        unitPrice: a.unitPrice || a.measurementUnit || '',
        imageUrl,
        storeUrl: `https://www.bonarea-online.com/es/shop?q=${encodeURIComponent(query)}`,
        category: guessCategory(title),
        source: 'live',
        productId: id || undefined,
        packaging: a.measurementUnit,
        features: a.measurementUnit
          ? [{ label: 'Formato', value: a.measurementUnit }]
          : undefined,
      });
    }
    return options;
  } catch {
    return [];
  }
}

/** Dia — API search-back (catálogo online) */
async function searchDia(query: string): Promise<SuperProductOption[]> {
  const rows = await withCoreFallback(query, searchDiaOnce);
  return pickTopRelevant(rows, query, 4);
}

async function searchDiaOnce(query: string): Promise<SuperProductOption[]> {
  try {
    const url = `https://www.dia.es/api/v1/search-back/search?q=${encodeURIComponent(query)}&page=1`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': UA,
        Accept: 'application/json',
        'Accept-Language': 'es-ES,es;q=0.9',
        Referer: 'https://www.dia.es/',
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      search_items?: {
        brand?: string;
        display_name?: string;
        image?: string;
        object_id?: string;
        sku_id?: string;
        url?: string;
        prices?: {
          price?: number;
          price_per_unit?: number;
          measure_unit?: string;
          strikethrough_price?: number;
        };
      }[];
    };

    const options: SuperProductOption[] = [];
    for (const p of data.search_items || []) {
      const title = String(p.display_name || '').trim();
      if (!title) continue;
      const path = p.url || '';
      const storeUrl = path
        ? path.startsWith('http')
          ? path
          : `https://www.dia.es${path}`
        : `https://www.dia.es/search?q=${encodeURIComponent(query)}`;
      const img = p.image || '';
      const imageUrl = img
        ? img.startsWith('http')
          ? img
          : `https://www.dia.es${img}`
        : '';
      const unit =
        p.prices?.price_per_unit != null && p.prices?.measure_unit
          ? `${Number(p.prices.price_per_unit).toFixed(2).replace('.', ',')} €/${String(p.prices.measure_unit).toLowerCase()}`
          : '';
      const features: ProductFeature[] = [];
      if (p.sku_id) pushFeature(features, 'SKU', p.sku_id);
      options.push({
        store: 'dia',
        title,
        brand: cleanBrand(p.brand, 'Dia'),
        price: parsePrice(p.prices?.price),
        previousPrice: parsePrice(p.prices?.strikethrough_price),
        unitPrice: unit,
        imageUrl,
        storeUrl,
        category: guessCategory(title),
        source: 'live',
        productId: p.object_id || p.sku_id,
        features,
      });
    }
    return options;
  } catch {
    return [];
  }
}

async function searchCarrefour(query: string): Promise<SuperProductOption[]> {
  const url = `https://www.carrefour.es/search-api/query/v1/search?query=${encodeURIComponent(query)}&offset=0&limit=8&lang=es&store_id=tienda.carrefour.es`;
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': UA,
        Accept: 'application/json',
        'Accept-Language': 'es-ES,es;q=0.9',
        Origin: 'https://www.carrefour.es',
        Referer: 'https://www.carrefour.es/supermercado',
      },
      signal: AbortSignal.timeout(8000),
    });
    // Akamai a menudo responde 403 a clientes no-browser; sin datos reales no inventamos.
    if (!res.ok) return [];
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('json')) return [];
    const data = (await res.json()) as {
      content?: {
        docs?: {
          display_name?: string;
          name?: string;
          brand?: string;
          price?: number | string;
          image_url?: string;
          url?: string;
          active_price?: { value?: number };
        }[];
      };
      docs?: unknown[];
    };
    const docs = data.content?.docs || [];
    const options = docs.slice(0, 8).map((p) => {
      const title = p.display_name || p.name || 'Producto Carrefour';
      const features: ProductFeature[] = [];
      const raw = p as Record<string, unknown>;
      if (raw.ean) pushFeature(features, 'EAN', raw.ean);
      if (raw.measure_unit && raw.measure_value != null) {
        pushFeature(features, 'Medida', `${raw.measure_value} ${raw.measure_unit}`);
      }
      if (raw.unit_price != null) pushFeature(features, 'Precio unitario', String(raw.unit_price));
      if (raw.packaging) pushFeature(features, 'Envase', raw.packaging);
      if (raw.nutriscore) pushFeature(features, 'Nutri-Score', raw.nutriscore);
      if (raw.description) pushFeature(features, 'Descripción', stripHtml(String(raw.description)));
      return {
        store: 'carrefour' as const,
        title,
        brand: cleanBrand(p.brand, 'Carrefour'),
        price: parsePrice(p.active_price?.value ?? p.price),
        unitPrice: raw.unit_price != null ? String(raw.unit_price) : '',
        imageUrl: p.image_url || '',
        storeUrl: p.url
          ? p.url.startsWith('http')
            ? p.url
            : `https://www.carrefour.es${p.url}`
          : `https://www.carrefour.es/?q=${encodeURIComponent(query)}`,
        category: guessCategory(title),
        source: 'live' as const,
        description: raw.description ? stripHtml(String(raw.description)) : undefined,
        ean: raw.ean ? String(raw.ean) : undefined,
        packaging: raw.packaging ? String(raw.packaging) : undefined,
        features,
      };
    });
    return pickTopRelevant(options, query, 4);
  } catch {
    return [];
  }
}

/** Interleave results so the UI doesn't look like "only Lidl" */
function balanceByStore(options: SuperProductOption[], perStore = 3, maxTotal = 15): SuperProductOption[] {
  const order: Store[] = ['mercadona', 'lidl', 'bonarea', 'carrefour', 'dia', 'other'];
  const buckets = Object.fromEntries(order.map((s) => [s, [] as SuperProductOption[]])) as Record<
    Store,
    SuperProductOption[]
  >;
  for (const opt of options) {
    if ((buckets[opt.store] || []).length < perStore) buckets[opt.store].push(opt);
  }
  const out: SuperProductOption[] = [];
  let added = true;
  while (added && out.length < maxTotal) {
    added = false;
    for (const s of order) {
      const next = buckets[s].shift();
      if (next) {
        out.push(next);
        added = true;
      }
      if (out.length >= maxTotal) break;
    }
  }
  return out;
}

export async function searchSupermarketProducts(query: string): Promise<{
  query: string;
  options: SuperProductOption[];
  liveCount: number;
  byStore: Record<string, number>;
}> {
  const q = query.trim();
  if (!q) return { query: q, options: [], liveCount: 0, byStore: {} };

  // Solo fuentes reales (sin IA ni inventados). Si un súper no responde, no aparece.
  const [mercadona, lidl, bonarea, carrefour, dia] = await Promise.all([
    searchMercadona(q),
    searchLidl(q),
    searchBonarea(q),
    searchCarrefour(q),
    searchDia(q),
  ]);

  const live = [...mercadona, ...lidl, ...bonarea, ...carrefour, ...dia];
  const options = balanceByStore(live, 3, 18);
  const byStore: Record<string, number> = {};
  for (const o of options) byStore[o.store] = (byStore[o.store] || 0) + 1;

  return {
    query: q,
    options,
    liveCount: live.length,
    byStore,
  };
}
