<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { api } from '@/api/client';
import {
  DIET_STYLES,
  NUTRITION_GOALS,
  type DietStyle,
  type MealRating,
  type NutritionGoal,
} from '@fridgeorder/shared';

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
}

interface Prep {
  _id: string;
  title: string;
  whenLabel: string;
  durationMinutes?: number;
  ingredients: string[];
  freezable: boolean;
  storageNotes: string;
}

interface MealPlan {
  _id: string;
  weekStart: string;
  meals: Meal[];
  preps: Prep[];
}

interface Preferences {
  onboardingCompleted: boolean;
  goals: NutritionGoal[];
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

const GOAL_LABELS: Record<string, string> = {
  balanced: 'Comer más equilibrado',
  lose_weight: 'Bajar de peso',
  maintain: 'Mantener el peso',
  gain_muscle: 'Aumentar masa muscular',
  save_money: 'Ahorrar dinero',
  cook_faster: 'Cocinar más rápido',
  use_food_better: 'Aprovechar mejor los alimentos',
  reduce_waste: 'Reducir desperdicios',
  more_variety: 'Mejorar la variedad',
};

const DIET_LABELS: Record<string, string> = {
  general: 'Alimentación general',
  mediterranean: 'Mediterránea',
  vegetarian: 'Vegetariana',
  vegan: 'Vegana',
  high_protein: 'Alta en proteínas',
  low_carb: 'Baja en carbohidratos',
  gluten_free: 'Sin gluten',
  lactose_free: 'Sin lactosa',
  other: 'Otra',
};

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
const RATING_ACTIONS: { rating: MealRating; label: string }[] = [
  { rating: 'like', label: 'Me gusta' },
  { rating: 'dislike', label: 'No' },
  { rating: 'maybe', label: 'Tal vez' },
  { rating: 'want_to_try', label: 'Probar' },
  { rating: 'tried', label: 'Ya lo probé' },
  { rating: 'never_again', label: 'Nunca más' },
  { rating: 'like_with_changes', label: 'Con cambios' },
];

type Tab = 'plan' | 'prefs' | 'swipe' | 'batch';

const tab = ref<Tab>('plan');
const plan = ref<MealPlan | null>(null);
const prefs = ref<Preferences | null>(null);
const dishes = ref<DishCard[]>([]);
const dishIndex = ref(0);
const batch = ref<BatchSession | null>(null);
const selected = ref<Meal | null>(null);
const loading = ref(false);
const error = ref('');
const message = ref('');
const moveDay = ref('jueves');
const ateOther = ref('');
const replaceIngredientFrom = ref('');
const replaceIngredientTo = ref('');

const form = ref({
  goals: ['balanced'] as NutritionGoal[],
  dietStyle: 'mediterranean' as DietStyle,
  adults: 2,
  children: 0,
  portions: 2,
  allergiesText: '',
  forbiddenText: '',
  restrictionsText: '',
  cookDays: ['lunes', 'martes', 'miercoles', 'jueves', 'viernes'] as string[],
  cookTimeMinutes: 45,
  weeklyBudgetEur: 80,
  dislikedText: '',
  favoriteText: '',
  cuisinesText: 'mediterránea, española',
  spiceLevel: 1,
  preferQuickMeals: true,
  preferTraditional: true,
  disclaimerAccepted: false,
});

const currentDish = computed(() => dishes.value[dishIndex.value] || null);
const visibleMeals = computed(() =>
  (plan.value?.meals || []).filter((m) => !['rejected', 'saved_for_next_week'].includes(m.status))
);
const mealsByDay = computed(() => {
  const map: Record<string, Meal[]> = Object.fromEntries(DAYS.map((d) => [d, []]));
  for (const m of visibleMeals.value) {
    (map[m.day] || (map[m.day] = [])).push(m);
  }
  return map;
});

function splitList(text: string) {
  return text
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

async function load() {
  error.value = '';
  try {
    const data = await api<{ plan: MealPlan | null; preferences: Preferences }>('/meals/current');
    plan.value = data.plan;
    prefs.value = data.preferences;
    if (!data.preferences?.onboardingCompleted) tab.value = 'prefs';
    else if ((data.preferences.swipes?.length || 0) < 5 && !data.plan) tab.value = 'swipe';
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Error al cargar';
  }
}

async function savePrefs() {
  loading.value = true;
  error.value = '';
  try {
    const data = await api<{ preferences: Preferences }>('/meals/preferences', {
      method: 'PUT',
      body: JSON.stringify({
        onboardingCompleted: true,
        goals: form.value.goals,
        dietStyle: form.value.dietStyle,
        adults: form.value.adults,
        children: form.value.children,
        portions: form.value.portions,
        allergies: splitList(form.value.allergiesText),
        forbiddenIngredients: splitList(form.value.forbiddenText),
        restrictions: splitList(form.value.restrictionsText),
        cookDays: form.value.cookDays,
        cookTimeMinutes: form.value.cookTimeMinutes,
        weeklyBudgetEur: form.value.weeklyBudgetEur,
        dislikedIngredients: splitList(form.value.dislikedText),
        favoriteIngredients: splitList(form.value.favoriteText),
        preferredCuisines: splitList(form.value.cuisinesText),
        spiceLevel: form.value.spiceLevel,
        preferQuickMeals: form.value.preferQuickMeals,
        preferTraditional: form.value.preferTraditional,
        disclaimerAccepted: form.value.disclaimerAccepted,
      }),
    });
    prefs.value = data.preferences;
    message.value = 'Preferencias guardadas';
    tab.value = 'swipe';
    await loadSwipes();
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
    message.value = 'Plan generado con recetas, equilibrio y preparaciones.';
    tab.value = 'plan';
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
  message.value = 'Marcada como preparada y descontada de despensa';
}

async function favoriteRecipe() {
  if (!plan.value || !selected.value) return;
  await api(`/meals/${plan.value._id}/meals/${selected.value._id}/favorite-recipe`, {
    method: 'POST',
    body: '{}',
  });
  message.value = 'Receta guardada como favorita';
}

async function loadBatch() {
  if (!plan.value) return;
  loading.value = true;
  try {
    const data = await api<{ batch: BatchSession }>(`/meals/${plan.value._id}/batch`);
    batch.value = data.batch;
    tab.value = 'batch';
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'No hay batch';
  } finally {
    loading.value = false;
  }
}

function toggleGoal(g: NutritionGoal) {
  if (form.value.goals.includes(g)) form.value.goals = form.value.goals.filter((x) => x !== g);
  else form.value.goals = [...form.value.goals, g];
}

function toggleCookDay(d: string) {
  if (form.value.cookDays.includes(d)) form.value.cookDays = form.value.cookDays.filter((x) => x !== d);
  else form.value.cookDays = [...form.value.cookDays, d];
}

onMounted(async () => {
  await load();
  if (prefs.value) {
    form.value.goals = (prefs.value.goals?.length ? prefs.value.goals : ['balanced']) as NutritionGoal[];
    form.value.dietStyle = prefs.value.dietStyle || 'mediterranean';
    form.value.adults = prefs.value.adults || 2;
    form.value.children = prefs.value.children || 0;
    form.value.portions = prefs.value.portions || 2;
    form.value.allergiesText = (prefs.value.allergies || []).join(', ');
    form.value.forbiddenText = (prefs.value.forbiddenIngredients || []).join(', ');
    form.value.restrictionsText = (prefs.value.restrictions || []).join(', ');
    form.value.cookDays = prefs.value.cookDays?.length ? prefs.value.cookDays : form.value.cookDays;
    form.value.cookTimeMinutes = prefs.value.cookTimeMinutes || 45;
    form.value.weeklyBudgetEur = prefs.value.weeklyBudgetEur || 80;
    form.value.dislikedText = (prefs.value.dislikedIngredients || []).join(', ');
    form.value.favoriteText = (prefs.value.favoriteIngredients || []).join(', ');
    form.value.cuisinesText = (prefs.value.preferredCuisines || []).join(', ') || form.value.cuisinesText;
    form.value.spiceLevel = prefs.value.spiceLevel ?? 1;
    form.value.preferQuickMeals = prefs.value.preferQuickMeals ?? true;
    form.value.preferTraditional = prefs.value.preferTraditional ?? true;
    form.value.disclaimerAccepted = prefs.value.disclaimerAccepted || false;
  }
  if (tab.value === 'swipe') await loadSwipes();
});
</script>

<template>
  <main class="container fade-in" style="padding: 1.25rem 0 6rem">
    <header class="page-header" style="flex-wrap: wrap">
      <div>
        <h1 class="page-title">Plan de comidas</h1>
        <p class="muted" style="margin: 0.25rem 0 0">Cuestionario, gustos, calendario flexible, recetas y batch cooking.</p>
      </div>
      <div style="display: flex; gap: 0.4rem; flex-wrap: wrap">
        <button class="btn ghost" :class="{ active: tab === 'prefs' }" @click="tab = 'prefs'">Cuestionario</button>
        <button class="btn ghost" :class="{ active: tab === 'swipe' }" @click="tab = 'swipe'; loadSwipes()">Gustos</button>
        <button class="btn ghost" :class="{ active: tab === 'plan' }" @click="tab = 'plan'">Calendario</button>
        <button class="btn ghost" :disabled="!plan" @click="loadBatch">Batch</button>
        <button class="btn" :disabled="loading" @click="generate">{{ loading ? '…' : 'Generar plan' }}</button>
      </div>
    </header>

    <p v-if="error" class="diff-bad">{{ error }}</p>
    <p v-if="message" class="diff-ok">{{ message }}</p>
    <p class="muted" style="font-size: 0.8rem; margin-top: 0.5rem">
      La info nutricional es orientativa y no sustituye el consejo de un médico o nutricionista.
    </p>

    <!-- CUESTIONARIO -->
    <section v-if="tab === 'prefs'" class="panel" style="margin-top: 1rem">
      <h2>Cuestionario inicial</h2>
      <h3>Objetivo principal</h3>
      <div class="chips">
        <button
          v-for="g in NUTRITION_GOALS"
          :key="g"
          type="button"
          class="chip-btn"
          :class="{ on: form.goals.includes(g) }"
          @click="toggleGoal(g)"
        >
          {{ GOAL_LABELS[g] || g }}
        </button>
      </div>

      <div class="field" style="margin-top: 1rem">
        <label>Estilo de alimentación</label>
        <select v-model="form.dietStyle">
          <option v-for="d in DIET_STYLES" :key="d" :value="d">{{ DIET_LABELS[d] || d }}</option>
        </select>
      </div>

      <div class="grid2">
        <div class="field"><label>Adultos</label><input v-model.number="form.adults" type="number" min="0" /></div>
        <div class="field"><label>Niños</label><input v-model.number="form.children" type="number" min="0" /></div>
        <div class="field"><label>Porciones</label><input v-model.number="form.portions" type="number" min="1" /></div>
        <div class="field"><label>Tiempo cocina (min)</label><input v-model.number="form.cookTimeMinutes" type="number" min="5" /></div>
        <div class="field"><label>Presupuesto semanal €</label><input v-model.number="form.weeklyBudgetEur" type="number" min="0" /></div>
        <div class="field"><label>Picante (0-5)</label><input v-model.number="form.spiceLevel" type="number" min="0" max="5" /></div>
      </div>

      <h3>Días que cocinas</h3>
      <div class="chips">
        <button v-for="d in DAYS" :key="d" type="button" class="chip-btn" :class="{ on: form.cookDays.includes(d) }" @click="toggleCookDay(d)">
          {{ d }}
        </button>
      </div>

      <div class="field"><label>Alergias</label><input v-model="form.allergiesText" placeholder="gluten, frutos secos…" /></div>
      <div class="field"><label>Ingredientes prohibidos</label><input v-model="form.forbiddenText" /></div>
      <div class="field"><label>Restricciones</label><input v-model="form.restrictionsText" /></div>
      <div class="field"><label>No me gustan</label><input v-model="form.dislikedText" /></div>
      <div class="field"><label>Favoritos</label><input v-model="form.favoriteText" /></div>
      <div class="field"><label>Cocinas preferidas</label><input v-model="form.cuisinesText" /></div>

      <label class="check"><input v-model="form.preferQuickMeals" type="checkbox" /> Prefiero comidas rápidas</label>
      <label class="check"><input v-model="form.preferTraditional" type="checkbox" /> Prefiero platos tradicionales</label>
      <label class="check"><input v-model="form.disclaimerAccepted" type="checkbox" /> Entiendo que esto no sustituye consejo médico</label>

      <button class="btn block" style="margin-top: 1rem" :disabled="loading || !form.disclaimerAccepted" @click="savePrefs">
        Guardar y seguir a gustos
      </button>
    </section>

    <!-- TINDER -->
    <section v-else-if="tab === 'swipe'" class="panel swipe-card" style="margin-top: 1rem">
      <h2>¿Qué te apetece?</h2>
      <template v-if="currentDish">
        <p class="eyebrow">{{ (currentDish.tags || []).join(' · ') }}</p>
        <h3>{{ currentDish.title }}</h3>
        <p class="muted">{{ currentDish.summary }}</p>
        <div class="chips" style="margin-top: 1rem">
          <button v-for="a in RATING_ACTIONS" :key="a.rating" class="btn ghost" type="button" @click="swipe(a.rating)">
            {{ a.label }}
          </button>
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
    <section v-else-if="tab === 'plan'" style="margin-top: 1rem">
      <p v-if="plan" class="muted">Semana del {{ plan.weekStart }}</p>
      <section v-if="!plan" class="panel">
        <p class="muted">Aún no hay menú. Completa gustos y pulsa Generar plan.</p>
      </section>

      <template v-for="day in DAYS" :key="day">
        <div v-if="mealsByDay[day]?.length" class="panel" style="margin-top: 0.7rem">
          <h3 style="text-transform: capitalize">{{ day }}</h3>
          <div v-for="meal in mealsByDay[day]" :key="meal._id" class="meal-row" @click="selected = meal">
            <div>
              <div class="chip">{{ meal.slot }} · {{ STATUS_LABELS[meal.status] || meal.status }}</div>
              <strong>{{ meal.title }}</strong>
              <p class="muted" style="margin: 0.25rem 0 0; font-size: 0.85rem">
                {{ meal.nutritionNote?.summary || meal.ingredients.slice(0, 4).join(', ') }}
              </p>
            </div>
            <span class="muted">›</span>
          </div>
        </div>
      </template>

      <section v-if="plan?.preps?.length" class="panel" style="margin-top: 0.8rem">
        <h3>Preparaciones anticipadas</h3>
        <div v-for="p in plan.preps" :key="p._id" class="list-item">
          <div class="chip">{{ p.whenLabel }}</div>
          <div>
            <strong>{{ p.title }}</strong>
            <div class="muted" style="font-size: 0.85rem">
              {{ p.durationMinutes || '—' }} min · {{ p.ingredients.join(', ') }}
              <span v-if="p.freezable"> · congelable</span>
            </div>
            <div class="muted" style="font-size: 0.8rem">{{ p.storageNotes }}</div>
          </div>
          <span />
        </div>
      </section>
    </section>

    <!-- BATCH -->
    <section v-else-if="tab === 'batch'" class="panel" style="margin-top: 1rem">
      <h2>Modo batch cooking</h2>
      <p v-if="!batch" class="muted">Genera un plan con preparaciones y vuelve a abrir Batch.</p>
      <template v-else>
        <p><strong>Tiempo total estimado:</strong> {{ batch.totalMinutes }} min</p>
        <ol>
          <li v-for="s in batch.steps" :key="s.order">
            {{ s.task }}
            <span class="muted">({{ s.minutes || '?' }} min)</span>
            <span v-if="s.parallelWith?.length" class="chip">paralelo con {{ s.parallelWith.join(',') }}</span>
          </li>
        </ol>
        <p><strong>Recipientes:</strong> {{ batch.containers.join(', ') }}</p>
        <p><strong>Heladera:</strong> {{ batch.fridge.join(', ') || '—' }}</p>
        <p><strong>Congelador:</strong> {{ batch.freezer.join(', ') || '—' }}</p>
        <p><strong>Consumir primero:</strong> {{ batch.eatFirst.join(', ') || '—' }}</p>
      </template>
    </section>

    <!-- DETALLE COMIDA -->
    <div v-if="selected" class="drawer">
      <div class="drawer-panel">
        <button class="btn ghost" style="float: right" @click="selected = null">Cerrar</button>
        <div class="chip">{{ selected.day }} · {{ selected.slot }} · {{ STATUS_LABELS[selected.status] }}</div>
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
          <div style="display: flex; gap: 0.5rem">
            <select v-model="moveDay">
              <option v-for="d in DAYS" :key="d" :value="d">{{ d }}</option>
            </select>
            <button class="btn" @click="act(selected, 'move_day', { targetDay: moveDay })">Mover</button>
          </div>
        </div>
        <div class="field">
          <label>Hoy comí otra cosa</label>
          <div style="display: flex; gap: 0.5rem">
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
          <button class="btn ghost" @click="cookSelected">Cociné esto</button>
          <button class="btn ghost" @click="favoriteRecipe">Favorita</button>
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
  </main>
</template>

<style scoped>
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
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
.grid2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.6rem;
}
.check {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  margin: 0.4rem 0;
  color: var(--text-muted);
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
  border-radius: 18px 18px 0 0;
  padding: 1rem 1rem 2rem;
  border: 1px solid var(--border);
  animation: fadeUp 0.25s ease;
}
@media (min-width: 800px) {
  .drawer {
    place-items: center;
  }
  .drawer-panel {
    border-radius: 18px;
    max-height: 85vh;
  }
}
</style>
