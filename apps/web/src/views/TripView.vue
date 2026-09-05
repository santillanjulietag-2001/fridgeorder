<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { CATEGORY_ORDER, CATEGORY_LABELS, type Category } from '@fridgeorder/shared';
import { api } from '@/api/client';
import { useSpeech } from '@/composables/useSpeech';

interface TripItem {
  _id: string;
  needId: string;
  name: string;
  category: Category;
  plannedQty: number;
  plannedPrice?: number;
  actualQty?: number;
  actualPrice?: number;
  purchased: boolean;
  unit: string;
}

interface Trip {
  _id: string;
  status: string;
  plannedTotal: number;
  actualTotal: number;
  items: TripItem[];
}

const route = useRoute();
const router = useRouter();
const speech = useSpeech();
const trip = ref<Trip | null>(null);
const error = ref('');
const voiceText = ref('');
const marking = ref(false);
const completing = ref(false);
const showSuccess = ref(false);
const editingPriceId = ref('');
const priceDraft = ref('');

const grouped = computed(() => {
  const map = Object.fromEntries(CATEGORY_ORDER.map((c) => [c, [] as TripItem[]])) as Record<
    Category,
    TripItem[]
  >;
  for (const item of trip.value?.items || []) {
    map[item.category]?.push(item);
  }
  return map;
});

function euro(n = 0) {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n);
}

function itemUnitPrice(item: TripItem) {
  return item.actualPrice ?? item.plannedPrice;
}

function itemTotal(item: TripItem) {
  return (itemUnitPrice(item) ?? 0) * (item.actualQty ?? item.plannedQty);
}

function parseEuro(raw: string) {
  const n = Number(String(raw).trim().replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
}

function diffClass(item: TripItem) {
  if (!item.purchased || item.plannedPrice == null || item.actualPrice == null) return '';
  const delta = Math.abs(item.actualPrice - item.plannedPrice);
  if (delta <= 0.15) return 'diff-ok';
  if (delta <= 0.8) return 'diff-warn';
  return 'diff-bad';
}

async function load() {
  error.value = '';
  try {
    if (route.params.id) {
      const data = await api<{ trip: Trip }>(`/trips/${route.params.id}`);
      trip.value = data.trip;
    } else {
      const data = await api<{ trip: Trip | null }>('/trips/active');
      trip.value = data.trip;
      if (data.trip) router.replace(`/trip/${data.trip._id}`);
    }
    if (trip.value?.status === 'planned') {
      await api(`/trips/${trip.value._id}/start`, { method: 'POST' });
      trip.value.status = 'in_progress';
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Error al cargar';
  }
}

async function toggleItem(item: TripItem) {
  if (!trip.value) return;
  const data = await api<{ trip: Trip }>(`/trips/${trip.value._id}/items`, {
    method: 'PATCH',
    body: JSON.stringify({
      itemId: item._id,
      purchased: !item.purchased,
      actualQty: item.actualQty ?? item.plannedQty,
      actualPrice: item.actualPrice ?? item.plannedPrice,
    }),
  });
  trip.value = data.trip;
}

function startPriceEdit(item: TripItem) {
  editingPriceId.value = item._id;
  const value = itemUnitPrice(item);
  priceDraft.value = value != null ? String(value).replace('.', ',') : '';
}

async function commitPrice(item: TripItem) {
  if (editingPriceId.value !== item._id) return;
  const next = parseEuro(priceDraft.value);
  editingPriceId.value = '';
  if (!Number.isFinite(next) || next === itemUnitPrice(item)) return;
  await savePrice(item, next);
}

async function savePrice(item: TripItem, price: number) {
  if (!trip.value) return;
  const data = await api<{ trip: Trip }>(`/trips/${trip.value._id}/items`, {
    method: 'PATCH',
    body: JSON.stringify({
      itemId: item._id,
      purchased: true,
      actualPrice: price,
      actualQty: item.actualQty ?? item.plannedQty,
    }),
  });
  trip.value = data.trip;
}

async function sendVoice(text: string) {
  if (!trip.value || !text.trim() || marking.value) return;
  error.value = '';
  marking.value = true;
  try {
    const data = await api<{ trip: Trip }>(`/trips/${trip.value._id}/voice`, {
      method: 'POST',
      body: JSON.stringify({ transcript: text }),
    });
    trip.value = data.trip;
    voiceText.value = '';
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'No se entendió la frase';
  } finally {
    marking.value = false;
  }
}

function listen() {
  speech.start((text) => {
    voiceText.value = text;
    sendVoice(text);
  });
}

async function complete() {
  if (!trip.value) return;
  completing.value = true;
  try {
    const payload = trip.value.items.map((item) => ({
      needId: item.needId,
      boughtQty: item.actualQty ?? item.plannedQty,
      alreadyConsumed: 0,
    }));
    const data = await api<{ trip: Trip }>(`/trips/${trip.value._id}/complete`, {
      method: 'POST',
      body: JSON.stringify({ consumptions: payload }),
    });
    trip.value = data.trip;
    showSuccess.value = true;
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'No se pudo cerrar';
  } finally {
    completing.value = false;
  }
}

onMounted(load);
watch(() => route.params.id, load);
</script>

<template>
  <main class="trip fade-in">
    <div class="container trip-wrap">
      <header class="trip-head">
        <h1 class="page-title">En el súper</h1>
        <div v-if="trip" class="trip-totals">
          <span>Plan {{ euro(trip.plannedTotal) }}</span>
          <strong>{{ euro(trip.actualTotal) }}</strong>
        </div>
      </header>

      <p v-if="error" class="diff-bad trip-error">{{ error }}</p>
      <p v-if="!trip" class="muted">No hay compra activa. Selecciona productos en la prelista.</p>

      <template v-if="trip">
        <div class="trip-search">
          <label class="trip-sr" for="trip-search-input">Buscar o dictar producto</label>
          <input
            id="trip-search-input"
            v-model="voiceText"
            type="search"
            enterkeyhint="done"
            placeholder="Buscar o dictar… ej. yogur 2,30"
            @keydown.enter.prevent="sendVoice(voiceText)"
          />
          <button
            class="trip-mic"
            type="button"
            :class="{ active: speech.listening }"
            :disabled="!speech.supported || marking"
            :aria-label="speech.listening ? 'Escuchando' : 'Hablar'"
            :title="speech.listening ? 'Escuchando…' : 'Hablar'"
            @click="listen"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z" stroke-linejoin="round" />
              <path d="M5 11a7 7 0 0 0 14 0M12 18v3" stroke-linecap="round" />
            </svg>
          </button>
        </div>

        <template v-for="cat in CATEGORY_ORDER" :key="cat">
          <section v-if="grouped[cat].length" class="trip-aisle">
            <div class="section-kicker">
              <h2>{{ CATEGORY_LABELS[cat] }}</h2>
            </div>
            <article
              v-for="item in grouped[cat]"
              :key="item._id"
              class="trip-row"
              :class="{ selected: item.purchased }"
            >
              <button
                class="trip-check"
                type="button"
                :class="{ on: item.purchased }"
                :aria-pressed="item.purchased"
                :aria-label="item.purchased ? `Quitar ${item.name}` : `Marcar ${item.name}`"
                @click="toggleItem(item)"
              >
                <svg v-if="item.purchased" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M20 6 9 17l-5-5" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
              </button>
              <button class="trip-copy" type="button" @click="toggleItem(item)">
                <strong :class="diffClass(item)">{{ item.name }}</strong>
                <span class="muted">{{ item.plannedQty }} {{ item.unit }}</span>
              </button>
              <div class="trip-price">
                <template v-if="item.purchased">
                  <input
                    v-if="editingPriceId === item._id"
                    class="trip-price-input"
                    type="text"
                    inputmode="decimal"
                    enterkeyhint="done"
                    aria-label="Precio"
                    autofocus
                    v-model="priceDraft"
                    @blur="commitPrice(item)"
                    @keydown.enter.prevent="($event.target as HTMLInputElement).blur()"
                  />
                  <button
                    v-else
                    class="trip-price-btn"
                    type="button"
                    title="Cambiar precio"
                    @click="startPriceEdit(item)"
                  >
                    {{ itemUnitPrice(item) != null ? euro(itemTotal(item)) : 'Precio' }}
                  </button>
                </template>
                <span v-else class="muted">{{ item.plannedPrice != null ? euro(itemTotal(item)) : 's/p' }}</span>
              </div>
            </article>
          </section>
        </template>
      </template>
    </div>

    <aside v-if="trip" class="trip-dock" aria-label="Cerrar compra">
      <button
        class="btn ghost"
        type="button"
        :disabled="marking || !voiceText.trim()"
        @click="sendVoice(voiceText)"
      >
        {{ marking ? 'Marcando…' : 'Marcar' }}
      </button>
      <button class="btn" type="button" :disabled="completing" @click="complete">
        {{ completing ? 'Cerrando…' : 'Llegar a caja' }}
      </button>
    </aside>

    <div v-if="showSuccess" class="modal-backdrop" style="z-index: 50">
      <div class="panel success-dialog" role="dialog" aria-modal="true" aria-labelledby="trip-success-title">
        <div class="success-mark" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4">
            <path d="M20 6 9 17l-5-5" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </div>
        <h3 id="trip-success-title">Compra cerrada</h3>
        <p class="muted">Lo comprado ya está en tu despensa.</p>
        <div class="success-actions">
          <button class="btn block" type="button" @click="router.push('/pantry')">Ver despensa</button>
          <button class="btn ghost block" type="button" @click="router.push('/needs')">Seguir en la lista</button>
        </div>
      </div>
    </div>
  </main>
</template>

<style scoped>
.trip {
  padding-bottom: 12.5rem;
}

.trip-wrap {
  padding-top: 0.25rem;
}

.trip-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 0.7rem;
}

.trip-head .page-title {
  flex: 1 1 auto;
}

.trip-totals {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.05rem;
  flex-shrink: 0;
  font-size: 0.78rem;
  color: var(--text-muted);
  line-height: 1.2;
}

.trip-totals strong {
  color: var(--accent);
  font-size: 1rem;
}

.trip-error {
  margin: 0 0 0.65rem;
}

.trip-sr {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.trip-search {
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.45rem;
  margin-bottom: 0.85rem;
}

.trip-search input {
  flex: 1 1 auto;
  min-width: 0;
  height: 2.65rem;
  border: 1px solid var(--border);
  background: rgba(0, 0, 0, 0.32);
  color: var(--text);
  border-radius: 999px;
  padding: 0 1rem;
  outline: none;
}

.trip-search input:focus {
  border-color: var(--accent);
}

.trip-mic {
  width: 2.65rem;
  height: 2.65rem;
  flex-shrink: 0;
  border: 0;
  border-radius: 999px;
  background: var(--surface-elevated);
  color: var(--text);
  display: grid;
  place-items: center;
  cursor: pointer;
  padding: 0;
}

.trip-mic svg {
  width: 1.2rem;
  height: 1.2rem;
}

.trip-mic.active {
  background: var(--accent);
  color: var(--on-accent);
}

.trip-mic:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.trip-aisle {
  margin-top: 0.75rem;
}

.trip-row {
  display: grid;
  grid-template-columns: 3.6rem minmax(0, 1fr) auto;
  gap: 0.65rem;
  align-items: center;
  background: rgba(35, 78, 78, 0.38);
  border-radius: 20px;
  padding: 0.5rem 0.7rem 0.5rem 0.5rem;
  margin-top: 0.5rem;
  backdrop-filter: blur(16px);
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.32);
}

.trip-row.selected {
  background: rgba(35, 78, 78, 0.58);
  box-shadow: inset 3px 0 0 var(--accent), 0 12px 28px rgba(0, 0, 0, 0.32);
}

.trip-check {
  width: 3.6rem;
  height: 3.6rem;
  border: 2.5px solid rgba(255, 255, 255, 0.42);
  border-radius: 16px;
  background: rgba(0, 0, 0, 0.28);
  color: var(--on-accent);
  display: grid;
  place-items: center;
  padding: 0;
  cursor: pointer;
}

.trip-check svg {
  width: 1.7rem;
  height: 1.7rem;
}

.trip-check.on {
  border-color: var(--accent);
  background: var(--accent);
}

.trip-copy {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.12rem;
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.trip-copy strong {
  font-size: 0.95rem;
  line-height: 1.25;
}

.trip-copy span {
  font-size: 0.78rem;
}

.trip-price {
  text-align: right;
  min-width: 4.6rem;
}

.trip-price-btn {
  margin: 0;
  padding: 0.2rem 0;
  border: 0;
  background: transparent;
  color: var(--accent);
  font-weight: 700;
  font-size: 1rem;
  line-height: 1.15;
  cursor: pointer;
}

.trip-price-input {
  width: 5.6rem;
  height: 2.2rem;
  border: 1px solid var(--accent);
  background: #121212;
  color: var(--accent);
  font-weight: 700;
  font-size: 0.95rem;
  text-align: right;
  border-radius: 999px;
  padding: 0 0.65rem;
  outline: none;
  appearance: none;
  -webkit-appearance: none;
  color-scheme: dark;
}

.trip-dock {
  position: fixed;
  left: 50%;
  transform: translateX(-50%);
  bottom: calc(6.6rem + env(safe-area-inset-bottom, 0px));
  z-index: 80;
  width: min(560px, calc(100% - 1.25rem));
  display: flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.65rem 0.75rem;
  border-radius: 22px;
  background: rgba(22, 22, 22, 0.86);
  backdrop-filter: blur(16px) saturate(150%);
  -webkit-backdrop-filter: blur(16px) saturate(150%);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.45);
}

.trip-dock .btn {
  flex: 1 1 0;
  min-height: 2.45rem;
  padding: 0.5rem 0.85rem;
}

.trip-dock .btn.ghost {
  background: #ffffff;
  color: #121212;
  box-shadow: none;
}

@media (min-width: 800px) {
  .trip-dock {
    bottom: calc(6.85rem + env(safe-area-inset-bottom, 0px));
  }
}
</style>
