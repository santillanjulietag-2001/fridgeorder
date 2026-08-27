<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { storeToRefs } from 'pinia';
import { STORE_LABELS, CATEGORY_ORDER, type Category, type Store } from '@fridgeorder/shared';
import { useNeedsStore, type NeedItem } from '@/stores/needs';
import { useSpeech } from '@/composables/useSpeech';

interface ProductOption {
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
  features?: { label: string; value: string }[];
}

const STORE_ORDER: Store[] = ['mercadona', 'lidl', 'bonarea', 'carrefour', 'dia', 'other'];

const STORE_LOGOS: Record<Store, string> = {
  mercadona: '/stores/mercadona.svg',
  lidl: '/stores/lidl.svg',
  bonarea: '/stores/bonarea.svg',
  carrefour: '/stores/carrefour.svg',
  dia: '/stores/dia.svg',
  other: '/stores/other.svg',
};

const needs = useNeedsStore();
const { selectedIds, items: needItems } = storeToRefs(needs);
const selectedNeedSet = computed(() => new Set(selectedIds.value.map(String)));
function isNeedChecked(id: string) {
  return selectedNeedSet.value.has(String(id));
}
async function onNeedCheck(id: string, ev: Event) {
  const checked = (ev.target as HTMLInputElement).checked;
  try {
    await needs.setSelected(id, checked);
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'No se pudo actualizar la selección';
  }
}

function openNeedDetail(item: NeedItem) {
  const features: { label: string; value: string }[] = [
    { label: 'Cantidad', value: `${item.quantity} ${item.unit}` },
  ];
  if (item.notes) features.push({ label: 'Notas', value: item.notes });
  if (item.priceSource) {
    features.push({
      label: 'Fuente precio',
      value:
        item.priceSource === 'scraped'
          ? 'Web del súper'
          : item.priceSource === 'ai_avg'
            ? 'Estimación IA'
            : item.priceSource,
    });
  }
  detailProduct.value = {
    store: (item.preferredStore || 'other') as Store,
    title: item.name,
    brand: item.brand || '',
    price: item.estimatedPrice,
    unitPrice: item.unitPrice || '',
    imageUrl: item.imageUrl || '',
    storeUrl: item.storeUrl || '',
    category: item.category,
    source: item.priceSource === 'scraped' ? 'live' : 'ai',
    description: item.notes || undefined,
    features,
  };
}

const speech = useSpeech();
const speechTranscript = computed(() => speech.transcript.value.trim());

const name = ref('');
const quantity = ref(1);
const error = ref('');
const searching = ref(false);
const options = ref<ProductOption[]>([]);
const liveCount = ref(0);
const picking = ref(false);
const detailProduct = ref<ProductOption | null>(null);
const DETAIL_FEATURE_SKIP = new Set(['Envase', 'Origen', 'EAN']);
const detailExtraFeatures = computed(() =>
  (detailProduct.value?.features || []).filter((f) => !DETAIL_FEATURE_SKIP.has(f.label))
);
const showResultsModal = ref(false);
const searchQueryLabel = ref('');
/** key -> quantity (>0 = selected) */
const optionQty = ref<Record<string, number>>({});
const pendingRemove = ref<{ id: string; name: string } | null>(null);
const pendingReset = ref<'all' | Category | null>(null);
const removing = ref(false);
const parsingSpoken = ref(false);
const spokenListening = ref(false);
const suggestingBasic = ref(false);
const showContextModal = ref(false);
const contextText = ref('');
const suggestingContext = ref(false);
const identifyingPhoto = ref(false);
const showFlowGuide = ref(false);
const photoInput = ref<HTMLInputElement | null>(null);

const SPOKEN_KEY = 'fo_spoken_list_session';

interface SpokenChoice {
  products: (ProductOption & { quantity?: number })[];
  needIds: string[];
}

interface SpokenSession {
  queries: string[];
  currentIndex: number;
  choices: Record<string, SpokenChoice>;
  transcript: string;
  origin?: 'voice' | 'suggested';
}

const spokenSession = ref<SpokenSession | null>(null);

/** Prelista sí/no antes de buscar (sugerencias nutricionales). */
const suggestPreview = ref<{
  items: string[];
  accepted: Record<number, boolean>;
  basedOn?: { goals: string[]; dietStyle: string };
} | null>(null);

const spokenActive = computed(() => Boolean(spokenSession.value?.queries.length));
const spokenSessionLabel = computed(() =>
  spokenSession.value?.origin === 'suggested' ? 'Sugerencias' : 'Lista hablada'
);
const spokenProgress = computed(() => {
  if (!spokenSession.value) return '';
  return `${spokenSession.value.currentIndex + 1} / ${spokenSession.value.queries.length}`;
});
const spokenCurrentQuery = computed(
  () => spokenSession.value?.queries[spokenSession.value.currentIndex] || ''
);
const canSpokenBack = computed(() => (spokenSession.value?.currentIndex || 0) > 0);
const canSpokenForward = computed(() => {
  if (!spokenSession.value) return false;
  return spokenSession.value.currentIndex < spokenSession.value.queries.length - 1;
});
const suggestAcceptedCount = computed(() => {
  if (!suggestPreview.value) return 0;
  return Object.values(suggestPreview.value.accepted).filter(Boolean).length;
});

function storeBreakdown(items: typeof needs.items) {
  const map = new Map<Store, { store: Store; label: string; logo: string; count: number; total: number }>();
  for (const item of items) {
    const store = (item.preferredStore || 'other') as Store;
    const row = map.get(store) || {
      store,
      label: STORE_LABELS[store] || store,
      logo: STORE_LOGOS[store] || STORE_LOGOS.other,
      count: 0,
      total: 0,
    };
    row.count += 1;
    row.total += (item.estimatedPrice || 0) * (item.quantity || 1);
    map.set(store, row);
  }
  return STORE_ORDER.map((s) => map.get(s)).filter(Boolean) as {
    store: Store;
    label: string;
    logo: string;
    count: number;
    total: number;
  }[];
}

const floatItems = computed(() => needs.selectedItems);
const floatTotal = computed(() =>
  floatItems.value.reduce((s, i) => s + (i.estimatedPrice || 0) * (i.quantity || 1), 0)
);
const floatByStore = computed(() => storeBreakdown(floatItems.value).filter((r) => r.count > 0));
const floatCount = computed(() => floatItems.value.length);
const floatStoresOpen = ref(false);
const allNeedsSelected = computed(() => {
  if (!needItems.value.length) return false;
  return needItems.value.every((i) => selectedNeedSet.value.has(String(i._id)));
});
const noneNeedsSelected = computed(
  () => needItems.value.length > 0 && selectedIds.value.length === 0
);

async function selectAllNeeds() {
  try {
    await needs.selectAll();
    const open: Record<string, boolean> = { ...openCategories.value };
    for (const cat of CATEGORY_ORDER) {
      if (needs.grouped[cat]?.length) open[cat] = true;
    }
    openCategories.value = open;
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'No se pudo marcar todos';
  }
}

async function selectNoneNeeds() {
  try {
    await needs.selectNone();
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'No se pudo desmarcar';
  }
}

const showSelectionFloat = computed(
  () =>
    needs.items.length > 0 &&
    !showResultsModal.value &&
    !suggestPreview.value &&
    !showContextModal.value &&
    !showFlowGuide.value &&
    !pendingRemove.value &&
    !pendingReset.value &&
    !spokenListening.value
);

/** Categorías de necesidades abiertas (por defecto todas colapsadas). */
const openCategories = ref<Record<string, boolean>>({});

function isCategoryOpen(cat: Category) {
  return Boolean(openCategories.value[cat]);
}

function toggleCategory(cat: Category) {
  openCategories.value = {
    ...openCategories.value,
    [cat]: !openCategories.value[cat],
  };
}

function categoryTotal(cat: Category) {
  return needs.grouped[cat].reduce(
    (sum, item) => sum + (item.estimatedPrice || 0) * (item.quantity || 1),
    0
  );
}

function optionKey(opt: ProductOption, idx: number) {
  return `${opt.store}::${opt.title}::${opt.storeUrl || idx}`;
}

type ResultsSort = 'price' | 'product' | 'store';
const resultsSort = ref<ResultsSort>('price');

const sortedOptions = computed(() => {
  const rows = options.value
    .map((o, idx) => ({ opt: o, idx, key: optionKey(o, idx) }))
    .filter((row) => row.opt.source === 'live');
  const sorted = [...rows];
  if (resultsSort.value === 'price') {
    sorted.sort((a, b) => (a.opt.price ?? Number.POSITIVE_INFINITY) - (b.opt.price ?? Number.POSITIVE_INFINITY));
  } else if (resultsSort.value === 'product') {
    sorted.sort((a, b) => a.opt.title.localeCompare(b.opt.title, 'es', { sensitivity: 'base' }));
  } else {
    sorted.sort((a, b) => {
      const byStore = STORE_ORDER.indexOf(a.opt.store) - STORE_ORDER.indexOf(b.opt.store);
      if (byStore !== 0) return byStore;
      return (a.opt.price ?? Number.POSITIVE_INFINITY) - (b.opt.price ?? Number.POSITIVE_INFINITY);
    });
  }
  return sorted;
});

const selectedCount = computed(() =>
  Object.values(optionQty.value).filter((q) => q > 0).length
);

const selectedOptions = computed(() =>
  options.value
    .map((o, idx) => {
      const key = optionKey(o, idx);
      const qty = optionQty.value[key] || 0;
      return qty > 0 ? { opt: o, key, qty } : null;
    })
    .filter(Boolean) as { opt: ProductOption; key: string; qty: number }[]
);

onMounted(() => {
  needs.fetchNeeds();
  restoreSpokenSession();
});

function saveSpokenSession() {
  if (!spokenSession.value) {
    localStorage.removeItem(SPOKEN_KEY);
    return;
  }
  localStorage.setItem(SPOKEN_KEY, JSON.stringify(spokenSession.value));
}

function restoreSpokenSession() {
  try {
    const raw = localStorage.getItem(SPOKEN_KEY);
    if (!raw) return;
    spokenSession.value = JSON.parse(raw) as SpokenSession;
    const q = spokenSession.value.queries[spokenSession.value.currentIndex];
    if (q) {
      void searchForQuery(q);
    }
  } catch {
    localStorage.removeItem(SPOKEN_KEY);
  }
}

function clearSpokenSession() {
  spokenSession.value = null;
  localStorage.removeItem(SPOKEN_KEY);
}

async function searchForQuery(query: string) {
  name.value = query;
  await searchSupers();
  // Preselect previous choices for this step if any
  const idx = spokenSession.value?.currentIndex;
  if (spokenSession.value && idx != null) {
    const prev = spokenSession.value.choices[String(idx)];
    if (prev?.products?.length) {
      const nextQty: Record<string, number> = {};
      for (const p of prev.products) {
        const foundIdx = options.value.findIndex(
          (o) => o.store === p.store && o.title === p.title
        );
        if (foundIdx >= 0) {
          const key = optionKey(options.value[foundIdx]!, foundIdx);
          nextQty[key] = Math.max(1, (p as ProductOption & { quantity?: number }).quantity || 1);
        }
      }
      optionQty.value = nextQty;
    }
  }
}

async function goSpokenIndex(nextIndex: number) {
  if (!spokenSession.value) return;
  if (nextIndex < 0 || nextIndex >= spokenSession.value.queries.length) return;
  spokenSession.value.currentIndex = nextIndex;
  saveSpokenSession();
  await searchForQuery(spokenSession.value.queries[nextIndex]!);
}

async function spokenBack() {
  if (!canSpokenBack.value || !spokenSession.value) return;
  await goSpokenIndex(spokenSession.value.currentIndex - 1);
}

async function spokenForward() {
  if (!canSpokenForward.value || !spokenSession.value) return;
  await goSpokenIndex(spokenSession.value.currentIndex + 1);
}

async function startSpokenList() {
  if (!speech.supported) {
    error.value = 'Tu navegador no soporta dictado por micrófono';
    return;
  }
  error.value = '';
  speech.transcript.value = '';
  spokenListening.value = true;
  speech.start(undefined, { continuous: true });
}

async function finishSpokenList() {
  speech.stop();
  spokenListening.value = false;
  const text = speech.transcript.value.trim();
  if (!text) {
    error.value = 'No se escuchó ninguna lista. Prueba de nuevo.';
    return;
  }
  parsingSpoken.value = true;
  error.value = '';
  try {
    const data = await needs.parseSpokenList(text);
    if (!data.items.length) {
      error.value =
        'No detecté productos de compra en lo que dijiste. Di solo nombres (ej. leche, pan, tomates), sin opiniones.';
      return;
    }
    spokenSession.value = {
      queries: data.items,
      currentIndex: 0,
      choices: {},
      transcript: text,
      origin: 'voice',
    };
    saveSpokenSession();
    await searchForQuery(data.items[0]!);
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Error al procesar la lista hablada';
  } finally {
    parsingSpoken.value = false;
  }
}

async function cancelSpokenListen() {
  speech.stop();
  spokenListening.value = false;
}

async function startSuggestedNeeds() {
  error.value = '';
  suggestingBasic.value = true;
  suggestPreview.value = null;
  try {
    const data = await needs.suggestBasicNeeds(10);
    if (!data.items.length) {
      error.value = 'No pude generar sugerencias nutricionales básicas.';
      return;
    }
    const accepted: Record<number, boolean> = {};
    data.items.forEach((_, i) => {
      accepted[i] = true;
    });
    suggestPreview.value = {
      items: data.items,
      accepted,
      basedOn: data.basedOn,
    };
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Error al sugerir necesidades';
  } finally {
    suggestingBasic.value = false;
  }
}

function openContextModal() {
  error.value = '';
  contextText.value = '';
  showContextModal.value = true;
}

function closeContextModal() {
  showContextModal.value = false;
  contextText.value = '';
}

async function submitContextSuggest() {
  const text = contextText.value.trim();
  if (text.length < 3) {
    error.value = 'Cuéntame un poco más el contexto de la compra.';
    return;
  }
  suggestingContext.value = true;
  error.value = '';
  try {
    const data = await needs.suggestFromContext(text);
    if (!data.items.length) {
      error.value = 'No pude armar una lista con ese contexto. Prueba a ser más concreto.';
      return;
    }
    showContextModal.value = false;
    contextText.value = '';
    const accepted: Record<number, boolean> = {};
    data.items.forEach((_, i) => {
      accepted[i] = true;
    });
    suggestPreview.value = {
      items: data.items,
      accepted,
      basedOn: { goals: [], dietStyle: 'contexto' },
    };
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Error al generar la lista';
  } finally {
    suggestingContext.value = false;
  }
}

function openPhotoCapture() {
  if (identifyingPhoto.value || searching.value) return;
  error.value = '';
  photoInput.value?.click();
}

function fileToCompressedDataUrl(file: File, maxSide = 960, quality = 0.78): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('No se pudo leer la imagen'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Imagen inválida (prueba JPG o PNG)'));
      img.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('No se pudo procesar la imagen'));
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        let q = quality;
        let dataUrl = canvas.toDataURL('image/jpeg', q);
        // Mantener payload razonable para la API
        while (dataUrl.length > 1_200_000 && q > 0.45) {
          q -= 0.1;
          dataUrl = canvas.toDataURL('image/jpeg', q);
        }
        resolve(dataUrl);
      };
      img.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  });
}

async function onPhotoSelected(ev: Event) {
  const input = ev.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    error.value = 'Elige una imagen del producto.';
    return;
  }

  identifyingPhoto.value = true;
  error.value = '';
  suggestPreview.value = null;
  try {
    const imageDataUrl = await fileToCompressedDataUrl(file);
    const identified = await needs.identifyProduct(imageDataUrl);
    if (!identified.items?.length) {
      error.value = 'No pude reconocer productos. Prueba otra foto más cercana.';
      return;
    }
    const accepted: Record<number, boolean> = {};
    identified.items.forEach((_, i) => {
      accepted[i] = true;
    });
    suggestPreview.value = {
      items: identified.items,
      accepted,
      basedOn: { goals: [], dietStyle: 'foto' },
    };
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Error al identificar la foto';
  } finally {
    identifyingPhoto.value = false;
  }
}

function setSuggestAccepted(index: number, value: boolean) {
  if (!suggestPreview.value) return;
  suggestPreview.value.accepted = { ...suggestPreview.value.accepted, [index]: value };
}

function acceptAllSuggest() {
  if (!suggestPreview.value) return;
  const accepted: Record<number, boolean> = {};
  suggestPreview.value.items.forEach((_, i) => {
    accepted[i] = true;
  });
  suggestPreview.value.accepted = accepted;
}

function rejectAllSuggest() {
  if (!suggestPreview.value) return;
  const accepted: Record<number, boolean> = {};
  suggestPreview.value.items.forEach((_, i) => {
    accepted[i] = false;
  });
  suggestPreview.value.accepted = accepted;
}

const allSuggestAccepted = computed(() => {
  if (!suggestPreview.value?.items.length) return false;
  return suggestPreview.value.items.every((_, i) => suggestPreview.value!.accepted[i]);
});

function toggleSuggestAll() {
  if (allSuggestAccepted.value) rejectAllSuggest();
  else acceptAllSuggest();
}

function closeSuggestPreview() {
  suggestPreview.value = null;
}

async function confirmSuggestPreview() {
  if (!suggestPreview.value) return;
  const queries = suggestPreview.value.items.filter((_, i) => suggestPreview.value!.accepted[i]);
  if (!queries.length) {
    error.value = 'Acepta al menos un producto de la prelista.';
    return;
  }
  const fromPhoto = suggestPreview.value.basedOn?.dietStyle === 'foto';
  suggestPreview.value = null;
  spokenSession.value = {
    queries,
    currentIndex: 0,
    choices: {},
    transcript: fromPhoto ? '(productos detectados en foto)' : '(sugerido según necesidades nutricionales)',
    origin: 'suggested',
  };
  saveSpokenSession();
  await searchForQuery(queries[0]!);
}

async function searchSupers() {
  if (!name.value.trim()) return;
  error.value = '';
  searching.value = true;
  options.value = [];
  optionQty.value = {};
  const keepWizardOpen = Boolean(spokenSession.value);
  showResultsModal.value = keepWizardOpen;
  searchQueryLabel.value = name.value.trim();
  try {
    const data = await needs.searchProducts(name.value.trim());
    options.value = data.options;
    liveCount.value = data.liveCount;
    if (!data.options.length) {
      error.value = keepWizardOpen
        ? 'Sin resultados para este producto.'
        : 'No se encontraron opciones';
      showResultsModal.value = keepWizardOpen;
    } else {
      showResultsModal.value = true;
      window.scrollTo(0, 0);
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Error al buscar en supers';
    if (!keepWizardOpen) showResultsModal.value = false;
  } finally {
    searching.value = false;
  }
}

function closeResultsModal() {
  showResultsModal.value = false;
  detailProduct.value = null;
  options.value = [];
  optionQty.value = {};
}

function cancelSpokenWizard() {
  clearSpokenSession();
  closeResultsModal();
  name.value = '';
}

function toggleOption(key: string) {
  if ((optionQty.value[key] || 0) > 0) {
    const next = { ...optionQty.value };
    delete next[key];
    optionQty.value = next;
  } else {
    optionQty.value = { ...optionQty.value, [key]: 1 };
  }
}

function isSelected(key: string) {
  return (optionQty.value[key] || 0) > 0;
}

function getQty(key: string) {
  return optionQty.value[key] || 0;
}

function bumpQty(key: string, delta: number, ev?: Event) {
  ev?.stopPropagation();
  ev?.preventDefault();
  const current = optionQty.value[key] || 0;
  const nextVal = current + delta;
  const next = { ...optionQty.value };
  if (nextVal <= 0) {
    delete next[key];
  } else {
    next[key] = nextVal;
  }
  optionQty.value = next;
}

function selectAllInStore(keys: string[]) {
  const allSelected = keys.every((k) => (optionQty.value[k] || 0) > 0);
  const next = { ...optionQty.value };
  if (allSelected) {
    for (const k of keys) delete next[k];
  } else {
    for (const k of keys) {
      if (!next[k]) next[k] = 1;
    }
  }
  optionQty.value = next;
}

async function pickSelected() {
  if (!selectedOptions.value.length) return;
  picking.value = true;
  error.value = '';
  try {
    const stepIndex = spokenSession.value?.currentIndex;
    if (spokenSession.value && stepIndex != null) {
      const prev = spokenSession.value.choices[String(stepIndex)];
      if (prev?.needIds?.length) {
        for (const id of prev.needIds) {
          try {
            await needs.removeNeed(id);
          } catch {
            /* ignore */
          }
        }
      }
    }

    const needIds: string[] = [];
    const products: (ProductOption & { quantity: number })[] = [];
    for (const row of selectedOptions.value) {
      const item = await needs.pickProduct({
        ...row.opt,
        quantity: row.qty,
        sourceHint: row.opt.source,
      });
      needIds.push(item._id);
      products.push({ ...row.opt, quantity: row.qty });
    }

    if (spokenSession.value && stepIndex != null) {
      spokenSession.value.choices[String(stepIndex)] = { products, needIds };
      saveSpokenSession();
      const next = stepIndex + 1;
      if (next < spokenSession.value.queries.length) {
        spokenSession.value.currentIndex = next;
        saveSpokenSession();
        name.value = '';
        quantity.value = 1;
        optionQty.value = {};
        await searchForQuery(spokenSession.value.queries[next]!);
        picking.value = false;
        return;
      }
      clearSpokenSession();
    }

    name.value = '';
    quantity.value = 1;
    closeResultsModal();
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'No se pudieron añadir los productos';
  } finally {
    picking.value = false;
  }
}

/** Omite el producto actual del wizard (lista hablada / sugerencias) sin añadir nada. */
async function skipSpokenStep() {
  if (!spokenSession.value) return;
  picking.value = true;
  error.value = '';
  try {
    const stepIndex = spokenSession.value.currentIndex;
    const prev = spokenSession.value.choices[String(stepIndex)];
    if (prev?.needIds?.length) {
      for (const id of prev.needIds) {
        try {
          await needs.removeNeed(id);
        } catch {
          /* ignore */
        }
      }
    }
    spokenSession.value.choices[String(stepIndex)] = { products: [], needIds: [] };
    const next = stepIndex + 1;
    if (next < spokenSession.value.queries.length) {
      spokenSession.value.currentIndex = next;
      saveSpokenSession();
      name.value = '';
      quantity.value = 1;
      optionQty.value = {};
      await searchForQuery(spokenSession.value.queries[next]!);
      return;
    }
    clearSpokenSession();
    name.value = '';
    quantity.value = 1;
    closeResultsModal();
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'No se pudo omitir este producto';
  } finally {
    picking.value = false;
  }
}

function euro(n?: number | string | null) {
  const value = typeof n === 'string' ? Number(n.replace(',', '.')) : n;
  if (value == null || Number.isNaN(Number(value))) return 'Sin precio';
  return `${Number(value).toFixed(2).replace('.', ',')} €`;
}

function askRemove(id: string, itemName: string) {
  pendingRemove.value = { id, name: itemName };
}

function cancelRemove() {
  pendingRemove.value = null;
}

async function confirmRemove() {
  if (!pendingRemove.value) return;
  removing.value = true;
  error.value = '';
  try {
    await needs.removeNeed(pendingRemove.value.id);
    pendingRemove.value = null;
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'No se pudo quitar';
  } finally {
    removing.value = false;
  }
}

function askResetAll() {
  if (!needs.items.length) return;
  pendingReset.value = 'all';
}

function askResetCategory(cat: Category) {
  if (!needs.grouped[cat].length) return;
  pendingReset.value = cat;
}

function cancelReset() {
  pendingReset.value = null;
}

const resetModalTitle = computed(() => {
  if (pendingReset.value === 'all') return '¿Vaciar toda la lista?';
  if (pendingReset.value) return `¿Vaciar ${needs.categoryLabel(pendingReset.value)}?`;
  return '';
});

const resetModalBody = computed(() => {
  if (pendingReset.value === 'all') {
    return `Se eliminarán los ${needs.items.length} productos de la lista de compras.`;
  }
  if (pendingReset.value) {
    const n = needs.grouped[pendingReset.value].length;
    return `Se eliminarán ${n} producto${n === 1 ? '' : 's'} de este grupo.`;
  }
  return '';
});

async function confirmReset() {
  if (!pendingReset.value) return;
  removing.value = true;
  error.value = '';
  try {
    const ids =
      pendingReset.value === 'all'
        ? needs.items.map((i) => i._id)
        : needs.grouped[pendingReset.value].map((i) => i._id);
    for (const id of ids) {
      try {
        await needs.removeNeed(id);
      } catch {
        /* ignore individual failures */
      }
    }
    pendingReset.value = null;
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'No se pudo vaciar la lista';
  } finally {
    removing.value = false;
  }
}
</script>

<template>
  <main
    class="container fade-in"
    :class="{ 'has-selection-float': showSelectionFloat }"
    style="padding: 1.25rem 0 6rem"
  >
    <section class="panel" style="margin-top: 0">
      <div class="page-header">
        <h1 class="page-title">Lista de compras</h1>
        <div class="header-tools">
          <button
            class="btn ghost settings-gear"
            type="button"
            aria-label="Cómo funciona"
            title="Cómo funciona"
            @click="showFlowGuide = true"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <path d="M9.5 9a2.5 2.5 0 1 1 3.8 2.1c-.8.5-1.3 1-1.3 2" stroke-linecap="round" />
              <circle cx="12" cy="16.5" r="0.9" fill="currentColor" stroke="none" />
            </svg>
          </button>
          <RouterLink
            class="btn ghost settings-gear"
            to="/settings"
            aria-label="Ajustes"
            title="Ajustes"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <circle cx="12" cy="12" r="3" />
              <path
                d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9c0 .7.4 1.3 1 1.5H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"
                stroke-linejoin="round"
              />
            </svg>
          </RouterLink>
        </div>
      </div>
      <div class="field">
        <label>¿Qué necesitas?</label>
        <div class="need-search">
          <input
            v-model="name"
            placeholder="Ej. queso cheddar"
            @keydown.enter.prevent="searchSupers()"
          />
          <button
            class="need-search-go"
            type="button"
            :disabled="searching || !name.trim()"
            :aria-label="searching ? 'Buscando' : 'Buscar súpers'"
            :title="searching ? 'Buscando…' : 'Buscar súpers'"
            @click="searchSupers"
          >
            <span v-if="searching" class="icon-action-spin" aria-hidden="true">…</span>
            <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true">
              <path d="M5 12h12M13 6l6 6-6 6" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </button>
        </div>
      </div>
      <!-- Cantidad/Súper ocultos: defaults quantity=1, store=other -->
      <input
        ref="photoInput"
        type="file"
        accept="image/*"
        capture="environment"
        class="sr-only-file"
        @change="onPhotoSelected"
      />
      <p v-if="error" class="diff-bad">{{ error }}</p>
      <div class="needs-actions">
        <button
          class="icon-action"
          type="button"
          :class="{ active: spokenListening }"
          :disabled="!speech.supported || parsingSpoken || searching || suggestingBasic || suggestingContext"
          :aria-label="
            parsingSpoken
              ? 'Procesando'
              : spokenListening
                ? 'Terminar lista'
                : 'Lista hablada'
          "
          :title="
            parsingSpoken
              ? 'Procesando…'
              : spokenListening
                ? 'Terminar lista'
                : 'Lista hablada'
          "
          @click="spokenListening ? finishSpokenList() : startSpokenList()"
        >
          <span class="icon-action-glyph" aria-hidden="true">
            <template v-if="parsingSpoken">
              <span class="icon-action-spin">…</span>
            </template>
            <svg
              v-else-if="spokenListening"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <rect x="7" y="7" width="10" height="10" rx="2" />
            </svg>
            <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path
                d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z"
                stroke-linejoin="round"
              />
              <path d="M5 11a7 7 0 0 0 14 0M12 18v3" stroke-linecap="round" />
            </svg>
          </span>
          <span class="icon-action-label">
            {{
              parsingSpoken ? 'Procesando' : spokenListening ? 'Terminar lista' : 'Lista hablada'
            }}
          </span>
        </button>

        <button
          class="icon-action"
          type="button"
          :disabled="
            identifyingPhoto ||
            suggestingContext ||
            suggestingBasic ||
            parsingSpoken ||
            searching ||
            spokenListening
          "
          :aria-label="identifyingPhoto ? 'Identificando' : 'Foto producto'"
          :title="identifyingPhoto ? 'Identificando…' : 'Foto de producto'"
          @click="openPhotoCapture"
        >
          <span class="icon-action-glyph" aria-hidden="true">
            <span v-if="identifyingPhoto" class="icon-action-spin">…</span>
            <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path
                d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z"
                stroke-linejoin="round"
              />
              <circle cx="12" cy="13" r="3.2" />
            </svg>
          </span>
          <span class="icon-action-label">{{ identifyingPhoto ? 'Identificando' : 'Foto' }}</span>
        </button>

        <button
          class="icon-action"
          type="button"
          :disabled="suggestingBasic || suggestingContext || parsingSpoken || searching || spokenListening"
          :aria-label="suggestingBasic ? 'Generando' : 'Lista con IA'"
          :title="suggestingBasic ? 'Generando…' : 'Lista con IA'"
          @click="startSuggestedNeeds"
        >
          <span class="icon-action-glyph" aria-hidden="true">
            <span v-if="suggestingBasic" class="icon-action-spin">…</span>
            <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 3v3M12 18v3M3 12h3M18 12h3" stroke-linecap="round" />
              <path
                d="M12 8.2a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 0 0 0-7.6Z"
                stroke-linejoin="round"
              />
              <path d="M8.5 8.5 7 7M15.5 8.5 17 7M8.5 15.5 7 17M15.5 15.5 17 17" stroke-linecap="round" />
            </svg>
          </span>
          <span class="icon-action-label">{{ suggestingBasic ? 'Generando' : 'Lista con IA' }}</span>
        </button>

        <button
          class="icon-action"
          type="button"
          :disabled="suggestingContext || suggestingBasic || parsingSpoken || searching || spokenListening"
          :aria-label="suggestingContext ? 'Generando' : 'Lista especial'"
          :title="suggestingContext ? 'Generando…' : 'Lista especial'"
          @click="openContextModal"
        >
          <span class="icon-action-glyph" aria-hidden="true">
            <span v-if="suggestingContext" class="icon-action-spin">…</span>
            <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path
                d="M12 21s-7-4.4-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 11c0 5.6-7 10-7 10Z"
                stroke-linejoin="round"
              />
            </svg>
          </span>
          <span class="icon-action-label">{{ suggestingContext ? 'Generando' : 'Lista especial' }}</span>
        </button>

        <button
          v-if="spokenListening"
          class="icon-action ghost"
          type="button"
          aria-label="Cancelar mic"
          title="Cancelar mic"
          @click="cancelSpokenListen"
        >
          <span class="icon-action-glyph" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M6 6l12 12M18 6L6 18" stroke-linecap="round" />
            </svg>
          </span>
          <span class="icon-action-label">Cancelar mic</span>
        </button>
      </div>
      <p v-if="spokenListening" class="muted needs-actions-hint">
        Enumera productos y pulsa <strong>Terminar lista</strong> al acabar.
      </p>
      <p v-if="speechTranscript" class="muted" style="margin-top: 0.6rem">“{{ speechTranscript }}”</p>
    </section>

    <section style="margin-top: 1.25rem">
      <p v-if="needs.loading" class="muted">Cargando…</p>
      <div v-if="!needs.loading && needs.items.length" class="list-reset-bar">
        <button
          type="button"
          class="btn ghost list-reset-all"
          :disabled="removing"
          @click="askResetAll"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <path d="M4 7h16M9 7V5h6v2M8 7l1 12h6l1-12" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
          Vaciar lista
        </button>
      </div>
      <template v-for="cat in CATEGORY_ORDER" :key="cat">
        <div v-if="needs.grouped[cat].length" class="panel category-panel" style="margin-bottom: 0.8rem">
          <div class="category-header">
            <button
              type="button"
              class="category-toggle"
              :aria-expanded="isCategoryOpen(cat)"
              @click="toggleCategory(cat)"
            >
              <span class="category-toggle-left">
                <span class="category-chevron" :class="{ open: isCategoryOpen(cat) }" aria-hidden="true">›</span>
                <strong>{{ needs.categoryLabel(cat) }}</strong>
              </span>
              <span class="category-toggle-meta">
                <span class="chip">{{ needs.grouped[cat].length }}</span>
                <span class="chip category-total">{{ euro(categoryTotal(cat)) }}</span>
              </span>
            </button>
            <button
              type="button"
              class="category-reset"
              :aria-label="`Vaciar ${needs.categoryLabel(cat)}`"
              :title="`Vaciar ${needs.categoryLabel(cat)}`"
              :disabled="removing"
              @click.stop="askResetCategory(cat)"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <path d="M4 7h16M9 7V5h6v2M8 7l1 12h6l1-12" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </button>
          </div>
          <div v-show="isCategoryOpen(cat)" class="category-body">
            <div v-for="item in needs.grouped[cat]" :key="item._id" class="option-row need-row">
              <label class="need-check-wrap">
                <input
                  class="need-check"
                  type="checkbox"
                  :checked="isNeedChecked(item._id)"
                  @change="onNeedCheck(item._id, $event)"
                />
              </label>
              <div class="need-photo">
                <img v-if="item.imageUrl" :src="item.imageUrl" alt="" class="thumb" />
                <div v-else class="thumb placeholder">
                  <img
                    :src="STORE_LOGOS[item.preferredStore] || STORE_LOGOS.other"
                    :alt="STORE_LABELS[item.preferredStore] || 'Súper'"
                    class="thumb-logo"
                  />
                </div>
                <button
                  class="compare-photo-info"
                  type="button"
                  title="Ver datos del producto"
                  aria-label="Ver datos del producto"
                  @click.stop="openNeedDetail(item)"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 11v5" stroke-linecap="round" />
                    <circle cx="12" cy="8" r="0.9" fill="currentColor" stroke="none" />
                  </svg>
                </button>
              </div>
              <div class="option-body">
                <div class="chip">
                  {{ STORE_LABELS[item.preferredStore] || item.preferredStore }}
                </div>
                <strong>{{ item.name }}</strong>
                <div class="muted" style="font-size: 0.85rem">
                  {{ item.quantity }} {{ item.unit }}
                  <span v-if="item.brand"> · {{ item.brand }}</span>
                  <span v-else-if="item.notes"> · {{ item.notes }}</span>
                  <span v-if="item.unitPrice"> · {{ item.unitPrice }}</span>
                  <span v-else-if="item.estimatedPrice != null && item.quantity > 1">
                    · {{ euro(item.estimatedPrice) }}/ud
                  </span>
                </div>
              </div>
              <div class="option-actions">
                <div class="price">{{ euro((item.estimatedPrice || 0) * (item.quantity || 1)) }}</div>
                <button
                  class="btn-x"
                  type="button"
                  title="Quitar"
                  aria-label="Quitar producto"
                  @click="askRemove(item._id, item.name)"
                >
                  ×
                </button>
              </div>
            </div>
          </div>
        </div>
      </template>
      <div v-if="!needs.loading && !needs.items.length" class="needs-empty">
        <div class="needs-empty-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
            <rect x="5" y="3" width="14" height="18" rx="2.5" />
            <path d="M5 10h14" stroke-linecap="round" />
            <path d="M9 14h6M9 17h4" stroke-linecap="round" />
          </svg>
        </div>
        <p class="needs-empty-text">Lista vacía</p>
      </div>
    </section>

    <div
      v-if="showContextModal"
      class="modal-backdrop modal-backdrop--top"
      @click.self="closeContextModal"
    >
      <div class="modal-panel results-modal context-modal" role="dialog" aria-modal="true">
        <div class="results-header">
          <div>
            <h3>Lista especial</h3>
            <p class="muted" style="margin: 0.2rem 0 0">¿Qué quieres comprar esta vez?</p>
          </div>
        </div>
        <div class="field" style="margin: 0.75rem 0 0">
          <textarea
            v-model="contextText"
            rows="5"
            placeholder="Ej. Tengo una cena romántica y quiero productos para una torta y una comida especial con carne y pastas"
          />
        </div>
        <div class="results-footer suggest-footer">
          <button
            class="suggest-icon-btn"
            type="button"
            title="Cancelar"
            aria-label="Cancelar"
            :disabled="suggestingContext"
            @click="closeContextModal"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke-linecap="round" />
            </svg>
          </button>
          <button
            class="suggest-icon-btn primary suggest-confirm"
            type="button"
            :disabled="suggestingContext || contextText.trim().length < 3"
            @click="submitContextSuggest"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true">
              <path d="M5 12h12M13 6l6 6-6 6" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
            <span>{{ suggestingContext ? 'Generando…' : 'Generar lista' }}</span>
          </button>
        </div>
      </div>
    </div>

    <div
      v-if="suggestPreview"
      class="modal-backdrop modal-backdrop--top"
      @click.self="closeSuggestPreview"
    >
      <div class="modal-panel results-modal suggest-preview" role="dialog" aria-modal="true">
        <div class="results-header">
          <div>
            <h3>Prelista</h3>
            <p v-if="suggestPreview.basedOn?.dietStyle === 'foto'" class="muted" style="margin: 0.2rem 0 0">
              productos detectados en la foto
            </p>
            <p
              v-else-if="suggestPreview.basedOn?.dietStyle && suggestPreview.basedOn.dietStyle !== 'contexto'"
              class="muted"
              style="margin: 0.2rem 0 0"
            >
              dieta: {{ suggestPreview.basedOn.dietStyle }}
            </p>
          </div>
          <button
            class="btn-x"
            type="button"
            title="Cerrar"
            aria-label="Cerrar"
            @click="closeSuggestPreview"
          >
            ×
          </button>
        </div>
        <div class="results-list suggest-list">
          <label
            v-for="(item, index) in suggestPreview.items"
            :key="`${item}-${index}`"
            class="suggest-row"
            :class="{ accepted: suggestPreview.accepted[index], rejected: !suggestPreview.accepted[index] }"
          >
            <input
              class="need-check"
              type="checkbox"
              :checked="suggestPreview.accepted[index]"
              @click.prevent="setSuggestAccepted(index, !suggestPreview.accepted[index])"
            />
            <strong>{{ item }}</strong>
          </label>
        </div>
        <div class="results-footer suggest-footer">
          <button
            class="suggest-icon-btn"
            type="button"
            :title="allSuggestAccepted ? 'Desmarcar todos' : 'Marcar todos'"
            :aria-label="allSuggestAccepted ? 'Desmarcar todos' : 'Marcar todos'"
            @click="toggleSuggestAll"
          >
            <svg
              v-if="allSuggestAccepted"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              aria-hidden="true"
            >
              <rect x="4" y="4" width="16" height="16" rx="3" />
              <path d="M8 12h8" stroke-linecap="round" />
            </svg>
            <svg
              v-else
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              aria-hidden="true"
            >
              <rect x="4" y="4" width="16" height="16" rx="3" />
              <path d="M8 12l2.5 2.5L16 9" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </button>
          <button
            class="suggest-icon-btn primary suggest-confirm"
            type="button"
            title="Buscar aceptados"
            :aria-label="`Buscar aceptados (${suggestAcceptedCount})`"
            :disabled="!suggestAcceptedCount || searching"
            @click="confirmSuggestPreview"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true">
              <path d="M5 12h12M13 6l6 6-6 6" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
            <span>Buscar aceptados ({{ suggestAcceptedCount }})</span>
          </button>
        </div>
      </div>
    </div>

    <Teleport to="body">
    <div
      v-if="showResultsModal"
      class="modal-backdrop modal-backdrop--sheet"
      @click.self="spokenActive ? cancelSpokenWizard() : closeResultsModal()"
    >
      <div
        class="modal-panel results-modal results-modal--compare"
        role="dialog"
        aria-modal="true"
        aria-labelledby="results-title"
      >
        <div class="results-header wizard-header">
          <div class="wizard-header-main">
            <div v-if="spokenActive" class="wizard-nav">
              <button
                class="spoken-icon-btn"
                type="button"
                title="Anterior"
                aria-label="Anterior"
                :disabled="!canSpokenBack || searching || picking"
                @click="spokenBack"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true">
                  <path d="M15 6l-6 6 6 6" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
              </button>
              <span class="chip">{{ spokenProgress }}</span>
              <button
                class="spoken-icon-btn"
                type="button"
                title="Siguiente (buscar)"
                aria-label="Siguiente"
                :disabled="!canSpokenForward || searching || picking"
                @click="spokenForward"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true">
                  <path d="M9 6l6 6-6 6" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
              </button>
            </div>
            <h3 id="results-title">Elegir productos buscados</h3>
          </div>
          <button
            class="btn-x"
            type="button"
            :aria-label="spokenActive ? 'Cancelar búsqueda' : 'Cerrar'"
            :title="spokenActive ? 'Cancelar búsqueda' : 'Cerrar'"
            @click="spokenActive ? cancelSpokenWizard() : closeResultsModal()"
          >
            ×
          </button>
        </div>
        <div class="results-query-banner" aria-live="polite">
          <strong class="results-query-name">
            {{ spokenActive ? spokenCurrentQuery : searchQueryLabel || name || '…' }}
          </strong>
          <span class="results-query-count">
            <template v-if="searching">Buscando…</template>
            <template v-else>
              {{ sortedOptions.length }} resultado{{ sortedOptions.length === 1 ? '' : 's' }}
              <span v-if="selectedCount"> · {{ selectedCount }} elegidos</span>
            </template>
          </span>
        </div>
        <div v-if="!searching && sortedOptions.length" class="results-sort" role="group" aria-label="Ordenar resultados">
          <span class="results-sort-label">Ordenar</span>
          <button
            type="button"
            class="results-sort-btn"
            :class="{ active: resultsSort === 'price' }"
            @click="resultsSort = 'price'"
          >
            Precio
          </button>
          <button
            type="button"
            class="results-sort-btn"
            :class="{ active: resultsSort === 'product' }"
            @click="resultsSort = 'product'"
          >
            Producto
          </button>
          <button
            type="button"
            class="results-sort-btn"
            :class="{ active: resultsSort === 'store' }"
            @click="resultsSort = 'store'"
          >
            Súper
          </button>
        </div>
        <div v-if="searching" class="wizard-loading" aria-live="polite" aria-busy="true" aria-label="Buscando en súpers">
          <div class="search-spinner" aria-hidden="true">
            <span class="search-spinner-orbit">
              <span class="search-spinner-slot"><img src="/stores/mercadona.svg" alt="" /></span>
              <span class="search-spinner-slot"><img src="/stores/lidl.svg" alt="" /></span>
              <span class="search-spinner-slot"><img src="/stores/carrefour.svg" alt="" /></span>
              <span class="search-spinner-slot"><img src="/stores/bonarea.svg" alt="" /></span>
              <span class="search-spinner-slot"><img src="/stores/dia.svg" alt="" /></span>
            </span>
            <span class="search-spinner-cart" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="9" cy="20" r="1.4" />
                <circle cx="17" cy="20" r="1.4" />
                <path d="M3 4h2l2.4 11h10.2l2-7H7.2" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </span>
          </div>
          <div class="search-spinner-dots" aria-hidden="true">
            <span /><span /><span />
          </div>
        </div>
        <div v-else class="results-list results-compare-grid">
          <article
            v-for="row in sortedOptions"
            :key="row.key"
            class="compare-card"
            :class="{ selected: isSelected(row.key) }"
            role="button"
            tabindex="0"
            @click="!isSelected(row.key) && bumpQty(row.key, 1)"
            @keydown.enter.prevent="!isSelected(row.key) && bumpQty(row.key, 1)"
          >
            <div class="compare-card-row">
              <div class="compare-photo">
                <img v-if="row.opt.imageUrl" :src="row.opt.imageUrl" alt="" class="compare-thumb" />
                <div v-else class="compare-thumb compare-thumb--empty">
                  <img
                    :src="STORE_LOGOS[row.opt.store] || STORE_LOGOS.other"
                    :alt="STORE_LABELS[row.opt.store] || row.opt.store"
                    class="thumb-logo"
                  />
                </div>
                <button
                  v-if="row.opt.source === 'live'"
                  class="compare-photo-info"
                  type="button"
                  title="Ver datos del producto"
                  aria-label="Ver datos del producto"
                  @click.stop="detailProduct = row.opt"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 11v5" stroke-linecap="round" />
                    <circle cx="12" cy="8" r="0.9" fill="currentColor" stroke="none" />
                  </svg>
                </button>
              </div>

              <div class="compare-card-body">
                <div class="compare-store-line">
                  <img
                    :src="STORE_LOGOS[row.opt.store] || STORE_LOGOS.other"
                    alt=""
                    class="compare-store-logo"
                  />
                  <span>{{ STORE_LABELS[row.opt.store] || row.opt.store }}</span>
                </div>
                <strong class="compare-title">{{ row.opt.title }}</strong>
                <div class="compare-meta muted">
                  <span>{{ row.opt.brand || '—' }}</span>
                  <span v-if="row.opt.unitPrice"> · {{ row.opt.unitPrice }}</span>
                </div>
              </div>

              <div class="compare-unit-corner">
                <div class="compare-unit-block">
                  <span class="compare-unit">{{ euro(row.opt.price) }}</span>
                  <strong v-if="getQty(row.key) > 0" class="compare-total">
                    Total {{ euro((row.opt.price || 0) * getQty(row.key)) }}
                  </strong>
                </div>
                <div class="compare-qty-row" @click.stop>
                  <button
                    class="qty-btn qty-btn--sm"
                    type="button"
                    aria-label="Menos"
                    @click="bumpQty(row.key, -1, $event)"
                  >
                    −
                  </button>
                  <span class="qty-value">{{ getQty(row.key) || 0 }}</span>
                  <button
                    class="qty-btn qty-btn--sm"
                    type="button"
                    aria-label="Más"
                    @click="bumpQty(row.key, 1, $event)"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
          </article>
          <p v-if="!sortedOptions.length" class="muted" style="padding: 1rem 0; text-align: center">
            Sin resultados
          </p>
        </div>
        <div class="results-footer" :class="{ 'results-footer--wizard': spokenActive }">
          <button
            v-if="!spokenActive"
            class="btn ghost"
            type="button"
            :disabled="picking || searching"
            @click="closeResultsModal"
          >
            Cancelar
          </button>
          <button
            v-if="spokenActive"
            class="btn ghost results-footer-btn"
            type="button"
            :disabled="picking || searching"
            @click="skipSpokenStep"
          >
            {{ canSpokenForward ? 'Continuar sin elegir' : 'Terminar sin elegir' }}
          </button>
          <button
            class="btn results-footer-btn"
            type="button"
            :disabled="picking || searching || !selectedCount"
            @click="pickSelected"
          >
            {{
              picking
                ? 'Añadiendo…'
                : spokenActive && canSpokenForward
                  ? `Añadir y seguir (${selectedCount})`
                  : spokenActive
                    ? `Añadir y terminar (${selectedCount})`
                    : `Añadir a la lista (${selectedCount})`
            }}
          </button>
        </div>
      </div>
    </div>

    <div
      v-if="detailProduct"
      class="modal-backdrop modal-backdrop--nested"
      @click.self="detailProduct = null"
    >
      <div
        class="modal-panel product-detail-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="product-detail-title"
      >
        <div class="results-header">
          <h3 id="product-detail-title">Detalle</h3>
          <button
            class="btn-x"
            type="button"
            title="Cerrar"
            aria-label="Cerrar"
            @click="detailProduct = null"
          >
            ×
          </button>
        </div>
        <div class="product-detail-body">
          <img
            v-if="detailProduct.imageUrl"
            :src="detailProduct.imageUrl"
            :alt="detailProduct.title"
            class="product-detail-img"
          />
          <div v-else class="product-detail-img product-detail-img--empty">
            <img
              :src="STORE_LOGOS[detailProduct.store] || STORE_LOGOS.other"
              :alt="STORE_LABELS[detailProduct.store] || detailProduct.store"
              class="thumb-logo"
            />
          </div>
          <strong class="product-detail-title">{{ detailProduct.title }}</strong>
          <p v-if="detailProduct.description" class="muted product-detail-desc">
            {{ detailProduct.description }}
          </p>
          <dl class="product-detail-meta">
            <div>
              <dt>Súper</dt>
              <dd>{{ STORE_LABELS[detailProduct.store] || detailProduct.store }}</dd>
            </div>
            <div>
              <dt>Marca</dt>
              <dd>{{ detailProduct.brand || '—' }}</dd>
            </div>
            <div>
              <dt>Precio</dt>
              <dd>
                {{ euro(detailProduct.price) }}
                <span
                  v-if="detailProduct.previousPrice && detailProduct.previousPrice !== detailProduct.price"
                  class="muted product-detail-prev"
                >
                  (antes {{ euro(detailProduct.previousPrice) }})
                </span>
              </dd>
            </div>
            <div v-if="detailProduct.unitPrice">
              <dt>Precio unitario</dt>
              <dd>{{ detailProduct.unitPrice }}</dd>
            </div>
            <div v-if="detailProduct.packaging">
              <dt>Envase</dt>
              <dd>{{ detailProduct.packaging }}</dd>
            </div>
            <div v-if="detailProduct.origin">
              <dt>Origen</dt>
              <dd>{{ detailProduct.origin }}</dd>
            </div>
            <div v-if="detailProduct.ean">
              <dt>EAN</dt>
              <dd>{{ detailProduct.ean }}</dd>
            </div>
            <div>
              <dt>Categoría</dt>
              <dd>{{ needs.categoryLabel(detailProduct.category) }}</dd>
            </div>
            <div>
              <dt>Origen datos</dt>
              <dd>
                {{
                  detailProduct.source === 'live'
                    ? 'Datos en vivo de la web del súper'
                    : 'Datos del producto en tu lista'
                }}
              </dd>
            </div>
          </dl>
          <div v-if="detailExtraFeatures.length" class="product-detail-features">
            <h4>Características</h4>
            <dl class="product-detail-meta">
              <div v-for="(f, i) in detailExtraFeatures" :key="`${f.label}-${i}`">
                <dt>{{ f.label }}</dt>
                <dd>{{ f.value }}</dd>
              </div>
            </dl>
          </div>
          <a
            v-if="detailProduct.storeUrl"
            class="btn product-detail-link"
            :href="detailProduct.storeUrl"
            target="_blank"
            rel="noopener noreferrer"
          >
            Abrir en {{ STORE_LABELS[detailProduct.store] || 'el súper' }}
          </a>
        </div>
      </div>
    </div>
    </Teleport>

    <Teleport to="body">
      <div
        v-if="showFlowGuide"
        class="modal-backdrop flow-guide-backdrop"
        @click.self="showFlowGuide = false"
      >
        <div
          class="modal-panel flow-guide-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="flow-guide-title"
        >
          <div class="flow-guide-header">
            <div>
              <p class="flow-guide-kicker">FridgeOrder</p>
              <h3 id="flow-guide-title">Cómo funciona</h3>
              <p class="muted flow-guide-lead">De la lista a la mesa… y otra vez a la lista según lo que consumes.</p>
            </div>
            <button
              class="btn-x flow-guide-close"
              type="button"
              title="Cerrar"
              aria-label="Cerrar"
              @click="showFlowGuide = false"
            >
              ×
            </button>
          </div>

          <ol class="flow-guide-track">
            <li class="flow-guide-step">
              <div class="flow-guide-card">
                <span class="flow-guide-num">1</span>
                <div class="flow-guide-copy">
                  <strong>Lista de compras</strong>
                  <p>Busca, añade por voz, foto o IA y marca lo que vas a comprar.</p>
                </div>
              </div>
              <div class="flow-guide-arrow" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4">
                  <path d="M12 4v14M6 14l6 6 6-6" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
              </div>
            </li>
            <li class="flow-guide-step">
              <div class="flow-guide-card">
                <span class="flow-guide-num">2</span>
                <div class="flow-guide-copy">
                  <strong>Prelista</strong>
                  <p>Revisa los elegidos y confirma antes de salir al súper.</p>
                </div>
              </div>
              <div class="flow-guide-arrow" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4">
                  <path d="M12 4v14M6 14l6 6 6-6" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
              </div>
            </li>
            <li class="flow-guide-step">
              <div class="flow-guide-card">
                <span class="flow-guide-num">3</span>
                <div class="flow-guide-copy">
                  <strong>Súper</strong>
                  <p>Compra con la lista activa y anota lo que llevas al carrito.</p>
                </div>
              </div>
              <div class="flow-guide-arrow" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4">
                  <path d="M12 4v14M6 14l6 6 6-6" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
              </div>
            </li>
            <li class="flow-guide-step">
              <div class="flow-guide-card">
                <span class="flow-guide-num">4</span>
                <div class="flow-guide-copy">
                  <strong>Despensa</strong>
                  <p>Lo comprado entra en tu inventario; al consumir, baja el stock.</p>
                </div>
              </div>
              <div class="flow-guide-arrow" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4">
                  <path d="M12 4v14M6 14l6 6 6-6" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
              </div>
            </li>
            <li class="flow-guide-step">
              <div class="flow-guide-card">
                <span class="flow-guide-num">5</span>
                <div class="flow-guide-copy">
                  <strong>Menú</strong>
                  <p>Planifica comidas y cocina con lo que hay en la despensa.</p>
                </div>
              </div>
              <div class="flow-guide-arrow" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4">
                  <path d="M12 4v14M6 14l6 6 6-6" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
              </div>
            </li>
            <li class="flow-guide-step flow-guide-step--loop">
              <div class="flow-guide-card flow-guide-card--loop">
                <span class="flow-guide-num flow-guide-num--loop" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                    <path
                      d="M4 12a8 8 0 0 1 13.5-5.8M20 4v5h-5"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    />
                    <path
                      d="M20 12a8 8 0 0 1-13.5 5.8M4 20v-5h5"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    />
                  </svg>
                </span>
                <div class="flow-guide-copy">
                  <strong>Retroalimentación</strong>
                  <p>
                    Lo que se consume (despensa o menú) vuelve a la
                    <em>Lista de compras</em>: se proponen o reponen faltantes para el próximo ciclo.
                  </p>
                </div>
              </div>
              <div class="flow-guide-loopback" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                  <path d="M12 20V6M6 12l6-6 6 6" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
                <span>vuelve a la lista</span>
              </div>
            </li>
          </ol>

          <button class="btn flow-guide-done" type="button" @click="showFlowGuide = false">
            Entendido
          </button>
        </div>
      </div>
    </Teleport>

    <div v-if="pendingRemove" class="modal-backdrop" @click.self="cancelRemove">
      <div class="modal-panel" role="dialog" aria-modal="true" aria-labelledby="remove-title">
        <h3 id="remove-title">¿Quitar de la lista?</h3>
        <p class="muted">
          Se eliminará <strong>{{ pendingRemove.name }}</strong> de tus necesidades.
        </p>
        <div class="modal-actions">
          <button class="btn ghost" type="button" :disabled="removing" @click="cancelRemove">Cancelar</button>
          <button class="btn danger" type="button" :disabled="removing" @click="confirmRemove">
            {{ removing ? 'Quitando…' : 'Sí, quitar' }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="pendingReset" class="modal-backdrop" @click.self="cancelReset">
      <div class="modal-panel" role="dialog" aria-modal="true" aria-labelledby="reset-title">
        <h3 id="reset-title">{{ resetModalTitle }}</h3>
        <p class="muted">{{ resetModalBody }}</p>
        <div class="modal-actions">
          <button class="btn ghost" type="button" :disabled="removing" @click="cancelReset">Cancelar</button>
          <button class="btn danger" type="button" :disabled="removing" @click="confirmReset">
            {{ removing ? 'Vaciando…' : 'Sí, vaciar' }}
          </button>
        </div>
      </div>
    </div>
  </main>

  <Teleport to="body">
    <aside v-if="showSelectionFloat" class="needs-float" aria-live="polite">
      <div class="needs-float-main">
        <button
          type="button"
          class="needs-float-summary"
          :aria-expanded="floatStoresOpen"
          @click="floatStoresOpen = !floatStoresOpen"
        >
          <span class="needs-float-chevron" :class="{ open: floatStoresOpen }" aria-hidden="true">›</span>
          <span>
            <span class="needs-float-label">Seleccionados</span>
            <strong class="needs-float-total">{{ euro(floatTotal) }}</strong>
            <span class="needs-float-count">
              {{ floatCount }} producto{{ floatCount === 1 ? '' : 's' }}
            </span>
          </span>
        </button>
        <div class="needs-float-actions" @click.stop>
          <button
            type="button"
            class="btn ghost needs-float-sel"
            :class="{ active: allNeedsSelected }"
            :disabled="!needItems.length"
            title="Marcar todos"
            @click.prevent="selectAllNeeds"
          >
            Todos
          </button>
          <button
            type="button"
            class="btn ghost needs-float-sel"
            :class="{ active: noneNeedsSelected }"
            :disabled="!needItems.length"
            title="Desmarcar todos"
            @click.prevent="selectNoneNeeds"
          >
            Ninguno
          </button>
          <RouterLink class="btn" to="/prelist">Ir a comprar</RouterLink>
        </div>
      </div>
      <div v-show="floatStoresOpen && floatByStore.length" class="needs-float-stores">
        <div v-for="row in floatByStore" :key="row.store" class="needs-float-store">
          <img :src="row.logo" :alt="row.label" />
          <span class="needs-float-store-count">{{ row.count }}</span>
          <span class="needs-float-store-name">{{ row.label }}</span>
          <span class="needs-float-store-eur">{{ euro(row.total) }}</span>
        </div>
      </div>
    </aside>
  </Teleport>
</template>

<style scoped>
.wizard-header {
  align-items: flex-start;
}
.wizard-header-main {
  min-width: 0;
  flex: 1;
}
.wizard-nav {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin-bottom: 0.45rem;
}
.wizard-loading {
  flex: 1 1 auto;
  min-height: 12rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.85rem;
  padding: 2rem 0.5rem;
  text-align: center;
}
.search-spinner {
  position: relative;
  width: 7.5rem;
  height: 7.5rem;
  display: grid;
  place-items: center;
}
.search-spinner-orbit {
  position: absolute;
  inset: 0;
  animation: search-orbit 2.8s linear infinite;
}
.search-spinner-slot {
  position: absolute;
  width: 1.85rem;
  height: 1.85rem;
  display: grid;
  place-items: center;
  animation: search-orbit-rev 2.8s linear infinite;
}
.search-spinner-slot img {
  width: 100%;
  height: 100%;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.35);
  background: rgba(255, 255, 255, 0.08);
}
.search-spinner-slot:nth-child(1) { top: 0; left: 50%; margin-left: -0.925rem; }
.search-spinner-slot:nth-child(2) { top: 18%; right: 2%; }
.search-spinner-slot:nth-child(3) { bottom: 6%; right: 12%; }
.search-spinner-slot:nth-child(4) { bottom: 6%; left: 12%; }
.search-spinner-slot:nth-child(5) { top: 18%; left: 2%; }
.search-spinner-cart {
  position: relative;
  z-index: 1;
  width: 2.4rem;
  height: 2.4rem;
  color: var(--accent);
  animation: search-bounce 0.9s ease-in-out infinite;
  filter: drop-shadow(0 6px 10px rgba(56, 189, 248, 0.35));
}
.search-spinner-cart svg {
  width: 100%;
  height: 100%;
}
.search-spinner-dots {
  display: inline-flex;
  gap: 0.4rem;
}
.search-spinner-dots span {
  width: 0.55rem;
  height: 0.55rem;
  border-radius: 999px;
  background: var(--accent);
  animation: search-dot 1.1s ease-in-out infinite;
}
.search-spinner-dots span:nth-child(2) { animation-delay: 0.15s; }
.search-spinner-dots span:nth-child(3) { animation-delay: 0.3s; }
@keyframes search-orbit {
  to { transform: rotate(360deg); }
}
@keyframes search-orbit-rev {
  to { transform: rotate(-360deg); }
}
@keyframes search-bounce {
  0%, 100% { transform: translateY(0) scale(1); }
  50% { transform: translateY(-8px) scale(1.08); }
}
@keyframes search-dot {
  0%, 80%, 100% { transform: translateY(0); opacity: 0.35; }
  40% { transform: translateY(-6px); opacity: 1; }
}
.spoken-icon-btn {
  width: 2.35rem;
  height: 2.35rem;
  border-radius: 11px;
  border: 1px solid var(--border);
  background: rgba(0, 0, 0, 0.22);
  color: var(--text);
  display: grid;
  place-items: center;
  padding: 0;
  cursor: pointer;
  flex-shrink: 0;
}
.spoken-icon-btn svg {
  width: 1.15rem;
  height: 1.15rem;
}
.spoken-icon-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
.spoken-icon-btn.danger {
  color: var(--danger);
}
.needs-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 0.35rem;
  margin-top: 0.85rem;
}
.need-search {
  position: relative;
  display: flex;
  align-items: center;
}
.need-search input {
  width: 100%;
  padding-right: 2.85rem;
}
.need-search-go {
  position: absolute;
  right: 0.35rem;
  top: 50%;
  transform: translateY(-50%);
  width: 2.15rem;
  height: 2.15rem;
  border: 0;
  border-radius: 11px;
  background: var(--accent-soft);
  color: var(--accent);
  display: grid;
  place-items: center;
  cursor: pointer;
  padding: 0;
}
.need-search-go svg {
  width: 1.15rem;
  height: 1.15rem;
}
.need-search-go:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
.need-search-go:not(:disabled):hover {
  background: rgba(2, 132, 199, 0.28);
  color: var(--accent-strong);
}
.icon-action {
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.35rem;
  padding: 0.55rem 0.25rem 0.4rem;
  border-radius: 14px;
  border: 1px solid var(--border);
  background: var(--accent-soft);
  color: var(--text);
  cursor: pointer;
}
.icon-action:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.icon-action.active {
  background: rgba(255, 138, 128, 0.18);
  border-color: rgba(255, 138, 128, 0.45);
  color: var(--danger);
}
.icon-action.ghost {
  background: transparent;
}
.icon-action-glyph {
  width: 2.4rem;
  height: 2.4rem;
  display: grid;
  place-items: center;
  border-radius: 12px;
  background: rgba(0, 0, 0, 0.18);
}
.icon-action-glyph svg {
  width: 1.35rem;
  height: 1.35rem;
}
.icon-action-label {
  font-size: 0.62rem;
  line-height: 1.15;
  color: var(--text-muted);
  text-align: center;
  max-width: 100%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.icon-action-spin {
  font-size: 1.1rem;
  line-height: 1;
  animation: fadeUp 0.8s ease infinite alternate;
}
.needs-actions-hint {
  margin-top: 0.55rem;
  font-size: 0.8rem;
}
.needs-float {
  position: fixed;
  left: 50%;
  transform: translateX(-50%);
  bottom: calc(4.75rem + env(safe-area-inset-bottom, 0px));
  z-index: 80;
  width: min(560px, calc(100% - 1.25rem));
  background: rgba(17, 24, 39, 0.97);
  border: 2.5px solid rgba(56, 189, 248, 0.55);
  border-radius: 16px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.45);
  padding: 0.75rem 0.9rem;
  backdrop-filter: blur(12px);
  pointer-events: auto;
}
@media (min-width: 800px) {
  .needs-float {
    bottom: 1.25rem;
  }
}
.needs-float-main {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
}
.needs-float-actions {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  flex-shrink: 0;
  position: relative;
  z-index: 2;
}
.needs-float-sel {
  padding: 0.45rem 0.65rem;
  font-size: 0.75rem;
  border-radius: 999px;
  min-height: 2.15rem;
}
.needs-float-sel.active {
  border-color: var(--accent);
  color: var(--accent);
  background: var(--accent-soft);
}
.needs-float-summary {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  background: transparent;
  border: 0;
  color: inherit;
  padding: 0;
  text-align: left;
  cursor: pointer;
  min-width: 0;
  flex: 1;
  overflow: hidden;
  position: relative;
  z-index: 0;
}
.needs-float-chevron {
  display: inline-block;
  font-size: 1.25rem;
  line-height: 1;
  color: var(--text-muted);
  transition: transform 0.15s ease;
  flex-shrink: 0;
}
.needs-float-chevron.open {
  transform: rotate(90deg);
}
.needs-float-label {
  display: block;
  font-size: 0.72rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.needs-float-total {
  display: block;
  font-size: 1.25rem;
  line-height: 1.15;
  margin-top: 0.05rem;
  color: var(--accent);
}
.needs-float-count {
  display: block;
  font-size: 0.8rem;
  color: var(--text-muted);
  margin-top: 0.1rem;
}
.needs-float-stores {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
  margin-top: 0.65rem;
  padding-top: 0.55rem;
  border-top: 1px solid var(--border);
}
.needs-float-store {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.28rem 0.5rem;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.35);
  border: 1px solid var(--border);
  font-size: 0.78rem;
}
.needs-float-store img {
  width: 18px;
  height: 18px;
  border-radius: 5px;
}
.needs-float-store-count {
  font-weight: 700;
  color: var(--accent);
}
.needs-float-store-name {
  color: var(--text-muted);
}
.needs-float-store-eur {
  color: var(--text);
  font-weight: 600;
  margin-left: 0.1rem;
}
.has-selection-float {
  padding-bottom: 11rem !important;
}
.category-header {
  display: flex;
  align-items: center;
  gap: 0.35rem;
}
.category-toggle {
  flex: 1;
  min-width: 0;
  width: auto;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
  background: transparent;
  border: 0;
  color: inherit;
  padding: 0.15rem 0;
  cursor: pointer;
  text-align: left;
}
.category-reset {
  width: 2rem;
  height: 2rem;
  flex-shrink: 0;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: rgba(0, 0, 0, 0.22);
  color: var(--danger);
  display: grid;
  place-items: center;
  padding: 0;
  cursor: pointer;
}
.category-reset svg {
  width: 1rem;
  height: 1rem;
}
.category-reset:hover:not(:disabled) {
  background: rgba(251, 113, 133, 0.15);
  border-color: rgba(251, 113, 133, 0.45);
}
.category-reset:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.list-reset-bar {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 0.65rem;
}
.list-reset-all {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.45rem 0.85rem;
  font-size: 0.85rem;
}
.list-reset-all svg {
  width: 1rem;
  height: 1rem;
}
.needs-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.65rem;
  min-height: 12rem;
  padding: 2rem 1rem;
  text-align: center;
}
.needs-empty-icon {
  width: 3.5rem;
  height: 3.5rem;
  display: grid;
  place-items: center;
  color: var(--text-muted);
  opacity: 0.7;
}
.needs-empty-icon svg {
  width: 3rem;
  height: 3rem;
}
.needs-empty-text {
  margin: 0;
  font-size: 0.9rem;
  font-weight: 500;
  color: var(--text-muted);
}
.settings-gear {
  width: 2.5rem;
  height: 2.5rem;
  padding: 0;
  display: grid;
  place-items: center;
  border-radius: 12px;
}
.settings-gear svg {
  width: 1.25rem;
  height: 1.25rem;
}
.header-tools {
  display: flex;
  gap: 0.4rem;
  flex-wrap: wrap;
  align-items: center;
}
.panel > .page-header {
  margin-bottom: 0.75rem;
}
.flow-guide-backdrop {
  z-index: 140;
  padding: 1rem;
  align-items: center;
}
.flow-guide-modal {
  width: min(440px, 100%);
  max-height: min(88dvh, 720px);
  overflow: auto;
  padding: 1.25rem 1.2rem 1.1rem;
  border: 1px solid rgba(56, 189, 248, 0.28);
  background:
    radial-gradient(520px 220px at 100% 0%, rgba(56, 189, 248, 0.14), transparent 55%),
    radial-gradient(420px 180px at 0% 100%, rgba(14, 165, 233, 0.1), transparent 50%),
    var(--surface-solid);
  animation: flow-guide-in 0.28s ease-out;
}
@keyframes flow-guide-in {
  from {
    opacity: 0;
    transform: translateY(12px) scale(0.98);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
.flow-guide-header {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  align-items: start;
  margin-bottom: 1.15rem;
}
.flow-guide-kicker {
  margin: 0 0 0.2rem;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--accent);
}
.flow-guide-header h3 {
  margin: 0;
  font-size: 1.35rem;
  font-weight: 750;
  letter-spacing: -0.02em;
}
.flow-guide-lead {
  margin: 0.35rem 0 0;
  font-size: 0.88rem;
  line-height: 1.35;
}
.flow-guide-close {
  width: 2.5rem;
  height: 2.5rem;
  color: #fff;
  font-size: 1.7rem;
  font-weight: 800;
  border-color: rgba(255, 255, 255, 0.35);
  flex-shrink: 0;
}
.flow-guide-track {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}
.flow-guide-step {
  display: flex;
  flex-direction: column;
  align-items: stretch;
}
.flow-guide-card {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.85rem;
  align-items: start;
  padding: 0.9rem 0.95rem;
  border-radius: 16px;
  border: 1px solid var(--border);
  background: rgba(0, 0, 0, 0.22);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
}
.flow-guide-num {
  width: 2.1rem;
  height: 2.1rem;
  border-radius: 12px;
  display: grid;
  place-items: center;
  font-size: 0.95rem;
  font-weight: 800;
  color: #0b1220;
  background: linear-gradient(145deg, #7dd3fc, var(--accent-strong));
  box-shadow: 0 6px 16px rgba(14, 165, 233, 0.35);
}
.flow-guide-copy strong {
  display: block;
  font-size: 1.02rem;
  font-weight: 700;
  margin-bottom: 0.25rem;
  letter-spacing: -0.01em;
}
.flow-guide-copy p {
  margin: 0;
  font-size: 0.84rem;
  line-height: 1.4;
  color: var(--text-muted);
}
.flow-guide-arrow {
  display: flex;
  justify-content: center;
  padding: 0.2rem 0 0.25rem;
  color: var(--accent);
}
.flow-guide-arrow svg {
  width: 1.35rem;
  height: 1.35rem;
  animation: flow-guide-pulse 1.25s ease-in-out infinite;
}
@keyframes flow-guide-pulse {
  0%,
  100% {
    transform: translateY(0);
    opacity: 0.55;
  }
  50% {
    transform: translateY(4px);
    opacity: 1;
  }
}
.flow-guide-step--last .flow-guide-card {
  border-color: rgba(56, 189, 248, 0.35);
  background: var(--accent-soft);
}
.flow-guide-card--loop {
  border-color: rgba(52, 211, 153, 0.4);
  background: rgba(52, 211, 153, 0.12);
}
.flow-guide-num--loop {
  background: linear-gradient(145deg, #6ee7b7, #34d399);
  box-shadow: 0 6px 16px rgba(52, 211, 153, 0.3);
  color: #0b1220;
}
.flow-guide-num--loop svg {
  width: 1.15rem;
  height: 1.15rem;
}
.flow-guide-copy em {
  font-style: normal;
  font-weight: 650;
  color: var(--accent);
}
.flow-guide-loopback {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  margin-top: 0.55rem;
  color: var(--ok);
  font-size: 0.78rem;
  font-weight: 650;
}
.flow-guide-loopback svg {
  width: 1.15rem;
  height: 1.15rem;
  animation: flow-guide-pulse 1.25s ease-in-out infinite;
}
.flow-guide-done {
  width: 100%;
  margin-top: 1.15rem;
  text-align: center;
}
.category-toggle-left {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
}
.category-toggle-meta {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  flex-shrink: 0;
}
.category-total {
  color: var(--text);
  background: rgba(255, 255, 255, 0.08);
}
.category-chevron {
  display: inline-block;
  font-size: 1.25rem;
  line-height: 1;
  transition: transform 0.15s ease;
  color: var(--text-muted);
}
.category-chevron.open {
  transform: rotate(90deg);
}
.category-body {
  margin-top: 0.35rem;
}
.sr-only-file {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  overflow: hidden;
  pointer-events: none;
}
.suggest-list {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}
.suggest-row {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  width: 100%;
  margin: 0;
  padding: 0.55rem 0.65rem;
  box-sizing: border-box;
  cursor: pointer;
}
.suggest-row strong {
  flex: 1;
  min-width: 0;
  font-weight: 600;
  line-height: 1.35;
}
.suggest-row.accepted {
  background: var(--accent-soft);
  border-radius: 10px;
}
.suggest-row.rejected {
  opacity: 0.55;
}
.suggest-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: nowrap;
  gap: 0.45rem;
}
.suggest-icon-btn {
  width: 2.55rem;
  height: 2.55rem;
  border-radius: 12px;
  border: 1px solid var(--border);
  background: rgba(0, 0, 0, 0.22);
  color: var(--text);
  display: grid;
  place-items: center;
  padding: 0;
  cursor: pointer;
  position: relative;
}
.suggest-icon-btn svg {
  width: 1.2rem;
  height: 1.2rem;
}
.suggest-icon-btn.primary {
  background: var(--accent);
  border-color: var(--accent);
  color: #0b1220;
  margin-left: auto;
  width: auto;
  min-width: 2.55rem;
  padding: 0 0.85rem;
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  border-radius: 999px;
  font-size: 0.85rem;
  font-weight: 600;
  white-space: nowrap;
}
.suggest-icon-btn.primary:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.suggest-confirm span {
  line-height: 1;
}
.option-row {
  display: grid;
  grid-template-columns: 56px 1fr auto;
  gap: 0.75rem;
  align-items: center;
  padding: 0.85rem 0;
  border-bottom: 1px solid var(--border);
}
.option-row.selectable {
  grid-template-columns: 56px 1fr auto;
  cursor: pointer;
  margin: 0;
  padding: 0.65rem 0.55rem;
  border-radius: 12px;
  border: 1px solid transparent;
  transition: background 0.15s ease, border-color 0.15s ease;
}
.option-row.selectable.selected {
  background: var(--accent-soft);
  border-color: rgba(2, 132, 199, 0.45);
  box-shadow: inset 0 0 0 1px rgba(2, 132, 199, 0.2);
}
.qty-controls {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  margin-top: 0.55rem;
}
.qty-btn {
  width: 2.6rem;
  height: 2.6rem;
  border-radius: 14px;
  border: 1px solid var(--border);
  background: var(--accent-soft);
  color: var(--text);
  font-size: 1.6rem;
  font-weight: 700;
  line-height: 1;
  cursor: pointer;
  display: grid;
  place-items: center;
  padding: 0;
}
.qty-btn:hover {
  background: rgba(2, 132, 199, 0.22);
  border-color: var(--accent);
}
.qty-btn--info {
  font-size: 1rem;
  color: var(--accent);
}
.qty-btn--info svg {
  width: 1.15rem;
  height: 1.15rem;
}
.qty-value {
  min-width: 1.75rem;
  text-align: center;
  font-size: 1.35rem;
  font-weight: 700;
  color: var(--accent);
}
.qty-prices {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  margin-left: 0.35rem;
  font-size: 0.85rem;
  color: var(--text-muted);
  line-height: 1.25;
}
.qty-prices strong {
  color: var(--accent);
  font-size: 1rem;
}
.need-row {
  grid-template-columns: auto 56px 1fr auto;
}
.option-row:last-child {
  border-bottom: 0;
}
.need-photo {
  position: relative;
  width: 56px;
  height: 56px;
  flex-shrink: 0;
}
.need-photo .thumb {
  width: 56px;
  height: 56px;
}
.need-check-wrap {
  display: grid;
  place-items: center;
  width: 2rem;
  height: 2rem;
  margin: 0;
  cursor: pointer;
}
.need-check {
  width: 1.15rem;
  height: 1.15rem;
  accent-color: var(--accent);
  cursor: pointer;
}
.thumb {
  width: 56px;
  height: 56px;
  object-fit: cover;
  border-radius: 12px;
  background: rgba(0, 0, 0, 0.2);
}
.thumb.placeholder {
  display: grid;
  place-items: center;
  color: var(--accent);
  font-weight: 700;
  font-size: 1.2rem;
}
.option-body {
  min-width: 0;
}
.option-actions {
  text-align: right;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  align-items: flex-end;
}
.price {
  font-weight: 700;
  font-size: 1.1rem;
  color: var(--accent);
  white-space: nowrap;
}
.store-link {
  display: inline-block;
  margin-top: 0.25rem;
  font-size: 0.8rem;
}
.btn-x {
  width: 2rem;
  height: 2rem;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: transparent;
  color: var(--text-muted);
  font-size: 1.35rem;
  line-height: 1;
  cursor: pointer;
  display: grid;
  place-items: center;
  padding: 0;
}
.btn-x:hover {
  color: var(--danger);
  border-color: var(--danger);
}
.modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 40;
  background: rgba(0, 0, 0, 0.55);
  display: grid;
  place-items: center;
  padding: 1rem;
  overflow: auto;
}
.modal-backdrop--top {
  place-items: start center;
  align-content: start;
  padding: 0.5rem 1rem 5.75rem;
  padding-bottom: calc(5.75rem + env(safe-area-inset-bottom, 0px));
}
.modal-backdrop--sheet {
  z-index: 120;
  display: flex;
  flex-direction: column;
  place-items: stretch;
  align-content: stretch;
  justify-content: stretch;
  padding: 0;
  overflow: hidden;
  inset: 0;
  height: 100dvh;
  height: 100vh;
}
.modal-backdrop--nested {
  z-index: 130;
  place-items: center;
}
.product-detail-modal {
  width: min(420px, 100%);
  max-height: min(80vh, 80dvh);
  overflow: auto;
}
.product-detail-body {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding-bottom: 0.25rem;
}
.product-detail-img {
  width: 100%;
  max-height: min(52vh, 420px);
  min-height: 220px;
  object-fit: contain;
  border-radius: 14px;
  background: rgba(0, 0, 0, 0.25);
}
.product-detail-img--empty {
  display: grid;
  place-items: center;
  min-height: 220px;
}
.product-detail-title {
  font-size: 1.05rem;
  line-height: 1.35;
}
.product-detail-desc {
  margin: 0;
  font-size: 0.9rem;
  line-height: 1.4;
}
.product-detail-prev {
  font-size: 0.85rem;
  margin-left: 0.35rem;
  text-decoration: line-through;
}
.product-detail-features {
  margin-top: 0.25rem;
  padding-top: 0.65rem;
  border-top: 1px solid var(--border);
}
.product-detail-features h4 {
  margin: 0 0 0.55rem;
  font-size: 0.95rem;
}
.product-detail-meta {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}
.product-detail-meta > div {
  display: grid;
  grid-template-columns: 7.5rem 1fr;
  gap: 0.5rem;
  align-items: baseline;
  font-size: 0.9rem;
}
.product-detail-meta dt {
  margin: 0;
  color: var(--text-muted);
  font-weight: 500;
}
.product-detail-meta dd {
  margin: 0;
  word-break: break-word;
}
.product-detail-link {
  text-align: center;
  text-decoration: none;
  margin-top: 0.25rem;
}
.modal-panel {
  width: min(420px, 100%);
  background: var(--surface-solid);
  border: 1px solid var(--border);
  border-radius: 18px;
  padding: 1.25rem;
  box-shadow: var(--shadow);
}
.results-modal {
  width: min(560px, 100%);
  max-height: min(58vh, calc(100vh - 10.5rem));
  max-height: min(58dvh, calc(100dvh - 10.5rem));
  display: flex;
  flex-direction: column;
  padding: 0.85rem 0.85rem 0.65rem;
  margin: 0 auto;
  align-self: start;
}
.results-modal--compare {
  width: 100%;
  max-width: none;
  flex: 1 1 auto;
  height: 100%;
  max-height: 100%;
  min-height: 0;
  margin: 0;
  align-self: stretch;
  border-radius: 0;
  border: 0;
  padding: calc(0.75rem + env(safe-area-inset-top, 0px)) 0.85rem 0;
  box-shadow: none;
  display: flex;
  flex-direction: column;
}
.results-modal--compare .btn-x {
  width: 2.75rem;
  height: 2.75rem;
  border-color: rgba(255, 255, 255, 0.35);
  color: #fff;
  font-size: 1.85rem;
  font-weight: 800;
  line-height: 1;
}
.results-modal--compare .btn-x:hover {
  color: #fff;
  border-color: #fff;
  background: rgba(255, 255, 255, 0.1);
}
.results-modal--compare .results-list {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  padding-bottom: 0.5rem;
}
.results-modal--compare .results-footer {
  position: sticky;
  bottom: 0;
  flex-shrink: 0;
  margin: 0;
  padding: 0.75rem 0.15rem calc(0.75rem + env(safe-area-inset-bottom, 0px));
  border-top: 1px solid var(--border);
  background: var(--surface-solid);
  box-shadow: 0 -10px 28px rgba(0, 0, 0, 0.35);
  z-index: 6;
}
.results-query-banner {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.35rem 0.75rem;
  width: 100%;
  box-sizing: border-box;
  margin: 0 0 0.55rem;
  padding: 0.55rem 0.7rem;
  border-radius: 12px;
  border: 1px solid rgba(2, 132, 199, 0.4);
  background: var(--accent-soft);
  flex-shrink: 0;
}
.results-query-name {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 1.05rem;
  font-weight: 700;
  line-height: 1.25;
  color: var(--text);
  word-break: break-word;
}
.results-query-count {
  flex: 0 0 auto;
  margin-left: auto;
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--text-muted);
  text-align: right;
  white-space: nowrap;
}
.results-sort {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.35rem;
  margin: 0 0 0.55rem;
  flex-shrink: 0;
}
.results-sort-label {
  font-size: 0.78rem;
  color: var(--text-muted);
  margin-right: 0.15rem;
}
.results-sort-btn {
  border: 1px solid var(--border);
  background: rgba(0, 0, 0, 0.18);
  color: var(--text-muted);
  border-radius: 999px;
  padding: 0.28rem 0.7rem;
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
}
.results-sort-btn.active {
  background: var(--accent-soft);
  border-color: rgba(2, 132, 199, 0.45);
  color: var(--accent);
}
.results-compare-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 0.45rem;
  align-content: start;
  width: 100%;
}
.results-query-banner,
.results-sort,
.compare-card {
  width: 100%;
  box-sizing: border-box;
}
.compare-card {
  display: block;
  padding: 0.45rem 0.5rem;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: rgba(0, 0, 0, 0.14);
  cursor: pointer;
  min-width: 0;
  transition: background 0.15s ease, border-color 0.15s ease;
}
.compare-card.selected {
  background: var(--accent-soft);
  border-color: rgba(2, 132, 199, 0.45);
}
.compare-card-row {
  display: grid;
  grid-template-columns: 64px minmax(0, 1fr) auto;
  grid-template-areas: 'photo body price';
  gap: 0.35rem 0.5rem;
  align-items: stretch;
  min-width: 0;
}
.compare-photo {
  grid-area: photo;
  position: relative;
  width: 64px;
  height: 64px;
  flex-shrink: 0;
  align-self: center;
}
.compare-thumb {
  width: 64px;
  height: 64px;
  object-fit: cover;
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.2);
  display: block;
}
.compare-thumb--empty {
  display: grid;
  place-items: center;
}
.compare-photo-info {
  position: absolute;
  right: 3px;
  bottom: 3px;
  width: 1.35rem;
  height: 1.35rem;
  border: 0;
  border-radius: 999px;
  padding: 0;
  display: grid;
  place-items: center;
  background: rgba(0, 0, 0, 0.72);
  color: #fff;
  cursor: pointer;
}
.compare-photo-info svg {
  width: 0.85rem;
  height: 0.85rem;
}
.compare-card-body {
  grid-area: body;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 0.12rem;
  padding-right: 0.25rem;
}
.compare-store-line {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.2rem 0.3rem;
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--text-muted);
  line-height: 1.2;
}
.compare-store-logo {
  width: 14px;
  height: 14px;
  border-radius: 3px;
}
.compare-unit-corner {
  grid-area: price;
  align-self: stretch;
  justify-self: end;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  justify-content: space-between;
  gap: 0.25rem;
  text-align: right;
  min-height: 64px;
}
.compare-unit-block {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.1rem;
  white-space: nowrap;
}
.compare-unit {
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--accent);
  line-height: 1.15;
}
.compare-total {
  font-size: 0.75rem;
  font-weight: 650;
  color: var(--text);
}
.compare-title {
  display: block;
  width: 100%;
  font-size: 0.88rem;
  line-height: 1.25;
  font-weight: 650;
  word-break: break-word;
}
.compare-meta {
  font-size: 0.75rem;
  line-height: 1.2;
  min-width: 0;
}
.compare-qty-row {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.35rem;
  margin: 0;
  width: 100%;
}
.compare-qty-row .qty-value {
  min-width: 1.1rem;
  text-align: center;
  font-size: 0.95rem;
}
.qty-btn--sm {
  width: 2.15rem;
  height: 2.15rem;
  border-radius: 11px;
  font-size: 1.25rem;
}
.results-list {
  overflow: auto;
  flex: 1 1 auto;
  min-height: 0;
  max-height: none;
  padding-bottom: 0.35rem;
  -webkit-overflow-scrolling: touch;
}
.results-header {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  align-items: start;
  margin-bottom: 0.5rem;
  flex-shrink: 0;
}
.results-footer {
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 0.5rem;
  padding: 0.65rem 0 0.15rem;
  border-top: 1px solid var(--border);
  margin-top: 0.25rem;
  flex-shrink: 0;
  background: var(--surface-solid);
  position: relative;
  z-index: 2;
}
.results-footer--wizard {
  flex-wrap: nowrap;
  justify-content: stretch;
  gap: 0.4rem;
}
.results-footer--wizard .results-footer-btn {
  flex: 1 1 0;
  min-width: 0;
  padding: 0.55rem 0.45rem;
  font-size: 0.72rem;
  line-height: 1.2;
  text-align: center;
  white-space: normal;
}
.store-group {
  margin-bottom: 0.85rem;
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 0.55rem 0.65rem 0.15rem;
  background: rgba(0, 0, 0, 0.12);
}
.store-group-header {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  padding: 0.25rem 0 0.45rem;
  border-bottom: 1px solid var(--border);
  margin-bottom: 0.15rem;
}
.store-logo {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  flex-shrink: 0;
}
.thumb-logo {
  width: 28px;
  height: 28px;
  border-radius: 8px;
}
.modal-panel h3 {
  margin: 0 0 0.5rem;
}
.results-modal h3 {
  margin: 0;
}
.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 1rem;
}
</style>
