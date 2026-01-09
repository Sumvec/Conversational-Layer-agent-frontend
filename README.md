# Shopify AI Chat Bubble

A modern, AI-powered chat bubble widget for E-commerce stores  stores that integrates with multiple LLM services and backend APIs.

## Features
- 🛍️ **Shopify Integration**: Product search, cart operations, and store context
- 💬 **Modern UI**: Beautiful, responsive chat interface
- ⚡ **Real-time**: WebSocket support for live updates
- 🎨 **Customizable**: Multiple themes and positioning options

## Prerequisites

- Node.js (recommended LTS, e.g. 18.x or 20.x)
- npm (comes with Node.js)
- Git (optional; GitHub Desktop supported)
- Optional: yarn (if you prefer it)

Check versions:
bash
node -v
npm -v
Quick start (local development)
Clone the repo (or ensure your local repo is the project folder):


#git clone https://github.com/Sumvec/Conversational-Layer-agent-frontend.git
#cd Conversational-Layer-agent-frontend
#If you already have the repo locally, cd into the project root (where package.json is).

Install dependencies:
npm install
Create environment variables

Create a .env (or .env.local) file in the project root. Example .env.example:

# Other config (example)
Save your real values to .env. Do not commit .env to git — .gitignore already excludes it.

Start the dev server:
npm run dev:frontend

To build the dist file :
npm run build 
# Open the app in the browser — the exact URL will appear in the console (commonly http://localhost:3000 or http://localhost:5173 depending on your setup).
