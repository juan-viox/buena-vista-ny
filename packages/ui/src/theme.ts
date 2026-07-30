// ============================================================
// Theme bootstrap — inject in each app layout's <head> via
// <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
// Runs before paint so the correct data-theme is set with no flash.
// Storage key: 'viox-theme' ('dark' | 'light'); default follows
// prefers-color-scheme, falling back to dark (the design default).
// ============================================================

export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem('viox-theme');if(t!=='dark'&&t!=='light'){t=window.matchMedia&&window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';}document.documentElement.dataset.theme=t;}catch(e){document.documentElement.dataset.theme='dark';}})();`;
