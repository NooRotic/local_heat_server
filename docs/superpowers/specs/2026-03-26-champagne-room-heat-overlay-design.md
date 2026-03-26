# Champagne Room — Interactive Heat Overlay System

**Date:** 2026-03-26
**Status:** Design
**Projects:** local_heat_server (LHS), riptheai-bot-v2 (RipV2)

## Overview

An interactive overlay framework built on the Twitch Heat extension that transforms click coordinates into a rich viewer presence, voting, and gaming system. The "Champagne Room" is the public-facing name for the viewer presence board.

The Local Heat Server serves as the development/testing environment with simulated viewers. The RipTheAI bot handles production with real Twitch identity resolution, AI-generated messages, and OBS integration.

Both share the same WebSocket message types (defined in this spec) so overlay prototypes built on LHS translate directly to production concepts in RipV2.

---

## Layer 0: Identity Resolution

### Problem
The Twitch Heat extension sends click events with user IDs using three formats:
- `A` + random = anonymous (not logged into Twitch) — **not resolvable**
- `U` + opaque token = unverified (logged in, extension cannot verify identity) — **not a Twitch user ID, not resolvable via API**
- Numeric only = verified Twitch user ID — **fully resolvable via Twitch API**

> **Important:** The `U`-prefix token is a Heat-internal identifier, NOT the viewer's Twitch user ID. Only bare numeric IDs (no prefix) can be resolved via the Twitch `Get Users` API. This must be verified against live Heat click data before production implementation. The existing `heatMapService.ts` in RipV2 already distinguishes `unverified` as its own bucket.

### Identity Tiers
| Prefix | Tier | Can Resolve Name? | Can Show Profile Pic? |
|--------|------|--------------------|-----------------------|
| None (numeric) | `verified` | Yes — Twitch API | Yes |
| `U` | `unverified` | No — opaque token | No — generic avatar with consistent color |
| `A` | `anonymous` | No — random per click | No — generic "?" marker |

**Key insight for LHS:** Since `U` users can't be resolved, the local emulator should generate both numeric IDs (to test the full identity flow) and `U`/`A` IDs (to test fallback/anonymous handling).

### LHS Implementation
- `viewers.json` — registry of fake test viewers (schema defined below)
- `src/identity.ts` — `IdentityResolver` class:
  - Parses prefix to determine tier
  - For numeric IDs: looks up viewer from `viewers.json`
  - For `U`-prefix: returns consistent unverified profile (same color per session)
  - For `A`-prefix: returns anonymous profile
  - Caches resolved profiles in memory
- `GET /api/identity/:userId` — REST endpoint returning profile data

### viewers.json Schema
```json
{
  "viewers": [
    {
      "userId": "12345678",
      "displayName": "CoolViewer42",
      "profileImageUrl": "https://static-cdn.jtvnw.net/jtv_user_pictures/example.png",
      "color": "#ff6b35",
      "friendshipLevel": 3,
      "bio": "Regular viewer, loves fighting games"
    }
  ]
}
```

### RipV2 Implementation (production)
- Modify `heatMapService.ts` to resolve identity on click:
  - Numeric IDs → `@twurple` Twitch API `getUsers()` with existing LRU cache (currently 5000 entries, 1hr TTL in heatMapService.ts — keep those values)
  - `U`-prefix → unverified profile with consistent color derived from token hash
  - `A`-prefix → anonymous profile
- Enrich verified users with chatter profile data from bot's database (friendship level, conversation history)
- **Action item:** Capture live Heat click data to confirm `U`-prefix behavior before building resolver

### Identity Response Shape
Used by both `GET /api/identity/:userId` (LHS) and the bot's internal resolver (RipV2):
```json
{
  "resolved": true,
  "userId": "12345678",
  "displayName": "CoolViewer42",
  "profileImageUrl": "https://static-cdn.jtvnw.net/jtv_user_pictures/example.png",
  "color": "#ff6b35",
  "tier": "verified",
  "friendshipLevel": 3
}
```

For unresolvable users:
```json
{
  "resolved": false,
  "userId": "Uabc123",
  "displayName": "Viewer",
  "profileImageUrl": null,
  "color": "#888888",
  "tier": "unverified",
  "friendshipLevel": 0
}
```

---

## Shared WebSocket Message Types

All new event types used by both LHS and RipV2. These extend the existing `HeatClickData` and `HeatSystemMessage` types.

### Click (enriched)
```json
{
  "type": "click",
  "id": "12345678",
  "x": "0.500",
  "y": "0.750",
  "identity": { /* Identity Response Shape above */ }
}
```

### Presence Events
```json
{ "type": "presence_join", "userId": "12345678", "status": "present", "identity": { ... } }
{ "type": "presence_update", "userId": "12345678", "status": "lurking", "identity": { ... } }
{ "type": "presence_state", "members": [ { "userId": "...", "status": "present", "identity": {...} } ] }
```
`presence_state` is sent to newly connected clients so they can hydrate the full board.

### Vote Events
```json
{ "type": "heatvote_start", "question": "Which boss?", "options": ["Left", "Right"], "layout": "split2" }
{ "type": "heatvote_cast", "userId": "12345678", "option": 0, "identity": { ... } }
{ "type": "heatvote_update", "tallies": [12, 8], "total": 20 }
{ "type": "heatvote_end", "winner": 0, "tallies": [12, 8], "question": "Which boss?" }
```

### Game Events (Layer 7, future)
```json
{ "type": "game_start", "game": "connect4", "players": ["12345678", "87654321"] }
{ "type": "game_move", "game": "connect4", "userId": "12345678", "column": 3 }
{ "type": "game_state", "game": "connect4", "board": [[...]], "turn": "12345678" }
{ "type": "game_end", "game": "connect4", "winner": "12345678" }
```

### LHS types.ts Additions
These message types will be added to `src/types.ts` alongside existing `HeatClickData` and `HeatSystemMessage`.

---

## Layer 1: Champagne Room — Status Button + Presence System

### The Bullseye Button
- Circular, draggable, always-visible element on the overlay
- Concentric ring / bullseye / target aesthetic
- Position persists to localStorage
- Click → expands with smooth animation revealing two orbital options: **"LURK"** and **"PRESENT"**
- Auto-collapses after 3 seconds if no selection

### Presence State Machine
```
                    click bullseye "Present"
                    or !present / present / present!
(invisible) ────────────────────────────────────────→ PRESENT
     │                                                   │
     │   click bullseye "Lurk"                           │
     │   or !lurk / lurk / lurk!                         │
     └──────────────────────────→ LURKING                │
                                    │                    │
                                    │  click "Present"   │
                                    │  or !present       │
                                    │  or chat message   │
                                    │                    │
                                    └────────────────→ PRESENT
                                                         │
                                              click "Lurk" / !lurk
                                                         │
                                                         ▼
                                                      LURKING
                                                      (cycles)
```

**Both "Present" and "Lurk" can be the first join action.** Clicking either bullseye option OR typing either command from invisible state joins the viewer to the Champagne Room.

### Key Rules
1. **Viewers are invisible until they opt in.** No one appears on the Champagne Room board until they interact with the bullseye OR use a presence command in chat.
2. **Chat message = present.** If a **lurking member** sends any chat message, they auto-transition to present. This only applies to viewers already on the board.
3. **Never show uninitiated viewers.** Chatting alone does NOT add someone to the board. The AI invites them instead.
4. **First bullseye click = join.** First interaction with the status button registers them and sets status to whichever they clicked (present OR lurking).
5. **First chat command = join.** Typing `!present` or `!lurk` from invisible state also joins the board.

### Presence State Storage

**LHS:** In-memory `Map<userId, PresenceEntry>` on the server. Lost on restart (acceptable for dev).
```typescript
interface PresenceEntry {
  userId: string;
  status: 'present' | 'lurking';
  identity: IdentityResponse;
  joinedAt: number;
  lastActivity: number;
}
```

**RipV2:** In-memory Map on the bot backend (same shape). Presence is session-scoped — resets when stream goes offline (via `stream.offline` EventSub event). No database persistence needed; presence is ephemeral by nature.

**Hydration:** When a new overlay client connects (OBS browser source load/reload), it receives a `presence_state` message with the full current member list. The server is the source of truth, not the overlay.

### AI Invitation for Non-Members
When a viewer chats but hasn't joined the Champagne Room, the AI sends a one-time contextual invite (per stream session, with 30-minute cooldown per user):

*"Yo @CoolViewer42, you're chattin' but you haven't stepped into the Champagne Room yet. Click the bullseye on screen or type !present to join the VIP board"*

Flavored by current AI personality and viewer friendship level. Regulars get warmer invites, first-timers get the explanation.

**RipV2 owner:** New `ChampagneRoomService` class that:
- Maintains the presence Map
- Tracks invite-sent timestamps per user (in-memory, session-scoped)
- Hooks into the chat message handler to check membership + send invites
- Exposes methods for PresenceCommand to call

### On "Present" Click / Command
- GSAP letter-by-letter text animation on overlay
- AI-generated welcome message using personality engine + chatter profile context
- Example: *"we welcome the presence returning to us, CoolViewer42 has returned"*
- Viewer's profile pic appears/lights up on Presence Board
- Optional: sound effect trigger via banger system

### On "Lurk" Click / Command
- AI-generated contextual farewell using recent chat history
- Example: *"Alright @CoolViewer42, go handle that code review — we'll hold it down"*
- If user mentioned what they're doing, lurk message references it
- Viewer's profile pic dims/ghosts on Presence Board
- Subtle fade-out animation (less fanfare than "Present")

### Chat Command Fallback (Mobile / Non-Heat Support)

Heat's Twitch extension is broken on mobile, so chat commands provide full parity:

| Trigger | Effect |
|---------|--------|
| `!present`, `present!`, `present` | Join board as present / return from lurk |
| `!lurk`, `lurk!`, `lurk` | Switch to lurking |
| `!status` | Check your own presence state |

**Parsing:** Match against the full message (trimmed, lowercased). Accepted exact values: `present`, `!present`, `present!`, `lurk`, `!lurk`, `lurk!`, `!status`. The `!` character is treated as optional decoration — any of the three forms match. No substring matching.

**RipV2 implementation:** New `PresenceCommand.ts` registered in CommandRegistry. Uses a Set of accepted trigger strings for O(1) lookup rather than regex or `startsWith`.

### Room Name Configuration
The "Champagne Room" name is the default but is fully configurable at runtime. The room title is a single config field that propagates everywhere: the presence board header, bot chat messages, AI invite text, timed messages, and chat command responses.

**LHS:** Stored in `theme.json` under a new `room` section:
```json
{
  "room": {
    "name": "Champagne Room"
  }
}
```
Editable from `/settings.html` alongside theme colors/fonts.

**RipV2:** Stored in bot config / dashboard setting. Changeable via dashboard UI or chat command:
`!roomname Club Rotic` (mod/streamer only)
Register in CommandRegistry alongside PresenceCommand in Sprint 5.

**Examples:** "Champagne Room" (weekday default), "Club Rotic" (weekend vibe), "The War Room" (competitive game night), "The Chill Zone" (just chatting)

All UI and bot messages reference the configured name dynamically — never hardcoded.

### The Presence Board
```
┌─ CHAMPAGNE ROOM ────────────┐
│                              │
│  PRESENT (3)                 │
│  [pic] CoolViewer42          │
│  [pic] NooRoticX             │
│  [pic] RaidBoss99            │
│                              │
│  LURKING (2)                 │
│  [dim] SilentSam             │
│  [dim] AFK_Andy              │
│                              │
│  Capacity: 5/∞  [+ 3 more]  │
└──────────────────────────────┘
```

- **Present viewers:** Full brightness, profile pic, display name
- **Lurking viewers:** Dimmed/grayscale profile pic, muted name
- **New arrivals:** Brief glow/pulse animation
- **Sort:** Most recent activity at top
- **Configurable max visible:** Show top N, "+X more" overflow
- **Configurable position:** Corner of screen, draggable

### RipV2 Note: Timed Messages
Add to the bot's rotating timed chat messages (using dynamic room name):
*"Click the bullseye on stream or type !present to join the {roomName} and show you're here!"*

Cycles periodically to educate new viewers about the feature.

### LHS Implementation
- `/presence.html` — prototype page with bullseye + presence board
- Simulated clicks AND simulated chat messages (test chat-triggers-present flow)
- Template messages instead of AI-generated (LHS has no personality engine)
- Full GSAP animation prototyping
- **Dependency:** GSAP must be added (CDN link in HTML, no npm install needed for prototype pages)

---

## Layer 2: Profile Markers

### Current Behavior
Click anywhere → generic colored dot or pin marker appears.

### New Behavior
Click anywhere → viewer's **profile picture** appears at that location (if resolved).

**For verified users (numeric IDs):**
- Circular cropped profile pic (32x32px)
- Colored ring matching their Twitch chat color
- Display name label on hover
- Subtle drop shadow in their color
- Persists for configurable duration (default 5s) then fades

**For unverified users (U prefix):**
- Generic avatar circle with consistent color (derived from token hash)
- No name label
- Same fade behavior

**For anonymous users (A prefix):**
- Generic marker with "?" icon
- Random color ring
- No name label

### Deduplication
One marker per viewer at a time. Rapid clicks update position of existing marker rather than spawning duplicates.

### LHS Implementation
- Update `/markers.html` to use identity-resolved profile pics from `viewers.json`
- Test with simulated viewers (5-10 simultaneous profile pics on screen)
- **Build order:** Viewer simulator (Layer 5) identity API should be functional first so markers can load real profile images during development

---

## Layer 3: Vote Regions

### Concept
Definable clickable zones on the overlay that collect and visualize votes in real-time.

### Vote Session Flow
1. Streamer triggers vote via `!heatvote start "Question?" "Option A" "Option B"` or dashboard
2. Overlay divides into visible labeled regions with semi-transparent colored overlays
3. Viewers click their preferred region (or type `!heatvote A` / `!heatvote 1` in chat)
4. Votes tally in real-time with visual bar/counter per region
5. Streamer closes vote via `!heatvote end`
6. Winner announced with animation, AI-flavored result message

> **Note:** Commands use `!heatvote` (not `!vote`) to avoid collision with the existing `VotingCommand.ts` in RipV2 which handles shoutout voting and image rating.

### Region Layouts (Presets)
- **Split 2:** Left/Right halves
- **Split 3:** Three vertical columns
- **Quadrant:** Four corners
- **Custom:** Arbitrary positioned zones (future)

### Vote Rules
- One vote per viewer (identified by resolved user ID)
- Votes stored in `Map<userId, optionIndex>` — changing vote simply overwrites the entry
- Unverified (`U`) and anonymous (`A`) users: each gets one vote per WebSocket connection (connection ID as key). Not perfect deduplication but acceptable — a viewer would have to reconnect to double-vote
- Configurable cooldown between vote sessions (default: 60 seconds, stored in vote config)

### Visual Feedback
- Each region shows: label, vote count, percentage bar
- Voter's profile pic briefly flashes in chosen region (if identified)
- Regions pulse/glow proportional to activity
- Leading option gets brighter border

### Vote Result Animation
- Winning region expands with flash/glow
- Losing regions fade out
- AI announces result: *"The people have spoken — Left path it is! 67% of y'all chose chaos"*
- Result lingers configurable seconds then clears

### Chat Commands (Mobile Fallback)

| Command | Effect | Permission |
|---------|--------|------------|
| `!heatvote A` / `!heatvote 1` | Vote for option | Anyone |
| `!heatvote start "Q" "A" "B"` | Start vote | Mod/Streamer |
| `!heatvote end` | Close vote | Mod/Streamer |
| `!heatvote results` | Show current tally | Anyone |

### LHS Implementation
- `/vote.html` — prototype with preset layouts
- Simulated voters at different rates
- Visual feedback and result animation testing
- Deduplication logic testing (verified IDs + connection-based fallback)

---

## Layer 5: Enhanced Local Heat Server (Dev Harness)

### Viewer Simulator Panel (`/simulator.html`)
A "puppet master" page for controlling fake viewers during development:

```
┌─ Viewer Simulator ──────────────────┐
│                                      │
│  [+ Add Viewer]  [Randomize All]     │
│                                      │
│  👤 CoolViewer42    [Click] [Lurk]   │
│  👤 RaidBoss99      [Click] [Present]│
│  👤 SilentSam       [Click] [Vote A] │
│  👤 Anonymous       [Click] [Vote B] │
│                                      │
│  ── Auto Mode ──                     │
│  [▶ Start]  Viewers: 8  Rate: 2/sec  │
│  Behavior: [Mixed ▼]                 │
│    ○ Clickers only                   │
│    ○ Presence flow (lurk/present)    │
│    ○ Voting simulation               │
│    ● Mixed (all behaviors)           │
└──────────────────────────────────────┘
```

**Manual mode:** Click buttons to trigger specific actions for specific fake viewers.
**Auto mode:** Simulated viewers click at configurable rates with configurable behavior profiles.
**Viewer registry:** `viewers.json` pre-loaded with realistic Twitch-like profiles.
**Identity API:** `GET /api/identity/:userId` returns profile in the Identity Response Shape defined above.
**Simulated chat:** Fake chat messages to test chat-triggers-present and AI invitation flows.

### Enhanced WebSocket
LHS WebSocket broadcasts enriched messages (with identity data) using the shared message types defined in this spec. Overlay prototype pages receive the same data shape they'd get in production from the bot.

---

## Layer 7: Click Games

### Connect Four ("Chat Plays Connect Four")
- Two viewers take turns clicking columns to drop pieces
- Board rendered on overlay as clickable regions (7 columns)
- Turn-based: bot tracks whose turn it is
- Win detection + celebration animation
- `!play connect4 @opponent` to challenge

### Mancala ("Chat Plays Mancala")
- Click pits to move stones
- Turn-based, same infrastructure as Connect Four
- Visual board on overlay

### General Pattern
Any single-click-on-target game works with this infrastructure:
- Define clickable regions (reuses vote region system)
- Track game state + turns
- Validate moves via identity (know who clicked)
- Render board state on overlay
- Chat command fallback for mobile
- Uses `game_*` WebSocket message types defined above

---

## Layers 4 & 6 (Reference — Deferred)

### Layer 4: Heat Overlay Route (RipV2)
Production overlay at `/app/heat-overlay` in bot's Next.js frontend. Loaded as OBS browser source. Contains all React components: BullseyeButton, PresenceBoard (Champagne Room), VoteOverlay, ProfileMarkers, game boards. Connects to bot's WebSocket for real identity, AI messages, personality engine, TTS.

**Handoff point:** After Sprint 4 (vote regions) is prototyped and validated on LHS, Sprint 5 should begin production implementation in RipV2 by creating this overlay route and porting proven concepts.

### Layer 6: Public Spectator View (Future)
Read-only web page consuming bot's WebSocket broadcast. Shows Champagne Room, vote results, heatmap in real-time. Viewers can watch without OBS.

**Privacy consideration:** Broadcasting presence data (who is watching, when) publicly has privacy implications. Must be opt-in per viewer before this layer is built. Deferred until core layers are solid and privacy model is designed.

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────┐
│  LOCAL HEAT SERVER (Dev/Testing)                │
│                                                  │
│  viewers.json ← fake viewer profiles             │
│  IdentityResolver ← parses prefix, looks up     │
│  PresenceManager ← in-memory presence state      │
│  ViewerSimulator ← manual/auto fake clicks       │
│  WebSocket ← broadcasts enriched events          │
│  Theme System ← configurable colors/fonts        │
│                                                  │
│  Prototype Pages:                                │
│    /presence.html  ← bullseye + champagne room   │
│    /vote.html      ← vote region prototype       │
│    /markers.html   ← profile pic markers         │
│    /simulator.html ← viewer puppet master        │
│    /heatmap.html   ← heat visualization          │
│    /settings.html  ← theme config                │
└────────────────┬────────────────────────────────┘
                 │
        shared message types
                 │
┌────────────────▼────────────────────────────────┐
│  RIPTHEAI BOT (Production)                      │
│                                                  │
│  heatMapService.ts ← real Heat API connection    │
│  IdentityResolver  ← real Twitch API lookups     │
│  ChampagneRoomSvc  ← presence state + invites    │
│  PresenceCommand   ← !lurk !present !status      │
│  HeatVoteCommand   ← !heatvote start/end/A/B     │
│  PersonalityEngine ← AI-generated messages       │
│  Timed Messages    ← Champagne Room explainer    │
│                                                  │
│  /app/heat-overlay ← production overlay in OBS   │
│    BullseyeButton  ← React + GSAP               │
│    ChampagneRoom   ← presence board component    │
│    VoteOverlay     ← vote regions component      │
│    ProfileMarkers  ← profile pic markers         │
│    GameBoard       ← Connect Four, Mancala, etc  │
└─────────────────────────────────────────────────┘
```

---

## Build Order

| Sprint | Layers | Scope | Notes |
|--------|--------|-------|-------|
| **Sprint 1** | 0 + scaffold | Identity resolution + shared message types in LHS `types.ts` + GSAP added to prototype pages | Foundation for everything |
| **Sprint 2** | 1 | Bullseye button + Champagne Room presence board + presence state management | First interactive feature |
| **Sprint 3** | 5 then 2 | Viewer simulator panel first (provides test data), then profile pic markers | Simulator enables marker testing |
| **Sprint 4** | 3 | Vote regions with `!heatvote` commands | Second interactive feature |
| **Sprint 5** | 4 | Production overlay route in RipV2 — port proven LHS concepts | Handoff to production |
| **Sprint 6+** | 7 | Chat Plays games (Connect Four, Mancala) | Built on vote region infrastructure |
| **Future** | 6 | Public spectator view (requires privacy model) | Moonshot |

---

## Open Questions

1. **Verify Heat `U`-prefix format:** Capture live click data to confirm whether `U`-prefix tokens are resolvable or opaque. This determines how many viewers can be fully identified in production.
2. **Stray literal in `heatMapIntegration.ts:252`:** A bare `444923029` on its own line — appears to be an accidentally committed channel ID. Should be cleaned up.
