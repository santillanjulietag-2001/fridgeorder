import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'splash', component: () => import('@/views/SplashView.vue') },
    { path: '/login', name: 'login', component: () => import('@/views/LoginView.vue') },
    { path: '/home', name: 'home', component: () => import('@/views/HomeView.vue'), meta: { auth: true } },
    { path: '/needs', name: 'needs', component: () => import('@/views/NeedsView.vue'), meta: { auth: true } },
    { path: '/prelist', name: 'prelist', component: () => import('@/views/PrelistView.vue'), meta: { auth: true } },
    { path: '/trip/:id?', name: 'trip', component: () => import('@/views/TripView.vue'), meta: { auth: true } },
    { path: '/pantry', name: 'pantry', component: () => import('@/views/PantryView.vue'), meta: { auth: true } },
    { path: '/meals', name: 'meals', component: () => import('@/views/MealsView.vue'), meta: { auth: true } },
    { path: '/recipes', name: 'recipes', component: () => import('@/views/RecipesView.vue'), meta: { auth: true } },
    { path: '/recipes/today', name: 'recipe-today', component: () => import('@/views/RecipesView.vue'), meta: { auth: true } },
    { path: '/compare', name: 'compare', component: () => import('@/views/CompareView.vue'), meta: { auth: true } },
    { path: '/settings', name: 'settings', component: () => import('@/views/SettingsView.vue'), meta: { auth: true } },
  ],
});

router.beforeEach(async (to) => {
  const auth = useAuthStore();
  if (!auth.user && auth.isAuthenticated) {
    await auth.bootstrap();
  }
  if (to.meta.auth && !auth.isAuthenticated) {
    return { name: 'login', query: { redirect: to.fullPath } };
  }
  if (to.name === 'login' && auth.isAuthenticated && auth.splashSeen) {
    return { name: 'home' };
  }
});
