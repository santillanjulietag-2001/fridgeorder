<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const router = useRouter();
const ready = ref(false);

const defaultSplash =
  'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=1600&q=80';

onMounted(async () => {
  await auth.bootstrap();
  ready.value = true;
  setTimeout(() => {
    auth.markSplashSeen();
    router.replace(auth.isAuthenticated ? '/needs' : '/login');
  }, 2200);
});

function skip() {
  auth.markSplashSeen();
  router.replace(auth.isAuthenticated ? '/needs' : '/login');
}
</script>

<template>
  <section class="splash" @click="skip">
    <div
      class="splash-bg"
      :style="{
        backgroundImage: `url(${auth.user?.settings.splashImageUrl || defaultSplash})`,
      }"
    />
    <div class="splash-overlay fade-in">
      <p class="eyebrow">Tu súper, en orden</p>
      <h1 class="brand">FridgeOrder</h1>
      <p class="muted">Listas, compra con voz y menú semanal</p>
      <button v-if="ready" class="btn ghost" type="button" @click.stop="skip">Entrar</button>
    </div>
  </section>
</template>

<style scoped>
.splash {
  min-height: 100vh;
  position: relative;
  display: grid;
  place-items: end stretch;
  overflow: hidden;
  cursor: pointer;
}

.splash-bg {
  position: absolute;
  inset: 0;
  background-size: cover;
  background-position: center;
  transform: scale(1.05);
  animation: ken 2.4s ease-out both;
}

.splash-overlay {
  position: relative;
  padding: 2.5rem 1.5rem 3rem;
  background: linear-gradient(to top, rgba(8, 12, 22, 0.94), rgba(8, 12, 22, 0.25));
}

.eyebrow {
  text-transform: uppercase;
  letter-spacing: 0.14em;
  font-size: 0.75rem;
  color: var(--accent);
  margin: 0 0 0.4rem;
}

.brand {
  font-size: clamp(2.6rem, 8vw, 4rem);
  margin-bottom: 0.4rem;
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
