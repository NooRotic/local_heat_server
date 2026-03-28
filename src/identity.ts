import { readFile } from 'fs/promises';
import { join } from 'path';
import type { IdentityResponse, ViewerProfile } from './types.js';

const VIEWERS_PATH = join(process.cwd(), 'viewers.json');

/**
 * Resolves Heat user IDs to viewer identities.
 *
 * Heat ID formats:
 *   numeric (no prefix) = verified Twitch user ID — resolvable
 *   U + token           = unverified — NOT a Twitch ID, not resolvable
 *   A + token           = anonymous — random per click, not resolvable
 *
 * LHS uses viewers.json for mock profiles.
 * Production (RipV2) would use Twitch API + chatter profile DB.
 */
export class IdentityResolver {
  private viewers = new Map<string, ViewerProfile>();
  private cache = new Map<string, IdentityResponse>();
  private loaded = false;

  /** Load viewer profiles from viewers.json */
  async load(): Promise<void> {
    try {
      const raw = await readFile(VIEWERS_PATH, 'utf-8');
      const data = JSON.parse(raw);
      for (const viewer of data.viewers || []) {
        this.viewers.set(viewer.userId, viewer);
      }
      this.loaded = true;
      console.log(`[Identity] Loaded ${this.viewers.size} viewer profiles`);
    } catch (error) {
      console.warn('[Identity] Could not load viewers.json, using anonymous fallback');
      this.loaded = true;
    }
  }

  /**
   * Parse a Heat user ID and determine its tier
   */
  parseId(rawId: string): { tier: 'verified' | 'unverified' | 'anonymous'; cleanId: string } {
    if (rawId.startsWith('A')) {
      return { tier: 'anonymous', cleanId: rawId };
    }
    if (rawId.startsWith('U')) {
      return { tier: 'unverified', cleanId: rawId };
    }
    // Numeric = verified Twitch user ID
    return { tier: 'verified', cleanId: rawId };
  }

  /**
   * Resolve a Heat user ID to a full identity
   */
  async resolve(rawId: string): Promise<IdentityResponse> {
    // Check cache first
    const cached = this.cache.get(rawId);
    if (cached) return cached;

    if (!this.loaded) await this.load();

    const { tier, cleanId } = this.parseId(rawId);
    let identity: IdentityResponse;

    if (tier === 'verified') {
      // Look up in viewers.json (LHS mock) — production would use Twitch API
      const viewer = this.viewers.get(cleanId);
      if (viewer) {
        identity = {
          resolved: true,
          userId: cleanId,
          displayName: viewer.displayName,
          profileImageUrl: viewer.profileImageUrl,
          color: viewer.color,
          tier: 'verified',
          friendshipLevel: viewer.friendshipLevel,
        };
      } else {
        identity = {
          resolved: false,
          userId: cleanId,
          displayName: `User_${cleanId.slice(0, 6)}`,
          profileImageUrl: null,
          color: this.hashColor(cleanId),
          tier: 'verified',
          friendshipLevel: 0,
        };
      }
    } else if (tier === 'unverified') {
      // U-prefix: opaque token, can't resolve to a real user
      identity = {
        resolved: false,
        userId: cleanId,
        displayName: 'Viewer',
        profileImageUrl: null,
        color: this.hashColor(cleanId),
        tier: 'unverified',
        friendshipLevel: 0,
      };
    } else {
      // Anonymous: random per click, no identity
      identity = {
        resolved: false,
        userId: cleanId,
        displayName: 'Anonymous',
        profileImageUrl: null,
        color: this.hashColor(cleanId),
        tier: 'anonymous',
        friendshipLevel: 0,
      };
    }

    // Don't cache anonymous IDs — they're random per click and will grow unboundedly
    if (tier !== 'anonymous') {
      this.cache.set(rawId, identity);
    }
    return identity;
  }

  /** Get all loaded viewer profiles */
  getViewers(): ViewerProfile[] {
    return Array.from(this.viewers.values());
  }

  /** Get a single viewer profile by userId */
  getViewer(userId: string): ViewerProfile | undefined {
    return this.viewers.get(userId);
  }

  /**
   * Generate a consistent color from an ID string.
   * Same ID always produces the same color.
   */
  private hashColor(id: string): string {
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
      hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0;
    }
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue}, 70%, 60%)`;
  }
}
