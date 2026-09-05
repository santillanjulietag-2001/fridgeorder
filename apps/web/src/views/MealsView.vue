<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { api } from '@/api/client';
import { MEAL_SLOT_LABELS, normalizeWeekday, type DietStyle, type MealRating, type MealSlot, type NutritionGoal } from '@fridgeorder/shared';
import MealQuestionnaireForm, { type QuestionnairePayload } from '@/components/MealQuestionnaireForm.vue';

interface Recipe {
  servings: number;
  steps: string[];
  prepMinutes?: number;
  cookMinutes?: number;
  totalMinutes?: number;
  difficulty?: string;
  tools: string[];
  substitutions: string[];
  tips: string[];
  fridgeDays?: number;
  freezable: boolean;
  freezeNotes: string;
  thawNotes: string;
  reheatNotes: string;
  pantryIngredientNames: string[];
  missingIngredientNames: string[];
}

interface Meal {
  _id: string;
  day: string;
  slot: string;
  title: string;
  ingredients: string[];
  status: string;
  scheduledDate?: string;
  portions: number;
  nutritionNote?: { summary: string; protein?: string; vegetables?: string; carbs?: string };
  recipe?: Recipe;
  replacedByTitle?: string;
  rejectReason?: string;
  source?: 'batch' | 'same_day';
  fromPrepTitle?: string;
  prepIds?: string[];
}

interface Prep {
  _id: string;
  title: string;
  whenLabel: string;
  durationMinutes?: number;
  ingredients: string[];
  freezable: boolean;
  storageNotes: string;
  usedByMealIds?: string[];
}

interface MealPlan {
  _id: string;
  weekStart: string;
  meals: Meal[];
  preps: Prep[];
  batchCookDay?: string;
}

interface Preferences {
  onboardingCompleted: boolean;
  goals: NutritionGoal[];
  otherGoal?: string;
  dietStyle: DietStyle;
  adults: number;
  children: number;
  portions: number;
  allergies: string[];
  forbiddenIngredients: string[];
  restrictions: string[];
  cookDays: string[];
  cookTimeMinutes: number;
  weeklyBudgetEur?: number;
  dislikedIngredients: string[];
  favoriteIngredients: string[];
  preferredCuisines: string[];
  spiceLevel: number;
  preferQuickMeals: boolean;
  preferTraditional: boolean;
  disclaimerAccepted: boolean;
  swipes: { dishKey: string; title: string; rating: string }[];
}

interface DishCard {
  dishKey: string;
  title: string;
  summary: string;
  tags?: string[];
}

interface BatchSession {
  totalMinutes: number;
  steps: { order: number; task: string; parallelWith?: number[]; minutes?: number }[];
  containers: string[];
  fridge: string[];
  freezer: string[];
  eatFirst: string[];
}

const STATUS_LABELS: Record<string, string> = {
  proposed: 'Propuesta',
  accepted: 'Aceptada',
  rejected: 'Rechazada',
  planned: 'Planificada',
  prepared: 'Preparada',
  consumed: 'Consumida',
  postponed: 'Pospuesta',
  saved_for_next_week: 'Otra semana',
  replaced: 'Reemplazada',
  frozen: 'Congelada',
  leftover: 'Sobró',
};

const DAYS = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];
const WEEKDAY_FROM_SUNDAY = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
const DAY_SHORT: Record<string, string> = {
  lunes: 'Lun',
  martes: 'Mar',
  miercoles: 'Mié',
  jueves: 'Jue',
  viernes: 'Vie',
  sabado: 'Sáb',
  domingo: 'Dom',
};
const DONE_STATUSES = ['consumed', 'prepared'];

function slotLabel(slot: string) {
  if (slot === 'comida') return 'Almuerzo';
  return MEAL_SLOT_LABELS[slot as MealSlot] || slot;
}

function isFromBatch(meal: Meal) {
  return meal.source === 'batch' || Boolean(meal.fromPrepTitle) || Boolean(meal.prepIds?.length);
}

function mealsForPrep(prep: Prep) {
  const ids = new Set((prep.usedByMealIds || []).map(String));
  return (plan.value?.meals || []).filter(
    (m) => ids.has(m._id) || (m.fromPrepTitle || '').toLowerCase() === prep.title.toLowerCase()
  );
}

type Tab = 'plan' | 'swipe' | 'batch';

const route = useRoute();
const tab = ref<Tab>('plan');
const plan = ref<MealPlan | null>(null);
const prefs = ref<Preferences | null>(null);
const dishes = ref<DishCard[]>([]);
const dishIndex = ref(0);
const batch = ref<BatchSession | null>(null);
const selected = ref<Meal | null>(null);
const selectedDay = ref(WEEKDAY_FROM_SUNDAY[new Date().getDay()] || 'lunes');
const weekStripEl = ref<HTMLElement | null>(null);
const loading = ref(false);
const error = ref('');
const message = ref('');
const moveDay = ref('jueves');
const ateOther = ref('');
const replaceIngredientFrom = ref('');
const replaceIngredientTo = ref('');
const showQuestionnaire = ref(true);
const batchCookDay = ref('');

const currentDish = computed(() => dishes.value[dishIndex.value] || null);
const visibleMeals = computed(() =>
  (plan.value?.meals || []).filter((m) => !['rejected', 'saved_for_next_week'].includes(m.status))
);
const mealsByDay = computed(() => {
  const map: Record<string, Meal[]> = Object.fromEntries(DAYS.map((d) => [d, []]));
  for (const m of visibleMeals.value) {
    const day = normalizeWeekday(m.day) || m.day;
    (map[day] || (map[day] = [])).push(m);
  }
  return map;
});

function localIso(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function mondayOfWeek(d = new Date()) {
  const date = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = date.getDay();
  date.setDate(date.getDate() + (dow === 0 ? -6 : 1 - dow));
  return localIso(date);
}

function addDaysIso(iso: string, days: number) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return localIso(d);
}

function dayTone(meals: Meal[]) {
  if (!meals.length) return 'empty' as const;
  const done = meals.filter((m) => DONE_STATUSES.includes(m.status)).length;
  if (done === meals.length) return 'done' as const;
  if (done > 0) return 'partial' as const;
  return 'planned' as const;
}

const weekStartIso = computed(() => plan.value?.weekStart || mondayOfWeek());

const weekStrip = computed(() => {
  const today = localIso();
  const start = weekStartIso.value;
  return DAYS.map((day, i) => {
    const iso = addDaysIso(start, i);
    const meals = mealsByDay.value[day] || [];
    return {
      day,
      short: DAY_SHORT[day] || day.slice(0, 3),
      iso,
      dateNum: Number(iso.slice(8, 10)),
      isToday: iso === today,
      mealCount: meals.length,
      doneCount: meals.filter((m) => DONE_STATUSES.includes(m.status)).length,
      tone: dayTone(meals),
    };
  });
});

const selectedDayInfo = computed(
  () => weekStrip.value.find((d) => d.day === selectedDay.value) || weekStrip.value[0]
);
const SLOT_SORT = ['desayuno', 'almuerzo', 'comida', 'merienda', 'cena'];
const selectedDayMeals = computed(() =>
  [...(mealsByDay.value[selectedDay.value] || [])].sort(
    (a, b) => SLOT_SORT.indexOf(a.slot) - SLOT_SORT.indexOf(b.slot)
  )
);

function isMealDone(status: string) {
  return DONE_STATUSES.includes(status);
}
const selectedDayTitle = computed(() => {
  const info = selectedDayInfo.value;
  if (info?.isToday) return 'Hoy';
  return info?.day || selectedDay.value;
});
const weekLabel = computed(() => {
  const d = new Date(`${weekStartIso.value}T12:00:00`);
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
});

function selectDay(day: string) {
  selectedDay.value = day;
}

function scrollSelectedIntoView() {
  nextTick(() => {
    const el = weekStripEl.value?.querySelector(`[data-day="${selectedDay.value}"]`);
    el?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  });
}

watch(selectedDay, scrollSelectedIntoView);
watch(
  () => tab.value,
  (t) => {
    if (t === 'plan') scrollSelectedIntoView();
  }
);
watch(
  () => plan.value?.weekStart,
  (start) => {
    const today = localIso();
    const base = start || mondayOfWeek();
    const inWeek = DAYS.some((_, i) => addDaysIso(base, i) === today);
    selectedDay.value = inWeek
      ? WEEKDAY_FROM_SUNDAY[new Date().getDay()] || 'lunes'
      : 'lunes';
  }
);

async function load() {
  error.value = '';
  try {
    const data = await api<{ plan: MealPlan | null; preferences: Preferences }>('/meals/current');
    plan.value = data.plan;
    prefs.value = data.preferences;
    if (data.plan?.batchCookDay) batchCookDay.value = data.plan.batchCookDay;
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Error al cargar';
  }
}

async function savePrefs(payload: QuestionnairePayload) {
  loading.value = true;
  error.value = '';
  try {
    const data = await api<{ preferences: Preferences }>('/meals/preferences', {
      method: 'PUT',
      body: JSON.stringify({
        onboardingCompleted: true,
        ...payload,
      }),
    });
    prefs.value = data.preferences;
    message.value = 'Preferencias guardadas';
    showQuestionnaire.value = false;
    tab.value = 'plan';
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'No se pudo guardar';
  } finally {
    loading.value = false;
  }
}

async function loadSwipes() {
  const data = await api<{ dishes: DishCard[] }>('/meals/swipe-cards');
  dishes.value = data.dishes;
  dishIndex.value = 0;
}

async function swipe(rating: MealRating) {
  if (!currentDish.value) return;
  await api('/meals/swipe', {
    method: 'POST',
    body: JSON.stringify({
      dishKey: currentDish.value.dishKey,
      title: currentDish.value.title,
      rating,
    }),
  });
  dishIndex.value += 1;
  if (dishIndex.value >= dishes.value.length) {
    message.value = 'Preferencias de platos listas. Ya puedes generar el plan.';
    tab.value = 'plan';
  }
}

async function generate() {
  loading.value = true;
  error.value = '';
  message.value = '';
  try {
    const data = await api<{ plan: MealPlan }>('/meals/generate', {
      method: 'POST',
      body: JSON.stringify({ includeRecipes: true, includeBatch: true }),
    });
    plan.value = data.plan;
    if (data.plan.batchCookDay) batchCookDay.value = data.plan.batchCookDay;
    else batchCookDay.value = '';
    batch.value = null;
    showQuestionnaire.value = false;
    message.value = 'Plan generado. Revisa las preparaciones y elige el día de batch.';
    tab.value = 'batch';
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'No se pudo generar';
  } finally {
    loading.value = false;
  }
}

async function act(meal: Meal, action: string, extra: Record<string, unknown> = {}) {
  if (!plan.value) return;
  loading.value = true;
  error.value = '';
  try {
    const data = await api<{ plan: MealPlan; meal: Meal }>(
      `/meals/${plan.value._id}/meals/${meal._id}/action`,
      { method: 'POST', body: JSON.stringify({ action, ...extra }) }
    );
    plan.value = data.plan;
    selected.value = data.meal;
    message.value = 'Comida actualizada';
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Acción fallida';
  } finally {
    loading.value = false;
  }
}

async function recipeMode(mode: string) {
  if (!plan.value || !selected.value) return;
  loading.value = true;
  try {
    const body: Record<string, unknown> = { mode };
    if (replaceIngredientFrom.value && replaceIngredientTo.value) {
      body.replaceIngredient = {
        from: replaceIngredientFrom.value,
        to: replaceIngredientTo.value,
      };
    }
    const data = await api<{ plan: MealPlan; meal: Meal }>(
      `/meals/${plan.value._id}/meals/${selected.value._id}/recipe`,
      { method: 'POST', body: JSON.stringify(body) }
    );
    plan.value = data.plan;
    selected.value = data.meal;
    message.value = 'Receta actualizada (faltantes enviados a la lista)';
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Error de receta';
  } finally {
    loading.value = false;
  }
}

async function cookSelected() {
  if (!plan.value || !selected.value) return;
  const data = await api<{ plan: MealPlan; meal: Meal }>(
    `/meals/${plan.value._id}/meals/${selected.value._id}/cook`,
    { method: 'POST', body: '{}' }
  );
  plan.value = data.plan;
  selected.value = data.meal;
  message.value = 'Marcado como cocinado. Se restaron los ingredientes de la despensa.';
}

async function favoriteRecipe() {
  if (!plan.value || !selected.value) return;
  await api(`/meals/${plan.value._id}/meals/${selected.value._id}/favorite-recipe`, {
    method: 'POST',
    body: '{}',
  });
  message.value = 'Guardada en Favoritas. Ábrela ahí para puntuar y añadir foto.';
}

async function loadBatch() {
  if (!plan.value) return;
  if (!batchCookDay.value) {
    error.value = 'Elige el día en que vas a cocinar el batch';
    tab.value = 'batch';
    return;
  }
  loading.value = true;
  error.value = '';
  try {
    const day = encodeURIComponent(batchCookDay.value);
    const data = await api<{ batch: BatchSession; cookDay?: string }>(
      `/meals/${plan.value._id}/batch?cookDay=${day}`
    );
    batch.value = data.batch;
    if (data.cookDay) batchCookDay.value = data.cookDay;
    tab.value = 'batch';
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'No hay batch';
  } finally {
    loading.value = false;
  }
}

watch(showQuestionnaire, (open) => {
  document.body.style.overflow = open ? 'hidden' : '';
}, { immediate: true });

onMounted(async () => {
  showQuestionnaire.value = true;
  await load();
  const q = String(route.query.tab || '');
  if (q === 'swipe' || q === 'batch') {
    tab.value = q;
  } else {
    tab.value = 'plan';
  }
  if (tab.value === 'swipe') await loadSwipes();
  if (tab.value === 'plan') scrollSelectedIntoView();
});

onUnmounted(() => {
  document.body.style.overflow = '';
});
</script>

<template>
  <main class="container fade-in meals">
    <header class="page-header meals-head">
      <div>
        <h1 class="page-title">Plan de comidas</h1>
        <p class="muted page-lead">Calendario de la semana, recetas, gustos y batch cooking.</p>
      </div>
    </header>
    <div class="meals-toolbar">
      <div class="chip-scroll">
        <button class="chip-filter" :class="{ on: tab === 'plan' }" @click="tab = 'plan'">Calendario</button>
        <button class="chip-filter" :class="{ on: tab === 'swipe' }" @click="tab = 'swipe'; loadSwipes()">Gustos</button>
        <button class="chip-filter" :class="{ on: showQuestionnaire }" @click="showQuestionnaire = true">Cuestionario</button>
        <button class="chip-filter" :class="{ on: tab === 'batch' }" :disabled="!plan" @click="tab = 'batch'">Batch</button>
      </div>
      <button class="btn meals-generate" :disabled="loading" @click="generate">
        {{ loading ? '…' : 'Generar plan' }}
      </button>
    </div>

    <p v-if="error" class="diff-bad">{{ error }}</p>
    <p v-if="message" class="diff-ok">{{ message }}</p>
    <p class="muted" style="font-size: 0.8rem; margin-top: 0.5rem">
      La info nutricional es orientativa y no sustituye el consejo de un médico o nutricionista.
    </p>

    <!-- TINDER -->
    <section v-if="tab === 'swipe'" class="panel swipe-card" style="margin-top: 1rem">
      <h2>¿Qué te apetece?</h2>
      <template v-if="currentDish">
        <p class="eyebrow">{{ (currentDish.tags || []).join(' · ') }}</p>
        <h3>{{ currentDish.title }}</h3>
        <p class="muted">{{ currentDish.summary }}</p>
        <div class="swipe-actions">
          <button class="btn ghost" type="button" @click="swipe('dislike')">No me gusta</button>
          <button class="btn" type="button" @click="swipe('like')">Me gusta</button>
        </div>
        <p class="muted" style="margin-top: 0.75rem">{{ dishIndex + 1 }} / {{ dishes.length }}</p>
      </template>
      <template v-else>
        <p class="muted">No hay más cartas. Genera el plan o pide más cartas.</p>
        <button class="btn" @click="loadSwipes">Más platos</button>
        <button class="btn ghost" @click="tab = 'plan'">Ir al calendario</button>
      </template>
    </section>

    <!-- CALENDARIO -->
    <section v-if="tab === 'plan'" class="plan-tab">
      <p class="week-label">Semana del {{ weekLabel }}</p>

      <div ref="weekStripEl" class="week-strip" role="tablist" aria-label="Días de la semana">
        <button
          v-for="d in weekStrip"
          :key="d.day"
          type="button"
          class="week-day"
          :class="{ on: selectedDay === d.day, today: d.isToday && selectedDay !== d.day }"
          :data-day="d.day"
          role="tab"
          :aria-selected="selectedDay === d.day"
          :aria-label="`${d.short} ${d.dateNum}${d.isToday ? ', hoy' : ''}, ${d.mealCount} comidas`"
          @click="selectDay(d.day)"
        >
          <span class="week-day-card">
            <span class="week-day-name">{{ d.short }}</span>
            <span class="week-day-num">{{ d.dateNum }}</span>
          </span>
          <span class="week-day-dot" :class="d.tone" aria-hidden="true">
            <svg v-if="d.tone === 'done'" viewBox="0 0 24 24">
              <path d="m6.5 12.2 3.4 3.3 7.6-8" />
            </svg>
            <svg v-else-if="d.tone === 'partial'" viewBox="0 0 24 24">
              <path d="M6.2 3v6.2M4.4 3v4.4M8 3v4.4M6.2 9.2V21" />
              <path d="M16.2 3.2c2.1 3.4 2.7 7 2.4 9.6h-4.4c0-2.7.8-6.3 2-9.6Z" />
              <path d="M16.2 12.8V21" />
            </svg>
            <svg v-else-if="d.tone === 'planned'" viewBox="0 0 24 24">
              <path d="M6.2 3v6.2M4.4 3v4.4M8 3v4.4M6.2 9.2V21" />
              <path d="M16.2 3.2c2.1 3.4 2.7 7 2.4 9.6h-4.4c0-2.7.8-6.3 2-9.6Z" />
              <path d="M16.2 12.8V21" />
            </svg>
            <svg v-else viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="4.2" />
            </svg>
          </span>
        </button>
      </div>

      <section v-if="!plan" class="panel">
        <p class="muted">Aún no hay menú. Completa gustos y pulsa Generar plan.</p>
      </section>

      <template v-else>
        <div class="section-kicker day-kicker">
          <h2>{{ selectedDayTitle }}</h2>
          <span v-if="selectedDayInfo?.mealCount" class="day-count">{{ selectedDayInfo.doneCount }}/{{ selectedDayInfo.mealCount }}</span>
        </div>

        <article
          v-for="meal in selectedDayMeals"
          :key="meal._id"
          class="cart-row meal-card"
          :class="{ done: isMealDone(meal.status) }"
          @click="selected = meal"
        >
          <span class="meal-slot" :data-slot="meal.slot" aria-hidden="true">
            <svg v-if="meal.slot === 'desayuno'" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="3.4" />
              <path d="M12 3.2v2.2M12 18.6v2.2M3.2 12h2.2M18.6 12h2.2M6 6l1.6 1.6M16.4 16.4 18 18M18 6l-1.6 1.6M7.6 16.4 6 18" />
            </svg>
            <svg v-else-if="meal.slot === 'merienda'" viewBox="0 0 24 24">
              <path d="M7 10h9.2a3.4 3.4 0 0 1 0 6.8H8.2A3.6 3.6 0 0 1 7 10Z" />
              <path d="M16.2 12.2h1.6a2.2 2.2 0 0 1 0 4.4" />
              <path d="M9.2 8.4c.4-1.4 1.4-2.4 2.8-2.4" />
            </svg>
            <svg v-else-if="meal.slot === 'cena'" viewBox="0 0 24 24">
              <path d="M16.4 4.8A7.4 7.4 0 1 1 6.2 16.6 6.2 6.2 0 0 0 16.4 4.8Z" />
            </svg>
            <svg v-else viewBox="0 0 24 24">
              <path d="M6.2 3v6.2M4.4 3v4.4M8 3v4.4M6.2 9.2V21" />
              <path d="M16.2 3.2c2.1 3.4 2.7 7 2.4 9.6h-4.4c0-2.7.8-6.3 2-9.6Z" />
              <path d="M16.2 12.8V21" />
            </svg>
          </span>
          <div class="meal-copy">
            <span class="meal-slot-label">{{ slotLabel(meal.slot) }}</span>
            <strong>{{ meal.title }}</strong>
            <p class="muted">
              {{ meal.nutritionNote?.summary || meal.ingredients.slice(0, 4).join(', ') || slotLabel(meal.slot) }}
            </p>
            <span class="meal-origin" :class="isFromBatch(meal) ? 'batch' : 'today'">
              {{ isFromBatch(meal) ? 'De batch' : 'Cocinar hoy' }}
            </span>
          </div>
          <span class="meal-check" :class="{ on: isMealDone(meal.status) }" aria-hidden="true">
            <svg v-if="isMealDone(meal.status)" viewBox="0 0 24 24">
              <path d="m6.5 12.2 3.4 3.3 7.6-8" />
            </svg>
          </span>
        </article>

        <section v-if="!selectedDayMeals.length" class="panel day-empty">
          <p class="muted">Este día debería tener 4 comidas. Vuelve a generar el plan para completar la semana.</p>
        </section>
      </template>
    </section>

    <!-- BATCH -->
    <section v-else-if="tab === 'batch'" class="panel batch-tab" style="margin-top: 1rem">
      <h2>Preparaciones con antelación</h2>
      <p class="muted">
        El batch se cocina un día y cubre comidas de toda la semana. Si un plato no sale de estas
        bases, se cocina ese mismo día. El calendario siempre tiene 4 comidas.
      </p>
      <template v-if="plan?.preps?.length">
        <div v-for="p in plan.preps" :key="p._id" class="list-item">
          <div class="chip">{{ p.whenLabel }}</div>
          <div>
            <strong>{{ p.title }}</strong>
            <div class="muted" style="font-size: 0.85rem">
              {{ p.durationMinutes || '—' }} min · {{ p.ingredients.join(', ') }}
              <span v-if="p.freezable"> · congelable</span>
            </div>
            <div class="muted" style="font-size: 0.8rem">{{ p.storageNotes }}</div>
            <p v-if="mealsForPrep(p).length" class="muted prep-feeds">
              Cubre: {{ mealsForPrep(p).map((m) => `${m.day} ${slotLabel(m.slot)}`).join(' · ') }}
            </p>
          </div>
          <span />
        </div>

        <h3 class="batch-day-title">¿Qué día vas a cocinar el batch?</h3>
        <p class="muted">Elige el día antes de ver los pasos de cocina.</p>
        <div class="chips">
          <button
            v-for="d in DAYS"
            :key="d"
            type="button"
            class="chip-btn"
            :class="{ on: batchCookDay === d }"
            @click="batchCookDay = d; batch = null"
          >
            {{ d }}
          </button>
        </div>
        <button class="btn block" style="margin-top: 1rem" :disabled="!batchCookDay || loading" @click="loadBatch">
          {{ loading ? 'Preparando…' : 'Ver cómo cocinar el batch' }}
        </button>
      </template>
      <p v-else class="muted">Genera un plan para ver las preparaciones de la semana.</p>

      <template v-if="batch">
        <h3 class="batch-day-title">Sesión del {{ batchCookDay }}</h3>
        <p><strong>Tiempo total estimado:</strong> {{ batch.totalMinutes }} min</p>
        <ol>
          <li v-for="s in batch.steps" :key="s.order">
            {{ s.task }}
            <span class="muted">({{ s.minutes || '?' }} min)</span>
            <span v-if="s.parallelWith?.length" class="chip">paralelo con {{ s.parallelWith.join(',') }}</span>
          </li>
        </ol>
        <p><strong>Recipientes:</strong> {{ batch.containers.join(', ') }}</p>
        <p><strong>Nevera:</strong> {{ batch.fridge.join(', ') || '—' }}</p>
        <p><strong>Congelador:</strong> {{ batch.freezer.join(', ') || '—' }}</p>
        <p><strong>Consumir primero:</strong> {{ batch.eatFirst.join(', ') || '—' }}</p>
      </template>
    </section>

    <!-- DETALLE COMIDA -->
    <div v-if="selected" class="drawer">
      <div class="drawer-panel">
        <button class="btn ghost" style="float: right" @click="selected = null">Cerrar</button>
        <div class="chip">{{ selected.day }} · {{ slotLabel(selected.slot) }} · {{ STATUS_LABELS[selected.status] }}</div>
        <p class="meal-origin" :class="isFromBatch(selected) ? 'batch' : 'today'">
          {{ isFromBatch(selected) ? 'De batch' : 'Cocinar hoy' }}
          <span v-if="selected.fromPrepTitle"> · {{ selected.fromPrepTitle }}</span>
        </p>
        <h2>{{ selected.title }}</h2>
        <p v-if="selected.replacedByTitle" class="muted">Antes: {{ selected.replacedByTitle }}</p>
        <p class="muted">{{ selected.nutritionNote?.summary }}</p>
        <p v-if="selected.nutritionNote" class="muted" style="font-size: 0.85rem">
          Prot: {{ selected.nutritionNote.protein || '—' }} ·
          Veg: {{ selected.nutritionNote.vegetables || '—' }} ·
          Carb: {{ selected.nutritionNote.carbs || '—' }}
        </p>

        <h3>Acciones</h3>
        <div class="chips">
          <button class="btn ghost" @click="act(selected, 'accept')">Aceptar</button>
          <button class="btn ghost" @click="act(selected, 'set_status', { status: 'consumed' })">Consumida</button>
          <button class="btn ghost" @click="act(selected, 'postpone')">Posponer</button>
          <button class="btn ghost" @click="act(selected, 'save_next_week')">Próxima semana</button>
          <button class="btn ghost" @click="act(selected, 'replace')">Cambiar esta comida</button>
          <button class="btn ghost" @click="act(selected, 'clear_day')">Dejar sin plan</button>
          <button class="btn ghost" @click="act(selected, 'reject', { rejectReason: 'No me apetece' })">Rechazar</button>
        </div>
        <div class="field" style="margin-top: 0.75rem">
          <label>Mover a otro día</label>
          <div class="field-row">
            <select v-model="moveDay">
              <option v-for="d in DAYS" :key="d" :value="d">{{ d }}</option>
            </select>
            <button class="btn" @click="act(selected, 'move_day', { targetDay: moveDay })">Mover</button>
          </div>
        </div>
        <div class="field">
          <label>Hoy comí otra cosa</label>
          <div class="field-row">
            <input v-model="ateOther" placeholder="Pasta con tomate" />
            <button class="btn ghost" @click="act(selected, 'ate_other', { ateOtherTitle: ateOther })">Guardar</button>
          </div>
        </div>

        <h3>Receta</h3>
        <template v-if="selected.recipe">
          <p class="muted">
            {{ selected.recipe.servings }} raciones · {{ selected.recipe.totalMinutes }} min ·
            {{ selected.recipe.difficulty }}
          </p>
          <p><strong>En despensa:</strong> {{ selected.recipe.pantryIngredientNames.join(', ') || '—' }}</p>
          <p><strong>Falta comprar:</strong> {{ selected.recipe.missingIngredientNames.join(', ') || '—' }}</p>
          <p><strong>Utensilios:</strong> {{ selected.recipe.tools.join(', ') }}</p>
          <ol>
            <li v-for="(step, i) in selected.recipe.steps" :key="i">{{ step }}</li>
          </ol>
          <p class="muted">{{ selected.recipe.tips.join(' · ') }}</p>
          <p class="muted">
            Conservación: {{ selected.recipe.fridgeDays }} días nevera.
            <span v-if="selected.recipe.freezable"> Congelable. {{ selected.recipe.freezeNotes }}</span>
          </p>
          <p class="muted">Descongelar: {{ selected.recipe.thawNotes }} · Recalentar: {{ selected.recipe.reheatNotes }}</p>
        </template>
        <p v-else class="muted">Sin receta aún.</p>

        <div class="chips" style="margin-top: 0.75rem">
          <button class="btn" @click="recipeMode('regenerate')">Regenerar receta</button>
          <button class="btn ghost" @click="recipeMode('faster')">Más rápida</button>
          <button class="btn ghost" @click="recipeMode('cheaper')">Más económica</button>
          <button class="btn ghost" @click="recipeMode('pantry_fit')">Ajustar a despensa</button>
          <button class="btn ghost" @click="favoriteRecipe">Favorita</button>
        </div>
        <div class="cook-action">
          <button class="btn block" @click="cookSelected">Marcar como cocinado</button>
          <p class="muted">
            Úsalo cuando ya hayas hecho el plato: se marca como hecho y se restan los ingredientes de la despensa.
          </p>
        </div>
        <div class="grid2" style="margin-top: 0.75rem">
          <div class="field"><label>Sustituir de</label><input v-model="replaceIngredientFrom" /></div>
          <div class="field"><label>Por</label><input v-model="replaceIngredientTo" /></div>
        </div>
        <button
          class="btn ghost block"
          :disabled="!replaceIngredientFrom || !replaceIngredientTo"
          @click="recipeMode('regenerate')"
        >
          Aplicar sustitución de ingrediente
        </button>
      </div>
    </div>

    <Teleport to="body">
      <div
        v-if="showQuestionnaire"
        class="modal-backdrop questionnaire-backdrop"
        @click.self="showQuestionnaire = false"
      >
        <div
          class="questionnaire-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="questionnaire-title"
        >
          <header class="questionnaire-head">
            <div>
              <p class="eyebrow">Menú</p>
              <h2 id="questionnaire-title">Cuestionario</h2>
            </div>
            <button
              class="btn-x"
              type="button"
              title="Cerrar"
              aria-label="Cerrar"
              @click="showQuestionnaire = false"
            >
              ×
            </button>
          </header>
          <MealQuestionnaireForm
            :initial="prefs"
            :loading="loading"
            :error="error"
            submit-label="Guardar"
            @save="savePrefs"
          />
        </div>
      </div>
    </Teleport>
  </main>
</template>

<style scoped>
.meals {
  min-width: 0;
  max-width: 100%;
  overflow-x: hidden;
  padding: 1.25rem 0 7.25rem;
}

.meals-head {
  flex-direction: column;
  align-items: stretch;
}

.meals-toolbar {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
  min-width: 0;
  margin-bottom: 0.35rem;
}

.meals-toolbar .chip-scroll {
  min-width: 0;
  width: 100%;
  margin-bottom: 0;
}

.meals-generate {
  width: 100%;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  min-width: 0;
}
.chip-btn {
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text);
  border-radius: 999px;
  padding: 0.35rem 0.7rem;
  cursor: pointer;
}
.chip-btn.on,
.btn.active {
  background: var(--accent-soft);
  border-color: var(--accent);
  color: var(--accent);
}
.other-goal {
  margin-top: 0.75rem;
}
.grid2 {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 0.6rem;
}
.check {
  display: flex;
  gap: 0.5rem;
  align-items: flex-start;
  margin: 0.4rem 0;
  color: var(--text-muted);
  min-width: 0;
}
.check input {
  flex-shrink: 0;
  margin-top: 0.15rem;
}
.field-row {
  display: flex;
  gap: 0.5rem;
  min-width: 0;
  align-items: center;
}
.field-row select,
.field-row input {
  flex: 1;
  min-width: 0;
  width: auto;
}
.field-row .btn {
  flex-shrink: 0;
}
.swipe-card h3 {
  font-size: 1.6rem;
  margin-top: 0.5rem;
}
.eyebrow {
  text-transform: uppercase;
  letter-spacing: 0.12em;
  font-size: 0.72rem;
  color: var(--accent);
}
.meal-row {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  align-items: center;
  padding: 0.75rem 0;
  border-bottom: 1px solid var(--border);
  cursor: pointer;
}
.meal-row:last-child {
  border-bottom: 0;
}
.plan-tab {
  margin-top: 1rem;
}

.week-label {
  margin: 0 0 0.75rem;
  color: var(--text-muted);
  font-size: 0.85rem;
}

.week-strip {
  display: flex;
  gap: 0.45rem;
  overflow-x: auto;
  padding: 0.1rem 0.05rem 0.35rem;
  margin: 0 -0.15rem 0.35rem;
  scrollbar-width: none;
  -webkit-overflow-scrolling: touch;
}

.week-strip::-webkit-scrollbar {
  display: none;
}

.week-day {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.42rem;
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  user-select: none;
}

.week-day-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.18rem;
  width: 3.45rem;
  height: 4.05rem;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.07);
  border: 1px solid rgba(255, 255, 255, 0.22);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.1);
  transition: background 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease, color 0.18s ease;
}

.week-day-name {
  font-size: 0.68rem;
  font-weight: 650;
  letter-spacing: 0.02em;
  color: var(--text-muted);
}

.week-day-num {
  font-size: 1.22rem;
  font-weight: 750;
  letter-spacing: -0.04em;
  line-height: 1;
}

.week-day.on .week-day-card {
  background: var(--accent);
  border-color: transparent;
  color: var(--on-accent);
  box-shadow: 0 8px 22px var(--accent-glow);
}

.week-day.on .week-day-name,
.week-day.on .week-day-num {
  color: var(--on-accent);
}

.week-day.today .week-day-card {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent-ring), inset 0 1px 0 rgba(255, 255, 255, 0.1);
}

.week-day-dot {
  width: 1.7rem;
  height: 1.7rem;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.38);
}

.week-day-dot svg {
  width: 0.92rem;
  height: 0.92rem;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.9;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.week-day-dot.planned {
  background: var(--surface-solid);
  color: #fff;
}

.week-day-dot.partial {
  background: var(--accent-soft);
  color: var(--accent);
}

.week-day-dot.done {
  background: var(--accent);
  color: var(--on-accent);
}

.day-kicker {
  margin-top: 0.55rem;
}

.day-kicker h2 {
  text-transform: capitalize;
  font-size: 1.35rem;
  letter-spacing: -0.03em;
}

.day-count {
  display: inline-flex;
  align-items: center;
  min-height: 1.5rem;
  padding: 0.12rem 0.55rem;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  color: var(--text-muted);
  font-size: 0.78rem;
  font-weight: 650;
}

.day-empty {
  margin-top: 0.65rem;
}

.meal-card {
  cursor: pointer;
  grid-template-columns: auto minmax(0, 1fr) auto;
}

.meal-card.done {
  opacity: 0.78;
}

.meal-slot {
  width: 2.55rem;
  height: 2.55rem;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: var(--surface-solid);
  color: #fff;
  flex-shrink: 0;
}

.meal-slot svg {
  width: 1.15rem;
  height: 1.15rem;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.meal-copy {
  min-width: 0;
}

.meal-copy strong {
  display: block;
  font-size: 0.95rem;
}

.meal-copy .muted {
  margin: 0.22rem 0 0;
  font-size: 0.82rem;
}

.meal-slot-label {
  display: block;
  margin-bottom: 0.12rem;
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--accent);
}

.meal-origin {
  display: inline-flex;
  align-items: center;
  margin-top: 0.4rem;
  padding: 0.14rem 0.5rem;
  border-radius: 999px;
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.02em;
}

.meal-origin.batch {
  background: var(--accent-soft);
  color: var(--accent);
}

.meal-origin.today {
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.82);
}

.prep-feeds {
  margin: 0.35rem 0 0;
  font-size: 0.78rem;
}

.drawer-panel .meal-origin {
  margin: 0.45rem 0 0.35rem;
}

.swipe-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.55rem;
  margin-top: 1rem;
}

.swipe-actions .btn {
  min-height: 2.7rem;
}

.cook-action {
  margin-top: 1rem;
}

.cook-action .muted {
  margin: 0.45rem 0 0;
  font-size: 0.82rem;
}

.batch-day-title {
  margin: 1.2rem 0 0.4rem;
}

.questionnaire-backdrop {
  z-index: 80;
  align-items: start;
  padding: 1rem 1rem calc(1.2rem + var(--safe-bottom));
}

.questionnaire-modal {
  width: min(560px, 100%);
  max-height: min(88vh, 880px);
  overflow: auto;
  margin: auto;
  background: var(--surface-solid);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  padding: 1.1rem 1.15rem 1.35rem;
}

.questionnaire-head {
  position: sticky;
  top: 0;
  z-index: 1;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
  margin: -0.15rem 0 0.85rem;
  padding-bottom: 0.65rem;
  background: var(--surface-solid);
}

.questionnaire-head h2 {
  margin: 0.15rem 0 0;
  font-size: 1.35rem;
}

.btn-x {
  width: 2rem;
  height: 2rem;
  flex-shrink: 0;
  border: 0;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.28);
  color: #fff;
  font-size: 1.35rem;
  line-height: 1;
  cursor: pointer;
  display: grid;
  place-items: center;
  padding: 0;
}

.btn-x:hover {
  color: var(--accent);
  background: rgba(240, 138, 28, 0.18);
}

.meal-check {
  width: 1.7rem;
  height: 1.7rem;
  border-radius: 50%;
  display: grid;
  place-items: center;
  border: 1.5px solid rgba(255, 255, 255, 0.28);
  color: transparent;
  flex-shrink: 0;
}

.meal-check.on {
  background: var(--accent);
  border-color: transparent;
  color: var(--on-accent);
}

.meal-check svg {
  width: 0.92rem;
  height: 0.92rem;
  fill: none;
  stroke: currentColor;
  stroke-width: 2.2;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.drawer {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  z-index: 30;
  display: grid;
  place-items: end center;
}
.drawer-panel {
  width: min(720px, 100%);
  max-height: 92vh;
  overflow: auto;
  background: var(--surface-solid);
  border-radius: var(--radius) var(--radius) 0 0;
  padding: 1rem 1rem 2rem;
  border: 1px solid var(--border);
  animation: fadeUp 0.25s ease;
}
@media (min-width: 640px) {
  .meals-toolbar {
    flex-direction: row;
    align-items: center;
  }

  .meals-generate {
    width: auto;
    flex-shrink: 0;
  }

  .grid2 {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .week-strip {
    justify-content: space-between;
  }

  .week-day-card {
    width: 4.15rem;
    height: 4.55rem;
    border-radius: 20px;
  }

  .week-day-num {
    font-size: 1.35rem;
  }
}

@media (min-width: 800px) {
  .drawer {
    place-items: center;
  }
  .drawer-panel {
    border-radius: var(--radius);
    max-height: 85vh;
  }
}
</style>

<style>
.questionnaire-backdrop.modal-backdrop {
  z-index: 80;
  align-items: start;
  padding: 1rem 1rem calc(1.2rem + env(safe-area-inset-bottom, 0px));
}
.questionnaire-modal {
  width: min(560px, 100%);
  max-height: min(88vh, 880px);
  overflow: auto;
  margin: auto;
  background: var(--surface-solid);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  padding: 1.1rem 1.15rem 1.35rem;
}
.questionnaire-head {
  position: sticky;
  top: 0;
  z-index: 1;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
  margin: -0.15rem 0 0.85rem;
  padding-bottom: 0.65rem;
  background: var(--surface-solid);
}
.questionnaire-head h2 {
  margin: 0.15rem 0 0;
  font-size: 1.35rem;
}
.questionnaire-head .btn-x {
  width: 2rem;
  height: 2rem;
  flex-shrink: 0;
  border: 0;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.28);
  color: #fff;
  font-size: 1.35rem;
  line-height: 1;
  cursor: pointer;
  display: grid;
  place-items: center;
  padding: 0;
}
.questionnaire-head .btn-x:hover {
  color: var(--accent);
  background: rgba(240, 138, 28, 0.18);
}
</style>
