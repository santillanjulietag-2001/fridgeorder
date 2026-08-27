<script setup lang="ts">
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const router = useRouter();
const route = useRoute();

const mode = ref<'login' | 'register'>('login');
const name = ref('');
const email = ref('demo@fridgeorder.local');
const password = ref('secret123');
const error = ref('');
const loading = ref(false);

async function submit() {
  error.value = '';
  loading.value = true;
  try {
    if (mode.value === 'login') {
      await auth.login(email.value, password.value);
    } else {
      await auth.register(name.value, email.value, password.value);
    }
    auth.markSplashSeen();
    router.replace((route.query.redirect as string) || '/needs');
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Error de autenticación';
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <main class="container fade-in" style="padding: 2.5rem 0 4rem">
    <p class="eyebrow">FridgeOrder</p>
    <h1 class="page-title">{{ mode === 'login' ? 'Entra a tu cuenta' : 'Crea tu cuenta' }}</h1>
    <p class="muted">Cada usuario tiene sus propios datos. Luego puedes compartir un hogar.</p>
    <p class="muted" style="margin-top: 0.5rem">
      Prueba: <code>demo@fridgeorder.local</code> / <code>secret123</code>
      · o pulsa “Crear cuenta nueva”.
    </p>

    <form class="panel" style="margin-top: 1.5rem; max-width: 420px" @submit.prevent="submit">
      <div v-if="mode === 'register'" class="field">
        <label>Nombre</label>
        <input v-model="name" required autocomplete="name" />
      </div>
      <div class="field">
        <label>Email</label>
        <input v-model="email" type="email" required autocomplete="email" />
      </div>
      <div class="field">
        <label>Contraseña</label>
        <input v-model="password" type="password" required minlength="6" autocomplete="current-password" />
      </div>
      <p v-if="error" class="diff-bad">{{ error }}</p>
      <button class="btn block" :disabled="loading">
        {{ loading ? 'Espera…' : mode === 'login' ? 'Entrar' : 'Registrarme' }}
      </button>
      <button class="btn ghost block" style="margin-top: 0.6rem" type="button" @click="mode = mode === 'login' ? 'register' : 'login'">
        {{ mode === 'login' ? 'Crear cuenta nueva' : 'Ya tengo cuenta' }}
      </button>
    </form>
  </main>
</template>

<style scoped>
.eyebrow {
  text-transform: uppercase;
  letter-spacing: 0.14em;
  font-size: 0.75rem;
  color: var(--accent);
}
</style>
