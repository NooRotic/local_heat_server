# Creating Custom Templates

This guide will help you create your own interactive Heat templates.

## Basic Template Structure

Every Heat template needs:

1. **Heat Client Library** - Include `heat-client.js`
2. **Channel Connection** - Create a HeatClient instance
3. **Click Handler** - Listen for incoming click events
4. **Visual Feedback** - Show clicks on screen

## Minimal Template

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>My Heat Template</title>
  <script src="/heat-client.js"></script>
</head>
<body>
  <div id="main"></div>

  <script>
    // 1. Get channel ID from URL
    const channelId = getChannelFromURL('channel', '12345');

    // 2. Create Heat client
    const heat = new HeatClient(channelId);

    // 3. Handle clicks
    heat.on('click', (e) => {
      const x = parseFloat(e.detail.x);
      const y = parseFloat(e.detail.y);
      
      // Your click logic here
      console.log(`Click at ${x}, ${y}`);
    });

    // 4. Auto-capture local clicks
    capturePageClicks(heat);
  </script>
</body>
</html>
```

## Heat Client API

### Creating a Client

```javascript
const heat = new HeatClient(channelId, options);
```

**Options:**
- `apiUrl` - WebSocket server URL (default: `'ws://localhost:8080'`)
- `debugMode` - Enable console logging (default: `true`)
- `reconnectDelay` - Milliseconds between reconnect attempts (default: `3000`)
- `autoConnect` - Connect automatically (default: `true`)

### Events

```javascript
// Connection established
heat.on('connected', () => {
  console.log('Connected!');
});

// Connection lost
heat.on('disconnected', (e) => {
  console.log('Disconnected:', e.detail);
});

// Click received (from any user)
heat.on('click', (e) => {
  const data = e.detail;
  // data.id - User ID
  // data.x - Normalized X (0.0 to 1.0)
  // data.y - Normalized Y (0.0 to 1.0)
  // data.type - 'click'
});

// System message
heat.on('system', (e) => {
  console.log('System:', e.detail.message);
});

// Error
heat.on('error', (e) => {
  console.error('Error:', e.detail);
});
```

### Methods

```javascript
// Manually send a click
heat.sendClick(x, y, userId);

// Connect/disconnect
heat.connect();
heat.disconnect();

// Get user info
const user = await heat.getUserById(userId);
// Returns: { id, display_name }
```

## Helper Functions

### Auto-Capture Page Clicks

```javascript
// Automatically send all clicks on the page
capturePageClicks(heat, optionalUserId);
```

### Get Channel from URL

```javascript
// Get channel ID from ?channel= parameter
const channelId = getChannelFromURL('channel', 'defaultValue');
```

## Coordinate System

All coordinates are **normalized** from 0.0 to 1.0:

- `x`: 0.0 = left edge, 1.0 = right edge
- `y`: 0.0 = top edge, 1.0 = bottom edge

This makes coordinates viewport-independent!

### Converting to Pixels

```javascript
heat.on('click', (e) => {
  const x = parseFloat(e.detail.x);
  const y = parseFloat(e.detail.y);
  
  // Convert to pixel coordinates
  const pixelX = x * window.innerWidth;
  const pixelY = y * window.innerHeight;
  
  console.log(`Click at pixel (${pixelX}, ${pixelY})`);
});
```

## Common Patterns

### Visual Click Markers

```javascript
function createMarker(x, y) {
  const marker = document.createElement('div');
  marker.className = 'marker';
  marker.style.left = (x * window.innerWidth) + 'px';
  marker.style.top = (y * window.innerHeight) + 'px';
  
  document.body.appendChild(marker);
  
  // Remove after animation
  setTimeout(() => marker.remove(), 2000);
}

heat.on('click', (e) => {
  createMarker(parseFloat(e.detail.x), parseFloat(e.detail.y));
});
```

### Per-User Tracking

```javascript
const userMarkers = new Map();

heat.on('click', (e) => {
  const userId = e.detail.id;
  const x = parseFloat(e.detail.x);
  const y = parseFloat(e.detail.y);
  
  // Update or create marker for this user
  if (userMarkers.has(userId)) {
    updateMarker(userMarkers.get(userId), x, y);
  } else {
    const marker = createMarker(x, y);
    userMarkers.set(userId, marker);
  }
});
```

### Click History

```javascript
const clickHistory = [];

heat.on('click', (e) => {
  clickHistory.push({
    userId: e.detail.id,
    x: parseFloat(e.detail.x),
    y: parseFloat(e.detail.y),
    timestamp: Date.now(),
  });
  
  // Keep only last 100 clicks
  if (clickHistory.length > 100) {
    clickHistory.shift();
  }
});
```

## Testing Your Template

1. **Start the server:**
   ```bash
   npm run dev
   ```

2. **Open your template:**
   ```
   http://localhost:3000/your-template.html
   ```

3. **Test multi-user:**
   - Open multiple browser windows
   - Use different channels: `?channel=123` and `?channel=456`
   - Clicks should sync in real-time

## Tips

- **Use CSS animations** for smooth visual effects
- **Debounce rapid clicks** if needed to avoid spam
- **Handle disconnects** gracefully with reconnection logic
- **Cache user info** to avoid repeated lookups
- **Test on different viewport sizes** - normalized coordinates work everywhere!

## Examples

See the included demos:
- `/test.html` - Basic click testing
- `/heatmap.html` - Canvas-based heatmap
- `/markers.html` - Per-user location markers

All demo source code is available in the `public/` directory.

## Production Deployment

To connect to the real Twitch Heat API instead of the emulator:

```javascript
const heat = new HeatClient(channelId, {
  apiUrl: 'wss://heat-api.j38.net', // Production API
  debugMode: false,
});
```

## Need Help?

- Check the demo source code in `public/`
- Review the Heat Client API above
- See the official Heat extension: https://github.com/scottgarner/Heat
