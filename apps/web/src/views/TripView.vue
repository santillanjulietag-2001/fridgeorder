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
const completing = ref(false);
const consumptions = ref<Record<string, { boughtQty: number; alreadyConsumed: number }>>({});

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
    if (trip.value) {
      for (const item of trip.value.items) {
        consumptions.value[item.needId] = {
          boughtQty: item.actualQty ?? item.plannedQty,
          alreadyConsumed: 0,
        };
      }
      if (trip.value.status === 'planned') {
        await api(`/trips/${trip.value._id}/start`, { method: 'POST' });
        trip.value.status = 'in_progress';
      }
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
  if (!trip.value || !text.trim()) return;
  error.value = '';
  try {
    const data = await api<{ trip: Trip }>(`/trips/${trip.value._id}/voice`, {
      method: 'POST',
      body: JSON.stringify({ transcript: text }),
    });
    trip.value = data.trip;
    voiceText.value = '';
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'No se entendió la frase';
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
    const payload = Object.entries(consumptions.value).map(([needId, v]) => ({
      needId,
      boughtQty: v.boughtQty,
      alreadyConsumed: v.alreadyConsumed,
    }));
    const data = await api<{ trip: Trip }>(`/trips/${trip.value._id}/complete`, {
      method: 'POST',
      body: JSON.stringify({ consumptions: payload }),
    });
    trip.value = data.trip;
    router.push('/pantry');
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
  <main class="fade-in" style="padding-bottom: 6rem">
    <div class="sticky-total">
      <div class="container" style="width: min(920px, 100% - 2rem)">
        <h1 class="page-title">En el súper</h1>
        <div v-if="trip" style="display: flex; justify-content: space-between; gap: 1rem; margin-top: 0.35rem">
          <span class="muted">Plan {{ euro(trip.plannedTotal) }}</span>
          <strong>Real {{ euro(trip.actualTotal) }}</strong>
        </div>
      </div>
    </div>

    <div class="container" style="padding-top: 1rem">
      <p v-if="error" class="diff-bad">{{ error }}</p>
      <p v-if="!trip" class="muted">No hay compra activa. Selecciona productos en la prelista.</p>

      <template v-if="trip">
        <section class="panel">
          <div class="field">
            <label>Voz / texto — ej. “yogur ok precio 2,30”</label>
            <input v-model="voiceText" @keydown.enter.prevent="sendVoice(voiceText)" />
          </div>
          <div style="display: flex; gap: 0.5rem; flex-wrap: wrap">
            <button class="btn" type="button" @click="sendVoice(voiceText)">Marcar</button>
            <button class="btn ghost" type="button" :disabled="!speech.supported" @click="listen">
              {{ speech.listening ? 'Escuchando…' : 'Hablar' }}
            </button>
            <button class="btn" type="button" :disabled="completing" @click="complete">
              Llegar a caja
            </button>
          </div>
        </section>

        <template v-for="cat in CATEGORY_ORDER" :key="cat">
          <section v-if="grouped[cat].length" class="panel" style="margin-top: 0.8rem">
            <h3>{{ CATEGORY_LABELS[cat] }}</h3>
            <div v-for="item in grouped[cat]" :key="item._id" class="list-item">
              <input type="checkbox" :checked="item.purchased" @change="toggleItem(item)" />
              <div>
                <strong :class="diffClass(item)">{{ item.name }}</strong>
                <div class="muted" style="font-size: 0.85rem">
                  Plan {{ item.plannedQty }} {{ item.unit }} · {{ item.plannedPrice != null ? euro(item.plannedPrice) : 's/p' }}
                </div>
                <div v-if="item.purchased" style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.4rem; margin-top: 0.4rem">
                  <input
                    type="number"
                    step="0.01"
                    :value="item.actualPrice"
                    placeholder="Precio real"
                    @change="savePrice(item, Number(($event.target as HTMLInputElement).value))"
                  />
                  <div class="muted" style="font-size: 0.8rem">
                    Consumido antes:
                    <input
                      type="number"
                      min="0"
                      style="width: 4rem; margin-left: 0.25rem"
                      v-model.number="consumptions[item.needId].alreadyConsumed"
                    />
                  </div>
                </div>
              </div>
              <div style="text-align: right">
                <div v-if="item.purchased">{{ euro((item.actualPrice ?? item.plannedPrice ?? 0) * (item.actualQty ?? item.plannedQty)) }}</div>
                <div v-else class="muted">pendiente</div>
              </div>
            </div>
          </section>
        </template>
      </template>
    </div>
  </main>
</template>
