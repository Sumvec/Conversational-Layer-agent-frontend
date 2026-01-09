// public/app.js
// Full fixed version (Option 2): uses #chatBubbleContainer to avoid window variable conflict.

const VECTOR_WEBHOOK_URL = 'https://sage.sumvec.com/n8n/webhook/54d7b928-24cf-40a5-b7dc-21ca07900d9a';
// const VECTOR_WEBHOOK_URL = process.env.VECTOR_WEBHOOK_URL;
// import './styles.css';

async function postToWebhook(payload) {
  try {
    // Normalize payload to match Postman: { text: '...'}
    const body = { text: payload && (payload.text || payload.message || payload.query || '') || '' };
    // Ensure sessionId always sent if present
    if (payload && payload.sessionId) body.sessionId = payload.sessionId;

    const res = await fetch(VECTOR_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Basic dGVzdDpzdW12ZWM='
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      // log response body for debugging
      const text = await res.text().catch(() => '<no-body>');
      console.warn('Webhook HTTP error', res.status, text);
      return null;
    }

    // Try to parse JSON; if fails, keep the raw text under .rawText
    let data = null;
    const textBody = await res.text().catch(() => '');
    try {
      data = textBody ? JSON.parse(textBody) : null;
    } catch (e) {
      // Not JSON — the webhook returned plain text (store it)
      data = { rawText: textBody };
    }

    if (!data) {
      console.warn('Webhook returned empty response (no body)');
      return null;
    }

    console.log('🔄 Raw webhook response:', data);

    // If webhook returned an array like [{ output: "..." }], use first element
    if (Array.isArray(data) && data.length > 0) {
      console.log('📌 Response is array, using first element');
      data = data[0];
    }

    // If data.rawText exists and looks like JSON inside a string (e.g., output contains JSON),
    // try to parse embedded JSON into parsedOutput.
    let parsedOutput = null;
    const possibleOutputStr = (data.output && typeof data.output === 'string' ? data.output : (data.rawText && typeof data.rawText === 'string' ? data.rawText : null));
    if (possibleOutputStr) {
      try {
        // Try brute-force JSON extraction inside a string (handles "output": "{...}" cases)
        const jsonMatch = possibleOutputStr.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsedOutput = JSON.parse(jsonMatch[0]);
          console.log('📦 Extracted JSON from output/rawText:', parsedOutput);
        } else {
          // store raw string as parsedOutput (so callers can use it uniformly)
          parsedOutput = possibleOutputStr;
        }
      } catch (e) {
        parsedOutput = possibleOutputStr;
      }
    } else if (data.parsedOutput) {
      parsedOutput = data.parsedOutput;
    }

    // Normalize products array for many possible shapes
    let products = [];
    if (Array.isArray(data.products)) {
      products = data.products;
    } else if (Array.isArray(data.results)) {
      products = data.results;
    } else if (data.results && Array.isArray(data.results.results)) {
      products = data.results.results;
    } else if (data.data && Array.isArray(data.data.products)) {
      products = data.data.products;
    } else if (Array.isArray(parsedOutput?.products)) {
      products = parsedOutput.products;
    } else if (Array.isArray(parsedOutput) && typeof parsedOutput[0] === 'object' && (parsedOutput[0].id || parsedOutput[0].title)) {
      products = parsedOutput;
    }

    if (products.length > 0) console.log('✓ Found', products.length, 'products');

    // Merge back normalized pieces and return stable structure
    return Object.assign({}, data, { products, parsedOutput });
  } catch (err) {
    console.warn('Webhook call failed', err);
    return null;
  }
}

class ChatBubble {
  constructor() {
    // Load style configuration
    this.styleConfig = this._loadStyleConfig();

    // Config
    this.apiBaseUrl =
      (window.ChatBubbleConfig && window.ChatBubbleConfig.apiUrl) ||
      window.location.origin;
    this.sessionId = this._loadOrGenerateSessionId();
    this.isOpen = false;
    this.isLoading = false;
    this.storeDomain = null;

    // Ensure CSS is loaded
    this._ensureStyles();

    // Setup UI + listeners
    this._ensureMarkup();
    this._bindElements();
    this._attachListeners();

    // Initialize content
    this.loadChatHistory();
    this.loadStoreDomain();
    this._fetchAndApplyStyleConfig(); // Load custom styles after DOM ready
  }

  _loadStyleConfig() {
    try {
      // First, prefer a build-time injected STYLE_CONFIG (defined by webpack DefinePlugin)
      if (typeof STYLE_CONFIG !== 'undefined' && STYLE_CONFIG) {
        try {
          // STYLE_CONFIG is injected as an object literal at build time
          const sc = STYLE_CONFIG;
          // Persist for runtime use
          localStorage.setItem('cb_style_config', JSON.stringify(sc));
          return sc;
        } catch (err) {
          console.warn('Failed to use build-time STYLE_CONFIG:', err);
        }
      }

      // Next, try to load from localStorage (persisted config)
      const configStr = localStorage.getItem('cb_style_config');
      if (configStr) {
        return JSON.parse(configStr);
      }
    } catch (err) {
      console.warn('Failed to load style config from localStorage or STYLE_CONFIG:', err);
    }

    // Return defaults if not found
    return {
      borderColor: '#e1e5e9',
      borderRadius: '18px',
      fontSize: '14px',
      color: '#333',
    };
  }

  async _fetchAndApplyStyleConfig() {
    try {
      const res = await fetch('/style-config.json');
      if (res.ok) {
        const config = await res.json();
        localStorage.setItem('cb_style_config', JSON.stringify(config));
        this.styleConfig = config;
        console.log('✓ Loaded custom style config:', config);
      }
    } catch (err) {
      console.debug('Style config endpoint not available (using defaults):', err.message);
    }
  }

  _ensureStyles() {
    // Auto-inject all CSS as a <style> tag (all styles embedded in this file)
    if (document.querySelector('style[data-cb-styles]')) return;
    const style = document.createElement('style');
    style.setAttribute('data-cb-styles', 'true');
    style.textContent = `
/* Reset and Base Styles */
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif; line-height: 1.6; color: #333; }
/* Chat Bubble Container */
.chat-bubble { position: fixed; bottom: 20px; right: 20px; z-index: 9999; font-family: inherit; pointer-events: auto; }
/* Chat Toggle Button */
.chat-toggle { width: 60px; height: 60px; border-radius: 50%; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border: none; color: white; cursor: pointer; box-shadow: 0 4px 20px rgba(102, 126, 234, 0.4); transition: all 0.3s ease; display: flex; align-items: center; justify-content: center; z-index: 10000;position: absolute; bottom: 4px; right: 10px; }
.chat-toggle:hover { transform: scale(1.1); box-shadow: 0 6px 25px rgba(102, 126, 234, 0.6); }
.chat-toggle:active { transform: scale(0.95); }
/* Chat Window */
.chat-window {  position: relative; bottom: 75px; right: 24px; width: 380px; height: 500px; background: white; border-radius: 20px; box-shadow: 0 10px 40px rgba(0, 0, 0, 0.15); display: flex; flex-direction: column; overflow: hidden; border: 1px solid #e1e5e9; opacity: 1; transform: translateY(0) scale(1); transition: all 0.3s ease; }
.chat-window.hidden { opacity: 0; transform: translateY(20px) scale(0.9); pointer-events: none; }
/* Chat Header */
.chat-header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; display: flex; justify-content: space-between; align-items: center; }
.chat-title h3 { font-size: 18px; font-weight: 600;color: white; }
.status-indicator { width: 8px; height: 8px; border-radius: 50%; background: #4ade80; margin-left: 8px; animation: pulse 2s infinite; }
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
.chat-close { background: none; border: none; color: white; font-size: 24px; cursor: pointer; width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; }
.chat-close:hover { background-color: rgba(255, 255, 255, 0.2); }
/* Messages */
.chat-messages { flex: 1; padding: 20px; overflow-y: auto; background: #f8fafc; gap: 8px; display: flex !important; flex-direction: column; }
.chat-messages::-webkit-scrollbar { width: 8px; }
.chat-messages::-webkit-scrollbar-thumb { background: rgba(99, 102, 241, 0.3); border-radius: 8px; }
.chat-messages::-webkit-scrollbar-track { background: transparent; }
.message { margin-bottom: 0; display: flex; flex-direction: column; animation: slideIn 0.3s ease-out; }
.message.user { align-items: flex-end; }
.message.assistant { align-items: flex-start; }
.message-content { max-width: 100%; padding: 12px 16px; border-radius: 18px; word-wrap: break-word; }
.message.user .message-content { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border-bottom-right-radius: 4px; }
.message.assistant .message-content { background: white; color: #333; border: 1px solid #e1e5e9; border-bottom-left-radius: 4px; }
.message-time { font-size: 11px; color: #6b7280; margin-top: 4px; padding: 0 8px; }
@keyframes slideIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
/* Input */
.chat-input-container { padding: 18px 20px; background: white; border-top: 1px solid #f0f0f0; flex-shrink: 0; }
.input-wrapper { display: flex; align-items: center; gap: 10px; background: #f3f4f6; border-radius: 26px; padding: 12px 18px; border: 1px solid #e5e7eb; transition: all 0.2s ease; }
.input-wrapper:focus-within { border-color: #667eea; background: #fff; box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1); }
#chatInput { flex: 1; border: none; background: none; outline: none; font-size: 15px; color: #1f2937; padding: 0; resize: none; width: 100%; min-height: 38px; font-family: inherit; }
#chatInput::placeholder { color: #6b7280; font-weight: 500; }
.send-button { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border: none; color: white; width: 40px; height: 40px; min-width: 40px; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s ease; flex-shrink: 0; }
.send-button:hover { transform: scale(1.08); box-shadow: 0 6px 20px rgba(102, 126, 234, 0.3); }
.send-button:active { transform: scale(0.95); }
.send-button:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
.send-button svg { width: 20px; height: 20px; }
/* Spinner */
.loading-spinner { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); z-index: 2000; }
.loading-spinner.hidden { display: none; }
.spinner { width: 40px; height: 40px; border: 4px solid #f3f3f3; border-top: 4px solid #667eea; border-radius: 50%; animation: spin 1s linear infinite; }
@keyframes spin { 0% { transform: rotate(0); } 100% { transform: rotate(360deg); } }
/* Typing Indicator */
.typing-indicator { display: flex; align-items: center; padding: 12px 16px; background: white; border: 1px solid #e1e5e9; border-radius: 18px; border-bottom-left-radius: 4px; max-width: 80px; }
.typing-indicator span { width: 8px; height: 8px; border-radius: 50%; background: #667eea; margin: 0 2px; animation: typing 1.4s infinite ease-in-out; }
.typing-indicator span:nth-child(1) { animation-delay: -0.32s; }
.typing-indicator span:nth-child(2) { animation-delay: -0.16s; }
@keyframes typing { 0%, 80%, 100% { transform: scale(0.8); opacity: 0.5; } 40% { transform: scale(1); opacity: 1; } }
/* Product card */
.cb-product { display: flex; gap: 12px; align-items: flex-start; padding: 10px; border-radius: 10px; background: #ffffff; border: 1px solid #eef2f7; box-shadow: 0 2px 6px rgba(16, 24, 40, 0.03); margin-bottom: 10px; }
.cb-product img { width: 64px; height: 64px; object-fit: cover; border-radius: 8px; flex: 0 0 64px; }
.cb-product > div { display: flex; flex-direction: column; min-width: 0; }
.cb-product .cb-title { font-weight: 600; color: #111827; line-height: 1.1; }
.cb-product .cb-actions { margin-top: 8px; display: flex; gap: 8px; align-items: center; flex-wrap: nowrap; width: 100%; }
.cb-product .cb-price { color: #374151; font-weight: 600; font-size: 13px; }
.cb-add { 
  transition: all 0.2s ease;
  flex-shrink: 0;
}
.cb-add:hover { 
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
}
.cb-add:active { 
  transform: translateY(0);
  opacity: 0.9;
}
/* Header layout */
.chat-header .chat-title { display: flex; align-items: center; gap: 8px; }
/* Responsive */
@media (max-width: 480px) {
  .chat-window { left: 12px; right: 12px; bottom: 80px; width: auto; height: 72vh; border-radius: 12px; }
  .chat-bubble { bottom: 12px; right: 12px; }
}
/* Compatibility */
.chat-product-card { display: flex; gap: 10px; align-items: flex-start; padding: 8px; border-radius: 10px; background: #fff; border: 1px solid #eef2f7; margin-bottom: 8px; }
.chat-product-card img { width: 72px; height: 72px; object-fit: cover; border-radius: 8px; flex: 0 0 72px; }
.chat-product-card .chat-card-body { display: flex; flex-direction: column; min-width: 0; }
.chat-product-card a { color: var(--cb-primary, #667eea); text-decoration: none; }
    `;
    
    // Apply comprehensive custom style configuration
    const {
      primaryColor = '#667eea',
      secondaryColor = '#764ba2',
      textColor = '#333',
      textColorLight = '#6b7280',
      backgroundColor = '#ffffff',
      backgroundColorLight = '#f8fafc',
      borderColor = '#e1e5e9',
      userMessageBg = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      userMessageColor = '#ffffff',
      assistantMessageBg = '#ffffff',
      assistantMessageColor = '#333',
      inputBackground = '#f3f4f6',
      borderRadius = '18px',
      borderRadiusSmall = '6px',
      fontSize = '14px',
      fontSizeLarge = '18px',
      fontSizeSmall = '12px',
      padding = '20px',
      paddingSmall = '12px',
      chatBubbleSize = '60px',
      chatBubbleBorderRadius = '50%',
      headerBackground = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      headerColor = '#ffffff',
      headerPadding = '20px',
      messageRadius = '18px',
      messagePadding = '12px 16px',
      messageBorderWidth = '1px',
      inputBorderRadius = '26px',
      inputPadding = '12px 18px',
      inputFontSize = '15px',
      buttonRadius = '50%',
      buttonSize = '40px',
      shadowSmall = '0 2px 6px rgba(16, 24, 40, 0.03)',
      shadowMedium = '0 4px 20px rgba(102, 126, 234, 0.4)',
      shadowLarge = '0 10px 40px rgba(0, 0, 0, 0.15)',
      transitionSpeed = '0.3s',
    } = this.styleConfig;

    const customStyles = `
/* Custom Configuration Overrides - Applied Everywhere */
:root {
  --cb-primary: ${primaryColor};
  --cb-secondary: ${secondaryColor};
  --cb-text: ${textColor};
  --cb-text-light: ${textColorLight};
  --cb-bg: ${backgroundColor};
  --cb-bg-light: ${backgroundColorLight};
  --cb-border: ${borderColor};
  --cb-shadow-sm: ${shadowSmall};
  --cb-shadow-md: ${shadowMedium};
  --cb-shadow-lg: ${shadowLarge};
  --cb-radius: ${borderRadius};
  --cb-radius-sm: ${borderRadiusSmall};
  --cb-transition: ${transitionSpeed};
}

/* Chat Bubble Toggle */
.chat-toggle { 
  width: ${chatBubbleSize}; 
  height: ${chatBubbleSize}; 
  border-radius: ${chatBubbleBorderRadius};
  background: linear-gradient(135deg, ${primaryColor} 0%, ${secondaryColor} 100%); 
  box-shadow: ${shadowMedium};
  transition: all ${transitionSpeed} ease;
}
.chat-toggle:hover { box-shadow: ${shadowLarge}; }

/* Chat Header */
.chat-header { 
  background: ${headerBackground}; 
  color: ${headerColor};
  padding: ${headerPadding};
}
.chat-title h3 { font-size: ${fontSizeLarge}; color: ${headerColor}; }

/* Chat Window */
.chat-window {
  background: ${backgroundColor};
  border: ${messageBorderWidth} solid ${borderColor};
  border-radius: ${borderRadius};
  box-shadow: ${shadowLarge};
  transition: all ${transitionSpeed} ease;
}
.chat-window.hidden { transition: all ${transitionSpeed} ease; }

/* Messages Area */
.chat-messages { 
  background: ${backgroundColorLight};
  padding: ${padding};
}

.message-content { 
  font-size: ${fontSize};
  border-radius: ${messageRadius};
  padding: ${messagePadding};
  border: ${messageBorderWidth} solid transparent;
}

.message.user .message-content { 
  background: ${userMessageBg}; 
  color: ${userMessageColor};
  border-color: transparent;
}

.message.assistant .message-content { 
  background: ${assistantMessageBg}; 
  color: ${assistantMessageColor};
  border-color: ${borderColor};
}

.message-time { 
  color: ${textColorLight}; 
  font-size: ${fontSizeSmall};
}

/* Input Area */
.chat-input-container { 
  padding: ${padding};
  background: ${backgroundColor};
  border-top: ${messageBorderWidth} solid ${borderColor};
}

.input-wrapper { 
  background: ${inputBackground};
  border-radius: ${inputBorderRadius};
  padding: ${inputPadding};
  border: ${messageBorderWidth} solid ${borderColor};
  transition: all ${transitionSpeed} ease;
}

.input-wrapper:focus-within { 
  border-color: ${primaryColor};
  background: ${backgroundColor};
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
}

#chatInput { 
  font-size: ${inputFontSize};
  color: ${textColor};
}

#chatInput::placeholder { 
  color: ${textColorLight};
}

/* Send Button */
.send-button { 
  background: linear-gradient(135deg, ${primaryColor} 0%, ${secondaryColor} 100%);
  width: ${buttonSize};
  height: ${buttonSize};
  border-radius: ${buttonRadius};
  box-shadow: ${shadowMedium};
  transition: all ${transitionSpeed} ease;
  color: white;
}

.send-button:hover { 
  transform: scale(1.08);
  box-shadow: ${shadowLarge};
}

/* Buttons and Links */
.cb-add {
  // background: ${inputBackground};
  background: unset !important;
  color: ${primaryColor};
  border: ${messageBorderWidth} solid ${borderColor};
  border-radius: ${borderRadiusSmall};
  padding: ${paddingSmall} ${padding};
  font-size: ${fontSizeSmall};
  transition: all ${transitionSpeed} ease;
  cursor: pointer;
}

.cb-add:hover { 
  transform: translateY(-2px);
  box-shadow: ${shadowMedium};
  border-color: ${primaryColor};
}

/* Product Cards */
.cb-product { 
  border: ${messageBorderWidth} solid ${borderColor};
  border-radius: ${borderRadiusSmall};
  background: ${backgroundColor};
  box-shadow: ${shadowSmall};
  margin-bottom: ${paddingSmall};
}

.cb-product img { 
  border-radius: ${borderRadiusSmall};
}

.cb-product .cb-title { 
  color: ${textColor};
  font-size: ${fontSize};
  font-weight: 600;
}

.cb-product .cb-price { 
  color: ${textColorLight};
  font-size: ${fontSizeSmall};
}

.cb-product .cb-actions { 
  gap: ${paddingSmall};
}

.cb-product a {
  color: ${primaryColor};
  // background: ${inputBackground};
  // border: ${messageBorderWidth} solid ${borderColor};
  // border-radius: ${borderRadiusSmall};
  padding: 2px 6px;
  transition: all ${transitionSpeed} ease;
}

.cb-product a:hover {
  border-color: ${primaryColor};
  transform: translateY(-2px);
}

/* Close Button */
.chat-close { 
  color: ${headerColor};
  font-size: ${fontSizeLarge};
  transition: all ${transitionSpeed} ease;
}

.chat-close:hover { 
  background-color: rgba(255, 255, 255, 0.2);
}

/* Typing Indicator */
.typing-indicator { 
  background: ${backgroundColor};
  border: ${messageBorderWidth} solid ${borderColor};
  border-radius: ${messageRadius};
  padding: ${messagePadding};
}

.typing-indicator span { 
  background: ${primaryColor};
  width: 8px;
  height: 8px;
}

/* Status Indicator */
.status-indicator { 
  background: #4ade80;
}

/* Spinner */
.spinner {
  border-top-color: ${primaryColor};
}

/* Product Card Legacy */
.chat-product-card { 
  border: ${messageBorderWidth} solid ${borderColor};
  background: ${backgroundColor};
  border-radius: ${borderRadiusSmall};
}

.chat-product-card a { 
  color: ${primaryColor};
  text-decoration: none;
}
    `;
    
    style.textContent += customStyles;
    document.head.appendChild(style);
  }

  _loadOrGenerateSessionId() {
    // Use sessionStorage so each browser tab/window gets a unique session id
    try {
      const key = 'cb_session_id';
      const saved = (typeof sessionStorage !== 'undefined') ? sessionStorage.getItem(key) : null;
      if (saved) return saved;

      let id;
      if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        id = 'session_' + crypto.randomUUID();
      } else {
        // Fallback for older environments
        id = 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      }

      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem(key, id);
      }
      return id;
    } catch (err) {
      console.warn('Failed to generate session id, falling back to ephemeral id:', err);
      return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }
  }

  _ensureMarkup() {
    if (document.getElementById("chatBubbleContainer")) return;

    const root = document.createElement("div");
    root.id = "cb-root";
    root.innerHTML = `
      <div id="chatBubbleContainer" class="chat-bubble">
        <button id="chatToggle" class="chat-toggle" aria-label="Open chat">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M20 2H4C2.9 2 2 2.9 2 4V22L6 18H20C21.1 18 22 17.1 22 16V4C22 2.9 21.1 2 20 2ZM20 16H5.17L4 17.17V4H20V16Z" fill="currentColor"/>
            <path d="M7 9H17V11H7V9ZM7 12H15V14H7V12Z" fill="currentColor"/>
          </svg>
        </button>
        <div id="chatWindow" class="chat-window hidden" role="dialog" aria-label="Chat window">
          <div class="chat-header">
            <div class="chat-title">
              <h3>AI Assistant</h3>
              <span class="status-indicator online" title="Online"></span>
            </div>
            <button id="chatClose" class="chat-close" aria-label="Close">✕</button>
          </div>
          <div id="chatMessages" class="chat-messages" aria-live="polite"></div>
          <div class="chat-input-container">
            <div class="input-wrapper">
              <input type="text" id="chatInput" class="cb-input" placeholder="Ask a question..." autocomplete="off" />
              <button id="sendButton" class="send-button" title="Send">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M2.01 21L23 12L2.01 3L2 10L17 12L2 14L2.01 21Z" fill="currentColor"/>
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
      <div id="loadingSpinner" class="loading-spinner hidden"><div class="spinner"></div></div>
    `;
    document.body.appendChild(root);
  }

 _bindElements() {
  const chatToggle = document.getElementById("chatToggle");
  if (chatToggle) this.chatToggle = chatToggle;

  const chatWindow = document.getElementById("chatWindow");
  if (chatWindow) this.chatWindow = chatWindow;

  const chatClose = document.getElementById("chatClose");
  if (chatClose) this.chatClose = chatClose;

  const chatMessages = document.getElementById("chatMessages");
  if (chatMessages) this.chatMessages = chatMessages;

  const chatInput = document.getElementById("chatInput");
  if (chatInput) this.chatInput = chatInput;

  const sendButton = document.getElementById("sendButton");
  if (sendButton) this.sendButton = sendButton;

  const loadingSpinner = document.getElementById("loadingSpinner");
  if (loadingSpinner) this.loadingSpinner = loadingSpinner;
}

  _attachListeners() {
  if (this.chatToggle)
    this.chatToggle.addEventListener("click", () => this.toggleChat());

  if (this.chatClose)
    this.chatClose.addEventListener("click", () => {
      this.closeChat();
    });

  if (this.sendButton)
    this.sendButton.addEventListener("click", () => this.sendMessage());

  if (this.chatInput) {
    this.chatInput.addEventListener("input", () => {
      this.chatInput.style.height = "auto";
      this.chatInput.style.height =
        Math.min(this.chatInput.scrollHeight, 160) + "px";
    });
    this.chatInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });
  }
}


  toggleChat() {
    this.isOpen = !this.isOpen;
    this.isOpen ? this.openChat() : this.closeChat();
  }

  openChat() {
    if (this.chatWindow) {
      this.chatWindow.classList.remove("hidden");
      this.chatInput?.focus();
      this._scrollToBottomAsync();
    }
    this.isOpen = true;
  }

  closeChat() {
    if (this.chatWindow) this.chatWindow.classList.add("hidden");
    this.isOpen = false;
  }

  async sendMessage() {
    const message = (this.chatInput?.value || "").trim();
    if (!message || this.isLoading) return;

    this.addMessage("user", this.escapeText(message));
    if (this.chatInput) {
      this.chatInput.value = "";
      this.chatInput.style.height = "auto";
    }

    this.setLoading(true);
    this.showTypingIndicator();

    try {
      if (this.isProductQuery(message)) {
        await this.handleProductQuery(message);
      } else {
        // Get webhook response
       // Get webhook response (single call)
       const webhookData = await postToWebhook({ text: message, sessionId: this.sessionId });
       // DEBUG: show the exact webhook payload/shape so we can see why parsing went wrong
       console.debug('webhookData (raw):', webhookData);
       this.hideTypingIndicator();
       

// Extract parsedOutput for structured flow
const po = webhookData?.parsedOutput || null;

// Try to extract a plain-text reply from multiple possible fields
let webhookReply = null;
const attemptFields = [
  // Prefer structured 'po' fields first, but also include rawText and top-level output early
  po?.before_message,
  po?.reply,
  po?.response,
  po?.message,
  // if webhook produced rawText (non-json) or plain output string, pick it up quickly
  webhookData?.rawText,
  webhookData?.output,
  webhookData?.text,
  webhookData?.reply,
  webhookData?.response,
  webhookData?.message,
];


for (const c of attemptFields) {
  if (c && typeof c === "string" && c.trim()) {
    webhookReply = c.trim();
    break;
  }
}

// 1) Structured product flow (before_message / products / after_message)
if (
  (po?.before_message || po?.after_message) ||
  (webhookData?.products && webhookData.products.length)
) {
  const header = po?.before_message || "I found these products:";
  if (webhookData.products?.length > 0) {
    this.displayProducts(webhookData.products, header, po?.after_message || null);
  } else {
    const combined = [po?.before_message, po?.after_message].filter(Boolean).join("\n\n");
    if (combined) this.addMessage("assistant", this.escapeText(combined));
  }
  return; // DONE — do not call LLM fallback // We use the strucutre response 
}

// 2) Plain text webhook reply — show immediately (NO second webhook call)
if (webhookReply) {
  const looksLikeHtml =
    /<\/?(img|a|div|span|button)/i.test(webhookReply) ||
    /!\[.*\]\(https?:\/\//i.test(webhookReply);

  if (looksLikeHtml) {
    const html = this._convertInlineMedia(webhookReply);
    this.addHtmlMessage("assistant", html);
  } else {
    this.addMessage("assistant", this.escapeText(webhookReply));
  }

  // If webhook included products, show under the reply
  if (webhookData.products?.length > 0) {
    this.displayProducts(webhookData.products);
  }

  return; // DONE — we used the first webhook response
}

// 3) Fallback only when webhook returned NOTHING usable
const response = await this.sendToLLM(message, webhookData);
if (response) {
  this.addMessage("assistant", this.escapeText(response));
  // Show products if present
  if (webhookData.products?.length > 0) {
    this.displayProducts(webhookData.products);
  }
} else {
  this.addMessage("assistant", "Sorry, I didn't get a response. Please try again.");
}

      }
    } catch (err) {
      console.error("❌ sendMessage error", err);
      this.hideTypingIndicator();
      this.addMessage("assistant", "Sorry — something went wrong.");
    } finally {
      this.setLoading(false);
    }
  }

  async sendToLLM(message, webhookData = null) {
    // Use existing webhookData if provided to avoid re-calling the webhook
    try {
      let data = webhookData;
      if (!data) {
        data = await postToWebhook({ text: message, sessionId: this.sessionId });
      }

      // If still no usable data, bail out
      if (!data || (typeof data === 'object' && data.ok === false && !data.data && !data.output && !data.parsedOutput && !data.rawText)) {
        console.debug('sendToLLM: no usable webhook data', data);
        return null;
      }

      // Try to extract response text from various possible fields (prioritized)
      let responseText = null;

      // Top-level explicit fields
      if (data.response) responseText = data.response;
      else if (data.reply) responseText = data.reply;
      else if (data.message) responseText = data.message;
      else if (data.text) responseText = data.text;

      // parsedOutput object/string
      else if (data.parsedOutput) {
        if (typeof data.parsedOutput === 'string') {
          responseText = data.parsedOutput;
        } else {
          responseText =
            data.parsedOutput.before_message ||
            data.parsedOutput.reply ||
            data.parsedOutput.response ||
            data.parsedOutput.output ||
            data.parsedOutput.message ||
            null;
        }
      }

      // output top-level (string)
      else if (data.output && typeof data.output === 'string') {
        responseText = data.output;
      }

      // rawText fallback (webhook returned non-JSON plain text earlier)
      else if (data.rawText && typeof data.rawText === 'string') {
        responseText = data.rawText;
      }

      // products -> generate a short user-friendly string
      else if (data.products && data.products.length > 0) {
        responseText = `Found ${data.products.length} product(s) for you!`;
      }

      if (!responseText) {
        console.warn('⚠️ Could not extract response text from webhook data:', data);
        return null;
      }

      console.log('✓ Extracted response text:', String(responseText).substring(0, 200));
      return responseText;
    } catch (err) {
      console.warn('❌ sendToLLM error', err);
      return null;
    }
  }


  addMessage(role, content) {
    // For assistant messages, detect markdown image/link syntax and raw image URLs
    // so we can render inline images/anchors while preserving surrounding text.
    if (role === 'assistant') {
      const asStr = String(content || '');
      const mdImageRegex = /!\[([^\]]*)\]\s*\(\s*(https?:\/\/[^\s)]+)\s*\)/ig;
      const mdLinkRegex = /\[([^\]]+)\]\s*\(\s*(https?:\/\/[^\s)]+)\s*\)/ig;
      const rawImgUrlRegex = /https?:\/\/[^\s\"'<>]+\.(png|jpe?g|gif|webp|svg)(\?.*)?/ig;
      // Support bracketed image syntax like: [Image: https://...jpg] or [image: https://...]
      const bracketImageRegex = /\[\s*(?:Image|image)\s*:\s*(https?:\/\/[^\]\s]+)\s*\]/ig;

      // Perform replacements first (avoid using .test on global regexes which is stateful)
      // Add a CDN-specific regex to catch long Shopify CDN URLs that may be wrapped
      const cdnShopifyRegex = /https?:\/\/cdn\.shopify\.com\/[^\s"'<>\)]+/ig;

      let html = asStr
        .replace(mdImageRegex, (m, alt, url) => {
          const safeUrl = String(url).replace(/^[\("'\s]+|[\)"'\s]+$/g, '');
          return `<img src="${safeUrl}" alt="${this.escapeText(alt || 'image')}" style="max-width:100%;height:auto;border-radius:8px;display:block;margin:8px 0;">`;
        })
        .replace(mdLinkRegex, (m, text, url) => {
          const safeUrl = String(url).replace(/^[\("'\s]+|[\)"'\s]+$/g, '');
          return `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer">${this.escapeText(text)}</a>`;
        })
        .replace(rawImgUrlRegex, (m) => {
          const safeUrl = String(m).replace(/^[\("'\s]+|[\)"'\s]+$/g, '');
          return `<img src="${safeUrl}" alt="product image" style="max-width:100%;height:auto;border-radius:8px;display:block;margin:8px 0;">`;
        });
      // Replace bracketed [Image: url] occurrences as well
      html = html.replace(bracketImageRegex, (m, url) => {
        const safeUrl = String(url).replace(/^[\("'\s]+|[\)"'\s]+$/g, '');
        return `<img src="${safeUrl}" alt="product image" style="max-width:100%;height:auto;border-radius:8px;display:block;margin:8px 0;">`;
      });

      // Also replace explicit Shopify CDN links (sometimes long, wrapped or parenthesized)
      html = html.replace(cdnShopifyRegex, (m) => {
        const safeUrl = String(m).replace(/^[\("'\s]+|[\)"'\s]+$/g, '');
        return `<img src="${safeUrl}" alt="product image" style="max-width:100%;height:auto;border-radius:8px;display:block;margin:8px 0;">`;
      });

      if ( asStr) {
        console.debug('Converted assistant message to HTML (image/link detected):', html);
        this.addHtmlMessage(role, html);
        return;
      } else {
        // Debug: show why we didn't convert (helpful for troubleshooting broken URLs)
        try {
          const hasCdn = /https?:\/\/cdn\.shopify\.com\//i.test(asStr);
          const hasImgExt = /\.(png|jpe?g|gif|webp|svg)(\?.*)?$/i.test(asStr.trim());
          console.debug('No conversion performed for assistant message. hasCdn:', hasCdn, 'hasImgExtAtEnd:', hasImgExt, 'preview:', asStr.substring(0,200));
        } catch (e) {}
      }
    }
    //try to respond with the exsisting elements and give out a response 
    const messageDiv = document.createElement("div");
    messageDiv.className = `message ${role}`;

    const messageContent = document.createElement("div");
    messageContent.className = "message-content";
    messageContent.textContent = content;

    const messageTime = document.createElement("div");
    messageTime.className = "message-time";
    messageTime.textContent = this._getCurrentTime();

    messageDiv.appendChild(messageContent);
    messageDiv.appendChild(messageTime);

    if (this.chatMessages) {
      this.chatMessages.appendChild(messageDiv);
      this._scrollToBottomAsync();
    }
  }

  addHtmlMessage(role, html) {
    const messageDiv = document.createElement("div");
    messageDiv.className = `message ${role}`;

    const messageContent = document.createElement("div");
    messageContent.className = "message-content";
    messageContent.innerHTML = html;

    const messageTime = document.createElement("div");
    messageTime.className = "message-time";
    messageTime.textContent = this._getCurrentTime();

    messageDiv.appendChild(messageContent);
    messageDiv.appendChild(messageTime);

    if (this.chatMessages) {
      this.chatMessages.appendChild(messageDiv);
      this._scrollToBottomAsync();
    }
  }

  showTypingIndicator() {
    if (!this.chatMessages) return;
    if (this.chatMessages.querySelector(".typing-message")) return;
    const typingDiv = document.createElement("div");
    typingDiv.className = "message assistant typing-message";
    typingDiv.innerHTML = `
      <div class="message-content typing-indicator">
        <span></span><span></span><span></span>
      </div>
    `;
    this.chatMessages.appendChild(typingDiv);
    this._scrollToBottomAsync();
  }

  hideTypingIndicator() {
    if (!this.chatMessages) return;
    const el = this.chatMessages.querySelector(".typing-message");
    if (el) el.remove();
  }

  _getCurrentTime() {
    return new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  _scrollToBottomAsync() {
    setTimeout(() => {
      if (this.chatMessages)
        this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
    }, 80);
  }

  setLoading(val) {
    this.isLoading = !!val;
    if (this.sendButton) this.sendButton.disabled = !!val;
    if (this.chatInput) this.chatInput.disabled = !!val;
    if (this.loadingSpinner) {
      if (val)
        this.loadingSpinner.classList.remove("hidden");
      else this.loadingSpinner.classList.add("hidden");
    }
  }

  async loadChatHistory() {
    try {
      // Use localStorage for history to avoid server dependency
      const raw = localStorage.getItem(`cb_history_${this.sessionId}`);
      if (!raw) return;
      const history = JSON.parse(raw) || [];
      history.forEach((msg) => {
        if (msg.role === 'user') this.addMessage('user', msg.content);
        else this.addMessage('assistant', msg.content);
      });
    } catch (err) {
      console.warn('loadChatHistory failed', err);
    }
  }

  async loadStoreDomain() {
    try {
      // Derive store domain from current location to avoid server call
      this.storeDomain = window.location.host;
    } catch (err) {
      // ignore
    }
  }

  isProductQuery(msg) {
    if (!msg) return false;
    const q = msg.trim().toLowerCase();

    // If it starts with a question word, treat it as a conversational question (not a product search)
    const questionWords = ["why", "what", "how", "when", "where", "who", "did", "does", "do", "is", "are", "was", "were"];
    for (const w of questionWords) {
      if (q.startsWith(w + " ") || q === w) return false;
    }

    // Look for exsisting database 
    // Look for explicit product-search verbs (with optional "me" or product descriptor).
    // This reduces false-positive matches from nouns alone.
    const productVerbs = [
      "show me",
      "show",
      "find me",
      "find",
      "search for",
      "search",
      "list",
      "browse",
      "search products",
      "show products",
      "show item",
      "show items"
    ];

    for (const v of productVerbs) {
      if (q.includes(v)) {
        // guard: if it's a short question like "show?" ignore
        if (q.length <= v.length + 1) return false;
        return true;
      }
    }

    // Additional heuristic: "I want" or "looking for" -> product intent
    if (/\b(i want|i'd like|i would like|looking for|need|want|buy)\b/.test(q)) return true;

    return false;
  }


  async handleProductQuery(message) {
    try {
      // First, ask the webhook for a structured response (may include before_message, products, after_message)
      try {
        const webhookFull = await postToWebhook({ text: message, sessionId: this.sessionId });
        const parsed = webhookFull && webhookFull.parsedOutput ? webhookFull.parsedOutput : null;
        if (parsed && (parsed.before_message || parsed.after_message || (webhookFull.products && webhookFull.products.length))) {
          // Render structured response: before_message -> products -> after_message
          if (webhookFull && webhookFull.products && webhookFull.products.length > 0) {
            this.displayProducts(webhookFull.products, parsed.before_message || 'I found these products:', parsed.after_message);
          } else if (parsed.before_message || parsed.after_message) {
            const combined = [parsed.before_message, parsed.after_message].filter(Boolean).join('\n\n');
            this.addMessage('assistant', this.escapeText(combined));
          }
          this.hideTypingIndicator();
          return;
        }
      } catch (e) {
        // ignore and continue to pipeline
        console.debug('webhook structured product attempt failed', e && e.message ? e.message : e);
      }

      // Try semantic vector search first (via Node proxy -> vector-services)
      const semantic = await this.searchProductsSemantic(message);
      let products = semantic && semantic.length ? semantic : [];

      // Then try LLM-driven extraction
      if (!products.length) {
        const llmProducts = await this.searchProductsLLM(message);
        products = llmProducts && llmProducts.length ? llmProducts : products;
      }

      if (!products.length) {
        // fallback to direct Shopify keyword search
        const direct = await this.searchProductsDirect(message);
        products = direct && direct.length ? direct : products;
      }

      this.hideTypingIndicator();

      if (!products || products.length === 0) {
        this.addMessage(
          "assistant",
          "I could not find matching products. Try different keywords."
        );
        return;
      }
      // Display products with default header (early webhook attempt already handled structured responses)
      this.displayProducts(products.slice(0, 8), 'I found these products:');
    } catch (err) {
      console.error("handleProductQuery error", err);
      this.hideTypingIndicator();
      this.addMessage("assistant", "There was an error fetching products.");
    }
  }

  // New: semantic search via external webhook
  async searchProductsSemantic(query) {
    try {
      const data = await postToWebhook({ text: query });
      if (!data) return [];
      if (Array.isArray(data.products) && data.products.length) return data.products;
      if (Array.isArray(data.results) && data.results.length) return data.results;
      if (Array.isArray(data)) return data;
      return [];
    } catch (err) {
      console.warn('searchProductsSemantic webhook failed', err);
      return [];
    }
  }

  async searchProductsLLM(query) {
    try {
      const data = await postToWebhook({ text: query });
      if (!data) return [];
      return data.products || data.results || [];
    } catch (err) {
      console.warn('searchProductsLLM webhook failed', err);
      return [];
    }
  }

  async searchProductsDirect(query) {
    try {
      const data = await postToWebhook({ text: query });
      if (!data) return [];
      if (Array.isArray(data.products)) return data.products;
      if (Array.isArray(data.results)) return data.results.map(r => ({
        product_id: r.product_id || r.id || null,
        title: r.title || r.name || '',
        handle: r.handle || '',
        description: r.description || '',
        tags: Array.isArray(r.tags) ? r.tags : [],
        featuredImage: (r.featuredImage && { url: r.featuredImage.url, altText: r.featuredImage.altText }) || (r.image ? { url: r.image } : null),
        variants: (r.variants && Array.isArray(r.variants) ? r.variants : []),
        priceRange: r.priceRange || undefined,
        _vector_meta: { score: r.score, certainty: r.certainty, raw: r }
      }));
      if (Array.isArray(data)) return data;
      return [];
    } catch (err) {
      console.warn('searchProductsDirect webhook failed', err);
      return [];
    }
  }

  async getProducts() {
    try {
      const res = await fetch(`${this.apiBaseUrl}/api/shopify/products`, {
        method: "GET",  
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Basic dGVzdDpzdW12ZWM=' },
      });
      if (!res.ok) return [];
      const data = await res.json();
      if (Array.isArray(data.products)) return data.products;
      const edges = data?.data?.products?.edges || [];
      return edges.map((e) => e.node || {});
    } catch (err) {
      console.warn("getProducts failed", err);
      return [];
    }
  }

  // Render an array of products into the chat with optional header and after-message
  displayProducts(products = [], headerText = 'I found these products:', afterMessage = null) {
    if (!products || !products.length) return;

    const itemsHtml = products.slice(0, 8)
      .map((p) => { 
        const rawTitle = p.title || p.name || p.handle || p.product_id || 'Untitled';
        const title = this.escapeText(rawTitle);
        const handle = p.handle || "";
        const price =
          (p.variants && p.variants[0] && p.variants[0].price) ||
          (p.priceRange &&
            p.priceRange.minVariantPrice &&
            p.priceRange.minVariantPrice.amount) ||
          "";
        const currency =
          (p.variants && p.variants[0] && p.variants[0].currency) ||
          (p.priceRange &&
            p.priceRange.minVariantPrice &&
            p.priceRange.minVariantPrice.currencyCode) ||
          "";
        const img = resolveImageFromProduct(p) || (p.image && (typeof p.image === 'string' ? p.image : (p.image.url || null))) || (p.featuredImage && (typeof p.featuredImage === 'string' ? p.featuredImage : (p.featuredImage.url || null))) || '';
        const href = this.buildProductUrl(handle);
        // const variantId = p.variants && p.variants[0] && p.variants[0].id;
        const variantId = p?.id
        const addButton = variantId
          ? `<button class="cb-add" data-variant="${variantId}" 
               style="color:var(--cb-primary,#667eea);
               text-decoration:none;font-size:13px;
               background:#f0f4ff;padding:2px 6px;border-radius:4px;
               display:inline-block;transition:all 0.2s;border:none;cursor:pointer;">
               Add to Cart</button>`
            : "";
        const imgHtml = img
          ? `<img src="${img}" alt="${title}" 
               style="width:72px;height:72px;object-fit:cover;
               border-radius:6px;margin-right:8px">`
          : "";
        const priceText = price ? ` - ${currency} ${price}` : "";
        return `
          <div class="cb-product">
              ${imgHtml}
              <div style="flex:1">
                <div style="font-weight:600">${title}${priceText}</div>
                <div style="margin-top:6px">
                  <a href="${href}" target="_blank" 
                     rel="noopener noreferrer" 
                     style="color:var(--cb-primary,#667eea);
                     text-decoration:none;margin-right:8px">View</a>
                  ${addButton}
                </div>
              </div>
            </div>
        `;
      })
      .join("");

    let html = `<div style="font-weight:600;margin-bottom:6px">${this.escapeText(headerText)}</div>` + itemsHtml;
    if (afterMessage) {
      const afterHtml = this._convertInlineMedia(afterMessage);
      html += `<div style="margin-top:8px;color:#6b7280;font-size:13px">${afterHtml}</div>`;
    }
    this.addHtmlMessage("assistant", html);

    setTimeout(() => {
      Array.from(
        this.chatMessages.querySelectorAll(".cb-add")
      ).forEach((btn) => {
        btn.onclick = async (e) => {
          const target = e.currentTarget;
          const variant = target.getAttribute("data-variant");
          if (!variant) {
            this.addMessage(
              "assistant",
              "This product cannot be added automatically."
            );
            return;
          }
          // Call wrapper so we explicitly log the action and pass the button element for UI state
          const added = await this.onAddToCartClicked(variant, 1, target);
          if (added) this.addMessage("assistant", "Added to cart!");
          else this.addMessage("assistant", "Failed to add to cart.");
        };
      });
    }, 200);
  }

  async addVariantToCart(variantGidOrId, quantity = 1) {
    try {
      let numeric = variantGidOrId;
      if (typeof variantGidOrId === "string" && variantGidOrId.includes("/")) {
        const parts = variantGidOrId.split("/");
        numeric = parts[parts.length - 1];
      }
      const resp = await fetch("/cart/add.js", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: numeric, quantity }),
      });
      if (!resp.ok) {
        const txt = await resp.text().catch(() => "");
        console.warn("cart add error", resp.status, txt);
        return false;
      }
      return true;
    } catch (err) {
      console.warn("addVariantToCart failed", err);
      return false;
    }
  }

  // Wrapper called by UI when Add to Cart is clicked — logs then calls addVariantToCart
  async onAddToCartClicked(variantGidOrId, quantity = 1, btn = null) {
    let prevHtml = null;
    try {
      console.log('onAddToCartClicked called with variant:', variantGidOrId, 'quantity:', quantity, 'button:', btn);

      // show global loading UI and disable the clicked button (if provided)
      this.setLoading(true);
      if (btn && typeof btn !== 'string') {
        try {
          btn.disabled = true;
          prevHtml = btn.innerHTML;
          btn.innerHTML = 'Adding...';
        } catch (e) {
          // ignore DOM errors
        }
      }

      // Normalize variant to numeric id (same logic as addVariantToCart)
      let numeric = variantGidOrId;
      if (typeof variantGidOrId === 'string' && variantGidOrId.includes('/')) {
        const parts = variantGidOrId.split('/');
        numeric = parts[parts.length - 1];
      }

      // First: send intent to webhook (matches screenshot): "add id:<id> to my cart"
      try {
        const webhookPayload = { text: `add ${numeric} to my cart`, sessionId: this.sessionId };
        console.log('Posting add-to-cart intent to webhook:', webhookPayload.text);
        const webhookResp = await postToWebhook(webhookPayload);
        console.log('Webhook add-to-cart response:', webhookResp);

        // Try to extract a friendly message from the webhook response
        let webhookMessage = null;
        if (webhookResp) {
          if (webhookResp.parsedOutput && typeof webhookResp.parsedOutput === 'object') {
            webhookMessage = webhookResp.parsedOutput.before_message || webhookResp.parsedOutput.output || webhookResp.parsedOutput.message || null;
          }
          if (!webhookMessage && typeof webhookResp.output === 'string') webhookMessage = webhookResp.output;
          if (!webhookMessage && webhookResp.response) webhookMessage = webhookResp.response;
        }
        if (webhookMessage) {
          // If the webhook returned raw HTML (e.g. a checkout link), render it as HTML
          const asStr = String(webhookMessage);
          // Special-case: some webhooks return a non-standard <href>URL</href> wrapper
          const hrefTagMatch = asStr.match(/<href>(.*?)<\/href>/i);
          if (hrefTagMatch && hrefTagMatch[1]) {
            const url = hrefTagMatch[1].trim();
            const anchor = `<a href="${url}" target="_blank" rel="noopener noreferrer">Proceed to Checkout</a>`;
                          const mdImageRegex = /!\[([^\]]*)\]\s*\(\s*(https?:\/\/[^\s)]+)\s*\)/ig;

            // Replace the <href>...</href> tag in the original message so surrounding text is preserved
            const replaced = asStr.replace(/<href>(.*?)<\/href>/ig, anchor).replace(mdImageRegex, (m, alt, url) => {
                  const safeUrl = String(url).replace(/^[\("'\s]+|[\)"'\s]+$/g, '');
                  return `<img src="${safeUrl}" alt="${this.escapeText(alt || 'image')}" style="max-width:100%;height:auto;border-radius:8px;display:block;margin:8px 0; box-sizing: content-box;">`;
                });

            this.addHtmlMessage('assistant', replaced);
          } else {
            const looksLikeHtml = /<a\s+href=|<button|<img|<div|<span/.test(asStr.toLowerCase());
            if (looksLikeHtml) {
              const mdImageRegex = /!\[([^\]]*)\]\s*\(\s*(https?:\/\/[^\s)]+)\s*\)/ig;
              const replaced=asStr.replace(mdImageRegex, (m, alt, url) => {
                  const safeUrl = String(url).replace(/^[\("'\s]+|[\)"'\s]+$/g, '');
                  return `<img src="${safeUrl}" alt="${this.escapeText(alt || 'image')}" style="max-width:100%;height:auto;border-radius:8px;display:block;margin:8px 0; box-sizing: content-box;">`;
                })
              this.addHtmlMessage('assistant', replaced);
            } else {
              // Support Markdown image/link syntax and raw image URLs (allow optional spaces)
              const mdImageRegex = /!\[([^\]]*)\]\s*\(\s*(https?:\/\/[^\s)]+)\s*\)/ig;
              const mdLinkRegex = /\[([^\]]+)\]\s*\(\s*(https?:\/\/[^\s)]+)\s*\)/ig;
              // Support bracketed image syntax like: [Image: https://...jpg]
              const bracketImageRegex = /\[\s*(?:Image|image)\s*:\s*(https?:\/\/[^\]\s]+)\s*\]/ig;
              // Perform replacements first (avoid .test on global regexes)
              let replaced = asStr
                .replace(mdImageRegex, (m, alt, url) => {
                  const safeUrl = String(url).replace(/^[\("'\s]+|[\)"'\s]+$/g, '');
                  return `<img src="${safeUrl}" alt="${this.escapeText(alt || 'image')}" style="max-width:100%;height:auto;border-radius:8px;display:block;margin:8px 0;">`;
                })
                .replace(mdLinkRegex, (m, text, url) => {
                  const safeUrl = String(url).replace(/^[\("'\s]+|[\)"'\s]+$/g, '');
                  return `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer">${this.escapeText(text)}</a>`;
                });
              // Replace [Image: url] style occurrences
              replaced = replaced.replace(bracketImageRegex, (m, url) => {
                const safeUrl = String(url).replace(/^[\("'\s]+|[\)"'\s]+$/g, '');
                return `<img src="${safeUrl}" alt="product image" style="max-width:100%;height:auto;border-radius:8px;display:block;margin:8px 0;">`;
              });
              // Also replace raw image URLs
              replaced = replaced.replace(/https?:\/\/[^\s"'<>]+\.(png|jpe?g|gif|webp|svg)(\?.*)?/ig, (m) => {
                const safeUrl = String(m).replace(/^[\("'\s]+|[\)"'\s]+$/g, '');
                return `<img src="${safeUrl}" alt="product image" style="max-width:100%;height:auto;border-radius:8px;display:block;margin:8px 0;">`;
              });

              if (replaced !== asStr) {
                console.debug('Converted webhook add-to-cart message to HTML:', replaced);
                this.addHtmlMessage('assistant', replaced);
              } else {
                try {
                  const hasCdn = /https?:\/\/cdn\.shopify\.com\//i.test(asStr);
                  console.debug('Webhook add-to-cart: no replacement performed. hasCdn:', hasCdn, 'preview:', asStr.substring(0,200));
                } catch (e) {}
                // If the message contains a raw URL, convert it to a clickable link or image
                const rawUrlMatch = asStr.match(/https?:\/\/[^\s"'<>\)]+/i);
                if (rawUrlMatch) {
                  let url = rawUrlMatch[0];
                  // Trim wrapping parentheses or quotes
                  const cleanUrl = url.replace(/^[\("'\s]+|[\)"'\s]+$/g, '');
                  const imgExt = /\.(png|jpe?g|gif|webp|svg)(\?.*)?$/i;
                  if (imgExt.test(cleanUrl)) {
                    // Replace URL with an inline image tag, preserving surrounding text
                    const imgTag = `<img src="${cleanUrl}" alt="product image" style="max-width:100%;height:auto;border-radius:8px;display:block;margin:8px 0;">`;
                    const replaced = asStr.replace(url, imgTag);
                    this.addHtmlMessage('assistant', replaced);
                  } else {
                    const anchor = `<a href="${cleanUrl}" target="_blank" rel="noopener noreferrer">${cleanUrl}</a>`;
                    // preserve any surrounding text by replacing the URL with the anchor
                    const replaced = asStr.replace(url, anchor);
                    this.addHtmlMessage('assistant', replaced);
                  }
                } else {
                  // plain text -> escape
                  this.addMessage('assistant', asStr);
                }
              }
            }
          }
          return true;
        }
      } catch (err) {
        console.warn('Webhook add-to-cart call failed:', err);
      }

      // Fallback: try directly adding to storefront cart
      const result = await this.addVariantToCart(numeric, quantity);
      console.log('addVariantToCart result for', numeric, ':', result);
      return result;
    } catch (err) {
      console.warn('onAddToCartClicked error', err);
      return false;
    } finally {
      // restore UI state
      try {
        if (btn && typeof btn !== 'string') {
          btn.disabled = false;
          if (prevHtml !== null) btn.innerHTML = prevHtml;
        }
      } catch (e) {}
      this.setLoading(false);
    }
  }

  buildProductUrl(handle) {
    if (!handle)  return "#";
    const domain = this.storeDomain || window.location.host;
    const withProto =
      domain.startsWith("http://") || domain.startsWith("https://")
        ? domain
        : `https://${domain}`;
    return `${withProto.replace(/\/+$/, "")}/products/${encodeURIComponent(
      handle
    )}`;
  }


  escapeText(s) {
    return (s || "").replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "'" }[
        c
      ])

    );
  }

  _convertInlineMedia(text) {
    const asStr = String(text || '');
    // Reconstruct any broken Shopify CDN URLs first
    const input = this._reconstructShopifyCdnUrls(asStr);
    const mdImageRegex = /!\[([^\]]*)\]\s*\(\s*(https?:\/\/[^\s)]+)\s*\)/ig;
    const mdLinkRegex = /\[([^\]]+)\]\s*\(\s*(https?:\/\/[^\s)]+)\s*\)/ig;
    const bracketImageRegex = /\[\s*(?:Image|image)\s*:\s*(https?:\/\/[^\]\s]+)\s*\]/ig;
    const rawImgUrlRegex = /https?:\/\/[^\s\"'<>]+\.(png|jpe?g|gif|webp|svg)(\?.*)?/ig;

    // Perform replacements on reconstructed input
    let html = input
      .replace(mdImageRegex, (m, alt, url) => {
        const safeUrl = String(url).replace(/^[\("'\s]+|[\)"'\s]+$/g, '');
        return `<img src="${safeUrl}" alt="${this.escapeText(alt || 'image')}" style="max-width:100%;height:auto;border-radius:8px;display:block;margin:8px 0;">`;
      })
      .replace(mdLinkRegex, (m, text, url) => {
        const safeUrl = String(url).replace(/^[\("'\s]+|[\)"'\s]+$/g, '');
        return `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer">${this.escapeText(text)}</a>`;
      })
      .replace(rawImgUrlRegex, (m) => {
        const safeUrl = String(m).replace(/^[\("'\s]+|[\)"'\s]+$/g, '');
        return `<img src="${safeUrl}" alt="product image" style="max-width:100%;height:auto;border-radius:8px;display:block;margin:8px 0;">`;
      });

    html = html.replace(bracketImageRegex, (m, url) => {
      const safeUrl = String(url).replace(/^[\("'\s]+|[\)"'\s]+$/g, '');
      return `<img src="${safeUrl}" alt="product image" style="max-width:100%;height:auto;border-radius:8px;display:block;margin:8px 0;">`;
    });

    // If no conversion happened, return escaped reconstructed input
    if (html === input) return this.escapeText(input);
    return html;
  }

  _reconstructShopifyCdnUrls(text) {
    if (!text) return text;
    const s = String(text);
    // Find occurrences of the cdn.shopify.com prefix and try to capture until an image extension
    return s.replace(/https?:\/\/cdn\.shopify\.com[\s\S]{0,1000}/ig, (match) => {
      const imgMatch = match.match(/(https?:\/\/cdn\.shopify\.com[\s\S]*?(?:png|jpe?g|gif|webp|svg)(?:\?[^\s\)]*)?)/i);
      if (imgMatch && imgMatch[1]) {
        // Remove any whitespace/newlines accidentally inserted inside the URL
        return imgMatch[1].replace(/\s+/g, '');
      }
      return match;
    });
  }

  // Add unmount method to remove markup and potential listeners
  unmount() {
    // Remove chat markup and also any global event listeners if added
    const root = document.getElementById("cb-root"); 
    if (root && root.parentNode) root.parentNode.removeChild(root);


    // Clear element references to avoid memory leaks
    this.chatToggle = null;
    this.chatWindow = null;
    this.chatClose = null;
    this.chatMessages = null;
    this.chatInput = null;
    this.sendButton = null;
    this.loadingSpinner = null;

  }
}

// Image helper: normalize and resolve common product image shapes
function normalizeImageUrl(raw) {
  if (!raw) return null;
  try {
    let url = String(raw).trim();
      // restore UI state
      try {
        if (btn && typeof btn !== 'string') {
          btn.disabled = false;
          if (prevHtml !== null) btn.innerHTML = prevHtml;
        }
      } catch (e) {}
      this.setLoading(false);
    if (url.startsWith('//')) url = window.location.protocol + url;
    // avoid mixed-content: upgrade http -> https when page is secure
    if (window.location.protocol === 'https:' && url.startsWith('http:')) {
      url = 'https:' + url.slice(5);
    }
    return url;
  } catch (e) {
    return null;
  }
}

function resolveImageFromProduct(p) {
  if (!p) return null;
  const candidates = [];
  if (typeof p === 'string') candidates.push(p);
  if (p.featuredImage) {
    if (typeof p.featuredImage === 'string') candidates.push(p.featuredImage);
    else if (p.featuredImage.url) candidates.push(p.featuredImage.url);
  }
  if (p.featured_image) candidates.push(p.featured_image);
  if (p.image) candidates.push(p.image);
  if (p.featuredImageUrl) candidates.push(p.featuredImageUrl);
  if (p.featured_image_url) candidates.push(p.featured_image_url);
  if (p.url) candidates.push(p.url);
  if (p.images && Array.isArray(p.images) && p.images.length) {
    const first = p.images[0];
    if (first && typeof first === 'string') candidates.push(first);
    if (first && first.src) candidates.push(first.src);
  }
  if (p.image && typeof p.image === 'object') {
    if (p.image.src) candidates.push(p.image.src);
  }

  for (const c of candidates) {
    const n = normalizeImageUrl(c);
    if (n) return n;
  }
  return null;
}

// Initialize after DOM ready with removable handler
function chatBubbleInitHandler() {
  window.chatBubble = window.chatBubble || new ChatBubble();
}
document.addEventListener("DOMContentLoaded", chatBubbleInitHandler);
window.chatBubbleInitHandler = chatBubbleInitHandler;

// Global unmount function to remove chat and listener
window.unmountChatBubble = function() {
  if (window.chatBubble && typeof window.chatBubble.unmount === 'function') {
    window.chatBubble.unmount();
    window.chatBubble = null;
  }
  if (window.chatBubbleInitHandler) {
    document.removeEventListener("DOMContentLoaded", window.chatBubbleInitHandler);
    window.chatBubbleInitHandler = null;
  }
};
window.ChatBubble = ChatBubble;
