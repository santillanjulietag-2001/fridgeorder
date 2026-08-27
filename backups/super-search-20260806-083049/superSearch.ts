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

async function fetchText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': UA,
        Accept: 'text/html,application/json',
        'Accept-Language': 'es-ES,es;q=0.9',
      },
      signal: AbortSignal.timeout(7000),
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

/** Mercadona search via public Algolia index + product detail API */
async function searchMercadona(query: string): Promise<SuperProductOption[]> {
  try {
    const url = `https://${MERCADONA_ALGOLIA.appId.toLowerCase()}-dsn.algolia.net/1/indexes/${MERCADONA_ALGOLIA.index}/query?x-algolia-application-id=${MERCADONA_ALGOLIA.appId}&x-algolia-api-key=${MERCADONA_ALGOLIA.apiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': UA },
      body: JSON.stringify({
        params: `query=${encodeURIComponent(query)}&hitsPerPage=6`,
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

    const base = (data.hits || []).slice(0, 6).map((p) => {
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
        brand: p.brand || 'Hacendado',
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

    return await Promise.all(base.map((opt) => enrichMercadonaProduct(opt)));
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
      brand: (d.brand || opt.brand || '').trim() || opt.brand,
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
  const apiUrl =
    `https://www.lidl.es/q/api/search?assortment=ES&locale=es_ES&version=v2.0.0` +
    `&q=${encodeURIComponent(query)}&offset=0&fetchsize=6`;
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
      const title = String(d.fullTitle || d.title || '')
        .replace(/^\s*-\s*/, '')
        .trim();
      if (!title || options.length >= 4) continue;
      const brandRaw = String(d.brand?.name || '').trim();
      const brand = !brandRaw || brandRaw === '-' ? 'Lidl' : brandRaw;
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

async function searchBonarea(query: string): Promise<SuperProductOption[]> {
  const candidates = [
    `https://www.bonarea-online.com/es/search?q=${encodeURIComponent(query)}`,
    `https://www.bonarea.com/es/buscar?q=${encodeURIComponent(query)}`,
  ];
  for (const url of candidates) {
    const html = await fetchText(url);
    if (!html) continue;
    const options: SuperProductOption[] = [];
    const priceBlocks = [
      ...html.matchAll(
        /(?:product|producto|card)[^>]*>[\s\S]{0,400}?([A-ZÁÉÍÓÚÑa-záéíóúñ0-9][^<]{5,80})[\s\S]{0,200}?(\d+[.,]\d{2})\s*€/gi
      ),
    ];
    for (const m of priceBlocks) {
      if (options.length >= 4) break;
      const title = m[1]!.replace(/\s+/g, ' ').trim();
      if (/cookie|script|política|aceptar/i.test(title)) continue;
      options.push({
        store: 'bonarea',
        title,
        brand: 'BonÀrea',
        price: parsePrice(m[2]),
        unitPrice: '',
        imageUrl: '',
        storeUrl: url,
        category: guessCategory(title),
        source: 'live',
      });
    }
    if (options.length) return options;
  }
  return [];
}

async function searchCarrefour(query: string): Promise<SuperProductOption[]> {
  const url = `https://www.carrefour.es/search-api/query/v1/search?query=${encodeURIComponent(query)}&offset=0&limit=6&lang=es&store_id=tienda.carrefour.es`;
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': UA,
        Accept: 'application/json',
        'Accept-Language': 'es-ES',
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
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
    return docs.slice(0, 4).map((p) => {
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
        brand: p.brand || 'Carrefour',
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
  const [mercadona, lidl, bonarea, carrefour] = await Promise.all([
    searchMercadona(q),
    searchLidl(q),
    searchBonarea(q),
    searchCarrefour(q),
  ]);

  const live = [...mercadona, ...lidl, ...bonarea, ...carrefour];
  const options = balanceByStore(live, 3, 15);
  const byStore: Record<string, number> = {};
  for (const o of options) byStore[o.store] = (byStore[o.store] || 0) + 1;

  return {
    query: q,
    options,
    liveCount: live.length,
    byStore,
  };
}
