<script setup lang="ts">
import { onMounted, onUnmounted, computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useNeedsStore } from '@/stores/needs';

const auth = useAuthStore();
const needs = useNeedsStore();
const route = useRoute();
const router = useRouter();
const menuOpen = ref(false);

const showNav = computed(
  () => auth.isAuthenticated && !['splash', 'login'].includes(String(route.name))
);
const showHeader = computed(() => showNav.value && route.name !== 'settings');

const userName = computed(() => (auth.user?.name || 'Cuenta').trim() || 'Cuenta');
const userSubtitle = computed(() => {
  const email = auth.user?.email || '';
  const local = email.split('@')[0];
  return local || 'Tu cuenta';
});
const userInitials = computed(() => {
  const parts = userName.value.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]![0] || ''}${parts[1]![0] || ''}`.toUpperCase();
  }
  return (parts[0] || 'C').slice(0, 1).toUpperCase();
});
const listCount = computed(() => needs.items.length);

const steps = [
  { to: '/needs', name: 'needs', label: 'Lista', icon: 'list' },
  { to: '/prelist', name: 'prelist', label: 'Prelista', icon: 'prelist' },
  { to: '/trip', name: 'trip', label: 'Súper', icon: 'trip' },
  { to: '/pantry', name: 'pantry', label: 'Despensa', icon: 'pantry' },
  { to: '/meals', name: 'meals', label: 'Menú', icon: 'meals' },
] as const;

function isNavActive(name: string) {
  const path = route.path;
  if (name === 'home') {
    return path === '/home' || path.startsWith('/recipes') || path === '/compare';
  }
  if (name === 'needs') return path === '/needs' || path.startsWith('/needs/');
  if (name === 'prelist') return path === '/prelist' || path.startsWith('/prelist/');
  if (name === 'trip') return path === '/trip' || path.startsWith('/trip/');
  if (name === 'pantry') return path === '/pantry' || path.startsWith('/pantry/');
  if (name === 'meals') return path === '/meals' || path.startsWith('/meals/');
  return route.name === name;
}

watch(
  () => route.fullPath,
  () => {
    menuOpen.value = false;
  }
);

watch(menuOpen, (open) => {
  document.body.style.overflow = open ? 'hidden' : '';
});

onMounted(() => {
  auth.bootstrap();
});

onUnmounted(() => {
  document.body.style.overflow = '';
});

function toggleMenu() {
  menuOpen.value = !menuOpen.value;
}

function closeMenu() {
  menuOpen.value = false;
}

function logout() {
  closeMenu();
  auth.logout();
  router.replace({ name: 'login' });
}
</script>

<template>
  <div class="app-shell" :class="{ 'has-nav': showNav, 'has-header': showHeader, 'menu-open': menuOpen }">
    <header v-if="showHeader" class="app-header">
      <RouterLink to="/home" class="brand app-header-brand" aria-label="Fridge Order, ir al inicio">
        <span class="wordmark">
          <span class="wordmark-fridge">FRIDGE</span>
          <span class="wordmark-order">ORDER</span>
        </span>
      </RouterLink>
      <div class="header-menu">
        <button
          class="header-menu-btn"
          type="button"
          :class="{ open: menuOpen }"
          :aria-expanded="menuOpen"
          aria-controls="app-menu"
          :title="menuOpen ? 'Cerrar menú' : 'Abrir menú'"
          :aria-label="menuOpen ? 'Cerrar menú' : 'Abrir menú'"
          @click="toggleMenu"
        >
          <span class="header-menu-bars" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
        </button>
        <Transition name="menu-fade">
          <div v-if="menuOpen" class="header-menu-backdrop" @click="closeMenu" />
        </Transition>
        <Transition name="menu-panel">
          <nav v-if="menuOpen" id="app-menu" class="header-menu-panel" aria-label="Menú">
          <RouterLink class="header-menu-brand" to="/home" aria-label="Fridge Order" @click="closeMenu">
            <img src="/logo.svg" alt="" width="36" height="36" />
            <span class="wordmark">
              <span class="wordmark-fridge">FRIDGE</span>
              <span class="wordmark-order">ORDER</span>
            </span>
          </RouterLink>
          <RouterLink class="header-menu-profile" to="/settings" @click="closeMenu">
            <span class="header-menu-avatar" aria-hidden="true">{{ userInitials }}</span>
            <span class="header-menu-profile-text">
              <strong>{{ userName }}</strong>
              <em>{{ userSubtitle }}</em>
            </span>
            <span class="header-menu-chevron" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <path d="m6 9 6 6 6-6" />
              </svg>
            </span>
          </RouterLink>
          <div class="header-menu-sep" />
          <p class="header-menu-kicker">Menu</p>
          <RouterLink
            class="header-menu-link"
            :class="{ 'is-active': isNavActive('home') }"
            to="/home"
            role="menuitem"
            @click="closeMenu"
          >
            <span class="header-menu-ico" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <path d="M4 11.2 12 4.4l8 6.8V20a1.2 1.2 0 0 1-1.2 1.2h-5.1v-6.2h-5.4V21.2H5.2A1.2 1.2 0 0 1 4 20Z" />
              </svg>
            </span>
            <span class="header-menu-label">Inicio</span>
          </RouterLink>
          <RouterLink
            v-for="step in steps"
            :key="step.to"
            :to="step.to"
            class="header-menu-link"
            :class="{ 'is-active': isNavActive(step.name) }"
            role="menuitem"
            @click="closeMenu"
          >
            <span class="header-menu-ico" aria-hidden="true">
              <svg v-if="step.icon === 'list'" viewBox="0 0 24 24">
                <rect x="6" y="5" width="12" height="16" rx="2.2" />
                <path d="M9 3.2h6v3.2H9z" />
                <path d="M9 11h6M9 14.5h6M9 18h3.5" />
              </svg>
              <svg v-else-if="step.icon === 'prelist'" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="8.25" />
                <path d="m8.6 12.2 2.2 2.2 4.7-4.8" />
              </svg>
              <svg v-else-if="step.icon === 'trip'" viewBox="0 0 24 24">
                <circle cx="9" cy="20" r="1.35" />
                <circle cx="18" cy="20" r="1.35" />
                <path d="M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.8a2 2 0 0 0 2-1.5L21 8H7" />
              </svg>
              <svg v-else-if="step.icon === 'pantry'" viewBox="0 0 24 24">
                <rect x="6" y="3" width="12" height="18" rx="2.2" />
                <path d="M6 11h12" />
              </svg>
              <svg v-else viewBox="0 0 24 24">
                <path d="M6.2 3v6.2M4.4 3v4.4M8 3v4.4M6.2 9.2V21" />
                <path d="M16.2 3.2c2.1 3.4 2.7 7 2.4 9.6h-4.4c0-2.7.8-6.3 2-9.6Z" />
                <path d="M16.2 12.8V21" />
              </svg>
            </span>
            <span class="header-menu-label">{{ step.label }}</span>
            <span v-if="step.name === 'needs' && listCount" class="header-menu-badge">{{ listCount }}</span>
          </RouterLink>
          <div class="header-menu-sep" />
          <RouterLink class="header-menu-link" to="/settings" role="menuitem" @click="closeMenu">
            <span class="header-menu-ico" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.2a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.2a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.2a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.2a1.7 1.7 0 0 0-1.5 1Z" />
              </svg>
            </span>
            <span class="header-menu-label">Ajustes</span>
          </RouterLink>
          <div class="header-menu-sep" />
          <button class="header-menu-link header-menu-logout" type="button" role="menuitem" @click="logout">
            <span class="header-menu-ico" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <path d="M12 2v10" />
                <path d="M7.1 4.7a8.2 8.2 0 1 0 9.8 0" />
              </svg>
            </span>
            <span class="header-menu-label">Cerrar sesión</span>
          </button>
          </nav>
        </Transition>
      </div>
    </header>
    <RouterView />
    <nav v-if="showNav" class="nav-bottom" aria-label="Principal">
      <div class="nav-bottom-row">
        <RouterLink to="/home" class="nav-item" :class="{ 'is-active': isNavActive('home') }" aria-label="Inicio" title="Inicio">
          <span class="nav-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="M4 11.2 12 4.4l8 6.8V20a1.2 1.2 0 0 1-1.2 1.2h-5.1v-6.2h-5.4V21.2H5.2A1.2 1.2 0 0 1 4 20Z" />
            </svg>
          </span>
          <span class="nav-label">Inicio</span>
        </RouterLink>
        <RouterLink to="/needs" class="nav-item" :class="{ 'is-active': isNavActive('needs') }" aria-label="Lista" title="Lista">
          <span class="nav-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <rect x="6" y="5" width="12" height="16" rx="2.2" />
              <path d="M9 3.2h6v3.2H9z" />
              <path d="M9 11h6M9 14.5h6M9 18h3.5" />
            </svg>
          </span>
          <span class="nav-label">Lista</span>
        </RouterLink>
        <RouterLink to="/prelist" class="nav-item" :class="{ 'is-active': isNavActive('prelist') }" aria-label="Prelista" title="Prelista">
          <span class="nav-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <circle class="nav-icon-ring" cx="12" cy="12" r="8.25" />
              <path d="m8.6 12.2 2.2 2.2 4.7-4.8" />
            </svg>
          </span>
          <span class="nav-label">Prelista</span>
        </RouterLink>
        <RouterLink to="/trip" class="nav-item" :class="{ 'is-active': isNavActive('trip') }" aria-label="Súper" title="Súper">
          <span class="nav-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <circle cx="9" cy="20" r="1.35" />
              <circle cx="18" cy="20" r="1.35" />
              <path d="M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.8a2 2 0 0 0 2-1.5L21 8H7" />
            </svg>
          </span>
          <span class="nav-label">Súper</span>
        </RouterLink>
        <RouterLink to="/pantry" class="nav-item" :class="{ 'is-active': isNavActive('pantry') }" aria-label="Despensa" title="Despensa">
          <span class="nav-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <rect x="6" y="3" width="12" height="18" rx="2.2" />
              <path d="M6 11h12" />
            </svg>
          </span>
          <span class="nav-label">Despensa</span>
        </RouterLink>
        <RouterLink to="/meals" class="nav-item" :class="{ 'is-active': isNavActive('meals') }" aria-label="Menú" title="Menú">
          <span class="nav-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="M6.2 3v6.2M4.4 3v4.4M8 3v4.4M6.2 9.2V21" />
              <path d="M16.2 3.2c2.1 3.4 2.7 7 2.4 9.6h-4.4c0-2.7.8-6.3 2-9.6Z" />
              <path d="M16.2 12.8V21" />
            </svg>
          </span>
          <span class="nav-label">Menú</span>
        </RouterLink>
      </div>
    </nav>
  </div>
</template>
