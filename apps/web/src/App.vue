<script setup lang="ts">
import { onMounted, computed } from 'vue';
import { useRoute } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const route = useRoute();

const showNav = computed(
  () => auth.isAuthenticated && !['splash', 'login'].includes(String(route.name))
);

onMounted(() => {
  auth.bootstrap();
});
</script>

<template>
  <div class="app-shell" :class="{ 'has-nav': showNav }">
    <header v-if="showNav" class="app-header">
      <RouterLink to="/needs" class="brand app-header-brand">
        <img class="app-header-logo" src="/logo.svg" alt="" width="36" height="36" />
        <span>FridgeOrder</span>
      </RouterLink>
    </header>
    <RouterView />
    <nav v-if="showNav" class="nav-bottom">
      <RouterLink to="/needs"><span class="nav-icon">☰</span>Lista</RouterLink>
      <RouterLink to="/prelist"><span class="nav-icon">✓</span>Prelista</RouterLink>
      <RouterLink to="/trip"><span class="nav-icon">🛒</span>Súper</RouterLink>
      <RouterLink to="/pantry"><span class="nav-icon">🧊</span>Despensa</RouterLink>
      <RouterLink to="/meals"><span class="nav-icon">🍽</span>Menú</RouterLink>
    </nav>
  </div>
</template>
