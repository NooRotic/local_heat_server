# Contributing to Heat Server Emulator

Thank you for your interest in contributing! This document provides guidelines for contributing to the project.

## Development Setup

1. **Fork and clone the repository**
   ```bash
   git clone https://github.com/YOUR_USERNAME/heat-server-emulator.git
   cd heat-server-emulator
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start development server**
   ```bash
   npm run dev
   ```

## Project Structure

```
heat-server-emulator/
├── src/
│   ├── server.ts          # Main WebSocket server
│   ├── channels.ts        # Channel management
│   ├── http-server.ts     # Static file server
│   ├── types.ts           # TypeScript interfaces
│   └── config.ts          # Configuration
├── public/
│   ├── heat-client.js     # Client library
│   ├── index.html         # Landing page
│   ├── test.html          # Test demo
│   ├── heatmap.html       # Heatmap demo
│   ├── markers.html       # Markers demo
│   └── templates/         # Template examples
├── docs/
│   ├── API.md            # API documentation
│   └── TEMPLATE_GUIDE.md # Template creation guide
└── dist/                 # Build output
```

## Code Style

- **TypeScript**: Strict mode enabled
- **Indentation**: 2 spaces
- **Quotes**: Single quotes for strings
- **Semicolons**: Required
- **Naming**:
  - Classes: `PascalCase`
  - Functions/Variables: `camelCase`
  - Constants: `UPPER_CASE`
  - Private members: prefix with `private`

## Making Changes

1. **Create a feature branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes**
   - Write clean, readable code
   - Add comments for complex logic
   - Follow existing patterns

3. **Test your changes**
   ```bash
   npm run build
   npm start
   ```
   
   Test all demos in `public/`:
   - `http://localhost:3000/test.html`
   - `http://localhost:3000/heatmap.html`
   - `http://localhost:3000/markers.html`

4. **Commit your changes**
   ```bash
   git add .
   git commit -m "feat: Add your feature description"
   ```

   Use conventional commit messages:
   - `feat:` New feature
   - `fix:` Bug fix
   - `docs:` Documentation changes
   - `refactor:` Code refactoring
   - `test:` Adding tests
   - `chore:` Maintenance tasks

5. **Push and create pull request**
   ```bash
   git push origin feature/your-feature-name
   ```

## Areas for Contribution

### High Priority

- **Tests**: Add unit tests and integration tests
- **Documentation**: Improve guides and examples
- **Examples**: Add more demo templates
- **Performance**: Optimize for high client counts

### Feature Ideas

- **Recording**: Save click sessions to replay later
- **Analytics**: Real-time click statistics dashboard
- **Authentication**: Optional token-based auth
- **Rate Limiting**: Prevent click spam
- **Channels UI**: Admin panel for managing channels
- **WebRTC**: Peer-to-peer mode for lower latency
- **Docker**: Containerized deployment
- **CLI**: Command-line interface for server control

### Bug Fixes

Always welcome! Check the issues page for known bugs.

## Adding a New Demo

1. Create HTML file in `public/`:
   ```html
   <!DOCTYPE html>
   <html lang="en">
   <head>
     <meta charset="UTF-8">
     <title>My Demo</title>
     <script src="/heat-client.js"></script>
   </head>
   <body>
     <script>
       const heat = new HeatClient(getChannelFromURL());
       heat.on('click', (e) => {
         // Your demo logic
       });
       capturePageClicks(heat);
     </script>
   </body>
   </html>
   ```

2. Add link to `public/index.html`:
   ```html
   <a href="/my-demo.html" class="demo-card">
     <div class="demo-icon">🎨</div>
     <div class="demo-title">My Demo</div>
     <div class="demo-description">Description here</div>
   </a>
   ```

3. Test thoroughly with multiple browser windows

## Documentation

When adding features, update relevant docs:

- `README.md` - User-facing features
- `docs/API.md` - API changes
- `docs/TEMPLATE_GUIDE.md` - Template examples
- Code comments - Complex logic

## Questions?

- Open an issue for discussion
- Check existing issues and PRs
- Review the documentation

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

Thank you for contributing! 🙏
