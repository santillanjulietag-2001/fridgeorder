<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { api } from '@/api/client';

interface Household {
  _id: string;
  name: string;
  inviteCode: string;
}

const auth = useAuthStore();
const router = useRouter();

const splashImageUrl = ref('');
const peopleCount = ref(2);
const dietaryNotes = ref('');
const householdName = ref('');
const inviteCode = ref('');
const households = ref<Household[]>([]);
const message = ref('');
const error = ref('');

onMounted(async () => {
  splashImageUrl.value = auth.user?.settings.splashImageUrl || '';
  peopleCount.value = auth.user?.settings.peopleCount || 2;
  dietaryNotes.value = auth.user?.settings.dietaryNotes || '';
  const data = await api<{ households: Household[] }>('/households');
  households.value = data.households;
});

async function saveSettings() {
  error.value = '';
  try {
    await auth.updateSettings({
      splashImageUrl: splashImageUrl.value,
      peopleCount: peopleCount.value,
      dietaryNotes: dietaryNotes.value,
    });
    message.value = 'Ajustes guardados';
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Error';
  }
}

async function createHousehold() {
  const data = await api<{ household: Household }>('/households', {
    method: 'POST',
    body: JSON.stringify({ name: householdName.value }),
  });
  households.value.push(data.household);
  householdName.value = '';
  message.value = `Hogar creado. Código: ${data.household.inviteCode}`;
}

async function joinHousehold() {
  const data = await api<{ household: Household }>('/households/join', {
    method: 'POST',
    body: JSON.stringify({ inviteCode: inviteCode.value }),
  });
  households.value.push(data.household);
  inviteCode.value = '';
  message.value = `Te uniste a ${data.household.name}`;
}

function logout() {
  auth.logout();
  router.replace('/login');
}
</script>

<template>
  <main class="container fade-in" style="padding: 1.25rem 0 6rem">
    <h1 class="page-title">Ajustes</h1>
    <p class="muted" style="margin: 0.25rem 0 0">Hola, {{ auth.user?.name }}</p>

    <section class="panel" style="margin-top: 1rem">
      <h3>Splash</h3>
      <div class="field">
        <label>URL de imagen inicial</label>
        <input v-model="splashImageUrl" placeholder="https://..." />
      </div>
      <div class="field">
        <label>Personas en casa</label>
        <input v-model.number="peopleCount" type="number" min="1" max="20" />
      </div>
      <div class="field">
        <label>Notas dietéticas</label>
        <textarea v-model="dietaryNotes" rows="3" placeholder="Sin gluten, vegetariano…" />
      </div>
      <button class="btn" @click="saveSettings">Guardar</button>
    </section>

    <section class="panel" style="margin-top: 1rem">
      <h3>Compartir hogar</h3>
      <div v-for="hh in households" :key="hh._id" class="list-item">
        <div class="chip">hogar</div>
        <div>
          <strong>{{ hh.name }}</strong>
          <div class="muted">Código: {{ hh.inviteCode }}</div>
        </div>
        <span />
      </div>
      <div class="field" style="margin-top: 0.75rem">
        <label>Crear hogar</label>
        <input v-model="householdName" placeholder="Familia García" />
      </div>
      <button class="btn ghost" :disabled="!householdName" @click="createHousehold">Crear</button>
      <div class="field" style="margin-top: 0.75rem">
        <label>Unirse con código</label>
        <input v-model="inviteCode" placeholder="ABC12345" />
      </div>
      <button class="btn ghost" :disabled="!inviteCode" @click="joinHousehold">Unirme</button>
    </section>

    <p v-if="message" class="diff-ok">{{ message }}</p>
    <p v-if="error" class="diff-bad">{{ error }}</p>

    <button class="btn danger block" style="margin-top: 1.25rem" @click="logout">Cerrar sesión</button>
  </main>
</template>
