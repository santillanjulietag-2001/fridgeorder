<script setup lang="ts">
import { computed, ref } from 'vue';
import { api } from '@/api/client';
import { fileToCompressedDataUrl } from '@/utils/image';

type NutritionLevel = 'bad' | 'warn' | 'ok';

interface NutritionFactor {
  id: string;
  side: 'negative' | 'positive';
  label: string;
  hint: string;
  value: string;
  level: NutritionLevel;
  detail: string;
}

interface ProductCard {
  name: string;
  brand: string;
  score: number;
  scoreLabel: string;
  photo?: string;
  verdict: string;
  betterOption: string;
  factors: NutritionFactor[];
}

const photoA = ref('');
const photoB = ref('');
const loading = ref(false);
const error = ref('');
const products = ref<ProductCard[]>([]);
const recommendation = ref('');
const winnerIndex = ref<number | null>(null);
const openKey = ref('');

const FACTOR_ICONS: Record<string, string> = {
  additives: 'M4 4h16v4H4zm2 6h12v10H6z',
  salt: 'M12 3v4M8 7h8M7 11c0 4 2.2 8 5 10 2.8-2 5-6 5-10H7Z',
  satFat: 'M12 4c4 4 6 7 6 10a6 6 0 1 1-12 0c0-3 2-6 6-10Z',
  sugar: 'M8 8h8l-1 10H9L8 8zm2-3h4v3h-4z',
  protein: 'M5 14c2-5 4-8 7-10 3 2 5 5 7 10-1 5-4 7-7 7s-6-2-7-7Z',
  calories: 'M12 3s4 5 4 9a4 4 0 1 1-8 0c0-4 4-9 4-9Z',
  fiber: 'M12 21V9m0 0C9 9 7 7 7 4c3 0 5 2 5 5zm0 0c3 0 5-2 5-5-3 0-5 2-5 5z',
};

function factorIcon(id: string) {
  return FACTOR_ICONS[id] || 'M5 12h14';
}

function scoreClass(score: number) {
  if (score < 30) return 'bad';
  if (score < 50) return 'warn';
  return 'ok';
}

function toggleFactor(productIndex: number, id: string) {
  const key = `${productIndex}:${id}`;
  openKey.value = openKey.value === key ? '' : key;
}

async function onPick(slot: 'a' | 'b', ev: Event) {
  const input = ev.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    error.value = 'Elige una foto JPG o PNG.';
    return;
  }
  error.value = '';
  const dataUrl = await fileToCompressedDataUrl(file);
  if (slot === 'a') photoA.value = dataUrl;
  else photoB.value = dataUrl;
}

function clearSlot(slot: 'a' | 'b') {
  if (slot === 'a') photoA.value = '';
  else photoB.value = '';
}

async function compare() {
  if (!photoA.value) {
    error.value = 'Sube al menos una foto del envase.';
    return;
  }
  loading.value = true;
  error.value = '';
  products.value = [];
  recommendation.value = '';
  winnerIndex.value = null;
  openKey.value = '';
  try {
    const data = await api<{
      products: ProductCard[];
      recommendation: string;
      winnerIndex: number | null;
    }>('/recipes/compare', {
      method: 'POST',
      body: JSON.stringify({
        imageDataUrl: photoA.value,
        imageDataUrlB: photoB.value || undefined,
      }),
    });
    const photos = [photoA.value, photoB.value].filter(Boolean);
    products.value = (data.products || []).map((item, i) => ({
      ...item,
      photo: photos[i] || photos[0],
      factors: item.factors || [],
    }));
    recommendation.value = data.recommendation || '';
    winnerIndex.value = data.winnerIndex;
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'No se pudo comparar';
  } finally {
    loading.value = false;
  }
}

function negatives(item: ProductCard) {
  return item.factors.filter((f) => f.side === 'negative');
}
function positives(item: ProductCard) {
  return item.factors.filter((f) => f.side === 'positive');
}
</script>

<template>
  <main class="container fade-in compare-page">
    <h1 class="page-title">Análisis de productos</h1>
    <p class="muted page-lead">
      Foto de uno o dos productos. Te leemos la etiqueta, damos nota y sugerimos qué conviene comprar.
    </p>

    <div class="compare-slots">
      <label class="compare-slot">
        <img v-if="photoA" :src="photoA" alt="Producto 1" />
        <span v-else>Producto 1</span>
        <input type="file" accept="image/*" capture="environment" @change="onPick('a', $event)" />
        <button v-if="photoA" class="clear" type="button" @click.prevent="clearSlot('a')">Quitar</button>
      </label>
      <label class="compare-slot">
        <img v-if="photoB" :src="photoB" alt="Producto 2" />
        <span v-else>Producto 2 (opcional)</span>
        <input type="file" accept="image/*" capture="environment" @change="onPick('b', $event)" />
        <button v-if="photoB" class="clear" type="button" @click.prevent="clearSlot('b')">Quitar</button>
      </label>
    </div>

    <button class="btn block" type="button" :disabled="loading || !photoA" @click="compare">
      {{ loading ? 'Leyendo etiqueta…' : photoB ? 'Comparar' : 'Analizar' }}
    </button>
    <p v-if="error" class="diff-bad" style="margin-top: 0.7rem">{{ error }}</p>

    <section v-if="recommendation" class="panel rec-card">
      <p class="muted rec-kicker">Recomendación</p>
      <p>{{ recommendation }}</p>
    </section>

    <article
      v-for="(item, i) in products"
      :key="i"
      class="yuka-card"
      :class="{ winner: winnerIndex === i }"
    >
      <header class="yuka-head">
        <img v-if="item.photo" :src="item.photo" alt="" class="yuka-thumb" />
        <span v-else class="yuka-thumb" />
        <div class="yuka-id">
          <strong>{{ item.name }}</strong>
          <em>{{ item.brand || 'Marca no leída' }}</em>
          <div class="yuka-score" :class="scoreClass(item.score)">
            <span class="dot" />
            <b>{{ item.score }}/100</b>
            <span>{{ item.scoreLabel || '—' }}</span>
          </div>
        </div>
      </header>

      <section v-if="negatives(item).length" class="yuka-block">
        <h3>Negativo</h3>
        <button
          v-for="factor in negatives(item)"
          :key="factor.id"
          class="factor-row"
          type="button"
          @click="toggleFactor(i, factor.id)"
        >
          <span class="factor-ico" aria-hidden="true">
            <svg viewBox="0 0 24 24"><path :d="factorIcon(factor.id)" /></svg>
          </span>
          <span class="factor-copy">
            <strong>{{ factor.label }}</strong>
            <em>{{ factor.hint }}</em>
            <p v-if="openKey === `${i}:${factor.id}`" class="factor-detail">{{ factor.detail }}</p>
          </span>
          <span class="factor-meta">
            <b>{{ factor.value }}</b>
            <i class="dot" :class="factor.level" />
            <svg class="chevron" :class="{ open: openKey === `${i}:${factor.id}` }" viewBox="0 0 24 24">
              <path d="m6 9 6 6 6-6" />
            </svg>
          </span>
        </button>
      </section>

      <section v-if="positives(item).length" class="yuka-block">
        <h3>Positivo</h3>
        <button
          v-for="factor in positives(item)"
          :key="factor.id"
          class="factor-row"
          type="button"
          @click="toggleFactor(i, factor.id)"
        >
          <span class="factor-ico" aria-hidden="true">
            <svg viewBox="0 0 24 24"><path :d="factorIcon(factor.id)" /></svg>
          </span>
          <span class="factor-copy">
            <strong>{{ factor.label }}</strong>
            <em>{{ factor.hint }}</em>
            <p v-if="openKey === `${i}:${factor.id}`" class="factor-detail">{{ factor.detail }}</p>
          </span>
          <span class="factor-meta">
            <b>{{ factor.value }}</b>
            <i class="dot" :class="factor.level" />
            <svg class="chevron" :class="{ open: openKey === `${i}:${factor.id}` }" viewBox="0 0 24 24">
              <path d="m6 9 6 6 6-6" />
            </svg>
          </span>
        </button>
      </section>

      <p v-if="item.verdict" class="yuka-verdict">{{ item.verdict }}</p>
      <p v-if="item.betterOption" class="muted yuka-alt">{{ item.betterOption }}</p>
    </article>
  </main>
</template>

<style scoped>
.compare-page {
  padding-bottom: 7.5rem;
}

.compare-slots {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.55rem;
  margin: 0.9rem 0 0.85rem;
}

.compare-slot {
  position: relative;
  display: grid;
  place-items: center;
  min-height: 8.5rem;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.07);
  border: 1px dashed rgba(255, 255, 255, 0.28);
  color: var(--text-muted);
  font-size: 0.82rem;
  font-weight: 700;
  text-align: center;
  padding: 0.5rem;
  cursor: pointer;
  overflow: hidden;
}

.compare-slot img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.compare-slot input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}

.compare-slot .clear {
  position: absolute;
  right: 0.4rem;
  bottom: 0.4rem;
  z-index: 2;
  border: 0;
  border-radius: 999px;
  padding: 0.25rem 0.55rem;
  background: rgba(18, 18, 18, 0.82);
  color: #fff;
  font-size: 0.72rem;
  font-weight: 700;
}

.rec-card {
  margin-top: 1rem;
}

.rec-kicker {
  margin: 0 0 0.35rem;
  font-size: 0.78rem;
  font-weight: 700;
}

.yuka-card {
  margin-top: 1rem;
  padding: 0.95rem 0.9rem 1rem;
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.07);
  border: 1px solid rgba(255, 255, 255, 0.16);
}

.yuka-card.winner {
  box-shadow: inset 3px 0 0 var(--accent);
}

.yuka-head {
  display: grid;
  grid-template-columns: 4.6rem minmax(0, 1fr);
  gap: 0.75rem;
  align-items: center;
  margin-bottom: 0.85rem;
}

.yuka-thumb {
  width: 4.6rem;
  height: 4.6rem;
  object-fit: cover;
  border-radius: 14px;
  background: rgba(0, 0, 0, 0.28);
}

.yuka-id {
  display: flex;
  flex-direction: column;
  min-width: 0;
  gap: 0.12rem;
}

.yuka-id em {
  font-style: normal;
  color: var(--text-muted);
  font-size: 0.82rem;
}

.yuka-score {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  margin-top: 0.25rem;
  font-size: 0.92rem;
}

.yuka-score b {
  font-size: 1.05rem;
}

.yuka-score .dot,
.factor-meta .dot {
  width: 0.7rem;
  height: 0.7rem;
  border-radius: 99px;
  display: inline-block;
  flex-shrink: 0;
}

.yuka-score.bad .dot,
.dot.bad {
  background: #e24b4b;
}
.yuka-score.warn .dot,
.dot.warn {
  background: var(--accent);
}
.yuka-score.ok .dot,
.dot.ok {
  background: #3dce7a;
}

.yuka-score.bad {
  color: #e24b4b;
}
.yuka-score.warn {
  color: var(--accent);
}
.yuka-score.ok {
  color: #3dce7a;
}

.yuka-block h3 {
  margin: 0.55rem 0 0.35rem;
  font-size: 0.72rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.factor-row {
  display: grid;
  grid-template-columns: 2.1rem minmax(0, 1fr) auto;
  gap: 0.55rem;
  align-items: start;
  width: 100%;
  margin: 0;
  padding: 0.55rem 0.15rem;
  border: 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.factor-ico {
  width: 2.1rem;
  height: 2.1rem;
  border-radius: 10px;
  display: grid;
  place-items: center;
  background: rgba(255, 255, 255, 0.08);
}

.factor-ico svg {
  width: 1.15rem;
  height: 1.15rem;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.factor-copy {
  display: flex;
  flex-direction: column;
  gap: 0.12rem;
  min-width: 0;
  padding-top: 0.12rem;
}

.factor-copy em {
  font-style: normal;
  font-size: 0.78rem;
  color: var(--text-muted);
}

.factor-detail {
  margin: 0.25rem 0 0;
  font-size: 0.8rem;
  line-height: 1.4;
  color: var(--text-muted);
}

.factor-meta {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  padding-top: 0.2rem;
  white-space: nowrap;
}

.factor-meta b {
  font-size: 0.88rem;
}

.chevron {
  width: 1rem;
  height: 1rem;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  opacity: 0.55;
  transition: transform 0.15s ease;
}

.chevron.open {
  transform: rotate(180deg);
}

.yuka-verdict {
  margin: 0.85rem 0 0.25rem;
}

.yuka-alt {
  margin: 0;
}
</style>
