function detectStore(hostname) {
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

function extract() {
  const store = detectStore(location.hostname);
  let title = text(first('h1')) || document.title;
  let brand = '';
  let price;
  let unitPrice = '';
  let imageUrl = '';

  if (store === 'mercadona') {
    title = text(first('h1', '[class*="product-title"]')) || title;
    price = parsePrice(text(first('[class*="price"]', '[data-testid="product-price"]')));
    brand = text(first('[class*="brand"]'));
    imageUrl = first('img[src*="product"]', 'main img')?.src || '';
    unitPrice = text(first('[class*="unit"]', '[class*="format"]'));
  } else if (store === 'bonarea') {
    title = text(first('h1', '.product-name')) || title;
    price = parsePrice(text(first('.price', '.product-price', '[class*="precio"]')));
    imageUrl = first('.product-image img', 'main img')?.src || '';
  } else if (store === 'lidl') {
    title = text(first('h1', '.keyfacts__title')) || title;
    price = parsePrice(text(first('.price__main', '.m-price__price', '.price')));
    brand = text(first('.keyfacts__brand'));
    imageUrl = first('picture img', 'main img')?.src || '';
    unitPrice = text(first('.price__label'));
  } else {
    const priceMeta = document.querySelector(
      'meta[property="product:price:amount"], meta[itemprop="price"]'
    );
    price = priceMeta?.content ? Number(priceMeta.content) : parsePrice(text(first('[class*="price"]')));
    imageUrl =
      document.querySelector('meta[property="og:image"]')?.content ||
      first('main img')?.src ||
      '';
  }

  return {
    store,
    storeUrl: location.href,
    title,
    brand,
    price,
    unitPrice,
    imageUrl,
    rawText: text(document.body).slice(0, 4000),
  };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'EXTRACT_PRODUCT') {
    try {
      sendResponse({ ok: true, product: extract() });
    } catch (e) {
      sendResponse({ ok: false, error: String(e) });
    }
  }
  return true;
});
