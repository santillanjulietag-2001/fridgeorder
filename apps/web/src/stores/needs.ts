import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { api } from '@/api/client';
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  type Category,
  type Store,
} from '@fridgeorder/shared';

export interface NeedItem {
  _id: string;
  name: string;
  category: Category;
  quantity: number;
  unit: string;
  notes: string;
  preferredStore: Store;
  estimatedPrice?: number;
  priceSource: string;
  status: string;
  source: string;
  brand?: string;
  unitPrice?: string;
  imageUrl?: string;
  storeUrl?: string;
}

export const useNeedsStore = defineStore('needs', () => {
  const items = ref<NeedItem[]>([]);
  const selectedIds = ref<string[]>([]);
  const loading = ref(false);

  function idOf(item: { _id: string } | string) {
    return String(typeof item === 'string' ? item : item._id);
  }

  const grouped = computed(() => {
    const map = Object.fromEntries(CATEGORY_ORDER.map((c) => [c, [] as NeedItem[]])) as Record<
      Category,
      NeedItem[]
    >;
    for (const item of items.value) {
      (map[item.category] || map.otros).push(item);
    }
    return map;
  });

  const selectedIdSet = computed(() => new Set(selectedIds.value.map(String)));

  const selectedItems = computed(() =>
    items.value.filter((i) => selectedIdSet.value.has(idOf(i)))
  );

  const selectedTotal = computed(() =>
    selectedItems.value.reduce((s, i) => s + (i.estimatedPrice || 0) * (i.quantity || 1), 0)
  );

  function syncItemStatus(ids: string[], selected: boolean) {
    const want = selected ? 'selected' : 'needed';
    const idSet = new Set(ids.map(String));
    items.value = items.value.map((item) =>
      idSet.has(idOf(item)) ? { ...item, status: want } : item
    );
  }

  function applyLocalSelection(ids: string[], selected: boolean) {
    const idSet = new Set(ids.map(String));
    if (selected) {
      const next = new Set(selectedIds.value.map(String));
      for (const id of idSet) next.add(id);
      selectedIds.value = [...next];
    } else {
      selectedIds.value = selectedIds.value.map(String).filter((id) => !idSet.has(id));
    }
    syncItemStatus([...idSet], selected);
  }

  async function persistSelection(ids: string[], selected: boolean) {
    if (!ids.length) return;
    await api('/needs/selection', {
      method: 'POST',
      body: JSON.stringify({ ids, selected }),
    });
  }

  async function fetchNeeds() {
    loading.value = true;
    try {
      const data = await api<{ items: NeedItem[] }>('/needs');
      items.value = data.items.map((i) => ({ ...i, _id: String(i._id) }));
      selectedIds.value = items.value
        .filter((i) => i.status === 'selected')
        .map((i) => idOf(i));
    } finally {
      loading.value = false;
    }
  }

  async function addNeed(payload: {
    name: string;
    quantity?: number;
    notes?: string;
    preferredStore?: Store;
    source?: string;
    estimatedPrice?: number;
    category?: Category;
    priceSource?: string;
  }) {
    const data = await api<{ item: NeedItem }>('/needs', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    const item = { ...data.item, _id: String(data.item._id) };
    items.value.unshift(item);
    applyLocalSelection([idOf(item)], true);
    return item;
  }

  async function searchProducts(query: string) {
    return api<{
      query: string;
      liveCount: number;
      options: {
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
      }[];
    }>('/needs/search-products', {
      method: 'POST',
      body: JSON.stringify({ query }),
    });
  }

  async function parseSpokenList(transcript: string) {
    return api<{ items: string[]; transcript: string; source?: 'ai' | 'heuristic' }>(
      '/needs/parse-spoken-list',
      {
        method: 'POST',
        body: JSON.stringify({ transcript }),
      }
    );
  }

  async function suggestBasicNeeds(count?: number) {
    return api<{
      items: string[];
      source?: 'ai' | 'heuristic';
      basedOn?: { goals: string[]; dietStyle: string };
    }>('/needs/suggest-basic', {
      method: 'POST',
      body: JSON.stringify(count ? { count } : {}),
    });
  }

  async function suggestFromContext(context: string, count?: number) {
    return api<{ items: string[]; source?: 'ai' | 'heuristic'; context: string }>(
      '/needs/suggest-context',
      {
        method: 'POST',
        body: JSON.stringify(count ? { context, count } : { context }),
      }
    );
  }

  async function identifyProduct(imageDataUrl: string) {
    return api<{
      items: string[];
      source?: 'ai' | 'heuristic';
    }>('/needs/identify-product', {
      method: 'POST',
      body: JSON.stringify({ imageDataUrl }),
    });
  }

  async function pickProduct(option: {
    store: Store;
    title: string;
    brand?: string;
    price?: number;
    unitPrice?: string;
    imageUrl?: string;
    storeUrl?: string;
    category?: Category;
    quantity?: number;
    sourceHint?: 'live' | 'ai';
  }) {
    const data = await api<{ item: NeedItem }>('/needs/pick-product', {
      method: 'POST',
      body: JSON.stringify(option),
    });
    const item = { ...data.item, _id: String(data.item._id) };
    items.value.unshift(item);
    applyLocalSelection([idOf(item)], true);
    return item;
  }

  async function removeNeed(id: string) {
    const sid = idOf(id);
    await api(`/needs/${sid}`, { method: 'DELETE' });
    items.value = items.value.filter((i) => idOf(i) !== sid);
    selectedIds.value = selectedIds.value.filter((x) => idOf(x) !== sid);
  }

  async function estimatePrices() {
    const prevSelected = new Set(selectedIds.value.map(String));
    const data = await api<{ items: NeedItem[] }>('/needs/estimate-prices', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    items.value = data.items.map((i) => ({ ...i, _id: String(i._id) }));
    // Mantener selección local si el item sigue existiendo; si no, usar status del server
    const stillHere = items.value.map((i) => idOf(i));
    const fromPrev = stillHere.filter((id) => prevSelected.has(id));
    const fromStatus = items.value.filter((i) => i.status === 'selected').map((i) => idOf(i));
    selectedIds.value = [...new Set([...fromPrev, ...fromStatus])];
  }

  async function setSelected(id: string, selected: boolean) {
    const sid = idOf(id);
    const currently = selectedIdSet.value.has(sid);
    if (currently === selected) return;

    applyLocalSelection([sid], selected);
    try {
      await persistSelection([sid], selected);
    } catch (err) {
      applyLocalSelection([sid], !selected);
      throw err;
    }
  }

  async function toggleSelect(id: string) {
    const sid = idOf(id);
    await setSelected(sid, !selectedIdSet.value.has(sid));
  }

  async function selectAll() {
    const ids = items.value.map((i) => idOf(i));
    const prev = [...selectedIds.value.map(String)];
    applyLocalSelection(ids, true);
    try {
      if (ids.length) await persistSelection(ids, true);
    } catch (err) {
      selectedIds.value = prev;
      items.value = items.value.map((item) => ({
        ...item,
        status: prev.includes(idOf(item)) ? 'selected' : 'needed',
      }));
      throw err;
    }
  }

  async function selectNone() {
    const ids = items.value.map((i) => idOf(i));
    const prev = [...selectedIds.value.map(String)];
    applyLocalSelection(ids, false);
    try {
      if (ids.length) await persistSelection(ids, false);
    } catch (err) {
      selectedIds.value = prev;
      items.value = items.value.map((item) => ({
        ...item,
        status: prev.includes(idOf(item)) ? 'selected' : 'needed',
      }));
      throw err;
    }
  }

  function isSelected(id: string) {
    return selectedIdSet.value.has(idOf(id));
  }

  function categoryLabel(c: Category) {
    return CATEGORY_LABELS[c];
  }

  return {
    items,
    selectedIds,
    selectedIdSet,
    loading,
    grouped,
    selectedItems,
    selectedTotal,
    fetchNeeds,
    addNeed,
    searchProducts,
    parseSpokenList,
    suggestBasicNeeds,
    suggestFromContext,
    identifyProduct,
    pickProduct,
    removeNeed,
    estimatePrices,
    setSelected,
    toggleSelect,
    selectAll,
    selectNone,
    isSelected,
    categoryLabel,
  };
});
