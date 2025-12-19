import type { Channel, ClientConnection } from './types.js';
import { config } from './config.js';

/**
 * Channel manager for Heat API emulator
 * Handles channel lifecycle, client connections, and message broadcasting
 */
export class ChannelManager {
  private channels = new Map<string, Channel>();
  private clients = new Set<ClientConnection>();

  /**
   * Get or create a channel
   */
  getOrCreateChannel(channelId: string): Channel {
    let channel = this.channels.get(channelId);
    
    if (!channel) {
      channel = {
        id: channelId,
        clients: new Set(),
        createdAt: Date.now(),
        totalClicks: 0,
      };
      this.channels.set(channelId, channel);
      this.log(`📺 Created channel: ${channelId}`);
    }

    return channel;
  }

  /**
   * Add client to channel
   */
  addClient(client: ClientConnection): boolean {
    const channel = this.getOrCreateChannel(client.channelId);

    if (channel.clients.size >= config.maxClientsPerChannel) {
      this.log(`⚠️ Channel ${client.channelId} is full (${config.maxClientsPerChannel} clients)`);
      return false;
    }

    channel.clients.add(client);
    this.clients.add(client);
    
    this.log(`✅ Client ${client.userId} joined channel ${client.channelId} (${channel.clients.size} total)`);
    return true;
  }

  /**
   * Remove client from channel
   */
  removeClient(client: ClientConnection): void {
    const channel = this.channels.get(client.channelId);
    
    if (channel) {
      channel.clients.delete(client);
      this.log(`👋 Client ${client.userId} left channel ${client.channelId} (${channel.clients.size} remaining)`);

      // Clean up empty channels
      if (channel.clients.size === 0) {
        this.channels.delete(client.channelId);
        this.log(`🗑️ Removed empty channel: ${client.channelId}`);
      }
    }

    this.clients.delete(client);
  }

  /**
   * Broadcast message to all clients in a channel
   */
  broadcast(channelId: string, message: string, excludeClient?: ClientConnection): void {
    const channel = this.channels.get(channelId);
    
    if (!channel) {
      this.log(`⚠️ Attempted to broadcast to non-existent channel: ${channelId}`);
      return;
    }

    let sentCount = 0;
    for (const client of channel.clients) {
      if (client !== excludeClient && client.ws.readyState === 1 /* OPEN */) {
        try {
          client.ws.send(message);
          client.lastActivity = Date.now();
          sentCount++;
        } catch (error) {
          this.log(`❌ Failed to send to client ${client.userId}: ${error}`);
        }
      }
    }

    if (config.debugMode) {
      this.log(`📤 Broadcast to ${sentCount}/${channel.clients.size} clients in channel ${channelId}`);
    }
  }

  /**
   * Increment click counter for channel
   */
  incrementClicks(channelId: string): void {
    const channel = this.channels.get(channelId);
    if (channel) {
      channel.totalClicks++;
    }
  }

  /**
   * Get channel statistics
   */
  getChannelStats(channelId: string): { clients: number; clicks: number; age: number } | null {
    const channel = this.channels.get(channelId);
    if (!channel) return null;

    return {
      clients: channel.clients.size,
      clicks: channel.totalClicks,
      age: Date.now() - channel.createdAt,
    };
  }

  /**
   * Get all channels info
   */
  getAllChannels(): Array<{ id: string; clients: number; clicks: number }> {
    return Array.from(this.channels.values()).map(ch => ({
      id: ch.id,
      clients: ch.clients.size,
      clicks: ch.totalClicks,
    }));
  }

  /**
   * Clean up stale connections
   */
  cleanupStaleConnections(maxAge: number): number {
    const now = Date.now();
    let cleaned = 0;

    for (const client of this.clients) {
      if (now - client.lastActivity > maxAge) {
        this.log(`🧹 Cleaning stale connection: ${client.userId} (inactive for ${Math.round((now - client.lastActivity) / 1000)}s)`);
        client.ws.close();
        this.removeClient(client);
        cleaned++;
      }
    }

    return cleaned;
  }

  /**
   * Get total stats
   */
  getStats(): { channels: number; clients: number; totalClicks: number } {
    let totalClicks = 0;
    for (const channel of this.channels.values()) {
      totalClicks += channel.totalClicks;
    }

    return {
      channels: this.channels.size,
      clients: this.clients.size,
      totalClicks,
    };
  }

  private log(message: string): void {
    if (config.debugMode) {
      console.log(`[ChannelManager] ${message}`);
    }
  }
}
