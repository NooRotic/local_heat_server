import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';

/**
 * Theme configuration shape
 */
export interface ThemeConfig {
  colors: Record<string, string>;
  fonts: Record<string, string>;
  effects: Record<string, number>;
  room: Record<string, string>;
}

const THEME_PATH = join(process.cwd(), 'theme.json');

/** Default theme — RipTheAI cyberpunk/matrix aesthetic */
const DEFAULTS: ThemeConfig = {
  colors: {
    primary: '#00ff88',
    accent: '#ff6b35',
    background: '#0a0a0a',
    surface: '#1a1a1a',
    surfaceLight: '#2a2a2a',
    panelBg: 'rgba(0, 20, 0, 0.85)',
    panelTint: 'rgba(0, 255, 136, 0.04)',
    border: '#004400',
    borderAccent: '#00ff88',
    text: '#ffffff',
    textSecondary: '#adadb8',
    textMuted: '#77777d',
    statusConnected: '#00ff88',
    statusDisconnected: '#ff4444',
    buttonGradientStart: '#00ff88',
    buttonGradientEnd: '#00cc66',
    buttonHover: '#33ff99',
    heatInner: '#ff0000',
    heatMid: '#ff6400',
    heatOuter: '#ffc800',
    markerDefault: '#00ff88',
    scrollbarThumb: '#ea580c',
    scrollbarTrack: '#374151',
  },
  fonts: {
    heading: "'Orbitron', 'Courier New', monospace",
    body: "'Courier New', Courier, monospace",
    mono: "'Courier New', Courier, monospace",
  },
  effects: {
    glowIntensity: 1.0,
    borderWidth: 2,
    borderRadius: 12,
    backdropBlur: 10,
    panelOpacity: 0.85,
  },
  room: {
    name: 'Champagne Room',
  },
};

/**
 * Deep merge source into target (non-destructive)
 */
function deepMerge(target: Record<string, any>, source: Record<string, any>): Record<string, any> {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (
      source[key] !== null &&
      typeof source[key] === 'object' &&
      !Array.isArray(source[key]) &&
      typeof target[key] === 'object' &&
      !Array.isArray(target[key])
    ) {
      result[key] = deepMerge(target[key], source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

/**
 * Manages theme.json — read, write, merge, reset
 */
export class ThemeManager {
  private cache: ThemeConfig | null = null;

  /** Load theme from disk, falling back to defaults for missing keys */
  async load(): Promise<ThemeConfig> {
    try {
      const raw = await readFile(THEME_PATH, 'utf-8');
      const parsed = JSON.parse(raw);
      this.cache = deepMerge(DEFAULTS, parsed) as ThemeConfig;
    } catch {
      this.cache = { ...DEFAULTS };
    }
    return this.cache;
  }

  /** Get current theme (from cache or disk) */
  async get(): Promise<ThemeConfig> {
    if (this.cache) return this.cache;
    return this.load();
  }

  /** Partial update — merges incoming data with current config and saves */
  async update(partial: Record<string, any>): Promise<ThemeConfig> {
    const current = await this.get();
    const merged = deepMerge(current as unknown as Record<string, any>, partial) as unknown as ThemeConfig;
    await writeFile(THEME_PATH, JSON.stringify(merged, null, 2), 'utf-8');
    this.cache = merged;
    return merged;
  }

  /** Reset to defaults */
  async reset(): Promise<ThemeConfig> {
    const defaults = structuredClone(DEFAULTS);
    await writeFile(THEME_PATH, JSON.stringify(defaults, null, 2), 'utf-8');
    this.cache = defaults;
    return defaults;
  }

  /** Get defaults (for reference) */
  getDefaults(): ThemeConfig {
    return structuredClone(DEFAULTS);
  }
}
