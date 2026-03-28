# Sprint 1: Identity Resolution + Message Types

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add identity resolution infrastructure and shared message types to the Local Heat Server so enriched click data (with viewer profiles) flows to all overlay pages.

**Architecture:** A new `IdentityResolver` class parses Heat ID prefixes (A/U/numeric), looks up profiles from `viewers.json`, and enriches click messages before broadcast. New TypeScript types define the shared message format for all future overlay features (presence, voting, games). The `room` config field is added to `theme.json` for the configurable room name.

**Tech Stack:** TypeScript, Node.js, `ws` WebSocket library, existing HTTP server infrastructure

**Spec:** `docs/superpowers/specs/2026-03-26-champagne-room-heat-overlay-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src/types.ts` | Modify | Add identity, presence, vote, and game message types |
| `src/identity.ts` | Create | `IdentityResolver` class — prefix parsing, viewer lookup, caching |
| `viewers.json` | Create | Registry of fake test viewers with Twitch-like profiles |
| `src/server.ts` | Modify | Wire IdentityResolver into click handling, enrich before broadcast |
| `src/http-server.ts` | Modify | Add `GET /api/identity/:userId` and `GET /api/viewers` endpoints |
| `theme.json` | Modify | Add `room.name` field |
| `public/theme-loader.js` | Modify | Expose `room.name` as CSS variable and on `window.HeatTheme` |

---

### Task 1: Extend types.ts with shared message types

**Files:**
- Modify: `src/types.ts`

- [ ] **Step 1: Add IdentityResponse interface**

```typescript
/**
 * Resolved viewer identity
 */
export interface IdentityResponse {
  resolved: boolean;
  userId: string;
  displayName: string;
  profileImageUrl: string | null;
  color: string;
  tier: 'verified' | 'unverified' | 'anonymous';
  friendshipLevel: number;
}
```

- [ ] **Step 2: Add enriched click type**

```typescript
/**
 * Click data enriched with identity (broadcast to overlay clients)
 */
export interface EnrichedClickData extends HeatClickData {
  identity: IdentityResponse;
}
```

- [ ] **Step 3: Add presence message types**

```typescript
/**
 * Presence events for Champagne Room
 */
export interface PresenceJoinMessage {
  type: 'presence_join';
  userId: string;
  status: 'present' | 'lurking';
  identity: IdentityResponse;
}

export interface PresenceUpdateMessage {
  type: 'presence_update';
  userId: string;
  status: 'present' | 'lurking';
  identity: IdentityResponse;
}

export interface PresenceStateMessage {
  type: 'presence_state';
  members: Array<{
    userId: string;
    status: 'present' | 'lurking';
    identity: IdentityResponse;
  }>;
}
```

- [ ] **Step 4: Add vote message types**

```typescript
/**
 * Heat vote events (using heatvote prefix to avoid collision with existing VotingCommand)
 */
export interface HeatVoteStartMessage {
  type: 'heatvote_start';
  question: string;
  options: string[];
  layout: 'split2' | 'split3' | 'quadrant' | 'custom';
}

export interface HeatVoteCastMessage {
  type: 'heatvote_cast';
  userId: string;
  option: number;
  identity: IdentityResponse;
}

export interface HeatVoteUpdateMessage {
  type: 'heatvote_update';
  tallies: number[];
  total: number;
}

export interface HeatVoteEndMessage {
  type: 'heatvote_end';
  winner: number;
  tallies: number[];
  question: string;
}
```

- [ ] **Step 5: Add game message types (future, define now)**

```typescript
/**
 * Game events (Connect Four, Mancala, etc.)
 */
export interface GameStartMessage {
  type: 'game_start';
  game: string;
  players: string[];
}

export interface GameMoveMessage {
  type: 'game_move';
  game: string;
  userId: string;
  column: number;
}

export interface GameStateMessage {
  type: 'game_state';
  game: string;
  board: number[][];
  turn: string;
}

export interface GameEndMessage {
  type: 'game_end';
  game: string;
  winner: string | null;
}
```

- [ ] **Step 6: Replace the existing HeatMessage union type**

**Important:** Replace the existing `HeatMessage` type on line 22 of `types.ts` — do NOT add a second declaration.

```typescript
/**
 * Union type for all Heat messages
 */
export type HeatMessage =
  | HeatClickData
  | EnrichedClickData
  | HeatSystemMessage
  | PresenceJoinMessage
  | PresenceUpdateMessage
  | PresenceStateMessage
  | HeatVoteStartMessage
  | HeatVoteCastMessage
  | HeatVoteUpdateMessage
  | HeatVoteEndMessage
  | GameStartMessage
  | GameMoveMessage
  | GameStateMessage
  | GameEndMessage;
```

- [ ] **Step 7: Add ViewerProfile interface for viewers.json**

```typescript
/**
 * Viewer profile as stored in viewers.json
 */
export interface ViewerProfile {
  userId: string;
  displayName: string;
  profileImageUrl: string;
  color: string;
  friendshipLevel: number;
  bio: string;
}
```

- [ ] **Step 8: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: Clean compile, no errors

- [ ] **Step 9: Commit**

```bash
git add src/types.ts
git commit -m "feat: add shared message types for identity, presence, voting, and games"
```

---

### Task 2: Create viewers.json with test viewer profiles

**Files:**
- Create: `viewers.json` (rename existing to `viewers.json` — wait, there isn't one yet)

Note: This is a separate file from `theme.json`. It lives at project root.

- [ ] **Step 1: Create viewers.json with 8 diverse test viewers**

```json
{
  "viewers": [
    {
      "userId": "12345678",
      "displayName": "CoolViewer42",
      "profileImageUrl": "https://static-cdn.jtvnw.net/jtv_user_pictures/placeholder-1.png",
      "color": "#ff6b35",
      "friendshipLevel": 3,
      "bio": "Regular viewer, loves fighting games"
    },
    {
      "userId": "23456789",
      "displayName": "RaidBoss99",
      "profileImageUrl": "https://static-cdn.jtvnw.net/jtv_user_pictures/placeholder-2.png",
      "color": "#9147ff",
      "friendshipLevel": 5,
      "bio": "Raid leader, always brings the squad"
    },
    {
      "userId": "34567890",
      "displayName": "SilentSam",
      "profileImageUrl": "https://static-cdn.jtvnw.net/jtv_user_pictures/placeholder-3.png",
      "color": "#00ff88",
      "friendshipLevel": 1,
      "bio": "Lurker who occasionally types"
    },
    {
      "userId": "45678901",
      "displayName": "PixelQueen",
      "profileImageUrl": "https://static-cdn.jtvnw.net/jtv_user_pictures/placeholder-4.png",
      "color": "#ff69b4",
      "friendshipLevel": 4,
      "bio": "Artist and emote creator"
    },
    {
      "userId": "56789012",
      "displayName": "CodeMonkey_Dev",
      "profileImageUrl": "https://static-cdn.jtvnw.net/jtv_user_pictures/placeholder-5.png",
      "color": "#1e90ff",
      "friendshipLevel": 2,
      "bio": "Backseat coder, always has opinions"
    },
    {
      "userId": "67890123",
      "displayName": "NightOwl_TV",
      "profileImageUrl": "https://static-cdn.jtvnw.net/jtv_user_pictures/placeholder-6.png",
      "color": "#ffd700",
      "friendshipLevel": 3,
      "bio": "Late night regular, never misses a stream"
    },
    {
      "userId": "78901234",
      "displayName": "TurboGamer",
      "profileImageUrl": "https://static-cdn.jtvnw.net/jtv_user_pictures/placeholder-7.png",
      "color": "#ff4444",
      "friendshipLevel": 2,
      "bio": "Competitive player, loves chat games"
    },
    {
      "userId": "89012345",
      "displayName": "ChillVibes420",
      "profileImageUrl": "https://static-cdn.jtvnw.net/jtv_user_pictures/placeholder-8.png",
      "color": "#00bcd4",
      "friendshipLevel": 1,
      "bio": "Just here for the vibes"
    }
  ]
}
```

- [ ] **Step 2: Commit**

```bash
git add viewers.json
git commit -m "feat: add test viewer profiles for identity simulation"
```

---

### Task 3: Create IdentityResolver class

**Files:**
- Create: `src/identity.ts`

- [ ] **Step 1: Create IdentityResolver with prefix parsing**

```typescript
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
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: Clean compile

- [ ] **Step 3: Commit**

```bash
git add src/identity.ts
git commit -m "feat: add IdentityResolver class with prefix parsing and viewer lookup"
```

---

### Task 4: Wire IdentityResolver into the WebSocket server

**Files:**
- Modify: `src/server.ts`

- [ ] **Step 1: Update imports in server.ts**

**Modify** the existing import on line 6 of `src/server.ts` (do NOT add a duplicate). Change:
```typescript
import type { HeatClickData, HeatSystemMessage, ClientConnection } from './types.js';
```
to:
```typescript
import type { HeatClickData, HeatSystemMessage, EnrichedClickData, ClientConnection } from './types.js';
```

And add a new import for the resolver:
```typescript
import { IdentityResolver } from './identity.js';
```

- [ ] **Step 2: Add identityResolver as a class member**

In the `HeatServer` class, add a member and initialize in constructor:

```typescript
private identityResolver: IdentityResolver;
```

In the constructor, before `this.setupWebSocketHandlers()`:

```typescript
this.identityResolver = new IdentityResolver();
this.identityResolver.load();
```

- [ ] **Step 3: Update handleClickMessage to enrich clicks with identity**

Replace the `handleClickMessage` method. The key change: after validation, resolve the identity and broadcast the enriched message instead of the raw one.

```typescript
private async handleClickMessage(client: ClientConnection, message: HeatClickData): Promise<void> {
    // Validate coordinates
    const x = parseFloat(message.x);
    const y = parseFloat(message.y);

    if (isNaN(x) || isNaN(y) || x < 0 || x > 1 || y < 0 || y > 1) {
      this.log(`⚠️ Invalid coordinates from ${client.userId}: (${message.x}, ${message.y})`);
      return;
    }

    // Use client's userId if message doesn't specify one
    if (!message.id) {
      message.id = client.userId;
    }

    // Resolve identity
    const identity = await this.identityResolver.resolve(message.id);

    // Build enriched message
    const enriched: EnrichedClickData = {
      ...message,
      identity,
    };

    // Increment click counter
    this.channelManager.incrementClicks(client.channelId);

    // Broadcast enriched click to all clients in channel
    this.channelManager.broadcast(
      client.channelId,
      JSON.stringify(enriched)
    );

    if (config.debugMode) {
      const name = identity.resolved ? identity.displayName : identity.tier;
      this.log(`🖱️ Click from ${name} (${message.id}) at (${message.x}, ${message.y}) in channel ${client.channelId}`);
    }
  }
```

Note: `handleMessage` calls `this.handleClickMessage(client, message as HeatClickData)` — since we changed the return type to `Promise<void>`, we need to add `await` or handle the promise. Update `handleMessage` to await it:

Change in `handleMessage`:
```typescript
if (message.type === 'click') {
  this.handleClickMessage(client, message as HeatClickData);
}
```
to:
```typescript
if (message.type === 'click') {
  await this.handleClickMessage(client, message as HeatClickData);
}
```

Make `handleMessage` async:
```typescript
private async handleMessage(client: ClientConnection, data: string): Promise<void> {
```

**Also update the `ws.on('message', ...)` registration** in `setupWebSocketHandlers` (line 109-111) to use an async callback:
```typescript
ws.on('message', async (data) => {
  await this.handleMessage(client, data.toString());
});
```
Without this, the async `handleMessage` return is silently dropped and unhandled rejections can crash Node.

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: Clean compile

- [ ] **Step 5: Test manually**

Run: `npm run dev`
Expected: Server starts, logs show `[Identity] Loaded 8 viewer profiles`

Open `http://localhost:7778/test.html` in a browser, click anywhere.
Check terminal — log should show identity tier info in the click log.

- [ ] **Step 6: Commit**

```bash
git add src/server.ts
git commit -m "feat: wire IdentityResolver into click handling, broadcast enriched clicks"
```

---

### Task 5: Add identity API endpoints to HttpServer

**Files:**
- Modify: `src/http-server.ts`

- [ ] **Step 1: Import IdentityResolver**

Add to imports:
```typescript
import { IdentityResolver } from './identity.js';
```

- [ ] **Step 2: Add identityResolver member and accept it in constructor**

Change the constructor to accept an optional `IdentityResolver`:
```typescript
private identityResolver: IdentityResolver;

constructor(publicDir: string = './public', identityResolver?: IdentityResolver) {
    this.publicDir = publicDir;
    this.themeManager = new ThemeManager();
    this.identityResolver = identityResolver || new IdentityResolver();
    this.server = createServer(this.handleRequest.bind(this));
}
```

- [ ] **Step 3: Add route matching for identity endpoints**

In `handleRequest`, add before the static file serving fallthrough:

```typescript
// Identity API routes
const identityMatch = url.match(/^\/api\/identity\/(.+)$/);
if (identityMatch) {
  await this.handleIdentityLookup(identityMatch[1], res);
  return;
}
if (url === '/api/viewers') {
  await this.handleViewersList(res);
  return;
}
```

- [ ] **Step 4: Implement the handler methods**

```typescript
/**
 * GET /api/identity/:userId — resolve a user ID to identity
 */
private async handleIdentityLookup(userId: string, res: ServerResponse): Promise<void> {
  try {
    const identity = await this.identityResolver.resolve(decodeURIComponent(userId));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(identity));
  } catch (error: any) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: error.message }));
  }
}

/**
 * GET /api/viewers — list all registered test viewers
 */
private async handleViewersList(res: ServerResponse): Promise<void> {
  const viewers = this.identityResolver.getViewers();
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ viewers }));
}
```

- [ ] **Step 5: Update server.ts to share the IdentityResolver instance**

In `src/server.ts`, reorder the constructor so the resolver is created before HttpServer. The final constructor body should be:

```typescript
constructor() {
    this.channelManager = new ChannelManager();

    // Identity resolver — must init before HttpServer so it can be shared
    this.identityResolver = new IdentityResolver();
    this.identityResolver.load();

    // Create HTTP server for serving demo pages + API
    this.httpServer = new HttpServer('./public', this.identityResolver);

    // Create HTTP server for WebSocket upgrade
    const server = createServer();
    // ... rest unchanged
```

- [ ] **Step 6: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: Clean compile

- [ ] **Step 7: Test manually**

Run: `npm run dev`

Test endpoints:
- `http://localhost:7778/api/viewers` — should return all 8 test viewers
- `http://localhost:7778/api/identity/12345678` — should return CoolViewer42 verified profile
- `http://localhost:7778/api/identity/U9999999` — should return unverified profile
- `http://localhost:7778/api/identity/A1234567` — should return anonymous profile

- [ ] **Step 8: Commit**

```bash
git add src/http-server.ts src/server.ts
git commit -m "feat: add identity API endpoints (GET /api/identity/:id, GET /api/viewers)"
```

---

### Task 6: Add room name config to theme.json and theme-loader.js

**Files:**
- Modify: `theme.json`
- Modify: `src/theme-manager.ts`
- Modify: `public/theme-loader.js`

- [ ] **Step 1: Add room section to theme.json**

Add after the `effects` section in `theme.json`:

```json
"room": {
  "name": "Champagne Room"
}
```

- [ ] **Step 2: Update ThemeManager defaults and interface (both changes in the same edit)**

**Important:** Both the interface AND the DEFAULTS must be updated atomically — changing one without the other will fail `tsc`.

Update the `ThemeConfig` interface:

```typescript
export interface ThemeConfig {
  colors: Record<string, string>;
  fonts: Record<string, string>;
  effects: Record<string, number>;
  room: Record<string, string>;
}
```

And in the same edit, add to the `DEFAULTS` object:

```typescript
room: {
  name: 'Champagne Room',
},
```

- [ ] **Step 3: Update theme-loader.js to expose room config**

In `public/theme-loader.js`, inside the `applyCSS` function, add after the effects block:

```javascript
// Room config
if (theme.room) {
  for (const [key, value] of Object.entries(theme.room)) {
    root.style.setProperty('--room-' + camelToDash(key), value);
  }
}
```

Also update the fallback theme object in the catch block to include:
```javascript
room: { name: 'Champagne Room' },
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: Clean compile

- [ ] **Step 5: Test manually**

Run: `npm run dev`
- `http://localhost:7778/api/theme` — response should include `"room": {"name": "Champagne Room"}`
- Open any page, check browser DevTools → Elements → `<html>` tag should have `--room-name: Champagne Room` as an inline style

- [ ] **Step 6: Commit**

```bash
git add theme.json src/theme-manager.ts public/theme-loader.js
git commit -m "feat: add configurable room name to theme system (default: Champagne Room)"
```

---

### Task 7: Add room name to settings page

**Files:**
- Modify: `public/settings.html`

- [ ] **Step 1: Add a "Room" section to the settings page**

Find the fonts section in `settings.html` and add a new section before it with a text input for the room name. The input should:
- Have id `room-name`
- Load current value from theme config on page init
- Be included in the save payload under `room.name`
- Have label "Room Name" styled like other section headers (Orbitron font, green)
- Include helper text: "The public name for the presence board (e.g., Champagne Room, Club Rotic)"

- [ ] **Step 2: Update the page's load/save/reset logic**

The settings page maintains a local `theme` object that gets sent as the PUT payload. The room name must be wired into this object.

In the JavaScript `loadTheme()` function, add after existing field population:
```javascript
// Initialize room on the theme object
if (!theme.room) theme.room = {};
theme.room.name = theme.room?.name || 'Champagne Room';
document.getElementById('room-name').value = theme.room.name;
```

Add an input event listener to keep `theme.room.name` in sync as the user types:
```javascript
document.getElementById('room-name').addEventListener('input', (e) => {
  if (!theme.room) theme.room = {};
  theme.room.name = e.target.value || 'Champagne Room';
});
```

The `saveTheme()` function already sends `JSON.stringify(theme)` — since `theme.room` is now populated, it will be included automatically. No changes needed to save logic.

In the `resetTheme()` handler, after re-fetching the reset response, re-populate:
```javascript
document.getElementById('room-name').value = theme.room?.name || 'Champagne Room';
```

- [ ] **Step 3: Test manually**

Run: `npm run dev`
- Open `http://localhost:7778/settings.html`
- Room Name field should show "Champagne Room"
- Change to "Club Rotic", click Save
- Refresh page — should still show "Club Rotic"
- Click Reset — should revert to "Champagne Room"

- [ ] **Step 4: Commit**

```bash
git add public/settings.html
git commit -m "feat: add room name setting to theme settings page"
```

---

### Task 8: Final integration test and build verification

**Files:** None (verification only)

- [ ] **Step 1: Full TypeScript build**

Run: `npm run build`
Expected: Clean build to `dist/`

- [ ] **Step 2: Run production build**

Run: `npm start`
Expected: Server starts on ports 7777/7778

- [ ] **Step 3: Verify all endpoints**

Test each endpoint:
- `http://localhost:7778/` — landing page loads with RipTheAI theme
- `http://localhost:7778/settings.html` — settings page with room name field
- `http://localhost:7778/api/theme` — includes `room` section
- `http://localhost:7778/api/viewers` — returns 8 test viewers
- `http://localhost:7778/api/identity/12345678` — returns CoolViewer42
- `http://localhost:7778/api/identity/Ufoobar` — returns unverified profile
- `http://localhost:7778/api/identity/Arandom` — returns anonymous profile

- [ ] **Step 4: Verify enriched click broadcast**

Open `http://localhost:7778/test.html` in browser.
Click on the page.
Open browser DevTools → Network → WS tab.
Verify the WebSocket message received includes an `identity` field.

**Note:** Clicks from test.html use server-generated `U`-prefix IDs, so you'll see `tier: "unverified"` and `resolved: false`. This is correct behavior — only numeric IDs (from `viewers.json`) resolve to full profiles. To test a resolved profile, use the REST endpoint: `http://localhost:7778/api/identity/12345678`

- [ ] **Step 5: Stop server, switch back to dev mode**

Stop the production server. Verify `npm run dev` still works.

- [ ] **Step 6: Commit any fixes, then create PR**

If any fixes were needed during testing:
```bash
git add -A
git commit -m "fix: integration test fixes for sprint 1"
```

Create feature branch and PR:
```bash
git checkout -b feature/sprint1-identity-resolution
git push -u origin feature/sprint1-identity-resolution
gh pr create --title "Sprint 1: Identity resolution + shared message types" --body "..."
```
