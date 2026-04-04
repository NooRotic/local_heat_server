import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';
import { config } from './config.js';
import { ChannelManager } from './channels.js';
import { HttpServer } from './http-server.js';
import type { HeatClickData, HeatSystemMessage, EnrichedClickData, ClientConnection, TargetHitMessage } from './types.js';
import { IdentityResolver } from './identity.js';
import { PresenceManager } from './presence.js';
import { ClickTargetManager } from './targets.js';

/**
 * Heat API Server Emulator
 * 
 * Emulates the Twitch Heat extension backend for local development.
 * Provides WebSocket server compatible with Heat's API protocol.
 * 
 * WebSocket URL format: ws://localhost:8080/channel/{channelId}
 */
class HeatServer {
  private wss: WebSocketServer;
  private httpServer: HttpServer;
  private channelManager: ChannelManager;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private identityResolver: IdentityResolver;
  private presenceManager: PresenceManager;
  private targetManager: ClickTargetManager;

  constructor() {
    this.channelManager = new ChannelManager();

    // Identity resolver — must init before HttpServer so it can be shared
    this.identityResolver = new IdentityResolver();
    this.identityResolver.load();

    this.presenceManager = new PresenceManager();

    this.targetManager = new ClickTargetManager();
    this.targetManager.load();

    // Create HTTP server for serving demo pages + API (share identity resolver + presence + targets)
    this.httpServer = new HttpServer('./public', this.identityResolver, this.presenceManager, this.targetManager);
    
    // Create HTTP server for WebSocket upgrade
    const server = createServer();
    
    // Create WebSocket server - accept all paths starting with /channel
    // Path validation happens in connection handler
    this.wss = new WebSocketServer({ 
      server,
      verifyClient: (info: { req: { url?: string } }) => {
        // Accept any path that starts with /channel/
        const url = info.req.url || '';
        return url.startsWith('/channel/');
      }
    });

    this.setupWebSocketHandlers();
    this.startHeartbeat();

    // Start WebSocket server
    server.listen(config.wsPort, () => {
      console.log(`
╔════════════════════════════════════════════╗
║   🔥 Heat Server Emulator                  ║
║                                            ║
║   WebSocket: ws://localhost:${config.wsPort}/channel/{id} ║
║   HTTP:      http://localhost:${config.httpPort}          ║
║   Debug Mode: ${config.debugMode ? 'ON ' : 'OFF'}                       ║
║                                            ║
║   Ready for connections!                   ║
╚════════════════════════════════════════════╝
      `);
    });

    // Start HTTP server for demos
    this.httpServer.start();
  }

  /**
   * Set up WebSocket connection handlers
   */
  private setupWebSocketHandlers(): void {
    this.wss.on('connection', (ws: WebSocket, request) => {
      const url = request.url;
      
      if (!url) {
        ws.close(1002, 'Invalid URL');
        return;
      }

      // Extract channel ID from URL: /channel/{channelId}
      const match = url.match(/^\/channel\/([^/?]+)/);
      if (!match) {
        ws.close(1002, 'Invalid channel URL format. Use: /channel/{channelId}');
        return;
      }

      const channelId = match[1];
      const userId = this.generateUserId();

      // Create client connection
      const client: ClientConnection = {
        ws,
        channelId,
        userId,
        connectedAt: Date.now(),
        lastActivity: Date.now(),
      };

      // Add to channel
      if (!this.channelManager.addClient(client)) {
        ws.close(1008, 'Channel is full');
        return;
      }

      // Send welcome message
      const welcomeMessage: HeatSystemMessage = {
        type: 'system',
        message: `Connected to Heat emulator, channel ${channelId}`,
      };
      ws.send(JSON.stringify(welcomeMessage));

      // Hydrate new client with current presence state
      const presenceState = this.presenceManager.getState();
      if (presenceState.members.length > 0) {
        ws.send(JSON.stringify(presenceState));
      }

      // Handle incoming messages
      ws.on('message', async (data) => {
        await this.handleMessage(client, data.toString());
      });

      // Handle disconnect
      ws.on('close', () => {
        this.channelManager.removeClient(client);
      });

      // Handle errors
      ws.on('error', (error) => {
        console.error(`[WebSocket Error] ${client.userId}:`, error.message);
      });

      // Update activity on pong
      ws.on('pong', () => {
        client.lastActivity = Date.now();
      });
    });
  }

  /**
   * Handle incoming WebSocket message
   */
  private async handleMessage(client: ClientConnection, data: string): Promise<void> {
    try {
      const message = JSON.parse(data);

      // Update last activity
      client.lastActivity = Date.now();

      // Validate message type
      if (message.type === 'click') {
        await this.handleClickMessage(client, message as HeatClickData);
      } else if (message.type === 'presence_join') {
        await this.handlePresenceJoin(client, message);
      } else if (message.type === 'chat') {
        await this.handleSimulatedChat(client, message);
      } else {
        this.log(`⚠️ Unknown message type from ${client.userId}: ${message.type}`);
      }
    } catch (error) {
      this.log(`❌ Failed to parse message from ${client.userId}: ${error}`);
    }
  }

  /**
   * Handle click message
   */
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

    // Hit-test against registered targets, broadcast target_hit for each match
    const hits = this.targetManager.hitTest(x, y);
    const now = Date.now();
    for (const hit of hits) {
      const hitMessage: TargetHitMessage = {
        type: 'target_hit',
        userId: message.id,
        identity,
        hit,
        timestamp: now,
      };
      this.channelManager.broadcast(client.channelId, JSON.stringify(hitMessage));
    }

    if (config.debugMode) {
      const name = identity.resolved ? identity.displayName : identity.tier;
      const hitSuffix = hits.length > 0 ? ` → hit [${hits.map(h => h.targetDisplayName).join(', ')}]` : '';
      this.log(`🖱️ Click from ${name} (${message.id}) at (${message.x}, ${message.y}) in channel ${client.channelId}${hitSuffix}`);
    }
  }

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
      const status = PRESENT_TRIGGERS.has(text) ? 'present' as const : 'lurking' as const;
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
      const identity = await this.identityResolver.resolve(userId);
      this.log(`💬 ${identity.displayName} chatted but isn't in the ${this.presenceManager.getRoomName()} — would send AI invite in production`);
    }
  }

  /**
   * Start heartbeat to detect stale connections
   */
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      // Send ping to all clients
      this.wss.clients.forEach((ws) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.ping();
        }
      });

      // Clean up stale connections (no activity for 2x heartbeat interval)
      const cleaned = this.channelManager.cleanupStaleConnections(config.heartbeatInterval * 2);
      if (cleaned > 0) {
        this.log(`🧹 Cleaned ${cleaned} stale connections`);
      }

      // Log stats
      if (config.debugMode) {
        const stats = this.channelManager.getStats();
        this.log(`📊 Stats: ${stats.channels} channels, ${stats.clients} clients, ${stats.totalClicks} total clicks`);
      }
    }, config.heartbeatInterval);
  }

  /**
   * Generate a unique user ID (unverified format)
   */
  private generateUserId(): string {
    return `U${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Log message with timestamp
   */
  private log(message: string): void {
    const timestamp = new Date().toLocaleTimeString();
    console.log(`[${timestamp}] ${message}`);
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    console.log('\n🛑 Shutting down Heat server...');

    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    // Close all connections
    this.wss.clients.forEach((ws) => {
      ws.close(1001, 'Server shutting down');
    });

    // Close WebSocket server
    await new Promise<void>((resolve) => {
      this.wss.close(() => resolve());
    });

    // Close HTTP server
    await this.httpServer.stop();

    console.log('✅ Server shut down gracefully');
  }
}

// ============================================================================
// MAIN
// ============================================================================

const server = new HeatServer();

// Graceful shutdown on signals
process.on('SIGINT', async () => {
  await server.shutdown();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await server.shutdown();
  process.exit(0);
});
