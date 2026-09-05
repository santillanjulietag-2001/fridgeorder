<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const router = useRouter();
const ready = ref(false);
let timer: ReturnType<typeof setTimeout> | undefined;

const defaultSplash =
  'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=1600&q=80';

onMounted(async () => {
  await auth.bootstrap();
  ready.value = true;
  if (auth.isAuthenticated) {
    timer = setTimeout(() => {
      goHome();
    }, 1600);
  }
});

onUnmounted(() => {
  if (timer) clearTimeout(timer);
});

function goHome() {
  auth.markSplashSeen();
  router.replace('/home');
}

function goLogin() {
  auth.markSplashSeen();
  router.replace({ name: 'login' });
}

function goRegister() {
  auth.markSplashSeen();
  router.replace({ name: 'login', query: { mode: 'register' } });
}
</script>

<template>
  <section class="splash">
    <div
      class="splash-bg"
      :style="{
        backgroundImage: `url(${auth.user?.settings.splashImageUrl || defaultSplash})`,
      }"
    />
    <div class="splash-wash" />

    <main class="splash-content fade-in">
      <div class="splash-hero">
        <div class="splash-logo" aria-hidden="true">
          <svg viewBox="0 0 64 64" fill="none">
            <path d="M20 28c0-11 24-11 24 0" stroke="#fff" stroke-width="3.5" stroke-linecap="round" />
            <path
              d="M12.5 28h39L46.2 55.6a3.2 3.2 0 0 1-3.1 2.4H20.9a3.2 3.2 0 0 1-3.1-2.4Z"
              stroke="#fff"
              stroke-width="3.5"
              stroke-linejoin="round"
            />
            <path d="M18.5 42.8h27" stroke="#fff" stroke-width="3.2" stroke-linecap="round" />
            <path
              d="M27.8 49.2c-7.6-2.4-11.2-11.6-7-18.2 2-3.2 5.6-4.6 8.6-3.2 5.8 2.6 8.4 12.2 4.2 19-1.4 2.2-3.6 3.2-5.8 2.4Z"
              stroke="#F08A1C"
              stroke-width="2.2"
              stroke-linejoin="round"
            />
            <path d="M29.2 47.2c-2.2-4.8-3.2-9.8-2.2-14.4" stroke="#F08A1C" stroke-width="1.6" stroke-linecap="round" />
            <path d="M27.6 40.2l-4.4-2.2M28.2 36.4l-3.8-3" stroke="#F08A1C" stroke-width="1.5" stroke-linecap="round" />
            <path
              d="M41.2 35.8c-4.6.2-8.3 4.2-8.3 9.4 0 5.2 3.5 9.4 8.4 9.4 4.9 0 8.4-4.2 8.4-9.4 0-5.2-3.6-9.2-8.5-9.4Z"
              stroke="#F08A1C"
              stroke-width="2.2"
            />
            <path d="M41.6 35.8c.4-2.8 1.8-5.2 4.2-6.4" stroke="#F08A1C" stroke-width="2" stroke-linecap="round" />
            <path d="M45.8 29.6c1.2.2 2.2 1.2 2.6 2.4" stroke="#F08A1C" stroke-width="1.7" stroke-linecap="round" />
          </svg>
        </div>
        <p class="splash-brand">
          <span class="wordmark">
            <span class="wordmark-fridge">FRIDGE</span>
            <span class="wordmark-order">ORDER</span>
          </span>
        </p>
        <h1 class="splash-slogan">
          Toda tu
          <em>compra</em>
          en una app!
        </h1>
      </div>

      <div v-if="ready" class="splash-actions">
        <template v-if="auth.isAuthenticated">
          <button class="splash-btn splash-btn-primary splash-btn-full" type="button" @click="goHome">
            Entrar
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M7 17 17 7M9 7h8v8" />
            </svg>
          </button>
        </template>
        <template v-else>
          <button class="splash-btn splash-btn-ghost" type="button" @click="goLogin">Iniciar sesión</button>
          <button class="splash-btn splash-btn-primary" type="button" @click="goRegister">
            Crear cuenta nueva
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M7 17 17 7M9 7h8v8" />
            </svg>
          </button>
        </template>
      </div>
    </main>
  </section>
</template>

<style scoped>
.splash {
  min-height: 100vh;
  min-height: 100dvh;
  position: relative;
  overflow: hidden;
  color: #fff;
}

.splash-bg,
.splash-wash {
  position: absolute;
  inset: 0;
}

.splash-bg {
  background-color: #121212;
  background-size: cover;
  background-position: center;
  transform: scale(1.05);
  animation: ken 8s ease-out both;
}

.splash-wash {
  background:
    linear-gradient(180deg, rgba(10, 10, 10, 0.28) 0%, rgba(10, 10, 10, 0.08) 40%, rgba(10, 10, 10, 0.58) 100%),
    linear-gradient(90deg, rgba(10, 10, 10, 0.22), transparent 58%);
}

.splash-content {
  position: relative;
  z-index: 1;
  min-height: 100vh;
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: max(3.2rem, calc(env(safe-area-inset-top, 0px) + 2.4rem)) 1.35rem
    max(1.6rem, calc(env(safe-area-inset-bottom, 0px) + 1.15rem));
}

.splash-hero {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  flex: 1;
  padding-bottom: 6vh;
}

.splash-logo {
  width: 3.1rem;
  height: 3.1rem;
  filter: drop-shadow(0 8px 18px rgba(0, 0, 0, 0.45));
}

.splash-logo svg {
  width: 100%;
  height: 100%;
  display: block;
}

.splash-brand {
  margin: 0.85rem 0 1.15rem;
  font-size: 0.82rem;
}

.splash-slogan {
  margin: 0;
  max-width: 11ch;
  font-size: clamp(2.55rem, 11vw, 3.55rem);
  font-weight: 700;
  letter-spacing: -0.045em;
  line-height: 0.98;
  text-wrap: balance;
}

.splash-slogan em {
  display: block;
  font-style: normal;
  color: var(--accent);
}

.splash-actions {
  display: grid;
  grid-template-columns: 1fr;
  gap: 0.65rem;
}

.splash-btn {
  width: 100%;
  min-height: 3.4rem;
  margin: 0;
  border: 0;
  border-radius: 999px;
  padding: 0.95rem 1.2rem;
  font-weight: 600;
  font-size: 0.95rem;
  letter-spacing: -0.02em;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  line-height: 1.1;
  text-align: center;
  white-space: nowrap;
}

.splash-btn svg {
  width: 1.05rem;
  height: 1.05rem;
  flex-shrink: 0;
  stroke: currentColor;
  fill: none;
  stroke-width: 2.1;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.splash-btn-ghost {
  background: rgba(22, 22, 22, 0.58);
  color: #fff;
  border: 1px solid rgba(255, 255, 255, 0.18);
  backdrop-filter: blur(16px) saturate(140%);
}

.splash-btn-ghost:hover {
  background: rgba(22, 22, 22, 0.72);
}

.splash-btn-primary {
  background: var(--accent);
  color: #fff;
  box-shadow: 0 10px 24px rgba(240, 138, 28, 0.32);
}

.splash-btn-primary:hover {
  filter: brightness(1.08);
}

.splash-btn-full {
  grid-column: 1 / -1;
}

@keyframes ken {
  from {
    transform: scale(1.12);
  }
  to {
    transform: scale(1.05);
  }
}
</style>
