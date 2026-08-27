<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { CATEGORY_ORDER } from '@fridgeorder/shared';
import { useNeedsStore } from '@/stores/needs';
import { api } from '@/api/client';

const needs = useNeedsStore();
const router = useRouter();
const loading = ref(false);
const error = ref('');

onMounted(() => needs.fetchNeeds());

function euro(n = 0) {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n);
}

async function estimate() {
  loading.value = true;
  error.value = '';
  try {
    await needs.estimatePrices();
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Error al estimar';
  } finally {
    loading.value = false;
  }
}

async function createTrip() {
  if (!needs.selectedIds.length) {
    error.value = 'Selecciona al menos un producto';
    return;
  }
  loading.value = true;
  error.value = '';
  try {
    const data = await api<{ trip: { _id: string } }>('/trips', {
      method: 'POST',
      body: JSON.stringify({ needIds: needs.selectedIds }),
    });
    router.push(`/trip/${data.trip._id}`);
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'No se pudo crear la compra';
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <main class="container fade-in" style="padding: 1.25rem 0 6rem">
    <div class="sticky-total">
      <div class="container page-header" style="width: min(920px, 100%)">
        <div>
          <h1 class="page-title">Prelista</h1>
          <p class="muted" style="margin: 0.2rem 0 0">
            {{ needs.selectedIds.length }} elegidos · {{ euro(needs.selectedTotal) }}
          </p>
        </div>
        <div style="display: flex; gap: 0.4rem; flex-wrap: wrap">
          <button class="btn ghost" @click="needs.selectAll">Todo</button>
          <button class="btn ghost" @click="needs.selectNone">Nada</button>
          <button class="btn ghost" :disabled="loading" @click="estimate">Precios IA</button>
          <button class="btn" :disabled="loading" @click="createTrip">Comprar</button>
        </div>
      </div>
    </div>

    <p v-if="error" class="diff-bad">{{ error }}</p>

    <template v-for="cat in CATEGORY_ORDER" :key="cat">
      <section v-if="needs.grouped[cat].length" class="panel" style="margin-top: 0.9rem">
        <h3>{{ needs.categoryLabel(cat) }}</h3>
        <div v-for="item in needs.grouped[cat]" :key="item._id" class="list-item">
          <input type="checkbox" :checked="needs.isSelected(item._id)" @click.prevent="needs.toggleSelect(item._id)" />
          <div>
            <strong>{{ item.name }}</strong>
            <div class="muted" style="font-size: 0.85rem">
              {{ item.quantity }} {{ item.unit }}
              <span v-if="item.priceSource === 'ai_avg'" class="chip">aprox. IA</span>
              <span v-else-if="item.priceSource === 'scraped'" class="chip">web</span>
            </div>
          </div>
          <strong>{{ item.estimatedPrice != null ? euro(item.estimatedPrice * item.quantity) : '—' }}</strong>
        </div>
      </section>
    </template>
  </main>
</template>
