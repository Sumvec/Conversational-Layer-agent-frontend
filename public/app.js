// public/app.js
// Full fixed version (Option 2): uses #chatBubbleContainer to avoid window variable conflict.

// const VECTOR_WEBHOOK_URL = 'https://sage.sumvec.com/n8n/webhook/54d7b928-24cf-40a5-b7dc-21ca07900d9a';
const VECTOR_WEBHOOK_URL = process.env.VECTOR_WEBHOOK_URL;
// import './styles.css';

async function postToWebhook(payload) {
  try {
    // Normalize payload to match Postman: { text: '...'}
    const body = { text: payload && (payload.text || payload.message || payload.query || '') };
    if (payload && payload.sessionId) body.sessionId = payload.sessionId;

    const res = await fetch(VECTOR_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      // log response body for debugging
      const text = await res.text().catch(() => '<no-body>');
      console.warn('Webhook HTTP error', res.status, text);
      return null;
    }
    let data = await res.json().catch(() => null);

    if (!data) {
      console.warn('Webhook returned empty response');
      return null;
    }

    console.log('🔄 Raw webhook response:', data);

    // Handle if response is an array (e.g., [{ output: "..." }])
    if (Array.isArray(data) && data.length > 0) {
      console.log('📌 Response is array, using first element');
      data = data[0];
    }

    // Parse output field if it's a string (may contain JSON or plain text)
    let parsedOutput = data.output;
    if (typeof parsedOutput === 'string') {
      try {
        // Look for JSON structure in the string (handles cases where output has preamble text)
        let jsonMatch = parsedOutput.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsedOutput = JSON.parse(jsonMatch[0]);
          console.log('📦 Extracted and parsed JSON from output string:', parsedOutput);
        } else {
          console.log('ℹ️ Output is plain text (no JSON found):', parsedOutput.substring(0, 100));
        }
      } catch (e) {
        // If parsing fails, try as-is
        console.warn('⚠️ Failed to parse output field:', e.message);
        // Keep original string
      }
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

    // Debug: show normalized products in console
    if (products.length > 0) {
      console.log('✓ Found', products.length, 'products');
    }

    // Return data with normalized products and parsed output
    return Object.assign({}, data || {}, { products, parsedOutput });
  } catch (err) {
    console.warn('Webhook call failed', err);
    return null;
  }
}

class ChatBubble {
  constructor() {
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
.chat-toggle { width: 60px; height: 60px; border-radius: 50%; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border: none; color: white; cursor: pointer; box-shadow: 0 4px 20px rgba(102, 126, 234, 0.4); transition: all 0.3s ease; display: flex; align-items: center; justify-content: center; z-index: 10000; }
.chat-toggle:hover { transform: scale(1.1); box-shadow: 0 6px 25px rgba(102, 126, 234, 0.6); }
.chat-toggle:active { transform: scale(0.95); }
/* Chat Window */
.chat-window {  bottom: 80px; right: 0; width: 380px; height: 500px; background: white; border-radius: 20px; box-shadow: 0 10px 40px rgba(0, 0, 0, 0.15); display: flex; flex-direction: column; overflow: hidden; border: 1px solid #e1e5e9; opacity: 1; transform: translateY(0) scale(1); transition: all 0.3s ease; }
.chat-window.hidden { opacity: 0; transform: translateY(20px) scale(0.9); pointer-events: none; }
/* Chat Header */
.chat-header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; display: flex; justify-content: space-between; align-items: center; }
.chat-title h3 { font-size: 18px; font-weight: 600; }
.status-indicator { width: 8px; height: 8px; border-radius: 50%; background: #4ade80; margin-left: 8px; animation: pulse 2s infinite; }
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
.chat-close { background: none; border: none; color: white; font-size: 24px; cursor: pointer; width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; }
.chat-close:hover { background-color: rgba(255, 255, 255, 0.2); }
/* Messages */
.chat-messages { flex: 1; padding: 20px; overflow-y: auto; background: #f8fafc; gap: 8px; display: flex; flex-direction: column; }
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
.cb-product .cb-actions { margin-top: 8px; display: flex; gap: 8px; align-items: center; }
.cb-product .cb-price { color: #374151; font-weight: 600; font-size: 13px; }
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
    document.head.appendChild(style);
  }

  _loadOrGenerateSessionId() {
    const saved = localStorage.getItem("cb_session_id");
    if (saved) return saved;
    const id =
      "chat_" +
      Date.now() +
      "_" +
      Math.random().toString(36).substr(2, 9);
    localStorage.setItem("cb_session_id", id);
    return id;
  }

  // Only inject markup if HTML doesn't already contain chatBubbleContainer
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
        const webhookData = await postToWebhook({ text: message, sessionId: this.sessionId });
        const response = await this.sendToLLM(message);
        this.hideTypingIndicator();

        // If webhook returned structured parsedOutput prefer that flow: before_message -> products -> after_message
        const po = webhookData && webhookData.parsedOutput ? webhookData.parsedOutput : null;
        console.debug('webhookData:', webhookData, 'parsedOutput:', po);
        if (po && (po.before_message || (webhookData && webhookData.products && webhookData.products.length) || po.after_message)) {
          // Use the before_message as the header for product rendering when available
          if (webhookData && webhookData.products && webhookData.products.length > 0) {
            const header = po.before_message ? po.before_message : 'I found these products:';
            console.log('📦 Displaying', webhookData.products.length, 'products from webhook with header:', header);
            this.displayProducts(webhookData.products, header, po.after_message);
          } else if (po.before_message || po.after_message) {
            // No products but we have before/after messages -> render single assistant bubble
            const combined = [po.before_message, po.after_message].filter(Boolean).join('\n\n');
            this.addMessage("assistant", this.escapeText(combined));
          }
        } else if (response) {
          // Fallback: show the linear response and any products
          this.addMessage("assistant", this.escapeText(response));
          if (webhookData && webhookData.products && webhookData.products.length > 0) {
            console.log('📦 Displaying', webhookData.products.length, 'products from webhook');
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

  async sendToLLM(message) {
    // Use webhook with { text } payload (webhook handles chat/LLM)
    try {
      const data = await postToWebhook({ text: message, sessionId: this.sessionId });
      if (!data) return null;

      // Try to extract response text from various possible fields
      let responseText = null;

      // Priority 1: Check for explicit response/reply/message fields at top level
      if (data.response) {
        responseText = data.response;
      } else if (data.reply) {
        responseText = data.reply;
      } else if (data.message) {
        responseText = data.message;
      } else if (data.text) {
        responseText = data.text;
      }

      // Priority 2: Check inside parsed output (structured response with before_message, products, etc.)
      else if (data.parsedOutput) {
        if (typeof data.parsedOutput === 'string') {
          responseText = data.parsedOutput;
        } else {
          // For structured responses, prefer before_message (intro for product searches)
          if (data.parsedOutput.before_message) {
            responseText = data.parsedOutput.before_message;
          } else if (data.parsedOutput.reply) {
            responseText = data.parsedOutput.reply;
          } else if (data.parsedOutput.response) {
            responseText = data.parsedOutput.response;
          } else if (data.parsedOutput.output) {
            responseText = data.parsedOutput.output;
          } else if (data.parsedOutput.message) {
            responseText = data.parsedOutput.message;
          }
        }
      }

      // Priority 3: Check output field directly (plain string)
      else if (data.output && typeof data.output === 'string') {
        responseText = data.output;
      }

      // Priority 4: If we have products but no message, generate one
      else if (data.products && data.products.length > 0) {
        responseText = `Found ${data.products.length} product(s) for you!`;
      }

      if (!responseText) {
        console.warn('⚠️ Could not extract response text from webhook data:', data);
        return null;
      }

      console.log('✓ Extracted response text:', responseText.substring(0, 100));
      return responseText;
    } catch (err) {
      console.warn('❌ sendToLLM webhook error', err);
      return null;
    }
  }

  addMessage(role, content) {
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
    const q = msg.toLowerCase();
    const keywords = [
      "find","search","show","product","items","catalog",
      "shoes","shirt","shirts","dress","pants","buy",
      "price","size","color","under","below","less"
    ];
    return keywords.some((k) => q.includes(k));
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
      const res = await fetch(`${this.apiBaseUrl}/api/shopify/products`);
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
        const addButton =
          p.variants &&
          p.variants[0] &&
          p.variants[0].id
            ? `<button class="cb-add" data-variant="${p.variants[0].id}" 
               style="background:var(--cb-primary,#667eea);color:#fff;border:none;
               padding:6px 8px;border-radius:6px;cursor:pointer;margin-left:8px">
               Add</button>`
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
            <div style="flex:1; min-width:0">
              <div class="cb-title">${title}${priceText}</div>
              <div class="cb-actions">
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
      html += `<div style="margin-top:8px;color:#6b7280;font-size:13px">${this.escapeText(afterMessage)}</div>`;
    }
    this.addHtmlMessage("assistant", html);

    setTimeout(() => {
      Array.from(
        this.chatMessages.querySelectorAll(".cb-add")
      ).forEach((btn) => {
        btn.onclick = async (e) => {
          const variant = e.currentTarget.getAttribute("data-variant");
          if (!variant) {
            this.addMessage(
              "assistant",
              "This product cannot be added automatically."
            );
            return;
          }
          const added = await this.addVariantToCart(variant, 1);
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

  buildProductUrl(handle) {
    if (!handle) return "#";
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

  // Add unmount method to remove markup and potential listeners
  unmount() {
    // Remove chat markup
    const root = document.getElementById("cb-root"); console.log('gaurav in unmount')
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
    if (!url) return null;
    // protocol-relative
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
  console.log('gaurav 1')
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
