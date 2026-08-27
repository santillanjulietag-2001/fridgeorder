export function detectStore(hostname) {
  const h = hostname.toLowerCase();
  if (h.includes('mercadona')) return 'mercadona';
  if (h.includes('bonarea')) return 'bonarea';
  if (h.includes('lidl')) return 'lidl';
  return 'other';
}

function text(el) {
  return (el?.textContent || '').replace(/\s+/g, ' ').trim();
}

function parsePrice(raw) {
  if (!raw) return undefined;
  const m = String(raw).replace(/\s/g, '').match(/(\d+[.,]\d{2}|\d+)/);
  if (!m) return undefined;
  return Number(m[1].replace(',', '.'));
}

function first(...sels) {
  for (const sel of sels) {
    const el = document.querySelector(sel);
    if (el) return el;
  }
  return null;
}

export function extractMercadona() {
  const title =
    text(first('h1', '[class*="product-title"]', '[data-testid="product-title"]')) ||
    document.title;
  const priceEl = first(
    '[class*="price"]',
    '[data-testid="product-price"]',
    '.product-price',
    'meta[itemprop="price"]'
  );
  const price =
    priceEl?.getAttribute?.('content') != null
      ? Number(priceEl.getAttribute('content'))
      : parsePrice(text(priceEl));
  const img = first('img[src*="product"]', '.product-image img', 'main img');
  const brand = text(first('[class*="brand"]', '[itemprop="brand"]'));
  return {
    title,
    brand,
    price,
    imageUrl: img?.src || '',
    unitPrice: text(first('[class*="unit"]', '[class*="format"]')),
  };
}

export function extractBonarea() {
  const title = text(first('h1', '.product-name', '.product__title')) || document.title;
  const price = parsePrice(text(first('.price', '.product-price', '[class*="precio"]')));
  const img = first('.product-image img', 'main img', 'img');
  return {
    title,
    brand: text(first('.brand', '[class*="marca"]')),
    price,
    imageUrl: img?.src || '',
    unitPrice: text(first('[class*="unit"]', '.precio-unidad')),
  };
}

export function extractLidl() {
  const title =
    text(first('h1', '[data-testid="product-title"]', '.keyfacts__title')) || document.title;
  const price = parsePrice(
    text(first('.price__main', '.m-price__price', '[data-testid="price"]', '.price'))
  );
  const img = first('picture img', '.media__image img', 'main img');
  return {
    title,
    brand: text(first('.keyfacts__brand', '[class*="brand"]')),
    price,
    imageUrl: img?.src || '',
    unitPrice: text(first('.price__label', '[class*="unit"]')),
  };
}

export function extractGeneric() {
  const title =
    text(first('h1', 'meta[property="og:title"]')) ||
    document.querySelector('meta[property="og:title"]')?.content ||
    document.title;
  const priceMeta = document.querySelector('meta[property="product:price:amount"], meta[itemprop="price"]');
  const price =
    priceMeta?.content != null
      ? Number(priceMeta.content)
      : parsePrice(text(first('[class*="price"]', '[itemprop="price"]', '.price')));
  const img =
    document.querySelector('meta[property="og:image"]')?.content ||
    first('main img', 'img')?.src ||
    '';
  return {
    title: typeof title === 'string' ? title : text(title),
    brand: text(first('[itemprop="brand"]', '[class*="brand"]')),
    price,
    imageUrl: img,
    unitPrice: '',
  };
}

export function extractFromPage() {
  const store = detectStore(location.hostname);
  let data;
  if (store === 'mercadona') data = extractMercadona();
  else if (store === 'bonarea') data = extractBonarea();
  else if (store === 'lidl') data = extractLidl();
  else data = extractGeneric();

  const rawText = text(document.body).slice(0, 4000);
  return {
    store,
    storeUrl: location.href,
    title: data.title || 'Producto',
    brand: data.brand || '',
    price: data.price,
    unitPrice: data.unitPrice || '',
    imageUrl: data.imageUrl || '',
    rawText,
  };
}
