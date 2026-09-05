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
  <main class="container fade-in prelist">
    <h1 class="page-title">Prelista</h1>
    <p class="muted page-lead">Revisa lo elegido antes de salir al súper.</p>

    <div class="chip-scroll" style="margin-bottom: 0.35rem">
      <button class="btn ghost" type="button" :disabled="loading" @click="estimate">Precios IA</button>
    </div>

    <p v-if="error" class="diff-bad">{{ error }}</p>

    <template v-for="cat in CATEGORY_ORDER" :key="cat">
      <section v-if="needs.grouped[cat].length" style="margin-top: 0.85rem">
        <div class="section-kicker">
          <h2>{{ needs.categoryLabel(cat) }}</h2>
        </div>
        <article
          v-for="item in needs.grouped[cat]"
          :key="item._id"
          class="cart-row"
          :class="{ selected: needs.isSelected(item._id) }"
        >
          <img v-if="item.imageUrl" :src="item.imageUrl" alt="" class="thumb" />
          <div v-else class="thumb" />
          <div>
            <label style="display: flex; align-items: center; gap: 0.45rem; cursor: pointer">
              <input
                type="checkbox"
                :checked="needs.isSelected(item._id)"
                @click.prevent="needs.toggleSelect(item._id)"
              />
              <strong>{{ item.name }}</strong>
            </label>
            <div class="muted" style="font-size: 0.85rem; margin-top: 0.2rem">
              {{ item.quantity }} {{ item.unit }}
              <span v-if="item.priceSource === 'ai_avg'" class="chip">aprox. IA</span>
              <span v-else-if="item.priceSource === 'scraped'" class="chip">web</span>
            </div>
          </div>
          <strong class="price">{{ item.estimatedPrice != null ? euro(item.estimatedPrice * item.quantity) : '—' }}</strong>
        </article>
      </section>
    </template>
  </main>

  <Teleport to="body">
    <aside class="prelist-summary" aria-live="polite">
      <div class="prelist-summary-main">
        <div class="prelist-summary-info">
          <span class="prelist-summary-label">Seleccionados</span>
          <strong class="prelist-summary-total">{{ euro(needs.selectedTotal) }}</strong>
          <span class="prelist-summary-count">
            {{ needs.selectedIds.length }} producto{{ needs.selectedIds.length === 1 ? '' : 's' }}
          </span>
        </div>
        <div class="prelist-summary-actions">
          <button class="btn ghost prelist-sel" type="button" @click="needs.selectAll">Todos</button>
          <button class="btn ghost prelist-sel" type="button" @click="needs.selectNone">Ninguno</button>
          <button class="btn prelist-buy" type="button" :disabled="loading" @click="createTrip">
            {{ loading ? 'Creando…' : 'Comprar' }}
          </button>
        </div>
      </div>
    </aside>
  </Teleport>
</template>

<style scoped>
.prelist {
  padding: 1.25rem 0 14.5rem;
}

.prelist-summary {
  position: fixed;
  left: 50%;
  transform: translateX(-50%);
  bottom: calc(6.6rem + env(safe-area-inset-bottom, 0px));
  z-index: 80;
  width: min(560px, calc(100% - 1.25rem));
  margin: 0;
  padding: 0.75rem 0.9rem;
  border-radius: 22px;
  border: 0;
  background: rgba(22, 22, 22, 0.86);
  backdrop-filter: blur(16px) saturate(150%);
  -webkit-backdrop-filter: blur(16px) saturate(150%);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.45);
}

.prelist-summary-main {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.55rem 0.65rem;
}

.prelist-summary-info {
  display: flex;
  flex-direction: column;
  gap: 0.08rem;
  min-width: 9rem;
}

.prelist-summary-label {
  color: #fff;
  font-size: 0.82rem;
  font-weight: 700;
}

.prelist-summary-total {
  color: var(--accent);
  font-size: 1.25rem;
  font-weight: 700;
  line-height: 1.15;
}

.prelist-summary-count {
  color: var(--text-muted);
  font-size: 0.78rem;
}

.prelist-summary-actions {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  flex: 1 1 auto;
  justify-content: flex-end;
}

.btn.ghost.prelist-sel {
  padding: 0.4rem 0.55rem;
  font-size: 0.75rem;
  border-radius: 999px;
  min-height: 2.15rem;
  background: #ffffff;
  color: #121212;
  box-shadow: none;
}

.prelist-buy {
  padding: 0.55rem 0.95rem;
  flex-shrink: 0;
}

@media (min-width: 800px) {
  .prelist-summary {
    bottom: calc(6.85rem + env(safe-area-inset-bottom, 0px));
  }
}
</style>

