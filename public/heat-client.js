/**
 * Heat Client Library
 * Reusable client for connecting to Heat API (production or local emulator)
 */

class HeatClient extends EventTarget {
  constructor(channelId, options = {}) {
    super();
    
    this.channelId = channelId;
    this.ws = null;
    this.users = new Map();
    
    // Options
    this.options = {
      apiUrl: options.apiUrl || 'ws://localhost:7777',
      reconnectDelay: options.reconnectDelay || 3000,
      debugMode: options.debugMode !== undefined ? options.debugMode : true,
      autoConnect: options.autoConnect !== undefined ? options.autoConnect : true,
    };

    if (this.options.autoConnect) {
      this.connect();
    }
  }

  /**
   * Connect to Heat WebSocket server
   */
  connect() {
    if (!this.channelId) {
      this.log('❌ Invalid channel ID');
      return;
    }

    const url = `${this.options.apiUrl}/channel/${this.channelId}`;
    this.log(`🔌 Connecting to ${url}...`);

    try {
      this.ws = new WebSocket(url);

      this.ws.addEventListener('open', () => {
        this.log(`✅ Connected to Heat API, channel ${this.channelId}`);
        this.dispatchEvent(new CustomEvent('connected'));
      });

      this.ws.addEventListener('message', (message) => {
        this.handleMessage(message.data);
      });

      this.ws.addEventListener('error', (error) => {
        this.log(`❌ WebSocket error:`, error);
        this.dispatchEvent(new CustomEvent('error', { detail: error }));
      });

      this.ws.addEventListener('close', (event) => {
        this.log(`🔌 Connection closed: ${event.code} - ${event.reason}`);
        this.dispatchEvent(new CustomEvent('disconnected', { detail: event }));
        this.scheduleReconnect();
      });

    } catch (error) {
      this.log(`❌ Failed to create WebSocket:`, error);
      this.scheduleReconnect();
    }
  }

  /**
   * Disconnect from server
   */
  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  /**
   * Send a click event to the server
   * @param {number} x - Normalized X coordinate (0.0 to 1.0)
   * @param {number} y - Normalized Y coordinate (0.0 to 1.0)
   * @param {string} [userId] - Optional user ID (defaults to auto-generated)
   */
  sendClick(x, y, userId) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.log('⚠️ Not connected to server');
      return false;
    }

    const clickData = {
      type: 'click',
      id: userId || this.generateUserId(),
      x: x.toFixed(3),
      y: y.toFixed(3),
    };

    try {
      this.ws.send(JSON.stringify(clickData));
      return true;
    } catch (error) {
      this.log('❌ Failed to send click:', error);
      return false;
    }
  }

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

  /**
   * Handle incoming WebSocket message
   */
  handleMessage(data) {
    try {
      const message = JSON.parse(data);
      const event = new CustomEvent(message.type, { detail: message });
      this.dispatchEvent(event);

      if (message.type === 'system') {
        this.log(`📢 System: ${message.message}`);
      } else if (message.type === 'click') {
        if (this.options.debugMode) {
          this.log(`🖱️ Click from ${message.id} at (${message.x}, ${message.y})`);
        }
      } else if (message.type === 'presence_join' || message.type === 'presence_update') {
        this.log(`🏛️ ${message.identity?.displayName || message.userId} → ${message.status}`);
      } else if (message.type === 'presence_state') {
        this.log(`🏛️ Presence hydration: ${message.members.length} members`);
      }
    } catch (error) {
      this.log('❌ Failed to parse message:', error);
    }
  }

  /**
   * Get user info by ID (simplified version for emulator)
   */
  async getUserById(id) {
    if (this.users.has(id)) {
      return this.users.get(id);
    }

    // Handle anonymous/unverified users
    if (id.startsWith('A')) {
      return { id, display_name: 'Anonymous' };
    }
    if (id.startsWith('U')) {
      return { id, display_name: 'Unverified' };
    }

    // For real Twitch IDs, we'd query the API
    // In emulator mode, just return a placeholder
    const user = { id, display_name: `User ${id.substring(0, 6)}` };
    this.users.set(id, user);
    return user;
  }

  /**
   * Schedule reconnection attempt
   */
  scheduleReconnect() {
    if (this.reconnectTimeout) return;

    this.log(`🔄 Reconnecting in ${this.options.reconnectDelay / 1000}s...`);
    
    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = null;
      this.connect();
    }, this.options.reconnectDelay);
  }

  /**
   * Generate a random user ID
   */
  generateUserId() {
    return `U${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Log helper
   */
  log(...args) {
    if (this.options.debugMode) {
      console.log('%c::HEAT::%c', 'color: white; background: orange; padding: 2px 4px;', '', ...args);
    }
  }

  /**
   * Convenience method: addEventListener alias
   */
  on(event, callback) {
    this.addEventListener(event, callback);
  }

  /**
   * Convenience method: removeEventListener alias
   */
  off(event, callback) {
    this.removeEventListener(event, callback);
  }
}

/**
 * Helper: Auto-capture click events on page and send to Heat
 * @param {HeatClient} heatClient - Heat client instance
 * @param {string} [userId] - Optional user ID to use for local clicks
 */
function capturePageClicks(heatClient, userId) {
  document.addEventListener('click', (event) => {
    const normalizedX = event.clientX / window.innerWidth;
    const normalizedY = event.clientY / window.innerHeight;
    
    heatClient.sendClick(normalizedX, normalizedY, userId);
  });
}

/**
 * Helper: Get channel ID from URL query parameter
 * @param {string} [paramName='channel'] - Query parameter name
 * @param {string} [defaultChannel='12345'] - Default channel ID
 * @returns {string} Channel ID
 */
function getChannelFromURL(paramName = 'channel', defaultChannel = '12345') {
  const params = new URLSearchParams(window.location.search);
  return params.get(paramName) || 
         params.get('channelId') || 
         params.get('channelID') || 
         defaultChannel;
}
