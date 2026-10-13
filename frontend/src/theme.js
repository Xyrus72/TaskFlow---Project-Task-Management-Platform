import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/*
 * Appearance: "light" (the default), "dark", or "system" (follow the device setting).
 * Saved per device. index.html applies the saved choice before the first paint, so pages never flash white.
 */
const media = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

export const resolveTheme = (pref) => (pref === 'dark' || (pref === 'system' && media?.matches) ? 'dark' : 'light');

function apply(pref) {
  const theme = resolveTheme(pref);
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0f131a' : '#2563eb');
}

export const useTheme = create(
  persist(
    (set) => ({
      theme: 'light',
      setTheme(theme) { set({ theme }); apply(theme); },
    }),
    { name: 'taskflow-theme', onRehydrateStorage: () => (state) => apply(state?.theme || 'light') },
  ),
);

media?.addEventListener('change', () => { if (useTheme.getState().theme === 'system') apply('system'); });

/** The theme currently on screen ("light" or "dark"). */
export const useIsDark = () => resolveTheme(useTheme((s) => s.theme)) === 'dark';
