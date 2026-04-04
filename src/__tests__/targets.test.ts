import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ClickTargetManager } from '../targets.js';
import type { ClickTarget, HitTestResult } from '../types.js';
import { readFile, writeFile } from 'fs/promises';

// Mock fs/promises
vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
}));

/** Sample targets for testing */
const targetA: ClickTarget = {
  name: 'webcam',
  displayName: 'Webcam',
  bounds: { x: 0.75, y: 0.70, width: 0.22, height: 0.28 },
  enabled: true,
};

const targetB: ClickTarget = {
  name: 'alert',
  displayName: 'Alert Box',
  bounds: { x: 0.0, y: 0.0, width: 0.30, height: 0.15 },
  enabled: true,
};

const overlapping: ClickTarget = {
  name: 'overlay',
  displayName: 'Overlay',
  bounds: { x: 0.0, y: 0.0, width: 1.0, height: 1.0 },
  enabled: true,
};

describe('ClickTargetManager', () => {
  let manager: ClickTargetManager;

  beforeEach(() => {
    manager = new ClickTargetManager();
    vi.clearAllMocks();
  });

  afterEach(() => {
    manager.clear();
  });

  // ===== hitTest() — hit detection =====
  describe('hitTest() — hit detection', () => {
    beforeEach(() => {
      manager.upsert(targetA);
      manager.upsert(targetB);
    });

    it('should return target when click is inside bounds', () => {
      // Click in the middle of targetA (webcam at 0.75-0.97, 0.70-0.98)
      const results = manager.hitTest(0.85, 0.80);
      expect(results).toHaveLength(1);
      expect(results[0].targetName).toBe('webcam');
    });

    it('should return empty array when click is outside all targets', () => {
      // Click in empty space (e.g., far right, far top)
      const results = manager.hitTest(0.99, 0.99);
      expect(results).toHaveLength(0);
    });

    it('should hit target at top-left corner (bounds.x, bounds.y)', () => {
      // targetB is at (0.0, 0.0) with size 0.30x0.15
      const results = manager.hitTest(0.0, 0.0);
      expect(results).toHaveLength(1);
      expect(results[0].targetName).toBe('alert');
    });

    it('should hit target at bottom-right corner (bounds.x + width, bounds.y + height)', () => {
      // targetB bottom-right at (0.30, 0.15)
      const results = manager.hitTest(0.30, 0.15);
      expect(results).toHaveLength(1);
      expect(results[0].targetName).toBe('alert');
    });

    it('should miss when click is just outside the right edge', () => {
      // targetB ends at x=0.30, so x=0.301 should miss
      const results = manager.hitTest(0.301, 0.075);
      expect(results).toHaveLength(0);
    });

    it('should miss when click is just outside the left edge', () => {
      // targetB starts at x=0.0, so x=-0.001 should miss
      const results = manager.hitTest(-0.001, 0.075);
      expect(results).toHaveLength(0);
    });

    it('should miss when click is just outside the bottom edge', () => {
      // targetB ends at y=0.15, so y=0.151 should miss
      const results = manager.hitTest(0.15, 0.151);
      expect(results).toHaveLength(0);
    });

    it('should miss when click is just outside the top edge', () => {
      // targetB starts at y=0.0, so y=-0.001 should miss
      const results = manager.hitTest(0.15, -0.001);
      expect(results).toHaveLength(0);
    });
  });

  // ===== hitTest() — multi-hit (overlapping targets) =====
  describe('hitTest() — multi-hit overlapping', () => {
    it('should return all overlapping targets when click lands in overlap zone', () => {
      manager.upsert(targetB); // (0.0, 0.0, 0.30, 0.15)
      manager.upsert(overlapping); // (0.0, 0.0, 1.0, 1.0)

      const results = manager.hitTest(0.15, 0.075); // Inside both
      expect(results).toHaveLength(2);

      const names = results.map((r) => r.targetName).sort();
      expect(names).toEqual(['alert', 'overlay']);
    });

    it('should return only non-overlapping target when click is outside overlap', () => {
      manager.upsert(targetB); // (0.0, 0.0, 0.30, 0.15)
      manager.upsert(overlapping); // (0.0, 0.0, 1.0, 1.0)

      const results = manager.hitTest(0.5, 0.5); // Only in overlay
      expect(results).toHaveLength(1);
      expect(results[0].targetName).toBe('overlay');
    });

    it('should include all matching targets (no ordering guarantee)', () => {
      const t1: ClickTarget = {
        name: 'zone1',
        displayName: 'Zone 1',
        bounds: { x: 0.0, y: 0.0, width: 1.0, height: 1.0 },
        enabled: true,
      };
      const t2: ClickTarget = {
        name: 'zone2',
        displayName: 'Zone 2',
        bounds: { x: 0.0, y: 0.0, width: 1.0, height: 1.0 },
        enabled: true,
      };
      const t3: ClickTarget = {
        name: 'zone3',
        displayName: 'Zone 3',
        bounds: { x: 0.0, y: 0.0, width: 1.0, height: 1.0 },
        enabled: true,
      };

      manager.upsert(t1);
      manager.upsert(t2);
      manager.upsert(t3);

      const results = manager.hitTest(0.5, 0.5);
      expect(results).toHaveLength(3);
      expect(results.map((r) => r.targetName).sort()).toEqual(['zone1', 'zone2', 'zone3']);
    });
  });

  // ===== hitTest() — disabled targets =====
  describe('hitTest() — disabled targets', () => {
    it('should exclude disabled targets from results', () => {
      const enabled: ClickTarget = {
        name: 'enabled_target',
        displayName: 'Enabled',
        bounds: { x: 0.0, y: 0.0, width: 0.5, height: 0.5 },
        enabled: true,
      };
      const disabled: ClickTarget = {
        name: 'disabled_target',
        displayName: 'Disabled',
        bounds: { x: 0.0, y: 0.0, width: 0.5, height: 0.5 },
        enabled: false,
      };

      manager.upsert(enabled);
      manager.upsert(disabled);

      const results = manager.hitTest(0.25, 0.25);
      expect(results).toHaveLength(1);
      expect(results[0].targetName).toBe('enabled_target');
    });

    it('should include target after re-enabling via toggle', () => {
      const target: ClickTarget = {
        name: 'toggle_test',
        displayName: 'Toggle Test',
        bounds: { x: 0.0, y: 0.0, width: 1.0, height: 1.0 },
        enabled: false,
      };

      manager.upsert(target);
      expect(manager.hitTest(0.5, 0.5)).toHaveLength(0);

      manager.toggle('toggle_test');
      expect(manager.hitTest(0.5, 0.5)).toHaveLength(1);
    });
  });

  // ===== hitTest() — relative coordinates =====
  describe('hitTest() — relative coordinates', () => {
    beforeEach(() => {
      manager.upsert(targetA); // bounds: x=0.75, y=0.70, width=0.22, height=0.28
    });

    it('should compute relativeX and relativeY at target center', () => {
      // Center of targetA: x = 0.75 + 0.22/2 = 0.86, y = 0.70 + 0.28/2 = 0.84
      const results = manager.hitTest(0.86, 0.84);
      expect(results).toHaveLength(1);
      expect(results[0].relativeX).toBeCloseTo(0.5, 2);
      expect(results[0].relativeY).toBeCloseTo(0.5, 2);
    });

    it('should compute relativeX=0, relativeY=0 at top-left corner', () => {
      const results = manager.hitTest(0.75, 0.70);
      expect(results).toHaveLength(1);
      expect(results[0].relativeX).toBeCloseTo(0, 5);
      expect(results[0].relativeY).toBeCloseTo(0, 5);
    });

    it('should compute relativeX=1, relativeY=1 at bottom-right corner', () => {
      const results = manager.hitTest(0.75 + 0.22, 0.70 + 0.28);
      expect(results).toHaveLength(1);
      expect(results[0].relativeX).toBeCloseTo(1, 5);
      expect(results[0].relativeY).toBeCloseTo(1, 5);
    });

    it('should handle point at 1/4 position', () => {
      // 1/4 along x: 0.75 + 0.22 * 0.25 = 0.805
      // 1/4 along y: 0.70 + 0.28 * 0.25 = 0.77
      const results = manager.hitTest(0.805, 0.77);
      expect(results).toHaveLength(1);
      expect(results[0].relativeX).toBeCloseTo(0.25, 2);
      expect(results[0].relativeY).toBeCloseTo(0.25, 2);
    });

    it('should handle point at 3/4 position', () => {
      // 3/4 along x: 0.75 + 0.22 * 0.75 = 0.915
      // 3/4 along y: 0.70 + 0.28 * 0.75 = 0.91
      const results = manager.hitTest(0.915, 0.91);
      expect(results).toHaveLength(1);
      expect(results[0].relativeX).toBeCloseTo(0.75, 2);
      expect(results[0].relativeY).toBeCloseTo(0.75, 2);
    });
  });

  // ===== hitTest() — globalX/globalY preserved =====
  describe('hitTest() — globalX/globalY preserved', () => {
    beforeEach(() => {
      manager.upsert(overlapping);
    });

    it('should preserve original click coordinates in globalX/globalY', () => {
      const clickX = 0.3456;
      const clickY = 0.7891;
      const results = manager.hitTest(clickX, clickY);

      expect(results).toHaveLength(1);
      expect(results[0].globalX).toBe(clickX);
      expect(results[0].globalY).toBe(clickY);
    });

    it('should preserve globalX/globalY across multiple overlapping targets', () => {
      manager.clear(); // Clear the overlapping target added in beforeEach
      const t1: ClickTarget = {
        name: 't1',
        displayName: 'T1',
        bounds: { x: 0.0, y: 0.0, width: 1.0, height: 1.0 },
        enabled: true,
      };
      const t2: ClickTarget = {
        name: 't2',
        displayName: 'T2',
        bounds: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
        enabled: true,
      };

      manager.upsert(t1);
      manager.upsert(t2);

      const clickX = 0.5432;
      const clickY = 0.6789;
      const results = manager.hitTest(clickX, clickY);

      expect(results).toHaveLength(2);
      results.forEach((result) => {
        expect(result.globalX).toBe(clickX);
        expect(result.globalY).toBe(clickY);
      });
    });
  });

  // ===== hitTestOne() — single target API =====
  describe('hitTestOne()', () => {
    it('should return HitTestResult when target is hit', () => {
      const result = manager.hitTestOne(0.85, 0.80, targetA);
      expect(result).not.toBeNull();
      expect(result!.targetName).toBe('webcam');
      expect(result!.globalX).toBe(0.85);
      expect(result!.globalY).toBe(0.80);
    });

    it('should return null when target is missed', () => {
      const result = manager.hitTestOne(0.5, 0.5, targetA);
      expect(result).toBeNull();
    });

    it('should compute relative coordinates correctly for single target', () => {
      // targetA center
      const centerX = 0.75 + 0.22 / 2;
      const centerY = 0.70 + 0.28 / 2;
      const result = manager.hitTestOne(centerX, centerY, targetA);

      expect(result).not.toBeNull();
      expect(result!.relativeX).toBeCloseTo(0.5, 2);
      expect(result!.relativeY).toBeCloseTo(0.5, 2);
    });

    it('should handle edge cases (corners)', () => {
      const topLeft = manager.hitTestOne(0.75, 0.70, targetA);
      expect(topLeft).not.toBeNull();
      expect(topLeft!.relativeX).toBeCloseTo(0, 5);
      expect(topLeft!.relativeY).toBeCloseTo(0, 5);

      const bottomRight = manager.hitTestOne(0.75 + 0.22, 0.70 + 0.28, targetA);
      expect(bottomRight).not.toBeNull();
      expect(bottomRight!.relativeX).toBeCloseTo(1, 5);
      expect(bottomRight!.relativeY).toBeCloseTo(1, 5);
    });

    it('should return null just outside bounds', () => {
      const just_outside_x = manager.hitTestOne(0.75 - 0.001, 0.80, targetA);
      expect(just_outside_x).toBeNull();

      const just_outside_y = manager.hitTestOne(0.85, 0.70 - 0.001, targetA);
      expect(just_outside_y).toBeNull();
    });
  });

  // ===== upsert() =====
  describe('upsert()', () => {
    it('should insert a valid target and return true', () => {
      const result = manager.upsert(targetA);
      expect(result).toBe(true);
      expect(manager.get('webcam')).toEqual(targetA);
    });

    it('should update an existing target (same name) and return true', () => {
      manager.upsert(targetA);
      const updated: ClickTarget = {
        ...targetA,
        displayName: 'Updated Webcam',
      };

      const result = manager.upsert(updated);
      expect(result).toBe(true);
      expect(manager.get('webcam')!.displayName).toBe('Updated Webcam');
      expect(manager.list()).toHaveLength(1); // list length unchanged
    });

    it('should return false for invalid target (missing name)', () => {
      const invalid: any = {
        displayName: 'Test',
        bounds: { x: 0.0, y: 0.0, width: 0.5, height: 0.5 },
        enabled: true,
      };

      const result = manager.upsert(invalid);
      expect(result).toBe(false);
      expect(manager.list()).toHaveLength(0);
    });

    it('should return false for empty name', () => {
      const invalid: any = {
        name: '',
        displayName: 'Test',
        bounds: { x: 0.0, y: 0.0, width: 0.5, height: 0.5 },
        enabled: true,
      };

      const result = manager.upsert(invalid);
      expect(result).toBe(false);
    });

    it('should return false for whitespace-only name', () => {
      const invalid: any = {
        name: '   ',
        displayName: 'Test',
        bounds: { x: 0.0, y: 0.0, width: 0.5, height: 0.5 },
        enabled: true,
      };

      const result = manager.upsert(invalid);
      expect(result).toBe(false);
    });

    it('should return false for missing displayName', () => {
      const invalid: any = {
        name: 'test',
        bounds: { x: 0.0, y: 0.0, width: 0.5, height: 0.5 },
        enabled: true,
      };

      const result = manager.upsert(invalid);
      expect(result).toBe(false);
    });

    it('should return false for empty displayName', () => {
      const invalid: any = {
        name: 'test',
        displayName: '',
        bounds: { x: 0.0, y: 0.0, width: 0.5, height: 0.5 },
        enabled: true,
      };

      const result = manager.upsert(invalid);
      expect(result).toBe(false);
    });

    it('should return false for whitespace-only displayName', () => {
      const invalid: any = {
        name: 'test',
        displayName: '\t\n  ',
        bounds: { x: 0.0, y: 0.0, width: 0.5, height: 0.5 },
        enabled: true,
      };

      const result = manager.upsert(invalid);
      expect(result).toBe(false);
    });

    it('should return false for missing bounds', () => {
      const invalid: any = {
        name: 'test',
        displayName: 'Test',
        enabled: true,
      };

      const result = manager.upsert(invalid);
      expect(result).toBe(false);
    });

    it('should return false for missing bounds fields (x, y, width, height)', () => {
      const invalid: any = {
        name: 'test',
        displayName: 'Test',
        bounds: { x: 0.0, y: 0.0 }, // missing width, height
        enabled: true,
      };

      const result = manager.upsert(invalid);
      expect(result).toBe(false);
    });

    it('should return false for negative x', () => {
      const invalid: any = {
        name: 'test',
        displayName: 'Test',
        bounds: { x: -0.1, y: 0.0, width: 0.5, height: 0.5 },
        enabled: true,
      };

      const result = manager.upsert(invalid);
      expect(result).toBe(false);
    });

    it('should return false for negative y', () => {
      const invalid: any = {
        name: 'test',
        displayName: 'Test',
        bounds: { x: 0.0, y: -0.1, width: 0.5, height: 0.5 },
        enabled: true,
      };

      const result = manager.upsert(invalid);
      expect(result).toBe(false);
    });

    it('should return false for x > 1', () => {
      const invalid: any = {
        name: 'test',
        displayName: 'Test',
        bounds: { x: 1.1, y: 0.0, width: 0.5, height: 0.5 },
        enabled: true,
      };

      const result = manager.upsert(invalid);
      expect(result).toBe(false);
    });

    it('should return false for y > 1', () => {
      const invalid: any = {
        name: 'test',
        displayName: 'Test',
        bounds: { x: 0.0, y: 1.1, width: 0.5, height: 0.5 },
        enabled: true,
      };

      const result = manager.upsert(invalid);
      expect(result).toBe(false);
    });

    it('should return false for zero width', () => {
      const invalid: any = {
        name: 'test',
        displayName: 'Test',
        bounds: { x: 0.0, y: 0.0, width: 0, height: 0.5 },
        enabled: true,
      };

      const result = manager.upsert(invalid);
      expect(result).toBe(false);
    });

    it('should return false for negative width', () => {
      const invalid: any = {
        name: 'test',
        displayName: 'Test',
        bounds: { x: 0.0, y: 0.0, width: -0.1, height: 0.5 },
        enabled: true,
      };

      const result = manager.upsert(invalid);
      expect(result).toBe(false);
    });

    it('should return false for zero height', () => {
      const invalid: any = {
        name: 'test',
        displayName: 'Test',
        bounds: { x: 0.0, y: 0.0, width: 0.5, height: 0 },
        enabled: true,
      };

      const result = manager.upsert(invalid);
      expect(result).toBe(false);
    });

    it('should return false for negative height', () => {
      const invalid: any = {
        name: 'test',
        displayName: 'Test',
        bounds: { x: 0.0, y: 0.0, width: 0.5, height: -0.1 },
        enabled: true,
      };

      const result = manager.upsert(invalid);
      expect(result).toBe(false);
    });

    it('should return false for width > 1', () => {
      const invalid: any = {
        name: 'test',
        displayName: 'Test',
        bounds: { x: 0.0, y: 0.0, width: 1.1, height: 0.5 },
        enabled: true,
      };

      const result = manager.upsert(invalid);
      expect(result).toBe(false);
    });

    it('should return false for height > 1', () => {
      const invalid: any = {
        name: 'test',
        displayName: 'Test',
        bounds: { x: 0.0, y: 0.0, width: 0.5, height: 1.1 },
        enabled: true,
      };

      const result = manager.upsert(invalid);
      expect(result).toBe(false);
    });

    it('should return false when x + width exceeds 1.0001', () => {
      const invalid: any = {
        name: 'test',
        displayName: 'Test',
        bounds: { x: 0.6, y: 0.0, width: 0.5, height: 0.5 }, // 0.6 + 0.5 = 1.1
        enabled: true,
      };

      const result = manager.upsert(invalid);
      expect(result).toBe(false);
    });

    it('should return false when y + height exceeds 1.0001', () => {
      const invalid: any = {
        name: 'test',
        displayName: 'Test',
        bounds: { x: 0.0, y: 0.6, width: 0.5, height: 0.5 }, // 0.6 + 0.5 = 1.1
        enabled: true,
      };

      const result = manager.upsert(invalid);
      expect(result).toBe(false);
    });

    it('should accept x + width == 1.0 (boundary)', () => {
      const valid: ClickTarget = {
        name: 'test',
        displayName: 'Test',
        bounds: { x: 0.5, y: 0.0, width: 0.5, height: 0.5 },
        enabled: true,
      };

      const result = manager.upsert(valid);
      expect(result).toBe(true);
    });

    it('should accept y + height == 1.0 (boundary)', () => {
      const valid: ClickTarget = {
        name: 'test',
        displayName: 'Test',
        bounds: { x: 0.0, y: 0.5, width: 0.5, height: 0.5 },
        enabled: true,
      };

      const result = manager.upsert(valid);
      expect(result).toBe(true);
    });

    it('should accept x + width up to 1.0001 (epsilon)', () => {
      const valid: ClickTarget = {
        name: 'test',
        displayName: 'Test',
        bounds: { x: 0.5, y: 0.0, width: 0.50005, height: 0.5 },
        enabled: true,
      };

      const result = manager.upsert(valid);
      expect(result).toBe(true);
    });

    it('should return false for enabled not being boolean (string)', () => {
      const invalid: any = {
        name: 'test',
        displayName: 'Test',
        bounds: { x: 0.0, y: 0.0, width: 0.5, height: 0.5 },
        enabled: 'true',
      };

      const result = manager.upsert(invalid);
      expect(result).toBe(false);
    });

    it('should return false for enabled not being boolean (number)', () => {
      const invalid: any = {
        name: 'test',
        displayName: 'Test',
        bounds: { x: 0.0, y: 0.0, width: 0.5, height: 0.5 },
        enabled: 1,
      };

      const result = manager.upsert(invalid);
      expect(result).toBe(false);
    });

    it('should return false for null input', () => {
      const result = manager.upsert(null as any);
      expect(result).toBe(false);
    });

    it('should return false for undefined input', () => {
      const result = manager.upsert(undefined as any);
      expect(result).toBe(false);
    });

    it('should return false for non-object input (string)', () => {
      const result = manager.upsert('target' as any);
      expect(result).toBe(false);
    });

    it('should return false for non-object input (number)', () => {
      const result = manager.upsert(42 as any);
      expect(result).toBe(false);
    });

    it('should allow optional metadata field', () => {
      const withMetadata: ClickTarget = {
        name: 'test',
        displayName: 'Test',
        bounds: { x: 0.0, y: 0.0, width: 0.5, height: 0.5 },
        enabled: true,
        metadata: { color: '#ff0000', sourceId: 'source_123' },
      };

      const result = manager.upsert(withMetadata);
      expect(result).toBe(true);
      expect(manager.get('test')!.metadata).toEqual({ color: '#ff0000', sourceId: 'source_123' });
    });
  });

  // ===== remove() =====
  describe('remove()', () => {
    it('should return true and remove existing target', () => {
      manager.upsert(targetA);
      expect(manager.list()).toHaveLength(1);

      const result = manager.remove('webcam');
      expect(result).toBe(true);
      expect(manager.list()).toHaveLength(0);
      expect(manager.get('webcam')).toBeUndefined();
    });

    it('should return false for non-existent target', () => {
      const result = manager.remove('does_not_exist');
      expect(result).toBe(false);
    });

    it('should remove only the specified target', () => {
      manager.upsert(targetA);
      manager.upsert(targetB);
      expect(manager.list()).toHaveLength(2);

      manager.remove('webcam');
      expect(manager.list()).toHaveLength(1);
      expect(manager.get('alert')).toBeDefined();
      expect(manager.get('webcam')).toBeUndefined();
    });

    it('should allow re-adding target after removal', () => {
      manager.upsert(targetA);
      manager.remove('webcam');
      expect(manager.list()).toHaveLength(0);

      manager.upsert(targetA);
      expect(manager.list()).toHaveLength(1);
      expect(manager.get('webcam')).toEqual(targetA);
    });
  });

  // ===== toggle() =====
  describe('toggle()', () => {
    it('should toggle enabled target to disabled and return false', () => {
      const freshTarget = { ...targetA }; // enabled: true
      manager.upsert(freshTarget);
      const result = manager.toggle('webcam');
      expect(result).toBe(false);
      expect(manager.get('webcam')!.enabled).toBe(false);
    });

    it('should toggle disabled target to enabled and return true', () => {
      const disabled: ClickTarget = { ...targetA, enabled: false };
      manager.upsert(disabled);

      const result = manager.toggle('webcam');
      expect(result).toBe(true);
      expect(manager.get('webcam')!.enabled).toBe(true);
    });

    it('should return null for non-existent target', () => {
      const result = manager.toggle('does_not_exist');
      expect(result).toBeNull();
    });

    it('should toggle multiple times', () => {
      const freshTarget = { ...targetA }; // Fresh copy to avoid state pollution
      manager.upsert(freshTarget);

      let state = manager.toggle('webcam');
      expect(state).toBe(false);

      state = manager.toggle('webcam');
      expect(state).toBe(true);

      state = manager.toggle('webcam');
      expect(state).toBe(false);
    });

    it('should affect hitTest results immediately', () => {
      const freshTarget = { ...targetA };
      manager.upsert(freshTarget);

      expect(manager.hitTest(0.85, 0.80)).toHaveLength(1);
      manager.toggle('webcam');
      expect(manager.hitTest(0.85, 0.80)).toHaveLength(0);
      manager.toggle('webcam');
      expect(manager.hitTest(0.85, 0.80)).toHaveLength(1);
    });
  });

  // ===== get() / list() / clear() =====
  describe('get() / list() / clear()', () => {
    it('should return target via get()', () => {
      manager.upsert(targetA);
      expect(manager.get('webcam')).toEqual(targetA);
    });

    it('should return undefined for non-existent target via get()', () => {
      expect(manager.get('does_not_exist')).toBeUndefined();
    });

    it('should return all targets via list()', () => {
      manager.upsert(targetA);
      manager.upsert(targetB);
      manager.upsert(overlapping);

      const list = manager.list();
      expect(list).toHaveLength(3);
      expect(list.map((t) => t.name).sort()).toEqual(['alert', 'overlay', 'webcam']);
    });

    it('should return empty array from list() when no targets', () => {
      expect(manager.list()).toHaveLength(0);
    });

    it('should clear all targets', () => {
      manager.upsert(targetA);
      manager.upsert(targetB);
      expect(manager.list()).toHaveLength(2);

      manager.clear();
      expect(manager.list()).toHaveLength(0);
      expect(manager.get('webcam')).toBeUndefined();
      expect(manager.get('alert')).toBeUndefined();
    });

    it('should allow re-adding targets after clear()', () => {
      manager.upsert(targetA);
      manager.clear();
      manager.upsert(targetB);

      expect(manager.list()).toHaveLength(1);
      expect(manager.get('alert')).toEqual(targetB);
    });
  });

  // ===== load() / save() with mocked fs =====
  describe('load() / save()', () => {
    const mockReadFile = readFile as any;
    const mockWriteFile = writeFile as any;

    afterEach(() => {
      vi.clearAllMocks();
    });

    describe('load()', () => {
      it('should parse targets.json and populate map', async () => {
        const mockData = {
          targets: [targetA, targetB],
        };
        mockReadFile.mockResolvedValueOnce(JSON.stringify(mockData));

        await manager.load();

        expect(manager.get('webcam')).toEqual(targetA);
        expect(manager.get('alert')).toEqual(targetB);
        expect(manager.list()).toHaveLength(2);
      });

      it('should skip invalid targets silently', async () => {
        const mockData = {
          targets: [
            targetA,
            {
              name: 'invalid',
              displayName: 'Invalid',
              bounds: { x: 2.0, y: 0.0, width: 0.5, height: 0.5 }, // x out of range
              enabled: true,
            },
            targetB,
          ],
        };
        mockReadFile.mockResolvedValueOnce(JSON.stringify(mockData));

        await manager.load();

        expect(manager.list()).toHaveLength(2);
        expect(manager.get('webcam')).toBeDefined();
        expect(manager.get('alert')).toBeDefined();
        expect(manager.get('invalid')).toBeUndefined();
      });

      it('should handle ENOENT gracefully (file not found)', async () => {
        mockReadFile.mockRejectedValueOnce({ code: 'ENOENT' });

        await manager.load();

        expect(manager.list()).toHaveLength(0);
      });

      it('should handle other read errors gracefully', async () => {
        mockReadFile.mockRejectedValueOnce(new Error('Permission denied'));

        await manager.load();

        expect(manager.list()).toHaveLength(0);
      });

      it('should handle empty targets array', async () => {
        const mockData = { targets: [] };
        mockReadFile.mockResolvedValueOnce(JSON.stringify(mockData));

        await manager.load();

        expect(manager.list()).toHaveLength(0);
      });

      it('should handle missing targets key in JSON', async () => {
        const mockData = {};
        mockReadFile.mockResolvedValueOnce(JSON.stringify(mockData));

        await manager.load();

        expect(manager.list()).toHaveLength(0);
      });

      it('should handle malformed JSON gracefully', async () => {
        mockReadFile.mockResolvedValueOnce('{ invalid json');

        await manager.load();

        expect(manager.list()).toHaveLength(0);
      });
    });

    describe('save()', () => {
      it('should write targets to targets.json via writeFile', async () => {
        manager.upsert(targetA);
        manager.upsert(targetB);

        await manager.save();

        expect(mockWriteFile).toHaveBeenCalledOnce();
        const call = mockWriteFile.mock.calls[0];
        const [filePath, data, encoding] = call;

        expect(encoding).toBe('utf-8');

        const parsed = JSON.parse(data);
        expect(parsed.targets).toHaveLength(2);
        expect(parsed.targets.map((t: any) => t.name).sort()).toEqual(['alert', 'webcam']);
      });

      it('should write empty array when no targets', async () => {
        await manager.save();

        expect(mockWriteFile).toHaveBeenCalledOnce();
        const call = mockWriteFile.mock.calls[0];
        const data = call[1];

        const parsed = JSON.parse(data);
        expect(parsed.targets).toEqual([]);
      });

      it('should format JSON with 2-space indentation', async () => {
        manager.upsert(targetA);

        await manager.save();

        const call = mockWriteFile.mock.calls[0];
        const data = call[1];

        expect(data).toContain('  '); // Should have indentation
        expect(data).toContain('\n'); // Should have newlines
      });

      it('should preserve metadata during save/load roundtrip', async () => {
        const withMeta: ClickTarget = {
          name: 'test',
          displayName: 'Test',
          bounds: { x: 0.0, y: 0.0, width: 0.5, height: 0.5 },
          enabled: true,
          metadata: { custom: 'value', sourceId: 'src_123' },
        };
        manager.upsert(withMeta);

        await manager.save();

        const call = mockWriteFile.mock.calls[0];
        const data = call[1];
        const parsed = JSON.parse(data);

        expect(parsed.targets[0].metadata).toEqual({ custom: 'value', sourceId: 'src_123' });
      });
    });

    describe('load() and save() integration', () => {
      it('should perform roundtrip: add -> save -> clear -> load', async () => {
        manager.upsert(targetA);
        manager.upsert(targetB);

        await manager.save();

        // Capture what was written
        const call = mockWriteFile.mock.calls[0];
        const savedData = call[1];

        // Clear and load
        manager.clear();
        expect(manager.list()).toHaveLength(0);

        mockReadFile.mockResolvedValueOnce(savedData);
        await manager.load();

        expect(manager.list()).toHaveLength(2);
        expect(manager.get('webcam')).toEqual(targetA);
        expect(manager.get('alert')).toEqual(targetB);
      });
    });
  });

  // ===== Edge cases and integration =====
  describe('Edge cases and integration', () => {
    it('should handle very small targets', () => {
      const tiny: ClickTarget = {
        name: 'tiny',
        displayName: 'Tiny',
        bounds: { x: 0.5, y: 0.5, width: 0.001, height: 0.001 },
        enabled: true,
      };

      manager.upsert(tiny);
      expect(manager.hitTest(0.5, 0.5)).toHaveLength(1); // Corner hit
      expect(manager.hitTest(0.5001, 0.5001)).toHaveLength(1); // Just inside
      expect(manager.hitTest(0.5011, 0.5011)).toHaveLength(0); // Just outside
    });

    it('should handle targets at unit boundaries', () => {
      const fullScreen: ClickTarget = {
        name: 'full',
        displayName: 'Full Screen',
        bounds: { x: 0.0, y: 0.0, width: 1.0, height: 1.0 },
        enabled: true,
      };

      manager.upsert(fullScreen);
      expect(manager.hitTest(0.0, 0.0)).toHaveLength(1);
      expect(manager.hitTest(1.0, 1.0)).toHaveLength(1);
      expect(manager.hitTest(0.5, 0.5)).toHaveLength(1);
      expect(manager.hitTest(1.001, 1.001)).toHaveLength(0);
    });

    it('should preserve reference on get()', () => {
      manager.upsert(targetA);
      const retrieved = manager.get('webcam')!;
      retrieved.enabled = false;

      expect(manager.get('webcam')!.enabled).toBe(false); // Change persists
    });

    it('should return new array from list() (not original reference)', () => {
      manager.upsert(targetA);
      const list1 = manager.list();
      list1.push(targetB); // Mutate returned array

      const list2 = manager.list();
      expect(list2).toHaveLength(1); // Original unaffected
    });
  });
});
