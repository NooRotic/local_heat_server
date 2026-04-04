import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PresenceManager } from '../presence.js';
import type { IdentityResponse } from '../types.js';

/**
 * Helper function to create a mock IdentityResponse for testing
 */
function createMockIdentity(overrides: Partial<IdentityResponse> = {}): IdentityResponse {
  return {
    resolved: true,
    userId: 'test-user-123',
    displayName: 'TestUser',
    profileImageUrl: 'https://example.com/avatar.png',
    color: '#FF5733',
    tier: 'verified',
    friendshipLevel: 0,
    ...overrides,
  };
}

describe('PresenceManager', () => {
  let manager: PresenceManager;

  beforeEach(() => {
    manager = new PresenceManager();
  });

  describe('setRoomName / getRoomName', () => {
    it('should initialize with default room name "Champagne Room"', () => {
      expect(manager.getRoomName()).toBe('Champagne Room');
    });

    it('should update room name via setRoomName', () => {
      manager.setRoomName('VIP Lounge');
      expect(manager.getRoomName()).toBe('VIP Lounge');
    });

    it('should propagate room name to announcements after update', () => {
      manager.setRoomName('Golden Room');
      const identity = createMockIdentity({ displayName: 'Alice' });
      const result = manager.join('user-1', 'present', identity);
      expect(result.announcement).toContain('Golden Room');
    });
  });

  describe('join - new member', () => {
    it('should add a new member as present with isNew=true', () => {
      const identity = createMockIdentity({ userId: 'user-1', displayName: 'Alice' });
      const result = manager.join('user-1', 'present', identity);

      expect(result.isNew).toBe(true);
      expect(result.message.type).toBe('presence_join');
      expect(manager.isMember('user-1')).toBe(true);
    });

    it('should add a new member as lurking with isNew=true', () => {
      const identity = createMockIdentity({ userId: 'user-2', displayName: 'Bob' });
      const result = manager.join('user-2', 'lurking', identity);

      expect(result.isNew).toBe(true);
      expect(result.message.type).toBe('presence_join');
      expect(manager.isMember('user-2')).toBe(true);
      expect(manager.getMember('user-2')?.status).toBe('lurking');
    });

    it('should include user identity in join message', () => {
      const identity = createMockIdentity({
        userId: 'user-3',
        displayName: 'Charlie',
        tier: 'unverified',
      });
      const result = manager.join('user-3', 'present', identity);

      expect(result.message.type).toBe('presence_join');
      if (result.message.type === 'presence_join') {
        expect(result.message.identity).toEqual(identity);
        expect(result.message.userId).toBe('user-3');
        expect(result.message.status).toBe('present');
      }
    });

    it('should generate announcement including display name and room name', () => {
      const identity = createMockIdentity({ displayName: 'TestUser' });
      manager.setRoomName('VIP Room');
      const result = manager.join('user-4', 'present', identity);

      expect(result.announcement).toContain('TestUser');
      expect(result.announcement).toContain('VIP Room');
    });

    it('should use welcome templates for present status', () => {
      const identity = createMockIdentity({ displayName: 'Diana' });
      const result = manager.join('user-5', 'present', identity);

      // Should contain phrases from welcome templates
      const announcement = result.announcement.toLowerCase();
      const hasWelcomePhrase =
        announcement.includes('entered') ||
        announcement.includes('welcome') ||
        announcement.includes('stepped') ||
        announcement.includes('building');

      expect(hasWelcomePhrase).toBe(true);
    });

    it('should use lurk templates for lurking status', () => {
      const identity = createMockIdentity({ displayName: 'Eve' });
      const result = manager.join('user-6', 'lurking', identity);

      // Should contain phrases from lurk templates
      const announcement = result.announcement.toLowerCase();
      const hasLurkPhrase =
        announcement.includes('shadows') ||
        announcement.includes('lurking') ||
        announcement.includes('catch') ||
        announcement.includes('quiet');

      expect(hasLurkPhrase).toBe(true);
    });

    it('should set joinedAt and lastActivity timestamps', () => {
      const before = Date.now();
      const identity = createMockIdentity();
      manager.join('user-7', 'present', identity);
      const after = Date.now();

      const member = manager.getMember('user-7');
      expect(member?.joinedAt).toBeGreaterThanOrEqual(before);
      expect(member?.joinedAt).toBeLessThanOrEqual(after);
      expect(member?.lastActivity).toBe(member?.joinedAt);
    });
  });

  describe('join - existing member (status change)', () => {
    it('should return isNew=false for existing member', () => {
      const identity1 = createMockIdentity({ userId: 'user-8', displayName: 'Frank' });
      manager.join('user-8', 'present', identity1);

      const identity2 = createMockIdentity({
        userId: 'user-8',
        displayName: 'Frank',
        color: '#AABBCC',
      });
      const result = manager.join('user-8', 'lurking', identity2);

      expect(result.isNew).toBe(false);
    });

    it('should return presence_update message type for existing member', () => {
      const identity1 = createMockIdentity();
      manager.join('user-9', 'present', identity1);

      const identity2 = createMockIdentity();
      const result = manager.join('user-9', 'lurking', identity2);

      expect(result.message.type).toBe('presence_update');
    });

    it('should update status from present to lurking', () => {
      const identity = createMockIdentity();
      manager.join('user-10', 'present', identity);

      manager.join('user-10', 'lurking', identity);
      const member = manager.getMember('user-10');

      expect(member?.status).toBe('lurking');
    });

    it('should update status from lurking to present', () => {
      const identity = createMockIdentity();
      manager.join('user-11', 'lurking', identity);

      manager.join('user-11', 'present', identity);
      const member = manager.getMember('user-11');

      expect(member?.status).toBe('present');
    });

    it('should update identity information on rejoin', () => {
      const identity1 = createMockIdentity({
        userId: 'user-12',
        displayName: 'Grace',
        color: '#FF0000',
      });
      manager.join('user-12', 'present', identity1);

      const identity2 = createMockIdentity({
        userId: 'user-12',
        displayName: 'Grace',
        color: '#00FF00',
      });
      manager.join('user-12', 'present', identity2);

      const member = manager.getMember('user-12');
      expect(member?.identity.color).toBe('#00FF00');
    });

    it('should update lastActivity on rejoin', async () => {
      const identity = createMockIdentity();
      manager.join('user-13', 'present', identity);
      const firstActivity = manager.getMember('user-13')?.lastActivity;

      // Small delay to ensure different timestamp
      const time = new Promise(resolve => setTimeout(resolve, 10));
      await time;

      manager.join('user-13', 'lurking', identity);
      const secondActivity = manager.getMember('user-13')?.lastActivity;

      expect(secondActivity).toBeGreaterThan(firstActivity!);
    });

    it('should preserve joinedAt timestamp on rejoin', async () => {
      const identity = createMockIdentity();
      manager.join('user-14', 'present', identity);
      const originalJoinedAt = manager.getMember('user-14')?.joinedAt;

      manager.join('user-14', 'lurking', identity);
      const currentJoinedAt = manager.getMember('user-14')?.joinedAt;

      expect(currentJoinedAt).toBe(originalJoinedAt);
    });

    it('should generate announcement for status change', () => {
      const identity = createMockIdentity({ displayName: 'Helen' });
      manager.join('user-15', 'present', identity);

      const result = manager.join('user-15', 'lurking', identity);

      expect(result.announcement).toBeTruthy();
      expect(result.announcement).toContain('Helen');
    });
  });

  describe('chatEscalate', () => {
    it('should transition lurking member to present', () => {
      const identity = createMockIdentity();
      manager.join('user-16', 'lurking', identity);

      const result = manager.chatEscalate('user-16');

      expect(result).not.toBeNull();
      expect(manager.getMember('user-16')?.status).toBe('present');
    });

    it('should return presence_update message on escalation', () => {
      const identity = createMockIdentity();
      manager.join('user-17', 'lurking', identity);

      const result = manager.chatEscalate('user-17');

      expect(result?.message.type).toBe('presence_update');
      expect(result?.message.status).toBe('present');
    });

    it('should return null for present member (no change needed)', () => {
      const identity = createMockIdentity();
      manager.join('user-18', 'present', identity);

      const result = manager.chatEscalate('user-18');

      expect(result).toBeNull();
    });

    it('should return null for non-member', () => {
      const result = manager.chatEscalate('non-existent-user');

      expect(result).toBeNull();
    });

    it('should update lastActivity on escalation', async () => {
      const identity = createMockIdentity();
      manager.join('user-19', 'lurking', identity);
      const beforeEscalate = manager.getMember('user-19')?.lastActivity;

      const time = new Promise(resolve => setTimeout(resolve, 10));
      await time;

      manager.chatEscalate('user-19');
      const afterEscalate = manager.getMember('user-19')?.lastActivity;

      expect(afterEscalate).toBeGreaterThan(beforeEscalate!);
    });

    it('should preserve identity on escalation', () => {
      const identity = createMockIdentity({
        userId: 'user-20',
        displayName: 'Isaac',
        color: '#1234AB',
      });
      manager.join('user-20', 'lurking', identity);

      manager.chatEscalate('user-20');
      const member = manager.getMember('user-20');

      expect(member?.identity.displayName).toBe('Isaac');
      expect(member?.identity.color).toBe('#1234AB');
    });

    it('should generate announcement for escalation', () => {
      const identity = createMockIdentity({ displayName: 'Ivy' });
      manager.join('user-21', 'lurking', identity);

      const result = manager.chatEscalate('user-21');

      expect(result?.announcement).toContain('Ivy');
      expect(result?.announcement).toContain('back from lurking');
    });

    it('should include correct identity in escalation message', () => {
      const identity = createMockIdentity({
        userId: 'user-22',
        displayName: 'Jack',
        tier: 'anonymous',
      });
      manager.join('user-22', 'lurking', identity);

      const result = manager.chatEscalate('user-22');

      expect(result?.message.identity).toEqual(identity);
      expect(result?.message.userId).toBe('user-22');
    });
  });

  describe('isMember / getMember', () => {
    it('should return true for existing member', () => {
      const identity = createMockIdentity();
      manager.join('user-23', 'present', identity);

      expect(manager.isMember('user-23')).toBe(true);
    });

    it('should return false for non-member', () => {
      expect(manager.isMember('user-nonexistent')).toBe(false);
    });

    it('should return member entry via getMember', () => {
      const identity = createMockIdentity({ userId: 'user-24' });
      manager.join('user-24', 'present', identity);

      const member = manager.getMember('user-24');

      expect(member).toBeDefined();
      expect(member?.userId).toBe('user-24');
      expect(member?.status).toBe('present');
    });

    it('should return undefined for non-member via getMember', () => {
      expect(manager.getMember('user-nonexistent')).toBeUndefined();
    });

    it('should reflect member state accurately', () => {
      const identity = createMockIdentity({ userId: 'user-25', displayName: 'Kate' });
      manager.join('user-25', 'lurking', identity);

      expect(manager.isMember('user-25')).toBe(true);
      const member = manager.getMember('user-25');
      expect(member?.status).toBe('lurking');
      expect(member?.identity.displayName).toBe('Kate');
    });
  });

  describe('remove', () => {
    it('should remove member and return true', () => {
      const identity = createMockIdentity();
      manager.join('user-26', 'present', identity);

      const removed = manager.remove('user-26');

      expect(removed).toBe(true);
      expect(manager.isMember('user-26')).toBe(false);
    });

    it('should return false for non-member', () => {
      const removed = manager.remove('user-nonexistent');

      expect(removed).toBe(false);
    });

    it('should make member inaccessible after removal', () => {
      const identity = createMockIdentity();
      manager.join('user-27', 'present', identity);

      manager.remove('user-27');

      expect(manager.getMember('user-27')).toBeUndefined();
    });

    it('should remove multiple members independently', () => {
      const identity1 = createMockIdentity({ userId: 'user-28' });
      const identity2 = createMockIdentity({ userId: 'user-29' });

      manager.join('user-28', 'present', identity1);
      manager.join('user-29', 'present', identity2);

      manager.remove('user-28');

      expect(manager.isMember('user-28')).toBe(false);
      expect(manager.isMember('user-29')).toBe(true);
    });
  });

  describe('getState', () => {
    it('should return presence_state message type', () => {
      const state = manager.getState();

      expect(state.type).toBe('presence_state');
    });

    it('should return empty members array when no members', () => {
      const state = manager.getState();

      expect(state.members).toEqual([]);
    });

    it('should include all members in state', () => {
      const identity1 = createMockIdentity({ userId: 'user-30', displayName: 'Leo' });
      const identity2 = createMockIdentity({ userId: 'user-31', displayName: 'Mia' });

      manager.join('user-30', 'present', identity1);
      manager.join('user-31', 'lurking', identity2);

      const state = manager.getState();

      expect(state.members.length).toBe(2);
      expect(state.members.map(m => m.userId)).toContain('user-30');
      expect(state.members.map(m => m.userId)).toContain('user-31');
    });

    it('should sort members by lastActivity descending', async () => {
      const identity1 = createMockIdentity({ userId: 'user-32' });
      const identity2 = createMockIdentity({ userId: 'user-33' });

      manager.join('user-32', 'present', identity1);

      // Small delay to ensure different timestamps
      const time = new Promise(resolve => setTimeout(resolve, 10));
      await time;

      manager.join('user-33', 'present', identity2);

      const state = manager.getState();

      // user-33 (newer) should come before user-32
      expect(state.members[0].userId).toBe('user-33');
      expect(state.members[1].userId).toBe('user-32');
    });

    it('should update sort order after activity', async () => {
      const identity1 = createMockIdentity({ userId: 'user-34' });
      const identity2 = createMockIdentity({ userId: 'user-35' });

      manager.join('user-34', 'present', identity1);

      const time = new Promise(resolve => setTimeout(resolve, 10));
      await time;

      manager.join('user-35', 'present', identity2);

      // Now update user-34 (should move to top)
      const time2 = new Promise(resolve => setTimeout(resolve, 10));
      await time2;

      manager.join('user-34', 'lurking', identity1);

      const state = manager.getState();

      // user-34 should now be first (most recent activity)
      expect(state.members[0].userId).toBe('user-34');
      expect(state.members[1].userId).toBe('user-35');
    });

    it('should include member status in state', () => {
      const identity1 = createMockIdentity({ userId: 'user-36' });
      const identity2 = createMockIdentity({ userId: 'user-37' });

      manager.join('user-36', 'present', identity1);
      manager.join('user-37', 'lurking', identity2);

      const state = manager.getState();
      const member1 = state.members.find(m => m.userId === 'user-36');
      const member2 = state.members.find(m => m.userId === 'user-37');

      expect(member1?.status).toBe('present');
      expect(member2?.status).toBe('lurking');
    });

    it('should include full identity in state members', () => {
      const identity = createMockIdentity({
        userId: 'user-38',
        displayName: 'Noah',
        color: '#DEADBEEF',
        tier: 'verified',
      });

      manager.join('user-38', 'present', identity);

      const state = manager.getState();
      const member = state.members[0];

      expect(member.identity).toEqual(identity);
    });

    it('should not include joinedAt in state (client does not need it)', () => {
      const identity = createMockIdentity();
      manager.join('user-39', 'present', identity);

      const state = manager.getState();
      const member = state.members[0];

      // Verify state member structure - should not have joinedAt or lastActivity
      expect('joinedAt' in member).toBe(false);
      expect('lastActivity' in member).toBe(false);
    });
  });

  describe('getCounts', () => {
    it('should return zeros when empty', () => {
      const counts = manager.getCounts();

      expect(counts).toEqual({ present: 0, lurking: 0, total: 0 });
    });

    it('should count present members correctly', () => {
      const identity1 = createMockIdentity({ userId: 'user-40' });
      const identity2 = createMockIdentity({ userId: 'user-41' });

      manager.join('user-40', 'present', identity1);
      manager.join('user-41', 'present', identity2);

      const counts = manager.getCounts();

      expect(counts.present).toBe(2);
      expect(counts.lurking).toBe(0);
      expect(counts.total).toBe(2);
    });

    it('should count lurking members correctly', () => {
      const identity1 = createMockIdentity({ userId: 'user-42' });
      const identity2 = createMockIdentity({ userId: 'user-43' });

      manager.join('user-42', 'lurking', identity1);
      manager.join('user-43', 'lurking', identity2);

      const counts = manager.getCounts();

      expect(counts.present).toBe(0);
      expect(counts.lurking).toBe(2);
      expect(counts.total).toBe(2);
    });

    it('should count mixed present and lurking', () => {
      const identity1 = createMockIdentity({ userId: 'user-44' });
      const identity2 = createMockIdentity({ userId: 'user-45' });
      const identity3 = createMockIdentity({ userId: 'user-46' });

      manager.join('user-44', 'present', identity1);
      manager.join('user-45', 'present', identity2);
      manager.join('user-46', 'lurking', identity3);

      const counts = manager.getCounts();

      expect(counts.present).toBe(2);
      expect(counts.lurking).toBe(1);
      expect(counts.total).toBe(3);
    });

    it('should update counts after status change', () => {
      const identity = createMockIdentity();
      manager.join('user-47', 'lurking', identity);

      let counts = manager.getCounts();
      expect(counts.lurking).toBe(1);
      expect(counts.present).toBe(0);

      manager.join('user-47', 'present', identity);

      counts = manager.getCounts();
      expect(counts.present).toBe(1);
      expect(counts.lurking).toBe(0);
    });

    it('should update counts after removal', () => {
      const identity1 = createMockIdentity({ userId: 'user-48' });
      const identity2 = createMockIdentity({ userId: 'user-49' });

      manager.join('user-48', 'present', identity1);
      manager.join('user-49', 'present', identity2);

      manager.remove('user-48');

      const counts = manager.getCounts();

      expect(counts.present).toBe(1);
      expect(counts.total).toBe(1);
    });

    it('should have total equal sum of present and lurking', () => {
      const identity1 = createMockIdentity({ userId: 'user-50' });
      const identity2 = createMockIdentity({ userId: 'user-51' });
      const identity3 = createMockIdentity({ userId: 'user-52' });

      manager.join('user-50', 'present', identity1);
      manager.join('user-51', 'present', identity2);
      manager.join('user-52', 'lurking', identity3);

      const counts = manager.getCounts();

      expect(counts.total).toBe(counts.present + counts.lurking);
    });
  });

  describe('clear', () => {
    it('should remove all members', () => {
      const identity1 = createMockIdentity({ userId: 'user-53' });
      const identity2 = createMockIdentity({ userId: 'user-54' });

      manager.join('user-53', 'present', identity1);
      manager.join('user-54', 'present', identity2);

      manager.clear();

      expect(manager.getCounts().total).toBe(0);
    });

    it('should make isMember return false for all previous members', () => {
      const identity1 = createMockIdentity({ userId: 'user-55' });
      const identity2 = createMockIdentity({ userId: 'user-56' });

      manager.join('user-55', 'present', identity1);
      manager.join('user-56', 'lurking', identity2);

      manager.clear();

      expect(manager.isMember('user-55')).toBe(false);
      expect(manager.isMember('user-56')).toBe(false);
    });

    it('should return empty state after clear', () => {
      const identity = createMockIdentity();
      manager.join('user-57', 'present', identity);

      manager.clear();

      const state = manager.getState();
      expect(state.members).toEqual([]);
    });

    it('should allow joining again after clear', () => {
      const identity = createMockIdentity({ userId: 'user-58' });
      manager.join('user-58', 'present', identity);

      manager.clear();

      const result = manager.join('user-58', 'present', identity);

      expect(result.isNew).toBe(true);
      expect(manager.isMember('user-58')).toBe(true);
    });
  });

  describe('Integration scenarios', () => {
    it('should handle complex multi-user scenario', () => {
      const user1 = createMockIdentity({ userId: 'user-59', displayName: 'Alice' });
      const user2 = createMockIdentity({ userId: 'user-60', displayName: 'Bob' });
      const user3 = createMockIdentity({ userId: 'user-61', displayName: 'Charlie' });

      // Join sequence
      manager.join('user-59', 'present', user1);
      manager.join('user-60', 'lurking', user2);
      manager.join('user-61', 'present', user3);

      // Verify initial state
      expect(manager.getCounts()).toEqual({ present: 2, lurking: 1, total: 3 });

      // Bob escalates via chat
      const escalation = manager.chatEscalate('user-60');
      expect(escalation).not.toBeNull();
      expect(manager.getCounts().present).toBe(3);

      // Charlie leaves
      manager.remove('user-61');
      expect(manager.getCounts()).toEqual({ present: 2, lurking: 0, total: 2 });

      // Alice updates her status
      const update = manager.join('user-59', 'lurking', user1);
      expect(update.isNew).toBe(false);
      expect(manager.getCounts()).toEqual({ present: 1, lurking: 1, total: 2 });
    });

    it('should maintain state consistency across operations', () => {
      const identity = createMockIdentity({ userId: 'user-62' });

      manager.join('user-62', 'present', identity);
      const firstMember = manager.getMember('user-62');

      manager.join('user-62', 'lurking', identity);
      const secondMember = manager.getMember('user-62');

      // joinedAt should be same, lastActivity should differ
      expect(firstMember?.joinedAt).toBe(secondMember?.joinedAt);
      expect(secondMember?.lastActivity).toBeGreaterThanOrEqual(firstMember!.lastActivity);
    });

    it('should generate all announcement templates eventually', () => {
      const announcements = new Set<string>();

      for (let i = 0; i < 50; i++) {
        const identity = createMockIdentity({
          userId: `user-${100 + i}`,
          displayName: 'TestUser',
        });
        const result = manager.join(`user-${100 + i}`, 'present', identity);
        announcements.add(result.announcement);
        manager.clear();
      }

      // Should have generated multiple different announcements
      expect(announcements.size).toBeGreaterThan(1);
    });
  });
});
