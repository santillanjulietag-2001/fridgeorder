<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { CATEGORY_LABELS, type Category } from '@fridgeorder/shared';
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

async function load() {
  const data = await api<{ items: PantryItem[] }>('/pantry');
  items.value = data.items;
}

async function consume(item: PantryItem, amount: number) {
  try {
    const data = await api<{ item: PantryItem }>(`/pantry/${item._id}`, {
      method: 'PATCH',
      body: JSON.stringify({ consumed: amount }),
    });
    const idx = items.value.findIndex((i) => i._id === item._id);
    if (idx >= 0) items.value[idx] = data.item;
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Error';
  }
}

onMounted(load);
</script>

<template>
  <main class="container fade-in" style="padding: 1.25rem 0 6rem">
    <h1 class="page-title">Despensa</h1>
    <p class="muted" style="margin: 0.25rem 0 0">Lo que tienes ahora, tras tus compras (menos lo ya consumido).</p>
    <p v-if="error" class="diff-bad">{{ error }}</p>

    <section v-if="!items.length" class="panel" style="margin-top: 1rem">
      <p class="muted">La despensa está vacía. Cierra una compra en el súper para llenarla.</p>
    </section>

    <section v-for="item in items" :key="item._id" class="panel" style="margin-top: 0.75rem">
      <div class="list-item" style="border: 0; padding: 0">
        <div class="chip">{{ CATEGORY_LABELS[item.category] }}</div>
        <div>
          <strong>{{ item.name }}</strong>
          <div class="muted">{{ item.quantityOnHand }} {{ item.unit }}</div>
        </div>
        <button class="btn ghost" @click="consume(item, 1)">Usé 1</button>
      </div>
    </section>

    <RouterLink class="btn block" style="margin-top: 1rem; text-align: center" to="/meals">
      Generar plan de comidas
    </RouterLink>
  </main>
</template>
