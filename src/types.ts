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
 * Union type for all Heat messages
 */
export type HeatMessage = HeatClickData | HeatSystemMessage;

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
