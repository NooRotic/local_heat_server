# Sprint 2: Champagne Room — Presence System

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Champagne Room presence system — a bullseye status button and viewer presence board that lets viewers opt in as "present" or "lurking," with GSAP animations and simulated chat commands for LHS dev testing.

**Architecture:** A new `PresenceManager` class manages an in-memory `Map<userId, PresenceEntry>` on the server. The WebSocket server handles `presence_join` and `presence_update` messages, broadcasts changes to all clients, and hydrates new connections with `presence_state`. A new `presence.html` prototype page contains the bullseye button UI, presence board, simulated chat panel, and GSAP letter-by-letter text animations. `heat-client.js` gets new methods for presence and simulated chat.

**Tech Stack:** TypeScript, Node.js, `ws` WebSocket, GSAP (CDN), existing theme system

**Spec:** `docs/superpowers/specs/2026-03-26-champagne-room-heat-overlay-design.md` (Layer 1)

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/types.ts` | Modify | Add `PresenceEntry` interface |
| `src/presence.ts` | Create | `PresenceManager` class — state, join/update/remove, template messages |
| `src/server.ts` | Modify | Wire PresenceManager into WebSocket: handle presence msgs, hydrate on connect, broadcast |
| `src/http-server.ts` | Modify | Add `GET /api/presence` and `POST /api/presence/simulate-chat` endpoints |
| `public/heat-client.js` | Modify | Add `sendPresence()`, `sendChat()` methods; handle presence events |
| `public/presence.html` | Create | Bullseye button + presence board + GSAP animations + simulated chat panel |

---

### Task 1: Add PresenceEntry type to types.ts

**Files:**
- Modify: `src/types.ts`

- [ ] **Step 1: Add PresenceEntry interface**

Add after the `PresenceStateMessage` interface (after line 69):

```typescript
/**
 * Server-side presence entry for a viewer in the Champagne Room
 */
export interface PresenceEntry {
  userId: string;
  status: 'present' | 'lurking';
  identity: IdentityResponse;
  joinedAt: number;
  lastActivity: number;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: Clean compile, no errors

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat: add PresenceEntry interface for Champagne Room state"
```

---

### Task 2: Create PresenceManager class

**Files:**
- Create: `src/presence.ts`

- [ ] **Step 1: Create PresenceManager with join/update/remove/getMembers**

```typescript
import type { PresenceEntry, IdentityResponse, PresenceJoinMessage, PresenceUpdateMessage, PresenceStateMessage } from './types.js';

/** Template welcome messages (LHS has no AI personality engine) */
const WELCOME_TEMPLATES = [
  '{name} has entered the {room}',
  'Welcome to the {room}, {name}!',
  '{name} just stepped into the {room}',
  'The {room} welcomes {name}!',
  '{name} is in the building!',
];

/** Template lurk messages */
const LURK_TEMPLATES = [
  '{name} slips into the shadows of the {room}',
  '{name} is lurking in the {room}',
  'Catch you later, {name}',
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
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: Clean compile

- [ ] **Step 3: Commit**

```bash
git add src/presence.ts
git commit -m "feat: add PresenceManager class with join/update/escalate/hydrate"
```

---

### Task 3: Wire PresenceManager into WebSocket server

**Files:**
- Modify: `src/server.ts`

- [ ] **Step 1: Import PresenceManager and add as class member**

Add to imports at line 7:
```typescript
import { PresenceManager } from './presence.js';
```

Update the import on line 6 to include `PresenceJoinMessage`:
```typescript
import type { HeatClickData, HeatSystemMessage, EnrichedClickData, PresenceJoinMessage, ClientConnection } from './types.js';
```

Add member to HeatServer class (after `private identityResolver`):
```typescript
private presenceManager: PresenceManager;
```

In constructor, after `this.identityResolver.load()`:
```typescript
this.presenceManager = new PresenceManager();
```

Also pass presenceManager to HttpServer — change the HttpServer constructor call:
```typescript
this.httpServer = new HttpServer('./public', this.identityResolver, this.presenceManager);
```

- [ ] **Step 2: Send presence_state to newly connected clients**

After the welcome message `ws.send(JSON.stringify(welcomeMessage))` at line 112, add:

```typescript
// Hydrate new client with current presence state
const presenceState = this.presenceManager.getState();
if (presenceState.members.length > 0) {
  ws.send(JSON.stringify(presenceState));
}
```

- [ ] **Step 3: Handle presence messages in handleMessage**

Replace the message type check in `handleMessage` (lines 147-151):

```typescript
if (message.type === 'click') {
  await this.handleClickMessage(client, message as HeatClickData);
} else if (message.type === 'presence_join') {
  await this.handlePresenceJoin(client, message);
} else if (message.type === 'chat') {
  await this.handleSimulatedChat(client, message);
} else {
  this.log(`⚠️ Unknown message type from ${client.userId}: ${message.type}`);
}
```

- [ ] **Step 4: Implement handlePresenceJoin**

Add after `handleClickMessage`:

```typescript
/**
 * Handle presence join/update from client
 */
private async handlePresenceJoin(
  client: ClientConnection,
  message: { userId?: string; status: 'present' | 'lurking' }
): Promise<void> {
  const userId = message.userId || client.userId;
  const identity = await this.identityResolver.resolve(userId);
  const result = this.presenceManager.join(userId, message.status, identity);

  // Broadcast presence change to all clients in channel
  this.channelManager.broadcast(
    client.channelId,
    JSON.stringify(result.message)
  );

  // Broadcast announcement as system message
  const announcement: HeatSystemMessage = {
    type: 'system',
    message: result.announcement,
  };
  this.channelManager.broadcast(client.channelId, JSON.stringify(announcement));

  this.log(`🏛️ ${identity.displayName} ${result.isNew ? 'joined' : 'updated'} → ${message.status}`);
}
```

- [ ] **Step 5: Implement handleSimulatedChat**

Add after `handlePresenceJoin`:

```typescript
/**
 * Handle simulated chat message (LHS testing only).
 * If sender is a lurking member, auto-escalate to present.
 * If sender is not a member, log the invite scenario.
 */
private async handleSimulatedChat(
  client: ClientConnection,
  message: { userId?: string; text: string }
): Promise<void> {
  const userId = message.userId || client.userId;
  const text = (message.text || '').trim().toLowerCase();

  // Check for presence commands
  const PRESENT_TRIGGERS = new Set(['present', '!present', 'present!']);
  const LURK_TRIGGERS = new Set(['lurk', '!lurk', 'lurk!']);

  if (PRESENT_TRIGGERS.has(text) || LURK_TRIGGERS.has(text)) {
    const status = PRESENT_TRIGGERS.has(text) ? 'present' : 'lurking';
    const identity = await this.identityResolver.resolve(userId);
    const result = this.presenceManager.join(userId, status, identity);

    this.channelManager.broadcast(client.channelId, JSON.stringify(result.message));
    const announcement: HeatSystemMessage = { type: 'system', message: result.announcement };
    this.channelManager.broadcast(client.channelId, JSON.stringify(announcement));

    this.log(`💬 ${identity.displayName} used chat command → ${status}`);
    return;
  }

  if (text === '!status') {
    const member = this.presenceManager.getMember(userId);
    const statusMsg: HeatSystemMessage = {
      type: 'system',
      message: member
        ? `You are currently ${member.status} in the ${this.presenceManager.getRoomName()}`
        : `You haven't joined the ${this.presenceManager.getRoomName()} yet. Click the bullseye or type !present`,
    };
    client.ws.send(JSON.stringify(statusMsg));
    return;
  }

  // Regular chat message — check for lurker escalation
  const escalation = this.presenceManager.chatEscalate(userId);
  if (escalation) {
    this.channelManager.broadcast(client.channelId, JSON.stringify(escalation.message));
    const announcement: HeatSystemMessage = { type: 'system', message: escalation.announcement };
    this.channelManager.broadcast(client.channelId, JSON.stringify(announcement));
    this.log(`💬 Chat auto-escalated ${userId} from lurking → present`);
  } else if (!this.presenceManager.isMember(userId)) {
    // Not a member — in production, AI would send an invite. LHS just logs it.
    const identity = await this.identityResolver.resolve(userId);
    this.log(`💬 ${identity.displayName} chatted but isn't in the ${this.presenceManager.getRoomName()} — would send AI invite in production`);
  }
}
```

- [ ] **Step 6: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: Clean compile

- [ ] **Step 7: Commit**

```bash
git add src/server.ts
git commit -m "feat: wire PresenceManager into WebSocket — handle presence, chat commands, hydration"
```

---

### Task 4: Add presence API endpoints to HttpServer

**Files:**
- Modify: `src/http-server.ts`

- [ ] **Step 1: Accept PresenceManager in constructor**

Add import:
```typescript
import { PresenceManager } from './presence.js';
```

Add member:
```typescript
private presenceManager: PresenceManager;
```

Update constructor signature:
```typescript
constructor(publicDir: string = './public', identityResolver?: IdentityResolver, presenceManager?: PresenceManager) {
  this.publicDir = publicDir;
  this.themeManager = new ThemeManager();
  this.identityResolver = identityResolver || new IdentityResolver();
  this.presenceManager = presenceManager || new PresenceManager();
  this.server = createServer(this.handleRequest.bind(this));
}
```

- [ ] **Step 2: Add route matching**

In `handleRequest`, after the `/api/viewers` route block and before the static file serving:

```typescript
// Presence API routes
if (url === '/api/presence') {
  this.handlePresenceState(res);
  return;
}
```

- [ ] **Step 3: Implement handler**

```typescript
/**
 * GET /api/presence — return current presence state
 */
private handlePresenceState(res: ServerResponse): void {
  const state = this.presenceManager.getState();
  const counts = this.presenceManager.getCounts();
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ...state, counts, roomName: this.presenceManager.getRoomName() }));
}
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: Clean compile

- [ ] **Step 5: Commit**

```bash
git add src/http-server.ts
git commit -m "feat: add GET /api/presence endpoint for presence state"
```

---

### Task 5: Update heat-client.js with presence and chat methods

**Files:**
- Modify: `public/heat-client.js`

- [ ] **Step 1: Add sendPresence method**

Add after the `sendClick` method (after line 103):

```javascript
/**
 * Send a presence join/update to the server
 * @param {'present' | 'lurking'} status - Desired presence status
 * @param {string} [userId] - Optional user ID
 */
sendPresence(status, userId) {
  if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
    this.log('⚠️ Not connected to server');
    return false;
  }

  const presenceData = {
    type: 'presence_join',
    userId: userId || undefined,
    status: status,
  };

  try {
    this.ws.send(JSON.stringify(presenceData));
    return true;
  } catch (error) {
    this.log('❌ Failed to send presence:', error);
    return false;
  }
}

/**
 * Send a simulated chat message to the server (LHS testing)
 * @param {string} text - Chat message text
 * @param {string} [userId] - Optional user ID
 */
sendChat(text, userId) {
  if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
    this.log('⚠️ Not connected to server');
    return false;
  }

  const chatData = {
    type: 'chat',
    userId: userId || undefined,
    text: text,
  };

  try {
    this.ws.send(JSON.stringify(chatData));
    return true;
  } catch (error) {
    this.log('❌ Failed to send chat:', error);
    return false;
  }
}
```

- [ ] **Step 2: Update handleMessage to log presence events**

In `handleMessage`, add handling for presence event types after the click block (line 118):

```javascript
} else if (message.type === 'presence_join' || message.type === 'presence_update') {
  this.log(`🏛️ ${message.identity?.displayName || message.userId} → ${message.status}`);
} else if (message.type === 'presence_state') {
  this.log(`🏛️ Presence hydration: ${message.members.length} members`);
}
```

- [ ] **Step 3: Commit**

```bash
git add public/heat-client.js
git commit -m "feat: add sendPresence() and sendChat() to heat-client.js"
```

---

### Task 6: Create presence.html — Bullseye Button + Presence Board

**Files:**
- Create: `public/presence.html`

This is the largest task. The page contains:
1. A draggable bullseye button that expands to show "Present" and "Lurk" orbital options
2. A presence board showing current members (present/lurking)
3. GSAP letter-by-letter text animation for announcements
4. A simulated chat panel for testing presence commands
5. WebSocket integration via heat-client.js

- [ ] **Step 1: Create the full presence.html page**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Champagne Room — Heat Presence Prototype</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&display=swap" rel="stylesheet">
  <script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js"></script>
  <script src="/theme-loader.js"></script>
  <script src="/heat-client.js"></script>
  <style>
    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: var(--font-body, 'Courier New', monospace);
      background: var(--color-background, #0a0a0a);
      color: var(--color-text, #fff);
      min-height: 100vh;
      overflow: hidden;
    }

    /* ─── Bullseye Button ─────────────────────────────────────── */
    .bullseye-container {
      position: fixed;
      bottom: 40px;
      right: 40px;
      z-index: 1000;
      cursor: grab;
    }
    .bullseye-container.dragging { cursor: grabbing; }

    .bullseye {
      width: 64px;
      height: 64px;
      border-radius: 50%;
      background: radial-gradient(circle,
        var(--color-primary, #9a04ae) 0%,
        transparent 30%,
        var(--color-primary, #9a04ae) 35%,
        transparent 50%,
        var(--color-primary, #9a04ae) 55%,
        transparent 70%);
      border: 3px solid var(--color-primary, #9a04ae);
      box-shadow: 0 0 20px var(--color-primary, #9a04ae), inset 0 0 15px rgba(0,0,0,0.5);
      cursor: pointer;
      transition: transform 0.3s ease, box-shadow 0.3s ease;
      position: relative;
    }
    .bullseye:hover {
      transform: scale(1.1);
      box-shadow: 0 0 30px var(--color-primary, #9a04ae), 0 0 60px var(--color-primary, #9a04ae), inset 0 0 15px rgba(0,0,0,0.5);
    }

    /* Orbital options */
    .orbital-options {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      pointer-events: none;
      opacity: 0;
    }
    .orbital-options.expanded {
      pointer-events: auto;
      opacity: 1;
    }

    .orbital-btn {
      position: absolute;
      width: 80px;
      height: 32px;
      border-radius: 16px;
      border: 2px solid;
      font-family: 'Orbitron', monospace;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: transform 0.2s ease, box-shadow 0.2s ease;
    }
    .orbital-btn:hover { transform: scale(1.1); }

    .orbital-present {
      background: rgba(0, 255, 136, 0.15);
      border-color: #00ff88;
      color: #00ff88;
      top: -50px;
      left: -40px;
    }
    .orbital-present:hover { box-shadow: 0 0 15px #00ff88; }

    .orbital-lurk {
      background: rgba(255, 170, 0, 0.15);
      border-color: #ffaa00;
      color: #ffaa00;
      top: 30px;
      left: -40px;
    }
    .orbital-lurk:hover { box-shadow: 0 0 15px #ffaa00; }

    /* ─── Presence Board ─────────────────────────────────────── */
    .presence-board {
      position: fixed;
      top: 20px;
      right: 20px;
      width: 280px;
      background: var(--color-panel-bg, rgba(0, 20, 0, 0.85));
      border: var(--effect-border-width, 2px) solid var(--color-border-accent, #ff00c8);
      border-radius: var(--effect-border-radius, 12px);
      backdrop-filter: blur(var(--effect-backdrop-blur, 7px));
      overflow: hidden;
      z-index: 500;
    }

    .board-header {
      padding: 12px 16px;
      border-bottom: 1px solid var(--color-border, #004400);
      background: rgba(0, 0, 0, 0.3);
    }
    .board-title {
      font-family: 'Orbitron', monospace;
      font-size: 11px;
      font-weight: 900;
      color: var(--color-primary, #9a04ae);
      text-shadow: 0 0 10px var(--color-primary, #9a04ae);
      letter-spacing: 0.15em;
      text-transform: uppercase;
    }
    .board-count {
      font-size: 10px;
      color: var(--color-text-muted, #77777d);
      margin-top: 2px;
    }

    .board-section {
      padding: 10px 16px;
    }
    .board-section-label {
      font-family: 'Orbitron', monospace;
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 0.2em;
      text-transform: uppercase;
      margin-bottom: 8px;
      padding-bottom: 4px;
      border-bottom: 1px solid rgba(255,255,255,0.05);
    }
    .label-present { color: #00ff88; }
    .label-lurking { color: #ffaa00; }

    .member-list {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .member-row {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 4px 0;
    }

    .member-avatar {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      border: 2px solid;
      object-fit: cover;
      flex-shrink: 0;
    }
    .member-row.present .member-avatar {
      border-color: var(--member-color, #00ff88);
      box-shadow: 0 0 8px var(--member-color, #00ff88);
    }
    .member-row.lurking .member-avatar {
      border-color: #555;
      filter: grayscale(0.7) brightness(0.5);
    }

    .member-name {
      font-size: 12px;
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .member-row.lurking .member-name {
      color: var(--color-text-muted, #77777d);
    }

    .member-row.new-arrival {
      animation: memberGlow 1.5s ease-out;
    }

    @keyframes memberGlow {
      0% { background: rgba(0, 255, 136, 0.3); }
      100% { background: transparent; }
    }

    .empty-state {
      font-size: 11px;
      color: var(--color-text-muted, #77777d);
      font-style: italic;
      padding: 8px 0;
    }

    /* ─── Announcement Banner ────────────────────────────────── */
    .announcement-bar {
      position: fixed;
      bottom: 120px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(0, 0, 0, 0.85);
      border: 1px solid var(--color-primary, #9a04ae);
      border-radius: 8px;
      padding: 10px 24px;
      font-family: 'Orbitron', monospace;
      font-size: 14px;
      font-weight: 700;
      color: var(--color-primary, #9a04ae);
      text-shadow: 0 0 10px var(--color-primary, #9a04ae);
      pointer-events: none;
      opacity: 0;
      z-index: 900;
      white-space: nowrap;
    }

    /* ─── Simulated Chat Panel ───────────────────────────────── */
    .chat-panel {
      position: fixed;
      bottom: 20px;
      left: 20px;
      width: 320px;
      background: var(--color-panel-bg, rgba(0, 20, 0, 0.85));
      border: var(--effect-border-width, 2px) solid var(--color-border, #004400);
      border-radius: var(--effect-border-radius, 12px);
      backdrop-filter: blur(var(--effect-backdrop-blur, 7px));
      overflow: hidden;
      z-index: 500;
    }

    .chat-header {
      padding: 10px 16px;
      border-bottom: 1px solid var(--color-border, #004400);
      font-family: 'Orbitron', monospace;
      font-size: 10px;
      font-weight: 700;
      color: var(--color-accent, #ff6b35);
      letter-spacing: 0.15em;
      text-transform: uppercase;
    }

    .chat-log {
      height: 180px;
      overflow-y: auto;
      padding: 10px 16px;
      font-size: 12px;
      line-height: 1.6;
    }
    .chat-log .msg-system { color: #ffaa00; font-style: italic; }
    .chat-log .msg-presence { color: #00ff88; }
    .chat-log .msg-chat { color: var(--color-text-secondary, #adadb8); }

    .chat-input-row {
      display: flex;
      border-top: 1px solid var(--color-border, #004400);
    }
    .chat-viewer-select {
      width: 120px;
      padding: 8px;
      background: #1a1a1a;
      color: #fff;
      border: none;
      border-right: 1px solid var(--color-border, #004400);
      font-family: 'Courier New', monospace;
      font-size: 11px;
    }
    .chat-input {
      flex: 1;
      padding: 8px 12px;
      background: #1a1a1a;
      color: #fff;
      border: none;
      font-family: 'Courier New', monospace;
      font-size: 12px;
    }
    .chat-input::placeholder { color: #555; }
    .chat-input:focus { outline: none; background: #222; }

    /* ─── Info overlay ───────────────────────────────────────── */
    .info-bar {
      position: fixed;
      top: 20px;
      left: 20px;
      background: rgba(26, 26, 26, 0.9);
      border: 1px solid var(--color-border, #004400);
      border-radius: 8px;
      padding: 10px 16px;
      font-size: 11px;
      color: var(--color-text-muted, #77777d);
      z-index: 500;
    }
    .info-bar a { color: var(--color-primary, #9a04ae); text-decoration: none; }
    .info-bar a:hover { text-decoration: underline; }
  </style>
</head>
<body>

  <!-- Info -->
  <div class="info-bar">
    <a href="/">&#8592; Home</a> &nbsp;|&nbsp; Champagne Room Prototype
    &nbsp;|&nbsp; <span id="connStatus">Connecting...</span>
  </div>

  <!-- Presence Board -->
  <div class="presence-board" id="presenceBoard">
    <div class="board-header">
      <div class="board-title" id="boardTitle">Champagne Room</div>
      <div class="board-count" id="boardCount">0 members</div>
    </div>
    <div class="board-section">
      <div class="board-section-label label-present">Present (<span id="presentCount">0</span>)</div>
      <div class="member-list" id="presentList">
        <div class="empty-state">No one here yet</div>
      </div>
    </div>
    <div class="board-section">
      <div class="board-section-label label-lurking">Lurking (<span id="lurkingCount">0</span>)</div>
      <div class="member-list" id="lurkingList">
        <div class="empty-state">No lurkers</div>
      </div>
    </div>
  </div>

  <!-- Announcement Banner (GSAP animated) -->
  <div class="announcement-bar" id="announcement"></div>

  <!-- Bullseye Button -->
  <div class="bullseye-container" id="bullseyeContainer">
    <div class="bullseye" id="bullseye"></div>
    <div class="orbital-options" id="orbitalOptions">
      <button class="orbital-btn orbital-present" id="btnPresent">Present</button>
      <button class="orbital-btn orbital-lurk" id="btnLurk">Lurk</button>
    </div>
  </div>

  <!-- Simulated Chat Panel -->
  <div class="chat-panel">
    <div class="chat-header">Simulated Chat</div>
    <div class="chat-log" id="chatLog"></div>
    <div class="chat-input-row">
      <select class="chat-viewer-select" id="viewerSelect">
        <option value="">Loading...</option>
      </select>
      <input type="text" class="chat-input" id="chatInput" placeholder="Type a message or !present / !lurk..." />
    </div>
  </div>

  <script>
    'use strict';

    // ── State ────────────────────────────────────────────────────
    const members = new Map(); // userId -> { status, identity }
    let bullseyeExpanded = false;
    let collapseTimer = null;
    let selectedViewerId = '';
    let roomName = 'Champagne Room';

    // ── Heat Client ──────────────────────────────────────────────
    const channelId = getChannelFromURL('channel', '12345');
    const heat = new HeatClient(channelId, { debugMode: true });

    heat.on('connected', () => {
      document.getElementById('connStatus').textContent = 'Connected';
      document.getElementById('connStatus').style.color = '#00ff88';
    });
    heat.on('disconnected', () => {
      document.getElementById('connStatus').textContent = 'Disconnected';
      document.getElementById('connStatus').style.color = '#ff4444';
    });

    // ── Load viewers for selector ────────────────────────────────
    async function loadViewers() {
      try {
        const res = await fetch('/api/viewers');
        const data = await res.json();
        const select = document.getElementById('viewerSelect');
        select.innerHTML = '';
        for (const v of data.viewers) {
          const opt = document.createElement('option');
          opt.value = v.userId;
          opt.textContent = v.displayName;
          select.appendChild(opt);
        }
        // Add unverified/anonymous options
        select.innerHTML += '<option value="U_test_unverified">Unverified</option>';
        select.innerHTML += '<option value="A_test_anon">Anonymous</option>';
        selectedViewerId = select.value;
      } catch (e) {
        console.warn('Could not load viewers:', e);
      }
    }

    document.getElementById('viewerSelect').addEventListener('change', (e) => {
      selectedViewerId = e.target.value;
    });

    // ── Load room name from theme ────────────────────────────────
    document.addEventListener('themeloaded', (e) => {
      const theme = e.detail;
      if (theme.room && theme.room.name) {
        roomName = theme.room.name;
        document.getElementById('boardTitle').textContent = roomName;
      }
    });

    // ── Presence event handlers ──────────────────────────────────
    heat.on('presence_join', (e) => {
      const msg = e.detail;
      addOrUpdateMember(msg.userId, msg.status, msg.identity, true);
      logChat(`${msg.identity.displayName} joined as ${msg.status}`, 'presence');
    });

    heat.on('presence_update', (e) => {
      const msg = e.detail;
      addOrUpdateMember(msg.userId, msg.status, msg.identity, false);
      logChat(`${msg.identity.displayName} → ${msg.status}`, 'presence');
    });

    heat.on('presence_state', (e) => {
      const msg = e.detail;
      members.clear();
      for (const m of msg.members) {
        addOrUpdateMember(m.userId, m.status, m.identity, false);
      }
      logChat(`Hydrated ${msg.members.length} members`, 'system');
    });

    heat.on('system', (e) => {
      const msg = e.detail;
      // Show announcement for join/leave messages (skip connection messages)
      if (msg.message && !msg.message.startsWith('Connected to') && !msg.message.startsWith('You are') && !msg.message.startsWith("You haven't")) {
        showAnnouncement(msg.message);
      }
      logChat(msg.message, 'system');
    });

    // ── Board rendering ──────────────────────────────────────────
    function addOrUpdateMember(userId, status, identity, isNew) {
      members.set(userId, { status, identity });
      renderBoard();

      if (isNew) {
        // Highlight new arrival
        const row = document.querySelector(`[data-user-id="${userId}"]`);
        if (row) row.classList.add('new-arrival');
      }
    }

    function renderBoard() {
      const presentList = document.getElementById('presentList');
      const lurkingList = document.getElementById('lurkingList');
      const presentMembers = [];
      const lurkingMembers = [];

      for (const [userId, data] of members) {
        if (data.status === 'present') presentMembers.push({ userId, ...data });
        else lurkingMembers.push({ userId, ...data });
      }

      presentList.innerHTML = presentMembers.length
        ? presentMembers.map(m => memberHTML(m, 'present')).join('')
        : '<div class="empty-state">No one here yet</div>';

      lurkingList.innerHTML = lurkingMembers.length
        ? lurkingMembers.map(m => memberHTML(m, 'lurking')).join('')
        : '<div class="empty-state">No lurkers</div>';

      document.getElementById('presentCount').textContent = presentMembers.length;
      document.getElementById('lurkingCount').textContent = lurkingMembers.length;
      document.getElementById('boardCount').textContent =
        `${presentMembers.length + lurkingMembers.length} members`;
    }

    function memberHTML(m, status) {
      const imgSrc = m.identity.profileImageUrl || 'data:image/svg+xml,' + encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><circle cx="16" cy="16" r="16" fill="' + (m.identity.color || '#555') + '"/><text x="16" y="21" text-anchor="middle" fill="#fff" font-size="14">?</text></svg>'
      );
      return `<div class="member-row ${status}" data-user-id="${m.userId}" style="--member-color: ${m.identity.color}">
        <img class="member-avatar" src="${imgSrc}" alt="" />
        <span class="member-name">${m.identity.displayName}</span>
      </div>`;
    }

    // ── GSAP Announcement ────────────────────────────────────────
    function showAnnouncement(text) {
      const el = document.getElementById('announcement');
      el.textContent = '';

      // Create individual letter spans
      const letters = text.split('').map(ch => {
        const span = document.createElement('span');
        span.textContent = ch;
        span.style.opacity = '0';
        span.style.display = 'inline-block';
        el.appendChild(span);
        return span;
      });

      const tl = gsap.timeline();
      tl.to(el, { opacity: 1, duration: 0.2 });
      tl.to(letters, {
        opacity: 1,
        duration: 0.03,
        stagger: 0.03,
        ease: 'none',
      });
      tl.to(el, { opacity: 0, duration: 0.5, delay: 2.5 });
    }

    // ── Bullseye interaction ─────────────────────────────────────
    const bullseye = document.getElementById('bullseye');
    const orbitals = document.getElementById('orbitalOptions');
    const container = document.getElementById('bullseyeContainer');

    bullseye.addEventListener('click', (e) => {
      e.stopPropagation();
      if (bullseyeExpanded) {
        collapseBullseye();
      } else {
        expandBullseye();
      }
    });

    function expandBullseye() {
      bullseyeExpanded = true;
      orbitals.classList.add('expanded');
      gsap.fromTo(orbitals, { scale: 0.5 }, { scale: 1, opacity: 1, duration: 0.3, ease: 'back.out(2)' });
      // Auto-collapse after 3 seconds
      if (collapseTimer) clearTimeout(collapseTimer);
      collapseTimer = setTimeout(collapseBullseye, 3000);
    }

    function collapseBullseye() {
      bullseyeExpanded = false;
      gsap.to(orbitals, { scale: 0.5, opacity: 0, duration: 0.2, onComplete: () => orbitals.classList.remove('expanded') });
      if (collapseTimer) { clearTimeout(collapseTimer); collapseTimer = null; }
    }

    document.getElementById('btnPresent').addEventListener('click', (e) => {
      e.stopPropagation();
      heat.sendPresence('present', selectedViewerId);
      collapseBullseye();
    });

    document.getElementById('btnLurk').addEventListener('click', (e) => {
      e.stopPropagation();
      heat.sendPresence('lurking', selectedViewerId);
      collapseBullseye();
    });

    // Close on outside click
    document.addEventListener('click', () => {
      if (bullseyeExpanded) collapseBullseye();
    });

    // ── Drag bullseye ────────────────────────────────────────────
    let isDragging = false, dragOffsetX = 0, dragOffsetY = 0;

    container.addEventListener('mousedown', (e) => {
      if (e.target === bullseye || e.target === container) {
        isDragging = true;
        container.classList.add('dragging');
        const rect = container.getBoundingClientRect();
        dragOffsetX = e.clientX - rect.left;
        dragOffsetY = e.clientY - rect.top;
        e.preventDefault();
      }
    });

    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      container.style.right = 'auto';
      container.style.bottom = 'auto';
      container.style.left = (e.clientX - dragOffsetX) + 'px';
      container.style.top = (e.clientY - dragOffsetY) + 'px';
    });

    document.addEventListener('mouseup', () => {
      isDragging = false;
      container.classList.remove('dragging');
    });

    // ── Simulated Chat ───────────────────────────────────────────
    const chatInput = document.getElementById('chatInput');
    chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && chatInput.value.trim()) {
        const text = chatInput.value.trim();
        heat.sendChat(text, selectedViewerId);
        logChat(`[${document.getElementById('viewerSelect').selectedOptions[0]?.textContent || 'You'}]: ${text}`, 'chat');
        chatInput.value = '';
      }
    });

    function logChat(text, type) {
      const log = document.getElementById('chatLog');
      const div = document.createElement('div');
      div.className = 'msg-' + type;
      div.textContent = text;
      log.appendChild(div);
      log.scrollTop = log.scrollHeight;
    }

    // ── Init ─────────────────────────────────────────────────────
    loadViewers();
  </script>
</body>
</html>
```

- [ ] **Step 2: Verify the page loads**

Run: `npm run dev`
Open: `http://localhost:7778/presence.html`
Expected:
- Presence board visible (top-right, empty state)
- Bullseye button visible (bottom-right, concentric rings)
- Simulated chat panel visible (bottom-left, viewer selector populated with 8 test viewers)
- Connection status shows "Connected"

- [ ] **Step 3: Test bullseye interaction**

1. Click bullseye → "Present" and "Lurk" buttons should appear with GSAP animation
2. Wait 3s → buttons auto-collapse
3. Select a viewer from dropdown, click bullseye → Present
4. Board should show the viewer in the Present section with profile pic and glow
5. Select a different viewer, click bullseye → Lurk
6. Board should show them dimmed in Lurking section

- [ ] **Step 4: Test simulated chat commands**

1. Select a viewer, type `!present` in chat input, press Enter
2. Viewer should appear on presence board as present
3. Type `!lurk` → viewer switches to lurking
4. Type `!status` → system message shows their status
5. Type any other message while lurking → auto-escalates to present

- [ ] **Step 5: Test GSAP announcement animation**

When a viewer joins or changes status, the announcement banner should appear at bottom-center with letter-by-letter reveal animation, hold for 2.5s, then fade out.

- [ ] **Step 6: Commit**

```bash
git add public/presence.html
git commit -m "feat: add presence.html — bullseye button, presence board, GSAP animations, simulated chat"
```

---

### Task 7: Build verification and final integration test

**Files:** None (verification only)

- [ ] **Step 1: Full TypeScript build**

Run: `npm run build`
Expected: Clean compile to `dist/`

- [ ] **Step 2: Test all API endpoints**

Run: `npm start`

Test:
- `http://localhost:7778/presence.html` — page loads, bullseye visible
- `http://localhost:7778/api/presence` — returns `{ type: 'presence_state', members: [], counts: { present: 0, lurking: 0, total: 0 }, roomName: 'Champagne Room' }`
- `http://localhost:7778/api/viewers` — still returns 8 test viewers
- `http://localhost:7778/api/theme` — includes room section

- [ ] **Step 3: Full presence flow test**

1. Open `http://localhost:7778/presence.html`
2. Select "CoolViewer42" from dropdown
3. Click bullseye → Present
4. Board shows CoolViewer42 as present, announcement animates
5. Select "RaidBoss99", type `!lurk` in chat
6. Board shows RaidBoss99 dimmed in lurking section
7. Type `hello` as RaidBoss99 → auto-escalates to present
8. `http://localhost:7778/api/presence` now shows 2 members
9. Open a second browser tab to `http://localhost:7778/presence.html`
10. Second tab should hydrate with both members immediately

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: integration test fixes for sprint 2"
```
(Only if fixes were needed)

- [ ] **Step 5: Update landing page with presence link**

Add a link to presence.html on the landing page (`public/index.html`) alongside existing demo links.

```bash
git add public/index.html
git commit -m "feat: add Champagne Room link to landing page"
```
