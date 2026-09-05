<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const router = useRouter();
const route = useRoute();

const mode = ref<'login' | 'register'>(route.query.mode === 'register' ? 'register' : 'login');

watch(
  () => route.query.mode,
  (value) => {
    mode.value = value === 'register' ? 'register' : 'login';
  }
);

const name = ref('');
const email = ref('demo@fridgeorder.local');
const password = ref('secret123');
const error = ref('');
const loading = ref(false);

const defaultSplash =
  'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=1600&q=80';

const bgUrl = computed(() => auth.user?.settings.splashImageUrl || defaultSplash);

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
    router.replace((route.query.redirect as string) || '/home');
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Error de autenticación';
  } finally {
    loading.value = false;
  }
}

function playSplash() {
  auth.replaySplash();
  router.push({ name: 'splash' });
}

function setMode(next: 'login' | 'register') {
  mode.value = next;
  const query = { ...route.query };
  if (next === 'register') query.mode = 'register';
  else delete query.mode;
  router.replace({ query });
}
</script>

<template>
  <section class="login-screen">
    <div class="login-bg" :style="{ backgroundImage: `url(${bgUrl})` }" />
    <div class="login-blur" />
    <div class="login-wash" />

    <main class="login-content fade-in">
      <button class="login-brand" type="button" title="Ver pantalla de inicio" aria-label="Fridge Order" @click="playSplash">
        <span class="wordmark wordmark--lg">
          <span class="wordmark-fridge">FRIDGE</span>
          <span class="wordmark-order">ORDER</span>
        </span>
      </button>

      <h1 class="login-title">
        <span>{{ mode === 'login' ? 'Entra a' : 'Crea' }}</span>
        tu cuenta
      </h1>

      <form class="login-form" @submit.prevent="submit">
        <div v-if="mode === 'register'" class="login-field">
          <label>Nombre</label>
          <input v-model="name" required autocomplete="name" />
        </div>
        <div class="login-field">
          <label>Email</label>
          <input v-model="email" type="email" required autocomplete="email" />
        </div>
        <div class="login-field">
          <label>Contraseña</label>
          <input v-model="password" type="password" required minlength="6" autocomplete="current-password" />
        </div>

        <p v-if="error" class="login-error">{{ error }}</p>

        <button class="login-primary" :disabled="loading">
          {{ loading ? 'Espera…' : mode === 'login' ? 'Entrar' : 'Registrarme' }}
        </button>
        <button
          class="login-secondary"
          type="button"
          @click="setMode(mode === 'login' ? 'register' : 'login')"
        >
          {{ mode === 'login' ? 'Crear cuenta nueva' : 'Ya tengo cuenta' }}
        </button>
      </form>

      <p class="login-hint">
        Prueba: demo@fridgeorder.local / secret123
      </p>

      <button
        class="login-footer"
        type="button"
        @click="setMode(mode === 'login' ? 'register' : 'login')"
      >
        {{ mode === 'login' ? 'Crear cuenta' : 'Iniciar sesión' }}
      </button>
    </main>
  </section>
</template>

<style scoped>
.login-screen {
  min-height: 100vh;
  min-height: 100dvh;
  position: relative;
  overflow: hidden;
  display: grid;
  place-items: center;
  color: #fff;
}

.login-bg,
.login-blur,
.login-wash {
  position: absolute;
  inset: 0;
}

.login-bg {
  background-size: cover;
  background-position: center;
  transform: scale(1.12);
  filter: blur(28px) saturate(1.15);
}

.login-blur {
  backdrop-filter: blur(18px) saturate(140%);
  background: rgba(18, 18, 18, 0.42);
}

.login-wash {
  background:
    linear-gradient(165deg, rgba(35, 78, 78, 0.38), transparent 46%),
    linear-gradient(to top, rgba(18, 18, 18, 0.82) 0%, rgba(18, 18, 18, 0.28) 52%, rgba(35, 78, 78, 0.18) 100%);
}

.login-content {
  position: relative;
  z-index: 1;
  width: min(420px, calc(100% - 3rem));
  padding: 3.2rem 0 2.4rem;
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  min-height: 100dvh;
}

.login-brand {
  display: inline-flex;
  align-items: center;
  gap: 0.65rem;
  margin: 0 0 2.4rem;
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  cursor: pointer;
  text-align: left;
}

.login-logo {
  width: 2.75rem;
  height: 2.75rem;
  border-radius: 0.85rem;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
}

.login-kicker {
  text-transform: uppercase;
  letter-spacing: 0.16em;
  font-size: 0.72rem;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.88);
}

.login-title {
  margin: 0 0 2.4rem;
  font-size: clamp(2.15rem, 8vw, 2.85rem);
  font-weight: 700;
  letter-spacing: -0.04em;
  line-height: 1.05;
  color: #fff;
}

.login-title span {
  display: block;
  font-size: 0.72em;
  font-weight: 700;
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: 1.45rem;
}

.login-field {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.login-field label {
  font-size: 0.92rem;
  font-weight: 400;
  color: rgba(255, 255, 255, 0.82);
}

.login-field input {
  width: 100%;
  border: 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.85);
  border-radius: 0;
  background: transparent;
  color: #fff;
  padding: 0.45rem 0 0.55rem;
  outline: none;
  box-shadow: none;
}

.login-field input:focus {
  border-bottom-color: #fff;
}

.login-field input::placeholder {
  color: rgba(255, 255, 255, 0.45);
}

.login-error {
  margin: 0;
  color: #f08a1c;
  font-size: 0.9rem;
}

.login-primary,
.login-secondary {
  width: 100%;
  border: 0;
  border-radius: 999px;
  padding: 0.95rem 1.2rem;
  font-weight: 600;
  cursor: pointer;
}

.login-primary {
  margin-top: 0.85rem;
  background: #f08a1c;
  color: #fff;
  box-shadow: 0 10px 24px rgba(240, 138, 28, 0.28);
}

.login-primary:hover {
  filter: brightness(1.08);
}

.login-primary:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.login-secondary {
  background: transparent;
  color: #fff;
  border: 1px solid rgba(255, 255, 255, 0.7);
  box-shadow: none;
}

.login-hint {
  margin: 1.35rem 0 0;
  font-size: 0.78rem;
  color: rgba(255, 255, 255, 0.7);
  line-height: 1.4;
}

.login-footer {
  margin-top: auto;
  padding: 1.25rem 0 0.4rem;
  border: 0;
  background: none;
  color: #fff;
  font-size: 0.95rem;
  cursor: pointer;
  text-align: center;
}

.login-footer:hover {
  opacity: 0.8;
}
</style>
