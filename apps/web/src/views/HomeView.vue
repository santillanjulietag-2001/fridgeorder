<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { STORE_LABELS, STORES, type Store } from '@fridgeorder/shared';
import { api } from '@/api/client';
import { useAuthStore } from '@/stores/auth';
import { useNeedsStore } from '@/stores/needs';

interface PantryItem {
  _id: string;
  name: string;
  quantityOnHand: number;
  unit: string;
  lastBoughtAt?: string;
}

interface Meal {
  _id: string;
  day: string;
  slot: string;
  title: string;
  status: string;
}

interface MealPlan {
  _id: string;
  weekStart: string;
  meals: Meal[];
}

const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'] as const;

const auth = useAuthStore();
const needs = useNeedsStore();
const router = useRouter();
const pantry = ref<PantryItem[]>([]);
const plan = ref<MealPlan | null>(null);
const loading = ref(true);
const tripStore = ref<Store | 'all'>('all');
const favoritesCount = ref(0);
const dailyTitle = ref('');

const firstName = computed(() => {
  const name = (auth.user?.name || '').trim();
  const part = name.split(/\s+/).filter(Boolean)[0];
  return part || 'tú';
});

const todayKey = computed(() => WEEKDAYS[new Date().getDay()] || 'lunes');

const todayMeals = computed(() => {
  const day = todayKey.value;
  return (plan.value?.meals || []).filter(
    (m) => m.day === day && !['rejected', 'saved_for_next_week'].includes(m.status)
  );
});

const todayLunch = computed(
  () =>
    todayMeals.value.find((m) => m.slot === 'almuerzo' || m.slot === 'comida') ||
    todayMeals.value[0] ||
    null
);

const pendingCount = computed(() => needs.items.length);
const selectedCount = computed(() => needs.selectedIds.length);

const listPreview = computed(() => {
  const selected = needs.selectedItems.slice(0, 2);
  const rest = needs.items.filter((item) => !needs.isSelected(item._id));
  return [...selected, ...rest].slice(0, 3);
});

const lowPantry = computed(() =>
  pantry.value
    .filter((item) => item.quantityOnHand <= 1)
    .sort((a, b) => a.quantityOnHand - b.quantityOnHand)
    .slice(0, 3)
);

const tripItems = computed(() => {
  const items = needs.selectedItems;
  if (tripStore.value === 'all') return items;
  return items.filter((item) => (item.preferredStore || 'other') === tripStore.value);
});

const tripTotal = computed(() =>
  tripItems.value.reduce((sum, item) => sum + (item.estimatedPrice || 0) * (item.quantity || 1), 0)
);

const welcomeLine = computed(() => {
  const parts: string[] = [];
  if (todayLunch.value) parts.push(`Hoy toca: ${todayLunch.value.title}`);
  else parts.push('Sin menú para hoy');
  if (lowPantry.value.length) {
    const n = lowPantry.value.length;
    parts.push(`${n} producto${n === 1 ? '' : 's'} con poco stock`);
  } else if (pendingCount.value) {
    parts.push(`${pendingCount.value} en la lista`);
  }
  return parts.join(' · ');
});

const suggestion = computed(() => {
  const names = lowPantry.value.map((item) => item.name);
  if (names.length && todayLunch.value) {
    return {
      text: `Tienes ${names.join(', ')} con poco stock. ¿Aprovechamos la despensa con ${todayLunch.value.title}?`,
      cta: 'Ver menú de hoy',
    };
  }
  if (names.length) {
    return {
      text: `Tienes ${names.length} producto${names.length === 1 ? '' : 's'} con poco stock. ¿Hacemos un menú para aprovechar la despensa?`,
      cta: 'Generar receta rápida',
    };
  }
  if (todayLunch.value) {
    return {
      text: `Hoy toca ${todayLunch.value.title}. ¿Abrimos la receta y nos ponemos a cocinar?`,
      cta: 'Ver receta',
    };
  }
  return {
    text: 'Aún no hay menú para esta semana. Genera un plan con lo que hay en la despensa.',
    cta: 'Generar plan',
  };
});

function euro(n = 0) {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n);
}

function pantryTag(item: PantryItem) {
  if (item.quantityOnHand <= 0) return `${item.name} agotado`;
  return `${item.name} bajo`;
}

function goPrelist(ev: MouseEvent) {
  const target = ev.target as HTMLElement | null;
  if (target?.closest('select, label')) return;
  router.push('/prelist');
}

onMounted(async () => {
  loading.value = true;
  try {
    const [, pantryData, mealsData, recipePreview] = await Promise.all([
      needs.fetchNeeds(),
      api<{ items: PantryItem[] }>('/pantry'),
      api<{ plan: MealPlan | null }>('/meals/current'),
      api<{ favoritesCount: number; dailyTitle: string }>('/recipes/preview').catch(
        () => ({ favoritesCount: 0, dailyTitle: '' })
      ),
    ]);
    pantry.value = pantryData.items || [];
    plan.value = mealsData.plan;
    favoritesCount.value = recipePreview.favoritesCount || 0;
    dailyTitle.value = recipePreview.dailyTitle || '';
  } catch {
    /* empty states cover missing data */
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <main class="container fade-in home">
    <section class="home-head">
      <h1>¡Hola, {{ firstName }}!</h1>
      <p class="home-lead">{{ loading ? 'Cargando el estado del hogar…' : welcomeLine }}</p>
    </section>

    <section class="stat-row" aria-label="Recetas y análisis de productos">
      <RouterLink class="stat-card home-shortcut" to="/recipes">
        <span>Favoritas</span>
        <strong>{{ favoritesCount }}</strong>
        <em>{{ favoritesCount ? 'Toca para foto y nota' : 'Tus platos guardados' }}</em>
      </RouterLink>
      <RouterLink class="stat-card home-shortcut" to="/recipes/today">
        <span>Del día</span>
        <strong>{{ dailyTitle ? 'Hoy' : 'Nueva' }}</strong>
        <em>{{ dailyTitle || 'Sugerencia diaria' }}</em>
      </RouterLink>
      <RouterLink class="stat-card home-shortcut home-shortcut--title" to="/compare">
        <strong>Análisis de productos</strong>
        <em>Nutrición en el súper</em>
      </RouterLink>
    </section>

    <section class="home-bento">
      <article class="glass-card list-card">
        <header class="card-top">
          <h2>Lista de compra</h2>
          <RouterLink class="round-btn" to="/needs" aria-label="Abrir lista">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M8 5l8 7-8 7" />
            </svg>
          </RouterLink>
        </header>
        <ul v-if="listPreview.length" class="check-list">
          <li v-for="item in listPreview" :key="item._id" :class="{ done: needs.isSelected(item._id) }">
            <span class="check" aria-hidden="true">
              <svg v-if="needs.isSelected(item._id)" viewBox="0 0 24 24">
                <path d="m6.5 12.2 3.2 3.2 7.8-8" />
              </svg>
            </span>
            <span class="check-copy">{{ item.name }}</span>
          </li>
        </ul>
        <p v-else class="empty">La lista está vacía. Dicta, fotografía o busca para empezar.</p>
        <p v-if="pendingCount" class="card-foot">
          {{ selectedCount }} listos para Prelista
        </p>
      </article>

      <RouterLink class="feature-card" to="/meals?tab=plan">
        <svg class="feature-wave" viewBox="0 0 320 220" preserveAspectRatio="none" aria-hidden="true">
          <path d="M0 140c28-22 52-10 78 4 32 16 48 8 78-8 34-18 58-14 84 6 18 14 36 16 80 4v74H0Z" />
          <path d="M0 168c36-18 62-6 92 8 28 12 50 2 76-12 30-16 58-10 86 8 18 12 32 10 66 0v48H0Z" />
        </svg>
        <p class="feature-kicker">Sugerencia IA</p>
        <h2>{{ suggestion.cta }}</h2>
        <p class="feature-sub">{{ suggestion.text }}</p>
      </RouterLink>
    </section>

    <section class="home-rows">
      <RouterLink class="row-card" to="/pantry">
        <div class="row-copy">
          <h3>Alerta despensa</h3>
          <div class="tag-row">
            <template v-if="lowPantry.length">
              <span v-for="item in lowPantry" :key="item._id" class="tag">{{ pantryTag(item) }}</span>
            </template>
            <span v-else-if="pantry.length" class="tag">Al día</span>
            <span v-else class="tag">Vacía</span>
          </div>
        </div>
        <span class="round-btn citrus" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path d="M8 5l8 7-8 7" />
          </svg>
        </span>
      </RouterLink>

      <article class="row-card" role="link" tabindex="0" @click="goPrelist" @keydown.enter="router.push('/prelist')">
        <div class="row-copy">
          <h3>Próximo viaje <span class="price">{{ euro(tripTotal) }}</span></h3>
          <div class="tag-row">
            <span class="tag">{{ tripItems.length }} en Prelista</span>
            <label class="tag tag-select">
              <span class="sr-only">Elegir súper</span>
              <select v-model="tripStore">
                <option value="all">Todos los súpers</option>
                <option v-for="store in STORES" :key="store" :value="store">
                  {{ STORE_LABELS[store] }}
                </option>
              </select>
              <svg class="tag-caret" viewBox="0 0 24 24" aria-hidden="true">
                <path d="m6 9 6 6 6-6" />
              </svg>
            </label>
          </div>
        </div>
        <span class="round-btn citrus" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path d="M8 5l8 7-8 7" />
          </svg>
        </span>
      </article>
    </section>
  </main>
</template>

<style scoped>
.home {
  position: relative;
  overflow-x: hidden;
  padding: 0.35rem 0 7.6rem;
}

.home-head,
.stat-row,
.home-bento,
.home-rows {
  position: relative;
}

.home-head {
  min-height: 25svh;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 0.4rem 0 0.2rem;
}

.home-head h1 {
  margin: 0;
  font-size: clamp(2.15rem, 8vw, 2.9rem);
  letter-spacing: -0.045em;
  line-height: 1.08;
}

.home-lead {
  margin: 0.9rem 0 0;
  color: var(--text-muted);
  font-size: 0.98rem;
  line-height: 1.5;
}

.stat-row {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.55rem;
  margin-top: 0.85rem;
}

.stat-card,
.glass-card,
.row-card {
  background: rgba(255, 255, 255, 0.07);
  border: 1px solid rgba(255, 255, 255, 0.28);
  backdrop-filter: blur(18px) saturate(140%);
  -webkit-backdrop-filter: blur(18px) saturate(140%);
  box-shadow: 0 16px 36px rgba(0, 0, 0, 0.42), inset 0 1px 0 rgba(255, 255, 255, 0.16);
}

.stat-card {
  display: flex;
  flex-direction: column;
  gap: 0.12rem;
  min-width: 0;
  padding: 0.75rem 0.7rem 0.7rem;
  border-radius: 20px;
  color: inherit;
  text-decoration: none;
}

.stat-card strong {
  font-size: 1.35rem;
  letter-spacing: -0.04em;
  color: var(--accent);
  line-height: 1;
}

.stat-card span {
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.home-shortcut {
  gap: 0.2rem;
  min-height: 5.6rem;
}

.home-shortcut em {
  font-style: normal;
  font-size: 0.68rem;
  font-weight: 600;
  color: var(--text-muted);
  line-height: 1.25;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.home-shortcut--title {
  justify-content: space-between;
}

.home-shortcut--title strong {
  font-size: 0.92rem;
  letter-spacing: -0.03em;
  line-height: 1.2;
  overflow-wrap: break-word;
}

.home-bento {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 0.7rem;
  margin-top: 0.85rem;
  align-items: stretch;
}

.glass-card,
.feature-card,
.row-card {
  border-radius: 32px;
  text-decoration: none;
  color: inherit;
}

.list-card,
.feature-card {
  min-width: 0;
  overflow: hidden;
}

.list-card {
  padding: 1.2rem 1.05rem 1.1rem;
  min-height: 17.5rem;
  display: flex;
  flex-direction: column;
}

.card-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.6rem;
  margin-bottom: 1rem;
}

.card-top h2 {
  min-width: 0;
}

.card-top h2,
.feature-card h2,
.row-card h3 {
  margin: 0;
  font-size: 1.22rem;
  letter-spacing: -0.03em;
  line-height: 1.15;
}

.round-btn {
  flex-shrink: 0;
  width: 2.35rem;
  height: 2.35rem;
  border-radius: 999px;
  display: grid;
  place-items: center;
  background: rgba(18, 18, 18, 0.42);
  color: var(--text);
  border: 1px solid rgba(255, 255, 255, 0.16);
}

.round-btn.citrus {
  background: var(--accent);
  color: var(--on-accent);
  border: 0;
  box-shadow: 0 8px 22px var(--accent-glow);
}

.round-btn svg {
  width: 1.05rem;
  height: 1.05rem;
  fill: none;
  stroke: currentColor;
  stroke-width: 2.1;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.check-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}

.check-list li {
  display: flex;
  align-items: flex-start;
  gap: 0.55rem;
  min-width: 0;
  max-width: 100%;
  padding: 0.62rem 0.7rem 0.62rem 0.55rem;
  border-radius: 18px;
  background: rgba(18, 18, 18, 0.38);
  color: var(--text);
  font-size: 0.84rem;
  font-weight: 600;
  line-height: 1.3;
}

.check-list li.done {
  background: var(--accent);
  color: var(--on-accent);
}

.check {
  width: 1.25rem;
  height: 1.25rem;
  margin-top: 0.08rem;
  border-radius: 999px;
  border: 1.5px solid rgba(255, 255, 255, 0.45);
  display: grid;
  place-items: center;
  flex-shrink: 0;
}

.check-list li.done .check {
  border-color: transparent;
  background: rgba(18, 18, 18, 0.22);
}

.check svg {
  width: 0.85rem;
  height: 0.85rem;
  fill: none;
  stroke: currentColor;
  stroke-width: 2.4;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.check-copy {
  flex: 1;
  min-width: 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.empty,
.card-foot {
  margin: 0;
  font-size: 0.8rem;
  line-height: 1.4;
  color: var(--text-muted);
}

.card-foot {
  margin-top: auto;
  padding-top: 1rem;
}

.feature-card {
  position: relative;
  overflow: hidden;
  min-height: 16.5rem;
  padding: 1.1rem 1rem 1.15rem;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  background:
    radial-gradient(120% 80% at 80% -10%, rgba(240, 138, 28, 0.38), transparent 52%),
    linear-gradient(165deg, #2f6a6a 0%, var(--structure) 48%, #163636 100%);
  border: 1px solid rgba(255, 255, 255, 0.18);
  box-shadow: 0 16px 36px rgba(0, 0, 0, 0.42);
}

.feature-wave {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  width: 100%;
  height: 58%;
  fill: rgba(18, 18, 18, 0.18);
}

.feature-kicker,
.feature-sub,
.feature-card h2 {
  position: relative;
}

.feature-kicker {
  margin: 0 0 0.35rem;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.72);
}

.feature-card h2 {
  font-size: clamp(1.15rem, 4.2vw, 1.5rem);
  margin-bottom: 0.35rem;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.feature-sub {
  margin: 0;
  font-size: 0.82rem;
  line-height: 1.35;
  color: rgba(255, 255, 255, 0.78);
  display: -webkit-box;
  -webkit-line-clamp: 3;
  line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.home-rows {
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
  margin-top: 0.85rem;
}

.row-card {
  display: flex;
  align-items: center;
  gap: 0.85rem;
  min-height: 5.6rem;
  padding: 1rem 0.95rem 1rem 1.15rem;
  cursor: pointer;
}

.row-copy {
  min-width: 0;
  flex: 1;
}

.price {
  color: var(--accent);
}

.tag-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  margin-top: 0.5rem;
}

.tag {
  display: inline-flex;
  align-items: center;
  max-width: 100%;
  padding: 0.22rem 0.55rem;
  border-radius: 999px;
  background: rgba(18, 18, 18, 0.38);
  color: rgba(255, 255, 255, 0.86);
  font-size: 0.7rem;
  font-weight: 650;
}

.tag-select {
  position: relative;
  padding: 0 1.45rem 0 0;
  border: 1px solid rgba(255, 255, 255, 0.28);
  background: rgba(18, 18, 18, 0.5);
  cursor: pointer;
}

.tag-select select {
  appearance: none;
  -webkit-appearance: none;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  padding: 0.28rem 0.15rem 0.28rem 0.65rem;
  max-width: 10.5rem;
  cursor: pointer;
}

.tag-caret {
  position: absolute;
  right: 0.4rem;
  top: 50%;
  width: 0.85rem;
  height: 0.85rem;
  transform: translateY(-50%);
  fill: none;
  stroke: currentColor;
  stroke-width: 2.2;
  stroke-linecap: round;
  stroke-linejoin: round;
  pointer-events: none;
  opacity: 0.85;
}

.sr-only {
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

@media (max-width: 520px) {
  .home-bento {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 0.6rem;
  }

  .list-card,
  .feature-card {
    min-height: 16.8rem;
    padding: 1rem 0.9rem 1rem;
  }

  .card-top h2,
  .feature-card h2,
  .row-card h3 {
    font-size: 1.05rem;
  }

  .check-list li {
    font-size: 0.8rem;
  }
}
</style>
