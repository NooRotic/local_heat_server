/**
 * Heat API click data payload
 */
export interface HeatClickData {
  type: 'click';
  id: string;    // User ID (A=anonymous, U=unverified, or Twitch ID)
  x: string;     // Normalized X coordinate (0.0 to 1.0) as string
  y: string;     // Normalized Y coordinate (0.0 to 1.0) as string
}

/**
 * Heat API system message
 */
export interface HeatSystemMessage {
  type: 'system';
  message: string;
}

/**
 * Identity resolution response for a viewer
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

/**
 * Click data enriched with resolved identity
 */
export interface EnrichedClickData extends HeatClickData {
  identity: IdentityResponse;
}

/**
 * Presence message: a viewer has joined the overlay
 */
export interface PresenceJoinMessage {
  type: 'presence_join';
  userId: string;
  status: 'present' | 'lurking';
  identity: IdentityResponse;
}

/**
 * Presence message: a viewer's status has changed
 */
export interface PresenceUpdateMessage {
  type: 'presence_update';
  userId: string;
  status: 'present' | 'lurking';
  identity: IdentityResponse;
}

/**
 * Presence message: full snapshot of current members
 */
export interface PresenceStateMessage {
  type: 'presence_state';
  members: Array<{
    userId: string;
    status: 'present' | 'lurking';
    identity: IdentityResponse;
  }>;
}

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

/**
 * HeatVote message: a vote session has started
 */
export interface HeatVoteStartMessage {
  type: 'heatvote_start';
  question: string;
  options: string[];
  layout: 'split2' | 'split3' | 'quadrant' | 'custom';
}

/**
 * HeatVote message: a viewer has cast a vote
 */
export interface HeatVoteCastMessage {
  type: 'heatvote_cast';
  userId: string;
  option: number;
  identity: IdentityResponse;
}

/**
 * HeatVote message: updated vote tallies
 */
export interface HeatVoteUpdateMessage {
  type: 'heatvote_update';
  tallies: number[];
  total: number;
}

/**
 * HeatVote message: the vote session has ended
 */
export interface HeatVoteEndMessage {
  type: 'heatvote_end';
  winner: number;
  tallies: number[];
  question: string;
}

/**
 * Game message: a game session has started
 */
export interface GameStartMessage {
  type: 'game_start';
  game: string;
  players: string[];
}

/**
 * Game message: a player has made a move
 */
export interface GameMoveMessage {
  type: 'game_move';
  game: string;
  userId: string;
  column: number;
}

/**
 * Game message: current board state
 */
export interface GameStateMessage {
  type: 'game_state';
  game: string;
  board: number[][];
  turn: string;
}

/**
 * Game message: the game has ended
 */
export interface GameEndMessage {
  type: 'game_end';
  game: string;
  winner: string | null;
}

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

/**
 * Viewer profile for display in overlays
 */
export interface ViewerProfile {
  userId: string;
  displayName: string;
  profileImageUrl: string;
  color: string;
  friendshipLevel: number;
  bio: string;
}

/**
 * Client connection info
 */
export interface ClientConnection {
  ws: import('ws').WebSocket;
  channelId: string;
  userId: string;
  connectedAt: number;
  lastActivity: number;
}

/**
 * Channel state
 */
export interface Channel {
  id: string;
  clients: Set<ClientConnection>;
  createdAt: number;
  totalClicks: number;
}
