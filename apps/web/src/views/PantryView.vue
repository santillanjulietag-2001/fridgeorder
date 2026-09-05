<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { CATEGORY_LABELS, CATEGORY_ORDER, type Category } from '@fridgeorder/shared';
import { api } from '@/api/client';

interface PantryItem {
  _id: string;
  name: string;
  category: Category;
  quantityOnHand: number;
  unit: string;
  notes: string;
}

const items = ref<PantryItem[]>([]);
const error = ref('');
const consumingId = ref<string | null>(null);

async function load() {
  const data = await api<{ items: PantryItem[] }>('/pantry');
  items.value = (data.items || []).filter((item) => item.quantityOnHand > 0);
}

const grouped = computed(() => {
  const map = Object.fromEntries(CATEGORY_ORDER.map((c) => [c, [] as PantryItem[]])) as Record<
    Category,
    PantryItem[]
  >;
  for (const item of items.value) {
    const cat = map[item.category] ? item.category : 'otros';
    map[cat].push(item);
  }
  return map;
});

const visibleCategories = computed(() => CATEGORY_ORDER.filter((cat) => grouped.value[cat].length));

async function consume(item: PantryItem) {
  if (consumingId.value) return;
  consumingId.value = item._id;
  error.value = '';
  try {
    const data = await api<{ item: PantryItem | null; deleted?: boolean }>(`/pantry/${item._id}`, {
      method: 'PATCH',
      body: JSON.stringify({ consumed: 1 }),
    });
    if (data.deleted || !data.item || data.item.quantityOnHand <= 0) {
      items.value = items.value.filter((i) => i._id !== item._id);
    } else {
      const idx = items.value.findIndex((i) => i._id === item._id);
      if (idx >= 0) items.value[idx] = data.item;
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Error';
  } finally {
    consumingId.value = null;
  }
}

onMounted(load);
</script>

<template>
  <main class="container fade-in pantry">
    <h1 class="page-title">Despensa</h1>
    <p class="muted page-lead">Lo que tienes ahora, tras tus compras (menos lo ya consumido).</p>
    <p v-if="error" class="diff-bad">{{ error }}</p>

    <section v-if="!items.length" class="panel pantry-empty">
      <p class="muted">La despensa está vacía. Cierra una compra en el súper para llenarla.</p>
    </section>

    <section v-for="cat in visibleCategories" :key="cat" class="pantry-aisle">
      <div class="section-kicker">
        <h2>{{ CATEGORY_LABELS[cat] }}</h2>
        <span class="chip">{{ grouped[cat].length }}</span>
      </div>
      <article v-for="item in grouped[cat]" :key="item._id" class="pantry-row">
        <div class="pantry-copy">
          <strong>{{ item.name }}</strong>
          <span class="muted">{{ item.quantityOnHand }} {{ item.unit }}</span>
        </div>
        <button
          class="pantry-consume"
          type="button"
          :disabled="consumingId === item._id"
          :aria-label="`Consumir 1 ${item.unit} de ${item.name}`"
          title="Consumir 1"
          @click="consume(item)"
        >
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M6 12h12" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" />
          </svg>
        </button>
      </article>
    </section>

  </main>

  <Teleport to="body">
    <aside class="pantry-dock" aria-label="Generar plan de comidas">
      <RouterLink class="btn block pantry-plan" to="/meals">
        Generar plan de comidas
      </RouterLink>
    </aside>
  </Teleport>
</template>

<style scoped>
.pantry {
  padding: 1.25rem 0 11.5rem;
}

.pantry-empty {
  margin-top: 0.85rem;
}

.pantry-aisle {
  margin-top: 1.45rem;
}

.pantry-aisle .section-kicker {
  margin: 0 0.15rem 0.7rem;
}

.pantry-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 1rem;
  align-items: center;
  background: rgba(35, 78, 78, 0.38);
  border-radius: 22px;
  padding: 1.05rem 1.05rem 1.05rem 1.15rem;
  margin-top: 0.55rem;
  backdrop-filter: blur(16px);
  box-shadow: 0 16px 36px rgba(0, 0, 0, 0.42);
}

.pantry-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.pantry-copy strong {
  font-size: 1.02rem;
  line-height: 1.3;
}

.pantry-consume {
  width: 2.75rem;
  height: 2.75rem;
  flex-shrink: 0;
  border: 0;
  border-radius: 999px;
  background: var(--accent);
  color: var(--on-accent);
  display: grid;
  place-items: center;
  padding: 0;
  cursor: pointer;
  box-shadow: 0 8px 22px var(--accent-glow);
}

.pantry-consume svg {
  width: 1.2rem;
  height: 1.2rem;
}

.pantry-consume:hover:not(:disabled) {
  filter: brightness(1.08);
}

.pantry-consume:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.pantry-dock {
  position: fixed;
  left: 50%;
  transform: translateX(-50%);
  bottom: calc(6.6rem + env(safe-area-inset-bottom, 0px));
  z-index: 80;
  width: min(560px, calc(100% - 1.25rem));
  padding: 0;
}

.pantry-plan {
  text-align: center;
  box-shadow: 0 8px 22px var(--accent-glow);
}

@media (min-width: 800px) {
  .pantry-dock {
    bottom: calc(6.85rem + env(safe-area-inset-bottom, 0px));
  }
}
</style>
