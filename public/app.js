// public/app.js
// Full fixed version (Option 2): uses #chatBubbleContainer to avoid window variable conflict.

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

    // Setup UI + listeners
    this._ensureMarkup();
    this._bindElements();
    this._attachListeners();

    // Initialize content
    this.loadChatHistory();
    this.loadStoreDomain();
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
        <button id="chatToggle" class="chat-toggle" aria-label="Open chat">💬</button>
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
              <textarea id="chatInput" class="cb-input" placeholder="Ask a question or search for products..." rows="1"></textarea>
              <button id="sendButton" class="send-button" title="Send">➤</button>
            </div>
          </div>
        </div>
      </div>
      <div id="loadingSpinner" class="loading-spinner hidden"><div class="spinner"></div></div>
    `;
    document.body.appendChild(root);
  }

  _bindElements() {
    this.chatToggle = document.getElementById("chatToggle");
    this.chatWindow = document.getElementById("chatWindow");
    this.chatClose = document.getElementById("chatClose");
    this.chatMessages = document.getElementById("chatMessages");
    this.chatInput = document.getElementById("chatInput");
    this.sendButton = document.getElementById("sendButton");
    this.loadingSpinner = document.getElementById("loadingSpinner");
  }

  _attachListeners() {
    if (this.chatToggle)
      this.chatToggle.addEventListener("click", () => this.toggleChat());
    if (this.chatClose)
      this.chatClose.addEventListener("click", () => this.closeChat());
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
      this.chatInput.focus();
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
        const response = await this.sendToLLM(message);
        this.hideTypingIndicator();
        if (response)
          this.addMessage("assistant", this.escapeText(response));
        else this.addMessage("assistant", "No response from assistant.");
      }
    } catch (err) {
      console.error("sendMessage error", err);
      this.hideTypingIndicator();
      this.addMessage("assistant", "Sorry — something went wrong.");
    } finally {
      this.setLoading(false);
    }
  }

  async sendToLLM(message) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const res = await fetch(`${this.apiBaseUrl}/api/chat/llm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, sessionId: this.sessionId }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error("LLM HTTP error: " + res.status + " " + txt);
      }
      const data = await res.json();
      return data.response || data.message || null;
    } catch (err) {
      clearTimeout(timeout);
      if (err.name === "AbortError")
        throw new Error("LLM request timed out");
      throw err;
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
      const res = await fetch(
        `${this.apiBaseUrl}/api/chat/${encodeURIComponent(this.sessionId)}`
      );
      if (!res.ok) return;
      const data = await res.json();
      if (!data || !Array.isArray(data.history)) return;
      data.history.forEach((msg) => {
        if (msg.role === "user") this.addMessage("user", msg.content);
        else this.addMessage("assistant", msg.content);
      });
    } catch (err) {
      console.warn("loadChatHistory failed", err);
    }
  }

  async loadStoreDomain() {
    try {
      const res = await fetch(`${this.apiBaseUrl}/api/shopify/store`);
      if (!res.ok) return;
      const data = await res.json();
      if (data && data.storeDomain) this.storeDomain = data.storeDomain;
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
      // Prior implementation used a local Weaviate semantic search. Removed.

      // Try LLM-driven extraction first
      const llmProducts = await this.searchProductsLLM(message);
      let products = llmProducts && llmProducts.length ? llmProducts : [];

      if (!products.length) {
        // fallback to direct Shopify keyword search
        const direct = await this.searchProductsDirect(message);
        products = direct && direct.length ? direct : [];
      }

      this.hideTypingIndicator();

      if (!products || products.length === 0) {
        this.addMessage(
          "assistant",
          "I could not find matching products. Try different keywords."
        );
        return;
      }

      const itemsHtml = products.slice(0, 8)
        .map((p) => {
          const title = this.escapeText(p.title || "Untitled");
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
          const img =
            p.featuredImage && p.featuredImage.url ? p.featuredImage.url : "";
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

      const html =
        `<div style="font-weight:600;margin-bottom:6px">
         I found these products:</div>` + itemsHtml;
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
    } catch (err) {
      console.error("handleProductQuery error", err);
      this.hideTypingIndicator();
      this.addMessage("assistant", "There was an error fetching products.");
    }
  }

  async searchProductsLLM(query) {
    try {
      const res = await fetch(`${this.apiBaseUrl}/api/chat/llm_search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: query }),
      });
      if (!res.ok) return [];
      const data = await res.json();
      return data.products || [];
    } catch (err) {
      console.warn("searchProductsLLM failed", err);
      return [];
    }
  }

  async searchProductsDirect(query) {
    try {
      const res = await fetch(
        `${this.apiBaseUrl}/api/shopify/products/search?q=${encodeURIComponent(
          query
        )}`
      );
      if (!res.ok) return [];
      const data = await res.json();
      if (Array.isArray(data.products)) return data.products;
      const edges = data?.data?.products?.edges || [];
      return edges.map((e) => e.node || {});
    } catch (err) {
      console.warn("searchProductsDirect failed", err);
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
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[
        c
      ])
    );
  }
}

// Initialize after DOM ready
document.addEventListener("DOMContentLoaded", () => {
  window.chatBubble = window.chatBubble || new ChatBubble();
});
window.ChatBubble = ChatBubble;
