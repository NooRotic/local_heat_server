# Heat Server Status

## ✅ Server is Running!

**WebSocket Server:** `ws://localhost:7777/channel/{channelId}`  
**HTTP Server:** `http://localhost:7778`

### Test the Server

1. **Open the landing page:**
   ```
   http://localhost:7778
   ```

2. **Test direct connection:**
   ```
   http://localhost:7778/test.html
   ```

3. **Try the heatmap:**
   ```
   http://localhost:7778/heatmap.html
   ```

### Multi-User Testing

Open multiple browser windows/tabs to the same URL to test real-time synchronization:

```
http://localhost:7778/test.html?channel=123
```

Click in one window → See it appear in all windows!

### Connection Info

The server is now ready to accept connections from:
- Frontend demo pages (already configured)
- Your ripTheAI bot integration (next step)
- Any custom WebSocket client

### Next Step: Integrate ripTheAI Bot

To connect your Twitch bot to this Heat emulator:

```javascript
// In your bot code
const WebSocket = require('ws');
const ws = new WebSocket('ws://localhost:7777/channel/YOUR_CHANNEL_ID');

ws.on('open', () => {
  console.log('Connected to Heat emulator');
});

ws.on('message', (data) => {
  const message = JSON.parse(data);
  if (message.type === 'click') {
    console.log(`Click at ${message.x}, ${message.y} from ${message.id}`);
    // Your bot logic here
  }
});

// Send a click
ws.send(JSON.stringify({
  type: 'click',
  id: 'BOT123',
  x: '0.5',
  y: '0.5'
}));
```

### Server Logs

The server is running in debug mode, so you'll see real-time connection and click logs in the terminal where it's running.

### Stop the Server

Press `Ctrl+C` in the terminal where the server is running, or:

```bash
# Kill all node processes (nuclear option)
taskkill //F //IM node.exe

# Or kill specific process
kill 1566  # (use the PID from [1] 1566 message)
```
