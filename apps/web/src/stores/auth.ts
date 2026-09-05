import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { api, clearTokens, setTokens, getAccessToken } from '@/api/client';

export interface UserSettings {
  splashImageUrl: string;
  locale: string;
  currency: string;
  peopleCount: number;
  dietaryNotes: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  settings: UserSettings;
  householdIds: string[];
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null);
  const loading = ref(false);
  const splashSeen = ref(sessionStorage.getItem('fo_splash_seen') === '1');

  const isAuthenticated = computed(() => Boolean(user.value && getAccessToken()));

  async function bootstrap() {
    if (!getAccessToken()) return;
    loading.value = true;
    try {
      const data = await api<{ user: User }>('/auth/me');
      user.value = data.user;
    } catch {
      clearTokens();
      user.value = null;
    } finally {
      loading.value = false;
    }
  }

  async function login(email: string, password: string) {
    const data = await api<{ user: User; accessToken: string; refreshToken: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setTokens(data.accessToken, data.refreshToken);
    user.value = data.user;
  }

  async function register(name: string, email: string, password: string) {
    const data = await api<{ user: User; accessToken: string; refreshToken: string }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password }),
    });
    setTokens(data.accessToken, data.refreshToken);
    user.value = data.user;
  }

  function logout() {
    clearTokens();
    user.value = null;
    replaySplash();
  }

  function markSplashSeen() {
    splashSeen.value = true;
    sessionStorage.setItem('fo_splash_seen', '1');
  }

  function replaySplash() {
    splashSeen.value = false;
    sessionStorage.removeItem('fo_splash_seen');
  }

  async function updateSettings(partial: Partial<UserSettings>) {
    const data = await api<{ settings: UserSettings }>('/me/settings', {
      method: 'PATCH',
      body: JSON.stringify(partial),
    });
    if (user.value) user.value.settings = data.settings;
  }

  return {
    user,
    loading,
    splashSeen,
    isAuthenticated,
    bootstrap,
    login,
    register,
    logout,
    markSplashSeen,
    replaySplash,
    updateSettings,
  };
});
