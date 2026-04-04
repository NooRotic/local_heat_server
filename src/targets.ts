import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import type { ClickTarget, HitTestResult, NormalizedBounds } from './types.js';

const TARGETS_PATH = join(process.cwd(), 'targets.json');

/**
 * Manages click target registration and hit-testing for LHS.
 *
 * Targets are axis-aligned rectangles in normalized (0-1) coordinate space.
 * A single click can hit zero, one, or many targets (overlap is allowed);
 * callers receive all matches and decide how to handle them.
 *
 * Production (RipV2) pulls bounds from OBS source transforms. LHS uses a
 * standalone registry — targets.json on disk for demo data.
 */
export class ClickTargetManager {
  private targets = new Map<string, ClickTarget>();
  private loaded = false;

  /** Load targets from targets.json (non-fatal if missing) */
  async load(): Promise<void> {
    try {
      const raw = await readFile(TARGETS_PATH, 'utf-8');
      const data = JSON.parse(raw);
      for (const target of data.targets || []) {
        if (this.validate(target)) {
          this.targets.set(target.name, target);
        } else {
          console.warn(`[Targets] Skipping invalid target: ${target.name || '(unnamed)'}`);
        }
      }
      this.loaded = true;
      console.log(`[Targets] Loaded ${this.targets.size} click targets`);
    } catch (error: any) {
      if (error?.code === 'ENOENT') {
        console.log('[Targets] No targets.json found, starting empty');
      } else {
        console.warn('[Targets] Failed to load targets.json:', error?.message);
      }
      this.loaded = true;
    }
  }

  /** Persist current targets to disk */
  async save(): Promise<void> {
    const data = { targets: Array.from(this.targets.values()) };
    await writeFile(TARGETS_PATH, JSON.stringify(data, null, 2), 'utf-8');
  }

  /**
   * Test a normalized click coordinate against all registered targets.
   * Returns every target the click landed inside (disabled targets excluded).
   */
  hitTest(x: number, y: number): HitTestResult[] {
    const results: HitTestResult[] = [];
    for (const target of this.targets.values()) {
      if (!target.enabled) continue;
      const hit = this.hitTestOne(x, y, target);
      if (hit) results.push(hit);
    }
    return results;
  }

  /** Test a single target. Returns the hit result or null if miss. */
  hitTestOne(x: number, y: number, target: ClickTarget): HitTestResult | null {
    const { bounds } = target;
    if (x < bounds.x || x > bounds.x + bounds.width) return null;
    if (y < bounds.y || y > bounds.y + bounds.height) return null;
    return {
      targetName: target.name,
      targetDisplayName: target.displayName,
      relativeX: bounds.width > 0 ? (x - bounds.x) / bounds.width : 0,
      relativeY: bounds.height > 0 ? (y - bounds.y) / bounds.height : 0,
      globalX: x,
      globalY: y,
    };
  }

  /** Create or replace a target. Returns false if the target fails validation. */
  upsert(target: ClickTarget): boolean {
    if (!this.validate(target)) return false;
    this.targets.set(target.name, target);
    return true;
  }

  /** Remove a target by name. Returns true if the target existed. */
  remove(name: string): boolean {
    return this.targets.delete(name);
  }

  /** Toggle enabled state. Returns the new state, or null if target doesn't exist. */
  toggle(name: string): boolean | null {
    const target = this.targets.get(name);
    if (!target) return null;
    target.enabled = !target.enabled;
    return target.enabled;
  }

  /** Get a single target by name */
  get(name: string): ClickTarget | undefined {
    return this.targets.get(name);
  }

  /** List all targets */
  list(): ClickTarget[] {
    return Array.from(this.targets.values());
  }

  /** Clear all targets (used in tests) */
  clear(): void {
    this.targets.clear();
  }

  /**
   * Validate a target definition.
   * Name + displayName must be non-empty, bounds must be in [0,1] with positive dimensions.
   */
  private validate(target: unknown): target is ClickTarget {
    if (!target || typeof target !== 'object') return false;
    const t = target as Record<string, unknown>;

    if (typeof t.name !== 'string' || t.name.trim() === '') return false;
    if (typeof t.displayName !== 'string' || t.displayName.trim() === '') return false;
    if (typeof t.enabled !== 'boolean') return false;

    const bounds = t.bounds as NormalizedBounds | undefined;
    if (!bounds || typeof bounds !== 'object') return false;
    if (typeof bounds.x !== 'number' || typeof bounds.y !== 'number') return false;
    if (typeof bounds.width !== 'number' || typeof bounds.height !== 'number') return false;

    // Coordinates must be in [0, 1] and form a valid rectangle inside the unit square
    if (bounds.x < 0 || bounds.x > 1) return false;
    if (bounds.y < 0 || bounds.y > 1) return false;
    if (bounds.width <= 0 || bounds.width > 1) return false;
    if (bounds.height <= 0 || bounds.height > 1) return false;
    if (bounds.x + bounds.width > 1.0001) return false;  // small epsilon for float precision
    if (bounds.y + bounds.height > 1.0001) return false;

    return true;
  }
}
