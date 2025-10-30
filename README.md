# Shopify AI Chat Bubble

A modern, AI-powered chat bubble widget for Shopify stores that integrates with multiple LLM services and backend APIs.

## Features

- 🤖 **LLM Support**: Ollama (default) with local/open models (e.g., llama3.1:latest)
- 🔗 **Backend Integration**: Optional Python example removed in simplified mode
- 🛍️ **Shopify Integration**: Product search, cart operations, and store context
- 💬 **Modern UI**: Beautiful, responsive chat interface
- ⚡ **Real-time**: WebSocket support for live updates
- 🎨 **Customizable**: Multiple themes and positioning options

## Quick Start

### 1. Installation

```bash
# Clone the repository
git clone <repository-url>
cd shopify-chat-bubble

# Install dependencies
npm install
```

### 2. Configuration

Copy the environment example file and configure your settings:

```bash
cp env.example .env
```

Edit `.env` with your service URLs (Ollama is default):

```env
# Ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.1:latest

# Backend Service URLs
GRAPHQL_ENDPOINT=http://localhost:4000/graphql
PYTHON_SERVICE_URL=http://localhost:5000

# Shopify Configuration
SHOPIFY_SHOP_DOMAIN=your-shop-name
SHOPIFY_ACCESS_TOKEN=your_shopify_access_token_here
```

### 3. Start the Server

```bash
# Development mode
npm run dev

# Production mode
npm start
```

The server will start on `http://localhost:3000`

### 4. Shopify Integration

#### Option A: Direct Integration (Recommended)

Add this script to your Shopify theme's `theme.liquid` file before the closing `</body>` tag:

```html
<script src="https://your-domain.com/shopify-app.js"></script>
```

#### Option B: Theme App Extension

1. Create a new theme app extension in your Shopify Partners dashboard
2. Upload the `shopify-app.js` file
3. Configure the extension settings

## API Endpoints

### Chat Endpoints

- `POST /api/chat/llm` - Send message to LLM service (Ollama)
- `GET /api/chat/:sessionId` - Get chat history

### Shopify Endpoints (optional product import)

- `GET /api/shopify/products?first=20` - List products via Storefront GraphQL
- `GET /api/shopify/products/search?q=shoes&first=20` - Search products

Environment variables required:

```env
SHOPIFY_STORE_DOMAIN=your-shop.myshopify.com
SHOPIFY_STOREFRONT_ACCESS_TOKEN=your_storefront_token
```

Notes:
- This uses the Shopify Storefront API (read-only) and does NOT touch your DigitalOcean host.
- Create a Storefront access token in Shopify Admin > Apps > Develop apps > Your app > Storefront API.

### Health Check

- `GET /health` - Server health status

## Configuration Options

### Chat Bubble Configuration

```javascript
const CHAT_BUBBLE_CONFIG = {
    apiUrl: 'https://your-domain.com',
    theme: 'modern', // 'modern', 'minimal', 'colorful'
    position: 'bottom-right', // 'bottom-right', 'bottom-left', 'top-right', 'top-left'
    autoOpen: false,
    welcomeMessage: "Hi! I'm your AI assistant.",
    primaryColor: '#667eea',
    secondaryColor: '#764ba2'
};
```

## Services Integration

### LLM Services

The chat bubble uses **Ollama** by default and can run fully locally.

- Default model: `llama3.1:latest` (configurable via `OLLAMA_MODEL`)
- Change model by setting `OLLAMA_MODEL` in `.env`

### GraphQL Integration

The system can convert natural language queries to GraphQL and execute them against your GraphQL endpoint.

### Python Service Integration

Optional example removed in simplified standalone build.

## Shopify Features

### Product Search
- Natural language product queries
- Real-time product search
- Product recommendations

### Cart Operations
- Add items to cart
- Cart status queries
- Checkout assistance

### Store Context
- Current product awareness
- Cart state integration
- Order history access

## Customization

### Themes

The chat bubble supports multiple themes:

1. **Modern** (default): Gradient design with smooth animations
2. **Minimal**: Clean, simple design
3. **Colorful**: Bright, vibrant colors

### Positioning

- `bottom-right` (default)
- `bottom-left`
- `top-right`
- `top-left`

### Colors

Customize the primary and secondary colors to match your brand:

```javascript
window.ChatBubbleConfig.primaryColor = '#your-color';
window.ChatBubbleConfig.secondaryColor = '#your-color';
```

## Development

### Project Structure

```
shopify-chat-bubble/
├── server/
│   └── index.js          # Node.js server
├── public/
│   ├── index.html        # Chat bubble HTML
│   ├── styles.css        # CSS styles
│   └── app.js           # Frontend JavaScript
├── shopify-app.js       # Shopify integration script
├── package.json         # Dependencies
└── README.md           # This file
```

### Building for Production

```bash
# Build frontend assets
npm run build

# Start production server
npm start
```

## Deployment

### Option 1: Docker (Ollama included)

```bash
docker-compose up -d
```

This starts Node server, Python service, and Ollama. To pull a model:

```bash
docker exec -it <ollama_container> ollama pull llama3.1:latest
```

### Option 2: Heroku

1. Create a Heroku app
2. Set environment variables
3. Deploy:

```bash
git push heroku main
```

### Option 2: Vercel

1. Connect your GitHub repository
2. Set environment variables in Vercel dashboard
3. Deploy automatically on push

### Option 3: AWS/GCP/Azure

Deploy the Node.js server to your preferred cloud platform and update the `apiUrl` in your Shopify integration.

## Security Considerations

- Store API keys in environment variables
- Use HTTPS in production
- Implement rate limiting
- Validate all inputs
- Use CORS properly

## Troubleshooting

### Common Issues

1. **Chat bubble not loading**: Check the `apiUrl` configuration
2. **API errors**: Verify environment variables and service URLs
3. **Shopify integration issues**: Ensure proper theme integration

### Debug Mode

Enable debug logging by adding to your `.env`:

```env
DEBUG=true
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Support

For support and questions:
- Create an issue on GitHub
- Check the troubleshooting section
- Review the API documentation

## Changelog

### v1.0.0
- Initial release
- Multi-LLM support
- Shopify integration
- GraphQL and Python service connectivity
- Modern UI with multiple themes
