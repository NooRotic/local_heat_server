/**
 * Theme Loader — fetches theme config from server and applies CSS custom properties.
 * Include this script in every page: <script src="/theme-loader.js"></script>
 *
 * Exposes window.HeatTheme for JS-driven rendering (canvas gradients, etc.)
 * Dispatches 'themeloaded' event on document when ready.
 */
(function () {
  'use strict';

  const API_URL = '/api/theme';

  /** Map flat theme keys to CSS custom property names */
  function applyCSS(theme) {
    const root = document.documentElement;

    // Colors
    if (theme.colors) {
      for (const [key, value] of Object.entries(theme.colors)) {
        root.style.setProperty('--color-' + camelToDash(key), value);
      }
    }

    // Fonts
    if (theme.fonts) {
      for (const [key, value] of Object.entries(theme.fonts)) {
        root.style.setProperty('--font-' + camelToDash(key), value);
      }
    }

    // Effects
    if (theme.effects) {
      for (const [key, value] of Object.entries(theme.effects)) {
        const unit = getUnit(key);
        root.style.setProperty('--effect-' + camelToDash(key), value + unit);
      }
    }
  }

  /** Convert camelCase to dash-case */
  function camelToDash(str) {
    return str.replace(/([A-Z])/g, '-$1').toLowerCase();
  }

  /** Get CSS unit for an effect key */
  function getUnit(key) {
    if (key === 'glowIntensity' || key === 'panelOpacity') return '';
    if (key === 'backdropBlur' || key === 'borderWidth' || key === 'borderRadius') return 'px';
    return '';
  }

  /** Compute glow shadows from primary color and intensity */
  function applyGlow(theme) {
    const root = document.documentElement;
    const color = (theme.colors && theme.colors.primary) || '#00ff88';
    const intensity = (theme.effects && theme.effects.glowIntensity) || 1;

    const blur1 = Math.round(16 * intensity);
    const blur2 = Math.round(32 * intensity);
    root.style.setProperty('--glow-text', `0 0 ${blur1}px ${color}, 0 0 ${blur2}px ${color}`);
    root.style.setProperty('--glow-box', `0 0 ${blur1}px ${color}55, 0 0 ${blur2}px ${color}33`);
    root.style.setProperty('--glow-box-strong', `0 0 ${blur1}px ${color}, 0 0 ${blur2}px ${color}88`);
  }

  /** Load and apply theme */
  async function loadTheme() {
    let theme;
    try {
      const res = await fetch(API_URL);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      theme = await res.json();
    } catch (err) {
      console.warn('[theme-loader] Could not fetch theme, using fallback:', err.message);
      // Minimal fallback so pages still look correct
      theme = {
        colors: {
          primary: '#00ff88', accent: '#ff6b35', background: '#0a0a0a',
          surface: '#1a1a1a', text: '#ffffff', textSecondary: '#adadb8',
          border: '#004400', borderAccent: '#00ff88',
          statusConnected: '#00ff88', statusDisconnected: '#ff4444',
          buttonGradientStart: '#00ff88', buttonGradientEnd: '#00cc66',
        },
        fonts: {
          heading: "'Orbitron', 'Courier New', monospace",
          body: "'Courier New', Courier, monospace",
        },
        effects: { glowIntensity: 1, borderWidth: 2, borderRadius: 12, backdropBlur: 10 },
      };
    }

    // Store globally for canvas/JS access
    window.HeatTheme = theme;

    // Apply to CSS
    applyCSS(theme);
    applyGlow(theme);

    // Notify listeners
    document.dispatchEvent(new CustomEvent('themeloaded', { detail: theme }));
  }

  // Load as soon as DOM is available
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadTheme);
  } else {
    loadTheme();
  }
})();
