import { createServer, type IncomingMessage, type ServerResponse } from 'http';
import { readFile } from 'fs/promises';
import { join, extname } from 'path';
import { config } from './config.js';
import { ThemeManager } from './theme-manager.js';
import { IdentityResolver } from './identity.js';
import { PresenceManager } from './presence.js';

/**
 * HTTP server for serving demo pages and theme API
 */
export class HttpServer {
  private server;
  private publicDir: string;
  private themeManager: ThemeManager;
  private identityResolver: IdentityResolver;
  private presenceManager: PresenceManager;

  constructor(publicDir: string = './public', identityResolver?: IdentityResolver, presenceManager?: PresenceManager) {
    this.publicDir = publicDir;
    this.themeManager = new ThemeManager();
    this.identityResolver = identityResolver || new IdentityResolver();
    this.presenceManager = presenceManager || new PresenceManager();
    this.server = createServer(this.handleRequest.bind(this));
  }

  /**
   * Start HTTP server
   */
  start(): void {
    this.server.listen(config.httpPort, () => {
      console.log(`📄 HTTP Server: http://localhost:${config.httpPort}`);
    });
  }

  /**
   * Handle HTTP request
   */
  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = (req.url || '/').split('?')[0];

    // CORS headers for API
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // Theme API routes
    if (url === '/api/theme') {
      await this.handleThemeAPI(req, res);
      return;
    }
    if (url === '/api/theme/reset') {
      await this.handleThemeReset(req, res);
      return;
    }

    // Identity API routes
    const identityMatch = url.match(/^\/api\/identity\/(.+)$/);
    if (identityMatch) {
      await this.handleIdentityLookup(identityMatch[1], res);
      return;
    }
    if (url === '/api/viewers') {
      await this.handleViewersList(res);
      return;
    }

    // Presence API routes
    if (url === '/api/presence') {
      this.handlePresenceState(res);
      return;
    }

    // Static file serving
    await this.serveStatic(url, res);
  }

  /**
   * GET /api/identity/:userId — resolve a user ID to identity
   */
  private async handleIdentityLookup(userId: string, res: ServerResponse): Promise<void> {
    try {
      const identity = await this.identityResolver.resolve(decodeURIComponent(userId));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(identity));
    } catch (error: any) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
  }

  /**
   * GET /api/viewers — list all registered test viewers
   */
  private async handleViewersList(res: ServerResponse): Promise<void> {
    const viewers = this.identityResolver.getViewers();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ viewers }));
  }

  /**
   * GET /api/presence — return current presence state
   */
  private handlePresenceState(res: ServerResponse): void {
    const state = this.presenceManager.getState();
    const counts = this.presenceManager.getCounts();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ...state, counts, roomName: this.presenceManager.getRoomName() }));
  }

  /**
   * GET /api/theme — return current theme
   * PUT /api/theme — partial update
   */
  private async handleThemeAPI(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      if (req.method === 'GET') {
        const theme = await this.themeManager.get();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(theme));
        return;
      }

      if (req.method === 'PUT') {
        const body = await this.readBody(req);
        const partial = JSON.parse(body);
        const updated = await this.themeManager.update(partial);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(updated));
        return;
      }

      res.writeHead(405);
      res.end('Method Not Allowed');
    } catch (error: any) {
      console.error('[Theme API Error]', error.message);
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
  }

  /**
   * POST /api/theme/reset — restore defaults
   */
  private async handleThemeReset(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== 'POST') {
      res.writeHead(405);
      res.end('Method Not Allowed');
      return;
    }

    try {
      const defaults = await this.themeManager.reset();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(defaults));
    } catch (error: any) {
      console.error('[Theme Reset Error]', error.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
  }

  /**
   * Read request body as string
   */
  private readBody(req: IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
      req.on('error', reject);
    });
  }

  /**
   * Serve static files from public directory
   */
  private async serveStatic(url: string, res: ServerResponse): Promise<void> {
    try {
      let filePath = url === '/' ? '/index.html' : url;

      // Security: prevent directory traversal
      if (filePath.includes('..')) {
        res.writeHead(403);
        res.end('403 Forbidden');
        return;
      }

      const fullPath = join(process.cwd(), this.publicDir, filePath);
      const content = await readFile(fullPath);

      const ext = extname(filePath);
      const contentType = this.getContentType(ext);

      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);

    } catch (error: any) {
      if (error.code === 'ENOENT') {
        res.writeHead(404);
        res.end('404 Not Found');
      } else {
        console.error('[HTTP Server Error]', error);
        res.writeHead(500);
        res.end('500 Internal Server Error');
      }
    }
  }

  /**
   * Get MIME type from file extension
   */
  private getContentType(ext: string): string {
    const types: Record<string, string> = {
      '.html': 'text/html',
      '.js': 'text/javascript',
      '.css': 'text/css',
      '.json': 'application/json',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.svg': 'image/svg+xml',
      '.woff': 'font/woff',
      '.woff2': 'font/woff2',
      '.ttf': 'font/ttf',
    };
    return types[ext] || 'text/plain';
  }

  /**
   * Stop server
   */
  async stop(): Promise<void> {
    await new Promise<void>((resolve) => {
      this.server.close(() => resolve());
    });
  }
}
