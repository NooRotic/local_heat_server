import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { join, extname } from 'path';
import { config } from './config.js';

/**
 * Simple HTTP server for serving demo pages
 */
export class HttpServer {
  private server;
  private publicDir: string;

  constructor(publicDir: string = './public') {
    this.publicDir = publicDir;
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
  private async handleRequest(req: any, res: any): Promise<void> {
    try {
      let filePath = req.url === '/' ? '/index.html' : req.url;
      
      // Remove query string
      filePath = filePath.split('?')[0];
      
      // Security: prevent directory traversal
      if (filePath.includes('..')) {
        res.writeHead(403);
        res.end('403 Forbidden');
        return;
      }

      const fullPath = join(process.cwd(), this.publicDir, filePath);
      const content = await readFile(fullPath);
      
      // Set content type
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
