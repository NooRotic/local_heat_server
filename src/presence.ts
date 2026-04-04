import type { PresenceEntry, IdentityResponse, PresenceJoinMessage, PresenceUpdateMessage, PresenceStateMessage } from './types.js';

/** Template welcome messages (LHS has no AI personality engine) */
const WELCOME_TEMPLATES = [
  '{name} has entered the {room}',
  'Welcome to the {room}, {name}!',
  '{name} just stepped into the {room}',
  'The {room} welcomes {name}!',
  '{name} is in the building — welcome to the {room}!',
];

/** Template lurk messages */
const LURK_TEMPLATES = [
  '{name} slips into the shadows of the {room}',
  '{name} is lurking in the {room}',
  'Catch you later, {name} — the {room} will be here',
  '{name} has gone quiet in the {room}',
];

/**
 * Manages viewer presence state for the Champagne Room.
 *
 * In-memory Map — lost on server restart (acceptable for LHS dev).
 * Production (RipV2) would use ChampagneRoomService with identical interface.
 */
export class PresenceManager {
  private members = new Map<string, PresenceEntry>();
  private roomName = 'Champagne Room';

  /** Update room name (called when theme changes) */
  setRoomName(name: string): void {
    this.roomName = name;
  }

  getRoomName(): string {
    return this.roomName;
  }

  /**
   * Join or update a viewer's presence.
   * Returns the broadcast message and a template announcement string.
   */
  join(userId: string, status: 'present' | 'lurking', identity: IdentityResponse): {
    message: PresenceJoinMessage | PresenceUpdateMessage;
    announcement: string;
    isNew: boolean;
  } {
    const existing = this.members.get(userId);
    const now = Date.now();

    if (existing) {
      // Update existing member
      existing.status = status;
      existing.lastActivity = now;
      existing.identity = identity;

      const announcement = this.getAnnouncement(identity.displayName, status);
      return {
        message: {
          type: 'presence_update',
          userId,
          status,
          identity,
        },
        announcement,
        isNew: false,
      };
    }

    // New member joining
    const entry: PresenceEntry = {
      userId,
      status,
      identity,
      joinedAt: now,
      lastActivity: now,
    };
    this.members.set(userId, entry);

    const announcement = this.getAnnouncement(identity.displayName, status);
    return {
      message: {
        type: 'presence_join',
        userId,
        status,
        identity,
      },
      announcement,
      isNew: true,
    };
  }

  /**
   * Auto-escalate lurker to present (triggered by chat message).
   * Returns null if user is not a lurker (no change needed).
   */
  chatEscalate(userId: string): {
    message: PresenceUpdateMessage;
    announcement: string;
  } | null {
    const entry = this.members.get(userId);
    if (!entry || entry.status !== 'lurking') return null;

    entry.status = 'present';
    entry.lastActivity = Date.now();

    return {
      message: {
        type: 'presence_update',
        userId,
        status: 'present',
        identity: entry.identity,
      },
      announcement: `${entry.identity.displayName} is back from lurking!`,
    };
  }

  /**
   * Check if a user is a member of the room (any status).
   */
  isMember(userId: string): boolean {
    return this.members.has(userId);
  }

  /**
   * Get a member's entry.
   */
  getMember(userId: string): PresenceEntry | undefined {
    return this.members.get(userId);
  }

  /**
   * Remove a member from the room.
   */
  remove(userId: string): boolean {
    return this.members.delete(userId);
  }

  /**
   * Get full presence state for hydration (sent to newly connected clients).
   */
  getState(): PresenceStateMessage {
    const members = Array.from(this.members.values())
      .sort((a, b) => b.lastActivity - a.lastActivity)
      .map(e => ({
        userId: e.userId,
        status: e.status,
        identity: e.identity,
      }));

    return {
      type: 'presence_state',
      members,
    };
  }

  /**
   * Get count of members by status.
   */
  getCounts(): { present: number; lurking: number; total: number } {
    let present = 0;
    let lurking = 0;
    for (const entry of this.members.values()) {
      if (entry.status === 'present') present++;
      else lurking++;
    }
    return { present, lurking, total: present + lurking };
  }

  /**
   * Clear all presence state (e.g., on server restart or stream offline).
   */
  clear(): void {
    this.members.clear();
  }

  /** Pick a random template announcement */
  private getAnnouncement(displayName: string, status: 'present' | 'lurking'): string {
    const templates = status === 'present' ? WELCOME_TEMPLATES : LURK_TEMPLATES;
    const template = templates[Math.floor(Math.random() * templates.length)];
    return template.replace('{name}', displayName).replace('{room}', this.roomName);
  }
}
