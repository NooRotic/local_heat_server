# Heat Server Emulator - API Documentation

## WebSocket Protocol

The Heat server emulator uses WebSocket connections to enable real-time click event broadcasting between clients.

### Connection

**Endpoint:** `ws://localhost:8080/channel/{channelId}`

**Example:**
```javascript
const ws = new WebSocket('ws://localhost:8080/channel/12345');
```

### Message Types

#### 1. Click Event

Sent when a user clicks on a page. Broadcast to all clients in the same channel.

**Direction:** Client → Server → All Clients

**Format:**
```json
{
  "type": "click",
  "id": "U1a2b3c",
  "x": "0.523",
  "y": "0.847"
}
```

**Fields:**
- `type` (string): Always `"click"`
- `id` (string): User identifier
  - `A...` = Anonymous user
  - `U...` = Unverified user  
  - Other = Twitch user ID (in production)
- `x` (string): Normalized X coordinate (0.0 to 1.0)
- `y` (string): Normalized Y coordinate (0.0 to 1.0)

**Example:**
```javascript
ws.send(JSON.stringify({
  type: 'click',
  id: 'U123abc',
  x: '0.500',
  y: '0.750'
}));
```

#### 2. System Message

Sent by server for informational messages.

**Direction:** Server → Client

**Format:**
```json
{
  "type": "system",
  "message": "Connected to Heat emulator, channel 12345"
}
```

**Fields:**
- `type` (string): Always `"system"`
- `message` (string): Informational text

## Server Configuration

The server can be configured by modifying `src/config.ts`:

```typescript
export const config = {
  wsPort: 8080,              // WebSocket server port
  httpPort: 3000,            // HTTP server port for demos
  debugMode: true,           // Enable verbose logging
  maxClientsPerChannel: 100, // Max clients per channel
  heartbeatInterval: 30000,  // Heartbeat ping interval (ms)
};
```

## Channel Management

### Channels

Channels are isolated broadcast groups. Clients in different channels do not receive each other's messages.

**Channel ID:** Any alphanumeric string (e.g., `"12345"`, `"my-channel"`, `"test"`)

### Auto-Creation

Channels are created automatically when the first client connects.

### Auto-Cleanup

Empty channels are automatically removed when the last client disconnects.

## Server Events

The server logs important events when `debugMode` is enabled:

```
[ChannelManager] 📺 Created channel: 12345
[ChannelManager] ✅ Client U1a2b3c joined channel 12345 (1 total)
[HeatServer] 🖱️ Click from U1a2b3c at (0.523, 0.847) in channel 12345
[ChannelManager] 👋 Client U1a2b3c left channel 12345 (0 remaining)
[ChannelManager] 🗑️ Removed empty channel: 12345
```

## Connection Lifecycle

### 1. Connect

Client opens WebSocket connection to `/channel/{channelId}`.

**Server Response:**
```json
{
  "type": "system",
  "message": "Connected to Heat emulator, channel {channelId}"
}
```

### 2. Active

Client sends click events. Server broadcasts to all clients in channel.

### 3. Heartbeat

Server sends WebSocket `ping` every 30 seconds. Clients respond with `pong`.

### 4. Disconnect

Client closes connection. Server removes client from channel.

## Error Handling

### Invalid URL

If the connection URL doesn't match `/channel/{channelId}`, the server closes the connection:

**Close Code:** `1002` (Protocol Error)  
**Reason:** `"Invalid channel URL format. Use: /channel/{channelId}"`

### Channel Full

If a channel has reached `maxClientsPerChannel`, new connections are rejected:

**Close Code:** `1008` (Policy Violation)  
**Reason:** `"Channel is full"`

### Invalid Coordinates

Clicks with invalid coordinates (outside 0.0-1.0 range) are logged but not broadcast:

```
⚠️ Invalid coordinates from U1a2b3c: (1.5, -0.3)
```

## Statistics

The server tracks statistics per channel:

```typescript
interface ChannelStats {
  clients: number;      // Current connected clients
  clicks: number;       // Total clicks received
  age: number;          // Channel age in milliseconds
}
```

Access via `ChannelManager.getChannelStats(channelId)`.

## Security Considerations

⚠️ **This is a development tool only!**

The emulator has minimal security:
- No authentication
- No rate limiting
- No input sanitization
- No CORS restrictions

**Do NOT use in production or expose to the internet.**

For production use, connect to the official Heat API:
```
wss://heat-api.j38.net/channel/{channelId}
```

## Performance

**Tested with:**
- 100 concurrent clients per channel
- 1000 clicks/second throughput
- <10ms broadcast latency

**Limits:**
- Max clients per channel: 100 (configurable)
- Max click history: 500 per channel
- Stale connection cleanup: 60 seconds

## Compatibility

**WebSocket Protocol:** RFC 6455  
**Supported Browsers:** All modern browsers with WebSocket support  
**Node.js:** v18.0.0 or higher

## Example: Full Client Implementation

```javascript
class MyHeatClient {
  constructor(channelId) {
    this.channelId = channelId;
    this.ws = null;
    this.connect();
  }

  connect() {
    this.ws = new WebSocket(`ws://localhost:8080/channel/${this.channelId}`);

    this.ws.onopen = () => {
      console.log('Connected');
    };

    this.ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      if (data.type === 'click') {
        this.handleClick(data);
      } else if (data.type === 'system') {
        console.log('System:', data.message);
      }
    };

    this.ws.onclose = (event) => {
      console.log('Disconnected:', event.code, event.reason);
      // Reconnect after 3 seconds
      setTimeout(() => this.connect(), 3000);
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
  }

  sendClick(x, y, userId = 'U' + Math.random().toString(36).slice(2)) {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'click',
        id: userId,
        x: x.toFixed(3),
        y: y.toFixed(3)
      }));
    }
  }

  handleClick(data) {
    console.log(`Click from ${data.id} at (${data.x}, ${data.y})`);
    // Your click handling logic here
  }
}

// Usage
const client = new MyHeatClient('12345');

document.addEventListener('click', (e) => {
  const x = e.clientX / window.innerWidth;
  const y = e.clientY / window.innerHeight;
  client.sendClick(x, y);
});
```

## See Also

- [README.md](../README.md) - Project overview
- [TEMPLATE_GUIDE.md](./TEMPLATE_GUIDE.md) - Template creation guide
- [Official Heat Repo](https://github.com/scottgarner/Heat) - Production extension
