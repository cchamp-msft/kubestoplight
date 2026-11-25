// The theme settings (background palette and motion, components/BgPicker.tsx)
// are offered in dev and review builds (VITE_BG_PICKER=1); ?picker=0 hides
// them. App.tsx puts the button that opens them in the menu drawer's footer.
export const THEME_SETTINGS = (import.meta.env.DEV || import.meta.env.VITE_BG_PICKER === '1')
  && new URLSearchParams(window.location.search).get('picker') !== '0';
