# Heat Server Emulator

A local development server that emulates the [Twitch Heat extension](https://github.com/scottgarner/Heat) backend API. This allows you to develop and test Heat-based interactive experiences offline without needing the actual Twitch extension.

## Features

- 🚀 **Full WebSocket API emulation** - Compatible with Heat's `wss://heat-api.j38.net/channel/{channelId}` protocol
- 🎯 **Click coordinate broadcasting** - Normalized (0.0-1.0) coordinate system matching production
- 📱 **Easy template system** - Simple HTML templates for creating clickable pages
- 🔄 **Real-time synchronization** - Multiple clients can connect and see each other's clicks
- 🛠️ **Developer-friendly** - TypeScript, hot reload, clean architecture
- 📦 **Production-ready** - Clean code, proper error handling, ready for public release

## Quick Start

### Installation

```bash
npm install
```

### Development

Start the server in development mode with hot reload:

```bash
npm run dev
```

The server will start on:
- **WebSocket**: `ws://localhost:8080/channel/{channelId}`
- **HTTP Server**: `http://localhost:3000` (for serving demo pages)

### Production Build

```bash
npm run build
npm start
```

## Usage

### Connecting to the Server

From your Heat-compatible client code:

```javascript
const channelId = "12345"; // Any channel ID
const ws = new WebSocket(`ws://localhost:8080/channel/${channelId}`);

ws.addEventListener('open', () => {
  console.log('Connected to Heat emulator');
});

ws.addEventListener('message', (event) => {
  const data = JSON.parse(event.data);
  
  if (data.type === 'click') {
    console.log(`Click at (${data.x}, ${data.y}) from user ${data.id}`);
  }
});
```

### Creating Click Events

Clicks are automatically captured from demo pages. To manually send a click:

```javascript
// Coordinates are normalized 0.0 to 1.0
const clickData = {
  type: 'click',
  id: 'U123456',  // User ID (U=unverified, A=anonymous, or real Twitch ID)
  x: '0.500',     // Normalized X coordinate (string)
  y: '0.750'      // Normalized Y coordinate (string)
};

ws.send(JSON.stringify(clickData));
```

## Demo Pages

Demo pages are served from the `public/` directory:

- `http://localhost:3000/heatmap.html` - Visual heatmap demo
- `http://localhost:3000/markers.html` - Click markers demo
- `http://localhost:3000/test.html` - Basic click test page

## Creating Your Own Templates

See the `public/templates/` directory for starter templates. Each template includes:

1. **Click capture** - Automatically converts mouse clicks to normalized coordinates
2. **WebSocket connection** - Pre-configured Heat client
3. **Channel selection** - URL parameter support for testing multiple channels

Example template structure:

```html
<!DOCTYPE html>
<html>
<head>
  <title>My Heat Template</title>
  <script src="/heat-client.js"></script>
</head>
<body>
  <div id="main"></div>
  
  <script>
    const heat = new HeatClient('12345'); // Your channel ID
    
    heat.on('click', (data) => {
      // Handle incoming clicks
      console.log(`Click at ${data.x}, ${data.y}`);
    });
    
    // Local clicks are automatically captured and sent
  </script>
</body>
</html>
```

## API Reference

### WebSocket Messages

#### Click Event (Incoming)
```json
{
  "type": "click",
  "id": "U123456",
  "x": "0.500",
  "y": "0.750"
}
```

#### System Event (Incoming)
```json
{
  "type": "system",
  "message": "Welcome to Heat emulator"
}
```

### Server Configuration

Edit `src/config.ts` to customize:

```typescript
export const config = {
  wsPort: 8080,        // WebSocket server port
  httpPort: 3000,      // HTTP server port for demos
  debugMode: true      // Enable verbose logging
};
```

## Architecture

```
├── src/
│   ├── server.ts          # Main WebSocket server
│   ├── channels.ts        # Channel management
│   ├── types.ts           # TypeScript interfaces
│   └── config.ts          # Configuration
├── public/
│   ├── heat-client.js     # Reusable client library
│   ├── templates/         # Starter templates
│   └── demos/             # Example implementations
└── dist/                  # Compiled output
```

## Development Tips

- Use `?channel=YOUR_ID` in URLs to test different channels
- Open multiple browser windows to test multi-user interactions
- Check the server console for connection logs and events
- All coordinates are normalized (0.0 to 1.0) for viewport independence

## License

MIT

## Credits

Inspired by [Scott Garner's Heat extension](https://github.com/scottgarner/Heat) for Twitch.
