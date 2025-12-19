import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';
import { config } from './config.js';
import { ChannelManager } from './channels.js';
import { HttpServer } from './http-server.js';
import type { HeatClickData, HeatSystemMessage, ClientConnection } from './types.js';

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

  constructor() {
    this.channelManager = new ChannelManager();
    
    // Create HTTP server for serving demo pages
    this.httpServer = new HttpServer('./public');
    
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

      // Handle incoming messages
      ws.on('message', (data) => {
        this.handleMessage(client, data.toString());
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
  private handleMessage(client: ClientConnection, data: string): void {
    try {
      const message = JSON.parse(data);
      
      // Update last activity
      client.lastActivity = Date.now();

      // Validate message type
      if (message.type === 'click') {
        this.handleClickMessage(client, message as HeatClickData);
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
  private handleClickMessage(client: ClientConnection, message: HeatClickData): void {
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

    // Increment click counter
    this.channelManager.incrementClicks(client.channelId);

    // Broadcast to all clients in channel (including sender for consistency)
    this.channelManager.broadcast(
      client.channelId,
      JSON.stringify(message)
    );

    if (config.debugMode) {
      this.log(`🖱️ Click from ${message.id} at (${message.x}, ${message.y}) in channel ${client.channelId}`);
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
