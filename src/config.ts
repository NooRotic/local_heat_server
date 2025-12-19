/**
 * Heat Server Emulator Configuration
 */

export const config = {
  /**
   * WebSocket server port for Heat API emulation
   */
  wsPort: 7777,

  /**
   * HTTP server port for serving demo pages
   */
  httpPort: 7778,

  /**
   * Enable verbose logging for debugging
   */
  debugMode: true,

  /**
   * Maximum number of clients per channel
   */
  maxClientsPerChannel: 100,

  /**
   * Heartbeat interval (ms) to detect stale connections
   */
  heartbeatInterval: 30000,
} as const;
