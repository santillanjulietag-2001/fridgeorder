<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import {
  DIET_STYLES,
  NUTRITION_GOALS,
  type DietStyle,
  type NutritionGoal,
} from '@fridgeorder/shared';

export interface QuestionnaireSeed {
  goals?: NutritionGoal[];
  otherGoal?: string;
  dietStyle?: DietStyle;
  adults?: number;
  children?: number;
  portions?: number;
  allergies?: string[];
  forbiddenIngredients?: string[];
  restrictions?: string[];
  cookDays?: string[];
  cookTimeMinutes?: number;
  weeklyBudgetEur?: number;
  dislikedIngredients?: string[];
  favoriteIngredients?: string[];
  preferredCuisines?: string[];
  spiceLevel?: number;
  preferQuickMeals?: boolean;
  preferTraditional?: boolean;
  disclaimerAccepted?: boolean;
}

export interface QuestionnairePayload {
  goals: NutritionGoal[];
  otherGoal: string;
  dietStyle: DietStyle;
  adults: number;
  children: number;
  portions: number;
  allergies: string[];
  forbiddenIngredients: string[];
  restrictions: string[];
  cookDays: string[];
  cookTimeMinutes: number;
  weeklyBudgetEur: number;
  dislikedIngredients: string[];
  favoriteIngredients: string[];
  preferredCuisines: string[];
  spiceLevel: number;
  preferQuickMeals: boolean;
  preferTraditional: boolean;
  disclaimerAccepted: boolean;
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
  other: 'Otro',
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

const DAYS = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];

const props = withDefaults(
  defineProps<{
    initial?: QuestionnaireSeed | null;
    loading?: boolean;
    error?: string;
    submitLabel?: string;
  }>(),
  {
    initial: null,
    loading: false,
    error: '',
    submitLabel: 'Guardar',
  }
);

const emit = defineEmits<{
  save: [payload: QuestionnairePayload];
}>();

const otherGoalInput = ref<HTMLInputElement | null>(null);
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
  otherGoal: '',
});

const otherRequired = computed(
  () => form.value.goals.includes('other') && !form.value.otherGoal.trim()
);
const canSubmit = computed(
  () =>
    form.value.disclaimerAccepted &&
    form.value.goals.length > 0 &&
    form.value.cookDays.length > 0 &&
    !otherRequired.value
);

function splitList(text: string) {
  return text
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function applyInitial(seed: QuestionnaireSeed | null | undefined) {
  if (!seed) return;
  form.value.goals = (seed.goals?.length ? seed.goals : ['balanced']) as NutritionGoal[];
  form.value.otherGoal = seed.otherGoal || '';
  form.value.dietStyle = seed.dietStyle || 'mediterranean';
  form.value.adults = seed.adults ?? 2;
  form.value.children = seed.children ?? 0;
  form.value.portions = seed.portions ?? 2;
  form.value.allergiesText = (seed.allergies || []).join(', ');
  form.value.forbiddenText = (seed.forbiddenIngredients || []).join(', ');
  form.value.restrictionsText = (seed.restrictions || []).join(', ');
  form.value.cookDays = seed.cookDays?.length ? [...seed.cookDays] : form.value.cookDays;
  form.value.cookTimeMinutes = seed.cookTimeMinutes || 45;
  form.value.weeklyBudgetEur = seed.weeklyBudgetEur ?? 80;
  form.value.dislikedText = (seed.dislikedIngredients || []).join(', ');
  form.value.favoriteText = (seed.favoriteIngredients || []).join(', ');
  form.value.cuisinesText = (seed.preferredCuisines || []).join(', ') || form.value.cuisinesText;
  form.value.spiceLevel = seed.spiceLevel ?? 1;
  form.value.preferQuickMeals = seed.preferQuickMeals ?? true;
  form.value.preferTraditional = seed.preferTraditional ?? true;
  form.value.disclaimerAccepted = seed.disclaimerAccepted || false;
}

watch(() => props.initial, applyInitial, { immediate: true });

function toggleGoal(g: NutritionGoal) {
  if (form.value.goals.includes(g)) {
    form.value.goals = form.value.goals.filter((x) => x !== g);
    return;
  }
  form.value.goals = [...form.value.goals, g];
  if (g === 'other') nextTick(() => otherGoalInput.value?.focus());
}

function toggleCookDay(d: string) {
  if (form.value.cookDays.includes(d)) {
    form.value.cookDays = form.value.cookDays.filter((x) => x !== d);
  } else {
    form.value.cookDays = [...form.value.cookDays, d];
  }
}

function submit() {
  if (!canSubmit.value || props.loading) return;
  emit('save', {
    goals: form.value.goals,
    otherGoal: form.value.goals.includes('other') ? form.value.otherGoal.trim() : '',
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
  });
}
</script>

<template>
  <form class="q-form" @submit.prevent="submit">
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
    <div v-if="form.goals.includes('other')" class="field other-goal">
      <label for="other-goal">Tu objetivo</label>
      <input
        id="other-goal"
        ref="otherGoalInput"
        v-model="form.otherGoal"
        type="text"
        maxlength="200"
        placeholder="Ej. más pescado, cenas ligeras, comida para llevar…"
      />
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
      <button
        v-for="d in DAYS"
        :key="d"
        type="button"
        class="chip-btn"
        :class="{ on: form.cookDays.includes(d) }"
        @click="toggleCookDay(d)"
      >
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

    <p v-if="error" class="q-error">{{ error }}</p>
    <button class="btn block q-submit" type="submit" :disabled="loading || !canSubmit">
      {{ loading ? 'Guardando…' : submitLabel }}
    </button>
  </form>
</template>

<style scoped>
.q-form h3 {
  margin: 0.85rem 0 0.55rem;
  font-size: 1rem;
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

.chip-btn.on {
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

.q-error {
  margin: 0.65rem 0 0;
  color: var(--accent);
  font-size: 0.85rem;
}

.q-submit {
  margin-top: 1rem;
}

@media (min-width: 640px) {
  .grid2 {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
