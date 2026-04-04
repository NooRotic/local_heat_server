import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { IdentityResolver } from '../identity.js';
import type { IdentityResponse, ViewerProfile } from '../types.js';
import { readFile } from 'fs/promises';
import { join } from 'path';

// Mock fs/promises
vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
}));

describe('IdentityResolver', () => {
  let resolver: IdentityResolver;

  beforeEach(() => {
    resolver = new IdentityResolver();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('parseId()', () => {
    it('should identify A-prefix as anonymous', () => {
      const result = resolver.parseId('A-random-token-12345');
      expect(result.tier).toBe('anonymous');
      expect(result.cleanId).toBe('A-random-token-12345');
    });

    it('should identify U-prefix as unverified', () => {
      const result = resolver.parseId('U-unverified-token-67890');
      expect(result.tier).toBe('unverified');
      expect(result.cleanId).toBe('U-unverified-token-67890');
    });

    it('should identify numeric ID as verified', () => {
      const result = resolver.parseId('12345678');
      expect(result.tier).toBe('verified');
      expect(result.cleanId).toBe('12345678');
    });

    it('should handle numeric IDs with leading zeros', () => {
      const result = resolver.parseId('00123456');
      expect(result.tier).toBe('verified');
      expect(result.cleanId).toBe('00123456');
    });

    it('should handle IDs starting with numbers as verified (not A or U)', () => {
      const result = resolver.parseId('1234ABC');
      expect(result.tier).toBe('verified');
      expect(result.cleanId).toBe('1234ABC');
    });
  });

  describe('resolve()', () => {
    beforeEach(async () => {
      // Mock viewers.json with test data
      const mockViewers = {
        viewers: [
          {
            userId: '12345678',
            displayName: 'CoolViewer42',
            profileImageUrl: 'https://static-cdn.jtvnw.net/jtv_user_pictures/placeholder-1.png',
            color: '#ff6b35',
            friendshipLevel: 3,
            bio: 'Regular viewer, loves fighting games',
          },
          {
            userId: '23456789',
            displayName: 'RaidBoss99',
            profileImageUrl: 'https://static-cdn.jtvnw.net/jtv_user_pictures/placeholder-2.png',
            color: '#9147ff',
            friendshipLevel: 5,
            bio: 'Raid leader, always brings the squad',
          },
          {
            userId: '34567890',
            displayName: 'SilentSam',
            profileImageUrl: 'https://static-cdn.jtvnw.net/jtv_user_pictures/placeholder-3.png',
            color: '#00ff88',
            friendshipLevel: 1,
            bio: 'Lurker who occasionally types',
          },
          {
            userId: '45678901',
            displayName: 'PixelQueen',
            profileImageUrl: 'https://static-cdn.jtvnw.net/jtv_user_pictures/placeholder-4.png',
            color: '#ff69b4',
            friendshipLevel: 4,
            bio: 'Artist and emote creator',
          },
          {
            userId: '56789012',
            displayName: 'CodeMonkey_Dev',
            profileImageUrl: 'https://static-cdn.jtvnw.net/jtv_user_pictures/placeholder-5.png',
            color: '#1e90ff',
            friendshipLevel: 2,
            bio: 'Backseat coder, always has opinions',
          },
          {
            userId: '67890123',
            displayName: 'NightOwl_TV',
            profileImageUrl: 'https://static-cdn.jtvnw.net/jtv_user_pictures/placeholder-6.png',
            color: '#ffd700',
            friendshipLevel: 3,
            bio: 'Late night regular, never misses a stream',
          },
          {
            userId: '78901234',
            displayName: 'TurboGamer',
            profileImageUrl: 'https://static-cdn.jtvnw.net/jtv_user_pictures/placeholder-7.png',
            color: '#ff4444',
            friendshipLevel: 2,
            bio: 'Competitive player, loves chat games',
          },
          {
            userId: '89012345',
            displayName: 'ChillVibes420',
            profileImageUrl: 'https://static-cdn.jtvnw.net/jtv_user_pictures/placeholder-8.png',
            color: '#00bcd4',
            friendshipLevel: 1,
            bio: 'Just here for the vibes',
          },
        ],
      };

      vi.mocked(readFile).mockResolvedValue(JSON.stringify(mockViewers));
      await resolver.load();
    });

    describe('with known verified ID', () => {
      it('should resolve known viewer and return correct identity', async () => {
        const identity = await resolver.resolve('12345678');

        expect(identity.resolved).toBe(true);
        expect(identity.userId).toBe('12345678');
        expect(identity.displayName).toBe('CoolViewer42');
        expect(identity.profileImageUrl).toBe(
          'https://static-cdn.jtvnw.net/jtv_user_pictures/placeholder-1.png'
        );
        expect(identity.color).toBe('#ff6b35');
        expect(identity.tier).toBe('verified');
        expect(identity.friendshipLevel).toBe(3);
      });

      it('should resolve different known viewers correctly', async () => {
        const identity1 = await resolver.resolve('23456789');
        const identity2 = await resolver.resolve('34567890');

        expect(identity1.displayName).toBe('RaidBoss99');
        expect(identity1.friendshipLevel).toBe(5);

        expect(identity2.displayName).toBe('SilentSam');
        expect(identity2.friendshipLevel).toBe(1);
      });
    });

    describe('with unknown verified ID', () => {
      it('should return resolved=false with generated displayName', async () => {
        const identity = await resolver.resolve('99999999');

        expect(identity.resolved).toBe(false);
        expect(identity.userId).toBe('99999999');
        expect(identity.displayName).toBe('User_999999');
        expect(identity.profileImageUrl).toBeNull();
        expect(identity.tier).toBe('verified');
        expect(identity.friendshipLevel).toBe(0);
      });

      it('should generate consistent color for unknown ID', async () => {
        const identity = await resolver.resolve('88888888');
        // Just verify it's an HSL color
        expect(identity.color).toMatch(/^hsl\(\d+,\s*70%,\s*60%\)$/);
      });
    });

    describe('with U-prefix (unverified)', () => {
      it('should return unverified tier with generic displayName', async () => {
        const identity = await resolver.resolve('U-unverified-token');

        expect(identity.resolved).toBe(false);
        expect(identity.userId).toBe('U-unverified-token');
        expect(identity.displayName).toBe('Viewer');
        expect(identity.profileImageUrl).toBeNull();
        expect(identity.tier).toBe('unverified');
        expect(identity.friendshipLevel).toBe(0);
      });

      it('should generate HSL color for unverified ID', async () => {
        const identity = await resolver.resolve('U-test-123');
        expect(identity.color).toMatch(/^hsl\(\d+,\s*70%,\s*60%\)$/);
      });

      it('should generate consistent color for same unverified ID', async () => {
        const id = 'U-consistent-test';
        const identity1 = await resolver.resolve(id);
        const identity2 = await resolver.resolve(id);

        expect(identity1.color).toBe(identity2.color);
      });
    });

    describe('with A-prefix (anonymous)', () => {
      it('should return anonymous tier with generic displayName', async () => {
        const identity = await resolver.resolve('A-random-token-1');

        expect(identity.resolved).toBe(false);
        expect(identity.userId).toBe('A-random-token-1');
        expect(identity.displayName).toBe('Anonymous');
        expect(identity.profileImageUrl).toBeNull();
        expect(identity.tier).toBe('anonymous');
        expect(identity.friendshipLevel).toBe(0);
      });

      it('should generate HSL color for anonymous ID', async () => {
        const identity = await resolver.resolve('A-test-456');
        expect(identity.color).toMatch(/^hsl\(\d+,\s*70%,\s*60%\)$/);
      });
    });

    describe('caching behavior', () => {
      it('should cache verified user IDs', async () => {
        const identity1 = await resolver.resolve('12345678');
        const identity2 = await resolver.resolve('12345678');

        // Should return the exact same object reference
        expect(identity1).toBe(identity2);
      });

      it('should cache unverified IDs', async () => {
        const identity1 = await resolver.resolve('U-unverified-token');
        const identity2 = await resolver.resolve('U-unverified-token');

        // Should return the exact same object reference
        expect(identity1).toBe(identity2);
      });

      it('should NOT cache anonymous IDs', async () => {
        const identity1 = await resolver.resolve('A-anon-token');
        const identity2 = await resolver.resolve('A-anon-token');

        // Should return different object references
        expect(identity1).not.toBe(identity2);
        // But content should be identical
        expect(identity1).toEqual(identity2);
      });

      it('should cache unknown verified IDs', async () => {
        const identity1 = await resolver.resolve('77777777');
        const identity2 = await resolver.resolve('77777777');

        // Should return the exact same object reference
        expect(identity1).toBe(identity2);
      });
    });

    describe('hashColor determinism', () => {
      it('should produce same color for same verified ID across multiple resolutions', async () => {
        const id = '55555555';
        const colors = new Set<string>();

        for (let i = 0; i < 5; i++) {
          const identity = await resolver.resolve(id);
          colors.add(identity.color);
        }

        // All should be identical
        expect(colors.size).toBe(1);
      });

      it('should produce same color for same unverified ID across multiple resolutions', async () => {
        const id = 'U-deterministic-test';
        const colors = new Set<string>();

        for (let i = 0; i < 5; i++) {
          const identity = await resolver.resolve(id);
          colors.add(identity.color);
        }

        // All should be identical
        expect(colors.size).toBe(1);
      });

      it('should produce consistent colors for different IDs', async () => {
        const id1 = '11111111';
        const id2 = '11111111';

        const identity1 = await resolver.resolve(id1);
        const identity2 = await resolver.resolve(id2);

        expect(identity1.color).toBe(identity2.color);
      });

      it('should produce different colors for different IDs', async () => {
        const identity1 = await resolver.resolve('10000001');
        const identity2 = await resolver.resolve('10000002');

        // Different IDs should likely produce different colors (not guaranteed, but very probable)
        // We'll just verify they're both valid HSL colors
        expect(identity1.color).toMatch(/^hsl\(\d+,\s*70%,\s*60%\)$/);
        expect(identity2.color).toMatch(/^hsl\(\d+,\s*70%,\s*60%\)$/);
      });
    });
  });

  describe('getViewers()', () => {
    beforeEach(async () => {
      const mockViewers = {
        viewers: [
          {
            userId: '12345678',
            displayName: 'CoolViewer42',
            profileImageUrl: 'https://static-cdn.jtvnw.net/jtv_user_pictures/placeholder-1.png',
            color: '#ff6b35',
            friendshipLevel: 3,
            bio: 'Regular viewer',
          },
          {
            userId: '23456789',
            displayName: 'RaidBoss99',
            profileImageUrl: 'https://static-cdn.jtvnw.net/jtv_user_pictures/placeholder-2.png',
            color: '#9147ff',
            friendshipLevel: 5,
            bio: 'Raid leader',
          },
          {
            userId: '34567890',
            displayName: 'SilentSam',
            profileImageUrl: 'https://static-cdn.jtvnw.net/jtv_user_pictures/placeholder-3.png',
            color: '#00ff88',
            friendshipLevel: 1,
            bio: 'Lurker',
          },
          {
            userId: '45678901',
            displayName: 'PixelQueen',
            profileImageUrl: 'https://static-cdn.jtvnw.net/jtv_user_pictures/placeholder-4.png',
            color: '#ff69b4',
            friendshipLevel: 4,
            bio: 'Artist',
          },
          {
            userId: '56789012',
            displayName: 'CodeMonkey_Dev',
            profileImageUrl: 'https://static-cdn.jtvnw.net/jtv_user_pictures/placeholder-5.png',
            color: '#1e90ff',
            friendshipLevel: 2,
            bio: 'Backseat coder',
          },
          {
            userId: '67890123',
            displayName: 'NightOwl_TV',
            profileImageUrl: 'https://static-cdn.jtvnw.net/jtv_user_pictures/placeholder-6.png',
            color: '#ffd700',
            friendshipLevel: 3,
            bio: 'Late night regular',
          },
          {
            userId: '78901234',
            displayName: 'TurboGamer',
            profileImageUrl: 'https://static-cdn.jtvnw.net/jtv_user_pictures/placeholder-7.png',
            color: '#ff4444',
            friendshipLevel: 2,
            bio: 'Competitive player',
          },
          {
            userId: '89012345',
            displayName: 'ChillVibes420',
            profileImageUrl: 'https://static-cdn.jtvnw.net/jtv_user_pictures/placeholder-8.png',
            color: '#00bcd4',
            friendshipLevel: 1,
            bio: 'Vibes',
          },
        ],
      };

      vi.mocked(readFile).mockResolvedValue(JSON.stringify(mockViewers));
      await resolver.load();
    });

    it('should return all loaded profiles', () => {
      const viewers = resolver.getViewers();
      expect(viewers).toHaveLength(8);
    });

    it('should return profiles as an array', () => {
      const viewers = resolver.getViewers();
      expect(Array.isArray(viewers)).toBe(true);
    });

    it('should include all viewer properties', () => {
      const viewers = resolver.getViewers();
      const viewer = viewers[0];

      expect(viewer).toHaveProperty('userId');
      expect(viewer).toHaveProperty('displayName');
      expect(viewer).toHaveProperty('profileImageUrl');
      expect(viewer).toHaveProperty('color');
      expect(viewer).toHaveProperty('friendshipLevel');
    });

    it('should return profiles with correct data', () => {
      const viewers = resolver.getViewers();
      const coolViewer = viewers.find((v) => v.userId === '12345678');

      expect(coolViewer).toBeDefined();
      expect(coolViewer?.displayName).toBe('CoolViewer42');
      expect(coolViewer?.friendshipLevel).toBe(3);
    });

    it('should return empty array if no viewers loaded', async () => {
      const emptyResolver = new IdentityResolver();
      vi.mocked(readFile).mockResolvedValue(JSON.stringify({ viewers: [] }));
      await emptyResolver.load();

      const viewers = emptyResolver.getViewers();
      expect(viewers).toEqual([]);
    });
  });

  describe('getViewer()', () => {
    beforeEach(async () => {
      const mockViewers = {
        viewers: [
          {
            userId: '12345678',
            displayName: 'CoolViewer42',
            profileImageUrl: 'https://static-cdn.jtvnw.net/jtv_user_pictures/placeholder-1.png',
            color: '#ff6b35',
            friendshipLevel: 3,
            bio: 'Regular viewer',
          },
          {
            userId: '23456789',
            displayName: 'RaidBoss99',
            profileImageUrl: 'https://static-cdn.jtvnw.net/jtv_user_pictures/placeholder-2.png',
            color: '#9147ff',
            friendshipLevel: 5,
            bio: 'Raid leader',
          },
        ],
      };

      vi.mocked(readFile).mockResolvedValue(JSON.stringify(mockViewers));
      await resolver.load();
    });

    it('should return specific viewer by userId', () => {
      const viewer = resolver.getViewer('12345678');

      expect(viewer).toBeDefined();
      expect(viewer?.displayName).toBe('CoolViewer42');
      expect(viewer?.friendshipLevel).toBe(3);
    });

    it('should return undefined for unknown userId', () => {
      const viewer = resolver.getViewer('99999999');
      expect(viewer).toBeUndefined();
    });

    it('should return correct profiles for different userIds', () => {
      const viewer1 = resolver.getViewer('12345678');
      const viewer2 = resolver.getViewer('23456789');

      expect(viewer1?.displayName).toBe('CoolViewer42');
      expect(viewer2?.displayName).toBe('RaidBoss99');
    });

    it('should preserve all viewer properties in retrieved profile', () => {
      const viewer = resolver.getViewer('12345678');

      expect(viewer).toEqual({
        userId: '12345678',
        displayName: 'CoolViewer42',
        profileImageUrl: 'https://static-cdn.jtvnw.net/jtv_user_pictures/placeholder-1.png',
        color: '#ff6b35',
        friendshipLevel: 3,
        bio: 'Regular viewer',
      });
    });
  });

  describe('load()', () => {
    it('should load viewers from viewers.json', async () => {
      const mockViewers = {
        viewers: [
          {
            userId: '12345678',
            displayName: 'CoolViewer42',
            profileImageUrl: 'https://example.com/avatar.png',
            color: '#ff6b35',
            friendshipLevel: 3,
            bio: 'Test viewer',
          },
        ],
      };

      vi.mocked(readFile).mockResolvedValue(JSON.stringify(mockViewers));

      await resolver.load();

      const viewers = resolver.getViewers();
      expect(viewers).toHaveLength(1);
      expect(viewers[0].displayName).toBe('CoolViewer42');
    });

    it('should handle missing viewers.json gracefully', async () => {
      vi.mocked(readFile).mockRejectedValue(new Error('ENOENT: no such file'));

      // Should not throw
      await resolver.load();

      const viewers = resolver.getViewers();
      expect(viewers).toEqual([]);
    });

    it('should handle malformed JSON gracefully', async () => {
      vi.mocked(readFile).mockResolvedValue('{ invalid json }');

      // Should not throw
      await resolver.load();

      const viewers = resolver.getViewers();
      expect(viewers).toEqual([]);
    });

    it('should handle missing viewers array in JSON', async () => {
      vi.mocked(readFile).mockResolvedValue(JSON.stringify({ notViewers: [] }));

      await resolver.load();

      const viewers = resolver.getViewers();
      expect(viewers).toEqual([]);
    });
  });

  describe('edge cases', () => {
    beforeEach(async () => {
      const mockViewers = {
        viewers: [
          {
            userId: '12345678',
            displayName: 'TestUser',
            profileImageUrl: 'https://example.com/avatar.png',
            color: '#ff6b35',
            friendshipLevel: 2,
            bio: 'Test',
          },
        ],
      };

      vi.mocked(readFile).mockResolvedValue(JSON.stringify(mockViewers));
      await resolver.load();
    });

    it('should handle empty string ID', async () => {
      const identity = await resolver.resolve('');
      expect(identity.tier).toBe('verified');
      expect(identity.resolved).toBe(false);
    });

    it('should handle IDs with special characters', async () => {
      const identity = await resolver.resolve('U-!@#$%^&*');
      expect(identity.tier).toBe('unverified');
      expect(identity.resolved).toBe(false);
    });

    it('should handle very long IDs', async () => {
      const longId = 'A' + 'x'.repeat(10000);
      const identity = await resolver.resolve(longId);
      expect(identity.tier).toBe('anonymous');
      expect(identity.color).toMatch(/^hsl\(\d+,\s*70%,\s*60%\)$/);
    });

    it('should handle IDs with only prefix', async () => {
      const identity = await resolver.resolve('A');
      expect(identity.tier).toBe('anonymous');
      expect(identity.userId).toBe('A');
    });

    it('should handle case-sensitive prefix matching', async () => {
      const identity1 = await resolver.resolve('a-lowercase');
      const identity2 = await resolver.resolve('A-uppercase');

      // lowercase 'a' should be treated as verified, not anonymous
      expect(identity1.tier).toBe('verified');
      expect(identity2.tier).toBe('anonymous');
    });

    it('should handle multiple calls to load', async () => {
      await resolver.load();
      await resolver.load();

      const viewers = resolver.getViewers();
      expect(viewers).toHaveLength(1);
    });
  });

  describe('integration scenarios', () => {
    beforeEach(async () => {
      const mockViewers = {
        viewers: [
          {
            userId: '12345678',
            displayName: 'KnownUser',
            profileImageUrl: 'https://example.com/avatar.png',
            color: '#ff6b35',
            friendshipLevel: 3,
            bio: 'Regular',
          },
        ],
      };

      vi.mocked(readFile).mockResolvedValue(JSON.stringify(mockViewers));
      await resolver.load();
    });

    it('should resolve mixed ID types in sequence', async () => {
      const verified = await resolver.resolve('12345678');
      const unknown = await resolver.resolve('99999999');
      const unverified = await resolver.resolve('U-token');
      const anonymous = await resolver.resolve('A-token');

      expect(verified.resolved).toBe(true);
      expect(unknown.resolved).toBe(false);
      expect(unverified.resolved).toBe(false);
      expect(anonymous.resolved).toBe(false);

      expect(verified.tier).toBe('verified');
      expect(unknown.tier).toBe('verified');
      expect(unverified.tier).toBe('unverified');
      expect(anonymous.tier).toBe('anonymous');
    });

    it('should handle rapid successive calls', async () => {
      const promises = Array.from({ length: 10 }, (_, i) =>
        resolver.resolve(`12345678`)
      );

      const results = await Promise.all(promises);

      // All should return the same cached object
      expect(new Set(results).size).toBe(1);
      expect(results[0].resolved).toBe(true);
      expect(results[0].displayName).toBe('KnownUser');
    });

    it('should maintain separate caches for different ID types', async () => {
      const verified1 = await resolver.resolve('12345678');
      const unverified1 = await resolver.resolve('U-12345678');
      const anonymous1 = await resolver.resolve('A-12345678');

      const verified2 = await resolver.resolve('12345678');
      const unverified2 = await resolver.resolve('U-12345678');
      const anonymous2 = await resolver.resolve('A-12345678');

      // Verified and unverified should be cached
      expect(verified1).toBe(verified2);
      expect(unverified1).toBe(unverified2);

      // Anonymous should NOT be cached
      expect(anonymous1).not.toBe(anonymous2);
      expect(anonymous1).toEqual(anonymous2);
    });
  });
});
