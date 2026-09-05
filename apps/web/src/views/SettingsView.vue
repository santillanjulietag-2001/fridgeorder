<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { api } from '@/api/client';

interface Household {
  _id: string;
  name: string;
  inviteCode: string;
}

type PanelId = 'prefs' | 'diet' | 'home' | null;

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
const openPanel = ref<PanelId>(null);
const saving = ref(false);

const initials = computed(() => {
  const parts = (auth.user?.name || 'T').trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]![0] || ''}${parts[1]![0] || ''}`.toUpperCase();
  }
  return (parts[0] || 'T').slice(0, 1).toUpperCase();
});

const handle = computed(() => {
  const local = (auth.user?.email || '').split('@')[0];
  return local ? `@${local}` : '';
});

const homeLabel = computed(() => households.value[0]?.name || 'Sin hogar compartido');

onMounted(async () => {
  splashImageUrl.value = auth.user?.settings.splashImageUrl || '';
  peopleCount.value = auth.user?.settings.peopleCount || 2;
  dietaryNotes.value = auth.user?.settings.dietaryNotes || '';
  const data = await api<{ households: Household[] }>('/households');
  households.value = data.households;
});

function togglePanel(id: Exclude<PanelId, null>) {
  openPanel.value = openPanel.value === id ? null : id;
}

function closeProfile() {
  if (window.history.length > 1) router.back();
  else router.replace('/home');
}

async function saveSettings() {
  error.value = '';
  message.value = '';
  saving.value = true;
  try {
    await auth.updateSettings({
      splashImageUrl: splashImageUrl.value,
      peopleCount: peopleCount.value,
      dietaryNotes: dietaryNotes.value,
    });
    message.value = 'Ajustes guardados';
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Error';
  } finally {
    saving.value = false;
  }
}

async function createHousehold() {
  error.value = '';
  const data = await api<{ household: Household }>('/households', {
    method: 'POST',
    body: JSON.stringify({ name: householdName.value }),
  });
  households.value.push(data.household);
  householdName.value = '';
  message.value = `Hogar creado. Código: ${data.household.inviteCode}`;
}

async function joinHousehold() {
  error.value = '';
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
  <main class="profile">
    <header class="profile-top">
      <button class="profile-icon-btn" type="button" aria-label="Cerrar" title="Cerrar" @click="closeProfile">
        ×
      </button>
    </header>

    <section class="profile-hero">
      <div class="profile-avatar" aria-hidden="true">{{ initials }}</div>
      <h1 class="profile-name">{{ auth.user?.name || 'Tu perfil' }}</h1>
      <p v-if="handle" class="profile-handle">{{ handle }}</p>
    </section>

    <article class="glass-card profile-plan">
      <div>
        <p class="profile-plan-kicker">Hogar</p>
        <strong>{{ homeLabel }}</strong>
        <p class="muted profile-plan-meta">{{ peopleCount }} persona{{ peopleCount === 1 ? '' : 's' }} en casa</p>
      </div>
    </article>

    <section class="glass-card profile-menu" aria-label="Ajustes">
      <button
        class="profile-row"
        type="button"
        :class="{ open: openPanel === 'prefs' }"
        :aria-expanded="openPanel === 'prefs'"
        @click="togglePanel('prefs')"
      >
        <span class="profile-row-ico" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
            <circle cx="12" cy="12" r="3" />
            <path d="M12 3v2.2M12 18.8V21M4.9 6.3l1.6 1.6M17.5 16.1l1.6 1.6M3 12h2.2M18.8 12H21M4.9 17.7l1.6-1.6M17.5 7.9l1.6-1.6" stroke-linecap="round" />
          </svg>
        </span>
        <span class="profile-row-text">
          <strong>Preferencias</strong>
          <em>Splash y personas en casa</em>
        </span>
        <span class="profile-chevron" aria-hidden="true">›</span>
      </button>
      <div v-if="openPanel === 'prefs'" class="profile-panel">
        <div class="field">
          <label>URL de imagen inicial</label>
          <input v-model="splashImageUrl" placeholder="https://..." />
        </div>
        <div class="field">
          <label>Personas en casa</label>
          <input v-model.number="peopleCount" type="number" min="1" max="20" />
        </div>
        <button class="btn profile-save" :disabled="saving" @click="saveSettings">
          {{ saving ? 'Guardando…' : 'Guardar' }}
        </button>
      </div>

      <button
        class="profile-row"
        type="button"
        :class="{ open: openPanel === 'diet' }"
        :aria-expanded="openPanel === 'diet'"
        @click="togglePanel('diet')"
      >
        <span class="profile-row-ico" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
            <path d="M12 21s-7-4.4-7-10a4.5 4.5 0 0 1 7-3.7A4.5 4.5 0 0 1 19 11c0 5.6-7 10-7 10Z" stroke-linejoin="round" />
          </svg>
        </span>
        <span class="profile-row-text">
          <strong>Dieta y notas</strong>
          <em>Alergias, gustos y restricciones</em>
        </span>
        <span class="profile-chevron" aria-hidden="true">›</span>
      </button>
      <div v-if="openPanel === 'diet'" class="profile-panel">
        <div class="field">
          <label>Notas dietéticas</label>
          <textarea v-model="dietaryNotes" rows="3" placeholder="Sin gluten, vegetariano…" />
        </div>
        <button class="btn profile-save" :disabled="saving" @click="saveSettings">
          {{ saving ? 'Guardando…' : 'Guardar' }}
        </button>
      </div>

      <button
        class="profile-row"
        type="button"
        :class="{ open: openPanel === 'home' }"
        :aria-expanded="openPanel === 'home'"
        @click="togglePanel('home')"
      >
        <span class="profile-row-ico" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
            <path d="M4 10.5 12 4l8 6.5V20a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 20v-9.5Z" stroke-linejoin="round" />
            <path d="M9.5 21.5v-7h5v7" />
          </svg>
        </span>
        <span class="profile-row-text">
          <strong>Hogar</strong>
          <em>{{ households.length ? `${households.length} hogar${households.length === 1 ? '' : 'es'}` : 'Crear o unirse' }}</em>
        </span>
        <span class="profile-chevron" aria-hidden="true">›</span>
      </button>
      <div v-if="openPanel === 'home'" class="profile-panel">
        <div v-for="hh in households" :key="hh._id" class="profile-home-item">
          <strong>{{ hh.name }}</strong>
          <span class="muted">Código: {{ hh.inviteCode }}</span>
        </div>
        <div class="field">
          <label>Crear hogar</label>
          <input v-model="householdName" placeholder="Familia García" />
        </div>
        <button class="btn ghost profile-save" :disabled="!householdName" @click="createHousehold">Crear</button>
        <div class="field" style="margin-top: 0.85rem">
          <label>Unirse con código</label>
          <input v-model="inviteCode" placeholder="ABC12345" />
        </div>
        <button class="btn ghost profile-save" :disabled="!inviteCode" @click="joinHousehold">Unirme</button>
      </div>
    </section>

    <p v-if="message" class="profile-msg">{{ message }}</p>
    <p v-if="error" class="profile-msg profile-msg--err">{{ error }}</p>

    <button class="glass-card profile-logout" type="button" @click="logout">
      <span class="profile-row-ico" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
          <path d="M9 21H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3" stroke-linecap="round" />
          <path d="M16 17l5-5-5-5M21 12H9" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </span>
      <strong>Cerrar sesión</strong>
    </button>

    <p class="profile-foot">
      <span class="wordmark wordmark--sm" aria-label="Fridge Order">
        <span class="wordmark-fridge">FRIDGE</span>
        <span class="wordmark-order">ORDER</span>
      </span>
      · 1.0.0
    </p>
  </main>
</template>

<style scoped>
.profile {
  width: min(430px, 100%);
  margin: 0 auto;
  padding: calc(0.55rem + env(safe-area-inset-top, 0px)) 1.1rem 7.25rem;
  min-height: 100dvh;
  background:
    radial-gradient(720px 420px at 50% -8%, rgba(35, 78, 78, 0.42), transparent 62%),
    #121212;
}

.profile-top {
  display: flex;
  align-items: center;
  min-height: 2.6rem;
  margin-bottom: 0.35rem;
}

.profile-icon-btn {
  width: 2.4rem;
  height: 2.4rem;
  border: 0;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
  font-size: 1.7rem;
  font-weight: 500;
  line-height: 1;
  cursor: pointer;
  backdrop-filter: blur(12px);
}

.profile-hero {
  text-align: center;
  padding: 0.4rem 0 1.35rem;
}

.profile-avatar {
  width: 5.4rem;
  height: 5.4rem;
  margin: 0 auto 0.85rem;
  border-radius: 999px;
  display: grid;
  place-items: center;
  background: var(--accent);
  color: #fff;
  font-size: 1.55rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  box-shadow: 0 12px 28px var(--accent-glow);
}

.profile-name {
  margin: 0;
  font-size: 1.45rem;
  letter-spacing: -0.03em;
  line-height: 1.2;
}

.profile-handle {
  margin: 0.35rem 0 0;
  color: var(--text-muted);
  font-size: 0.92rem;
}

.glass-card {
  background: rgba(255, 255, 255, 0.07);
  backdrop-filter: blur(22px) saturate(140%);
  -webkit-backdrop-filter: blur(22px) saturate(140%);
  border: 0;
  border-radius: 28px;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.12), 0 16px 36px rgba(0, 0, 0, 0.28);
}

.profile-plan {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.05rem 1.15rem;
  margin-bottom: 0.85rem;
}

.profile-plan-kicker {
  margin: 0 0 0.15rem;
  font-size: 0.78rem;
  color: var(--text-muted);
}

.profile-plan strong {
  font-size: 1.05rem;
}

.profile-plan-meta {
  margin: 0.2rem 0 0;
  font-size: 0.82rem;
}

.profile-menu {
  overflow: hidden;
  padding: 0.35rem 0;
}

.profile-row {
  width: 100%;
  display: grid;
  grid-template-columns: 2.1rem 1fr auto;
  gap: 0.85rem;
  align-items: center;
  padding: 1.05rem 1.15rem;
  border: 0;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.profile-row.open .profile-chevron {
  transform: rotate(90deg);
  color: var(--accent);
}

.profile-row-ico {
  width: 2.1rem;
  height: 2.1rem;
  display: grid;
  place-items: center;
  color: #fff;
}

.profile-row-ico svg {
  width: 1.35rem;
  height: 1.35rem;
}

.profile-row-text {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.12rem;
}

.profile-row-text strong {
  font-size: 1rem;
  font-weight: 600;
}

.profile-row-text em {
  font-style: normal;
  font-size: 0.8rem;
  color: var(--text-muted);
}

.profile-chevron {
  color: rgba(255, 255, 255, 0.45);
  font-size: 1.35rem;
  line-height: 1;
  transition: transform 0.15s ease, color 0.15s ease;
}

.profile-panel {
  padding: 0 1.15rem 1.1rem;
}

.profile-panel .field input,
.profile-panel .field textarea {
  border: 0;
  background: rgba(0, 0, 0, 0.32);
  border-radius: 16px;
}

.profile-panel .field input:focus,
.profile-panel .field textarea:focus {
  border: 0;
  background: rgba(0, 0, 0, 0.45);
  outline: none;
}

.profile-save {
  width: 100%;
}

.profile-home-item {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  margin-bottom: 0.85rem;
  padding: 0.7rem 0.85rem;
  border-radius: 16px;
  background: rgba(0, 0, 0, 0.22);
}

.profile-msg {
  margin: 0.85rem 0.2rem 0;
  text-align: center;
  color: #fff;
  font-size: 0.88rem;
}

.profile-msg--err {
  color: var(--accent);
}

.profile-logout {
  width: 100%;
  margin-top: 0.85rem;
  display: flex;
  align-items: center;
  gap: 0.85rem;
  padding: 1.05rem 1.15rem;
  color: inherit;
  cursor: pointer;
  text-align: left;
}

.profile-logout strong {
  font-weight: 600;
}

.profile-foot {
  margin: 1.4rem 0 0;
  text-align: center;
  font-size: 0.72rem;
  color: rgba(255, 255, 255, 0.38);
}
</style>
