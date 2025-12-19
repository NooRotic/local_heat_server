# 🔥 Heat Server Emulator - Quick Start Guide

## What You've Got

A complete, production-ready local Heat API server emulator with:

✅ **WebSocket Server** - Full Heat API compatibility  
✅ **HTTP Server** - Serves demo pages and templates  
✅ **Client Library** - Reusable `heat-client.js`  
✅ **4 Demo Pages** - Test, Heatmap, Markers, and Landing page  
✅ **Template System** - Easy to create new interactive pages  
✅ **Full Documentation** - API docs, template guide, contributing guide  
✅ **TypeScript** - Clean, type-safe code  
✅ **Hot Reload** - Development server with tsx watch mode  

## Installation & Setup

### 1. Install Dependencies

```bash
npm install
```

✅ **Already done!** All packages installed.

### 2. Configure Ports (if needed)

Edit `src/config.ts` to change ports:

```typescript
export const config = {
  wsPort: 9090,    // WebSocket server port
  httpPort: 9091,  // HTTP server port for demos
  // ... other settings
};
```

**Current Configuration:**
- WebSocket: `ws://localhost:9090`
- HTTP: `http://localhost:9091`

### 3. Start the Server

**Development mode (with hot reload):**
```bash
npm run dev
```

**Production mode:**
```bash
npm run build
npm start
```

### 4. Open in Browser

Visit: **http://localhost:9091**

You'll see the landing page with links to all demos!

## Project Structure

```
heatMapping/
├── src/                    # TypeScript source code
│   ├── server.ts          # Main WebSocket server
│   ├── channels.ts        # Channel management logic
│   ├── http-server.ts     # Static file server
│   ├── types.ts           # TypeScript interfaces
│   └── config.ts          # Configuration
│
├── public/                 # Frontend files (served by HTTP server)
│   ├── heat-client.js     # Reusable client library
│   ├── index.html         # Landing page
│   ├── test.html          # Basic click test demo
│   ├── heatmap.html       # Canvas heatmap demo
│   ├── markers.html       # User location markers demo
│   └── templates/         # Template examples
│       └── template-basic.html
│
├── docs/                   # Documentation
│   ├── API.md             # Complete API reference
│   ├── TEMPLATE_GUIDE.md  # How to create templates
│   └── ...
│
├── dist/                   # Compiled JavaScript (created on build)
├── package.json           # Dependencies and scripts
├── tsconfig.json          # TypeScript configuration
└── README.md              # Main documentation
```

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server with hot reload |
| `npm run build` | Compile TypeScript to JavaScript |
| `npm start` | Run compiled server (production) |
| `npm run serve` | Build and start production server |
| `npm run clean` | Remove build output |

## Demo Pages

Once the server is running, visit these URLs:

### 🎯 Test Page
**URL:** `http://localhost:9091/test.html`

Basic click testing with real-time markers, connection status, and click counters.

### 🌡️ Heatmap
**URL:** `http://localhost:9091/heatmap.html`

Visual heatmap with canvas rendering, fade effects, and intensity controls.

### 📍 Markers
**URL:** `http://localhost:9091/markers.html`

Persistent location markers for each user with unique colors.

### 🏠 Landing Page
**URL:** `http://localhost:9091/`

Overview page with links to all demos and documentation.

## Testing Multi-User Interaction

1. **Start the server**
2. **Open multiple browser windows**
3. **Visit the same demo in each window** (e.g., `/test.html`)
4. **Click in one window** → See the click appear in all windows!

**Pro Tip:** Use `?channel=123` to test different channels:
- Window 1: `http://localhost:9091/test.html?channel=123`
- Window 2: `http://localhost:9091/test.html?channel=123` ← Same channel, sees clicks
- Window 3: `http://localhost:9091/test.html?channel=456` ← Different channel, isolated

## Creating Your Own Templates

See `docs/TEMPLATE_GUIDE.md` for a complete guide!

**Quick template:**

```html
<!DOCTYPE html>
<html>
<head>
  <script src="/heat-client.js"></script>
</head>
<body>
  <script>
    const heat = new HeatClient(getChannelFromURL());
    
    heat.on('click', (e) => {
      console.log(`Click at ${e.detail.x}, ${e.detail.y}`);
    });
    
    capturePageClicks(heat);
  </script>
</body>
</html>
```

## Using the Client Library

```javascript
// Create client
const heat = new HeatClient('12345', {
  apiUrl: 'ws://localhost:9090',
  debugMode: true,
});

// Listen for clicks
heat.on('click', (e) => {
  const x = parseFloat(e.detail.x);  // 0.0 to 1.0
  const y = parseFloat(e.detail.y);  // 0.0 to 1.0
  const userId = e.detail.id;
  
  // Your logic here
});

// Send a click
heat.sendClick(0.5, 0.75);

// Auto-capture page clicks
capturePageClicks(heat);
```

## Connecting to Production

To use the real Twitch Heat API instead of the local emulator:

```javascript
const heat = new HeatClient(channelId, {
  apiUrl: 'wss://heat-api.j38.net',  // Production API
  debugMode: false,
});
```

## Documentation

- **README.md** - Overview and quick start
- **docs/API.md** - Complete API documentation
- **docs/TEMPLATE_GUIDE.md** - How to create templates
- **CONTRIBUTING.md** - Contribution guidelines

## Troubleshooting

### Port Already in Use

If you see `EADDRINUSE` error:

1. Edit `src/config.ts` and change `wsPort` and `httpPort`
2. Update the URLs in all HTML files to match
3. Restart the server

### Can't Connect from Browser

1. Check the server is running (`npm run dev`)
2. Verify the WebSocket URL matches your config
3. Check browser console for errors
4. Ensure no firewall is blocking the ports

### Clicks Not Appearing

1. Open browser console (F12) to see logs
2. Verify you're on the same channel in all windows
3. Check the connection status indicator

## Next Steps

1. **Try the demos** - Open http://localhost:9091
2. **Read the docs** - Check out `docs/TEMPLATE_GUIDE.md`
3. **Create a template** - Build something cool!
4. **Contribute** - See `CONTRIBUTING.md`

## Features for Production Release

This project is ready for public release! It includes:

- ✅ Clean, professional code
- ✅ TypeScript with strict typing
- ✅ Comprehensive documentation
- ✅ Multiple working examples
- ✅ Easy template creation
- ✅ MIT License
- ✅ Contributing guidelines
- ✅ Production build process

## Credits

Inspired by [Scott Garner's Heat extension](https://github.com/scottgarner/Heat) for Twitch.

## License

MIT - See LICENSE file for details.

---

**Have fun building interactive experiences!** 🚀
