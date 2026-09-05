<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { api } from '@/api/client';
import { fileToCompressedDataUrl } from '@/utils/image';

interface RecipeBody {
  servings?: number;
  steps?: string[];
  totalMinutes?: number;
  difficulty?: string;
  tools?: string[];
  tips?: string[];
}

interface SavedRecipe {
  _id: string;
  title: string;
  explanation: string;
  ingredients: string[];
  recipe?: RecipeBody;
  nutritionSummary: string;
  favorite: boolean;
  cookedCount: number;
  rating?: number;
  photos: { dataUrl: string; at: string }[];
}

interface DailyRecipe {
  _id: string;
  title: string;
  explanation: string;
  ingredients: string[];
  recipe?: RecipeBody;
  nutritionSummary: string;
}

const route = useRoute();
const isDaily = computed(() => route.name === 'recipe-today');
const recipes = ref<SavedRecipe[]>([]);
const daily = ref<DailyRecipe | null>(null);
const favoritedDaily = ref(false);
const dailySavedId = ref('');
const openId = ref('');
const loading = ref(false);
const error = ref('');
const saving = ref(false);
const reviewing = ref(false);

const title = computed(() => (isDaily.value ? 'Receta del día' : 'Recetas favoritas'));
const lead = computed(() =>
  isDaily.value
    ? 'Una sugerencia distinta cada día. Puedes guardarla en favoritas.'
    : 'Pulsa una receta para verla, puntuarla y añadir una foto.'
);

function openRecipe(item: SavedRecipe) {
  openId.value = openId.value === item._id ? '' : item._id;
}

function replaceRecipe(next: SavedRecipe) {
  const idx = recipes.value.findIndex((r) => r._id === next._id);
  if (idx >= 0) recipes.value[idx] = next;
}

async function loadList() {
  loading.value = true;
  error.value = '';
  try {
    const data = await api<{ recipes: SavedRecipe[] }>('/recipes');
    recipes.value = data.recipes || [];
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'No se pudieron cargar';
  } finally {
    loading.value = false;
  }
}

async function loadDaily() {
  loading.value = true;
  error.value = '';
  try {
    const data = await api<{ daily: DailyRecipe; favorited: boolean; savedId?: string }>('/recipes/daily');
    daily.value = data.daily;
    favoritedDaily.value = data.favorited;
    dailySavedId.value = data.savedId || '';
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'No hay receta hoy';
  } finally {
    loading.value = false;
  }
}

async function saveDaily() {
  if (!daily.value || saving.value) return;
  saving.value = true;
  error.value = '';
  try {
    const data = await api<{ recipe: { _id: string } }>('/recipes/daily/favorite', {
      method: 'POST',
      body: '{}',
    });
    favoritedDaily.value = true;
    dailySavedId.value = data.recipe?._id || '';
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'No se pudo guardar';
  } finally {
    saving.value = false;
  }
}

async function removeFavorite(id: string) {
  if (!id || saving.value) return;
  saving.value = true;
  error.value = '';
  try {
    await api(`/recipes/${id}/favorite`, { method: 'DELETE' });
    recipes.value = recipes.value.filter((r) => r._id !== id);
    if (openId.value === id) openId.value = '';
    if (dailySavedId.value === id) {
      favoritedDaily.value = false;
      dailySavedId.value = '';
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'No se pudo quitar';
  } finally {
    saving.value = false;
  }
}

async function rateRecipe(recipe: SavedRecipe, rating: number) {
  if (reviewing.value) return;
  reviewing.value = true;
  error.value = '';
  try {
    const data = await api<{ recipe: SavedRecipe }>(`/recipes/${recipe._id}/review`, {
      method: 'POST',
      body: JSON.stringify({ rating }),
    });
    replaceRecipe(data.recipe);
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'No se pudo guardar la nota';
  } finally {
    reviewing.value = false;
  }
}

async function onRecipePhoto(recipe: SavedRecipe, ev: Event) {
  const input = ev.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file?.type.startsWith('image/')) return;
  reviewing.value = true;
  error.value = '';
  try {
    const photoDataUrl = await fileToCompressedDataUrl(file, 720, 0.72);
    const data = await api<{ recipe: SavedRecipe }>(`/recipes/${recipe._id}/review`, {
      method: 'POST',
      body: JSON.stringify({ photoDataUrl }),
    });
    replaceRecipe(data.recipe);
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'No se pudo subir la foto';
  } finally {
    reviewing.value = false;
  }
}

watch(
  () => String(route.name),
  () => {
    openId.value = '';
    if (isDaily.value) loadDaily();
    else loadList();
  },
  { immediate: true }
);
</script>

<template>
  <main class="container fade-in recipes-page">
    <h1 class="page-title">{{ title }}</h1>
    <p class="muted page-lead">{{ lead }}</p>

    <p v-if="error" class="diff-bad">{{ error }}</p>
    <p v-else-if="loading" class="muted">Cargando…</p>

    <template v-if="isDaily && daily">
      <article class="panel recipe-card">
        <p class="muted recipe-kicker">Sugerencia de hoy</p>
        <h2>{{ daily.title }}</h2>
        <p>{{ daily.explanation }}</p>
        <p v-if="daily.nutritionSummary" class="muted">{{ daily.nutritionSummary }}</p>
        <p v-if="daily.recipe" class="muted">
          {{ daily.recipe.servings || 2 }} raciones
          <span v-if="daily.recipe.totalMinutes"> · {{ daily.recipe.totalMinutes }} min</span>
          <span v-if="daily.recipe.difficulty"> · {{ daily.recipe.difficulty }}</span>
        </p>
        <ol v-if="daily.recipe?.steps?.length">
          <li v-for="(step, i) in daily.recipe.steps" :key="i">{{ step }}</li>
        </ol>
        <button
          v-if="!favoritedDaily"
          class="btn block"
          type="button"
          :disabled="saving"
          @click="saveDaily"
        >
          {{ saving ? 'Guardando…' : 'Añadir a favoritas' }}
        </button>
        <button
          v-else
          class="btn ghost block"
          type="button"
          :disabled="saving || !dailySavedId"
          @click="removeFavorite(dailySavedId)"
        >
          {{ saving ? 'Quitando…' : 'Quitar de favoritas' }}
        </button>
      </article>
    </template>

    <template v-else-if="!isDaily">
      <p v-if="!loading && !recipes.length" class="muted">
        Aún no hay favoritas. Márcalas desde el menú o desde la receta del día.
      </p>

      <article
        v-for="item in recipes"
        :key="item._id"
        class="panel recipe-row"
        :class="{ open: openId === item._id }"
      >
        <div class="recipe-top">
          <button class="recipe-head" type="button" @click="openRecipe(item)">
            <img v-if="item.photos[0]" :src="item.photos[0].dataUrl" alt="" class="recipe-thumb" />
            <span v-else class="recipe-thumb empty" />
            <span class="recipe-copy">
              <strong>{{ item.title }}</strong>
              <em>{{ item.explanation || item.nutritionSummary || 'Pulsa para puntuar y añadir foto' }}</em>
              <span v-if="item.rating" class="muted">Nota {{ item.rating }}/5</span>
            </span>
          </button>
          <button
            class="recipe-remove"
            type="button"
            :disabled="saving"
            title="Quitar de favoritas"
            aria-label="Quitar de favoritas"
            @click="removeFavorite(item._id)"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="M4 7h16M9 7V5h6v2M8 7l1 12h6l1-12" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </button>
        </div>
        <div v-if="openId === item._id" class="recipe-body">
          <p v-if="item.explanation">{{ item.explanation }}</p>
          <p v-if="item.recipe" class="muted">
            {{ item.recipe.servings || 2 }} raciones
            <span v-if="item.recipe.totalMinutes"> · {{ item.recipe.totalMinutes }} min</span>
            <span v-if="item.recipe.difficulty"> · {{ item.recipe.difficulty }}</span>
          </p>
          <ol v-if="item.recipe?.steps?.length">
            <li v-for="(step, i) in item.recipe.steps" :key="i">{{ step }}</li>
          </ol>
          <p class="muted rate-label">Tu nota</p>
          <div class="rate-row">
            <button
              v-for="n in 5"
              :key="n"
              class="rate-btn"
              :class="{ on: (item.rating || 0) >= n }"
              type="button"
              :disabled="reviewing"
              :aria-label="`${n} de 5`"
              @click="rateRecipe(item, n)"
            >
              ★
            </button>
          </div>
          <div class="gallery-grid">
            <img v-for="(photo, i) in item.photos" :key="i" :src="photo.dataUrl" alt="" />
            <label class="gallery-add">
              {{ item.photos.length ? 'Otra foto' : 'Añadir foto' }}
              <input
                type="file"
                accept="image/*"
                capture="environment"
                class="sr-only-file"
                @change="onRecipePhoto(item, $event)"
              />
            </label>
          </div>
          <button
            class="btn ghost block remove-fav"
            type="button"
            :disabled="saving"
            @click="removeFavorite(item._id)"
          >
            {{ saving ? 'Quitando…' : 'Quitar de favoritas' }}
          </button>
        </div>
      </article>
    </template>
  </main>
</template>

<style scoped>
.recipes-page {
  padding-bottom: 7.5rem;
}

.recipe-card h2 {
  margin: 0.15rem 0 0.5rem;
}

.recipe-kicker {
  margin: 0;
  font-size: 0.78rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.recipe-row {
  padding: 0.7rem;
  margin-top: 0.65rem;
}

.recipe-top {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 0.35rem;
  align-items: center;
}

.recipe-head {
  display: grid;
  grid-template-columns: 4.4rem minmax(0, 1fr);
  gap: 0.7rem;
  align-items: center;
  width: 100%;
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.recipe-remove {
  width: 2.4rem;
  height: 2.4rem;
  flex-shrink: 0;
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.08);
  color: var(--text-muted);
  display: grid;
  place-items: center;
  cursor: pointer;
}

.recipe-remove svg {
  width: 1.15rem;
  height: 1.15rem;
}

.recipe-remove:disabled {
  opacity: 0.45;
}

.recipe-thumb {
  width: 4.4rem;
  height: 4.4rem;
  object-fit: cover;
  border-radius: 14px;
  background: rgba(0, 0, 0, 0.28);
}

.recipe-thumb.empty {
  display: block;
}

.recipe-copy {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  min-width: 0;
}

.recipe-copy em {
  font-style: normal;
  font-size: 0.82rem;
  color: var(--text-muted);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.recipe-body {
  margin-top: 0.7rem;
  padding-top: 0.55rem;
  border-top: 1px solid var(--border);
}

.rate-label {
  margin: 0.7rem 0 0.35rem;
  font-size: 0.78rem;
  font-weight: 700;
}

.rate-row {
  display: flex;
  gap: 0.35rem;
  margin-bottom: 0.7rem;
}

.rate-btn {
  width: 2.2rem;
  height: 2.2rem;
  border: 0;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.35);
  font-size: 1.15rem;
  line-height: 1;
  cursor: pointer;
}

.rate-btn.on {
  background: var(--accent-soft);
  color: var(--accent);
}

.gallery-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.4rem;
}

.gallery-grid img {
  width: 100%;
  aspect-ratio: 1;
  object-fit: cover;
  border-radius: 12px;
}

.gallery-add {
  position: relative;
  display: grid;
  place-items: center;
  aspect-ratio: 1;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.08);
  font-size: 0.72rem;
  font-weight: 700;
  text-align: center;
  padding: 0.35rem;
  cursor: pointer;
}

.remove-fav {
  margin-top: 0.85rem;
}

.sr-only-file {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}
</style>
