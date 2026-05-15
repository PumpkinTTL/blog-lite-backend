import { computed, ref } from 'vue'
import { darkTheme, type GlobalThemeOverrides } from 'naive-ui'

export const isDark = ref(false)

export const naiveTheme = computed(() => (isDark.value ? darkTheme : null))

export const themeOverrides: GlobalThemeOverrides = {
  common: {
    primaryColor: '#2563EB',
    primaryColorHover: '#3B82F6',
    primaryColorPressed: '#1D4ED8',
    primaryColorSuppl: '#60A5FA',
    borderRadius: '8px',
    borderRadiusSmall: '6px',
    fontFamily: "'Inter', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    fontSize: '14px',
  },
  Card: {
    borderRadius: '16px',
  },
  Input: {
    borderRadius: '8px',
  },
  Button: {
    borderRadiusMedium: '8px',
  },
}
