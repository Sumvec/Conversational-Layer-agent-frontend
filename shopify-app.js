// shopify-app.js — Chat bubble frontend loader for Shopify (compatible with original shape)
// Lines: ~316

(function() {
  'use strict';

  // default configuration — override by setting window.ChatBubbleConfig before this script runs
  const DEFAULT_CONFIG = {
    apiUrl: 'http://localhost:3000', // change to ngrok / production URL
    theme: 'modern',
    position: 'bottom-right',
    autoOpen: false,
    welcomeMessage: "Hi! I'm your AI assistant. How can I help you today?",
    primaryColor: '#667eea',
    secondaryColor: '#764ba2'
  };

  // merge config (window.ChatBubbleConfig may be set by host)
  const CHAT_BUBBLE_CONFIG = Object.assign({}, DEFAULT_CONFIG, window.ChatBubbleConfig || {});
  // normalize apiUrl (remove trailing slash)
  CHAT_BUBBLE_CONFIG.apiUrl = (CHAT_BUBBLE_CONFIG.apiUrl || '').replace(/\/+$/, '') || DEFAULT_CONFIG.apiUrl;

  // expose to global so app.js can read it
  window.ChatBubbleConfig = CHAT_BUBBLE_CONFIG;

  // Avoid double-loading
  if (window.__chatBubble_loader_loaded) {
    console.debug('shopify-app.js: loader already loaded');
    return;
  }

  function loadChatBubble() {
    if (window.chatBubbleLoaded) return;

    // Load CSS
    const cssHref = `${CHAT_BUBBLE_CONFIG.apiUrl}/styles.css`;
    if (!document.querySelector(`link[href="${cssHref}"]`)) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = cssHref;
      link.onerror = () => console.error('Failed to load chat bubble CSS from', cssHref);
      document.head.appendChild(link);
    }

    // Load JS bundle
    const scriptSrc = `${CHAT_BUBBLE_CONFIG.apiUrl}/app.js`;
    if (!document.querySelector(`script[src="${scriptSrc}"]`)) {
      const s = document.createElement('script');
      s.src = scriptSrc;
      s.async = true;
      s.onload = initializeChatBubble;
      s.onerror = () => console.error('Failed to load chat bubble UI script from', scriptSrc);
      document.head.appendChild(s);
    } else {
      // if already present, try to initialize
      initializeChatBubble();
    }
  }

  function initializeChatBubble() {
    // If ChatBubble class isn't present yet, wait a bit (app.js might be still parsing)
    if (typeof ChatBubble === 'undefined' && !window.chatBubble) {
      // try again shortly
      setTimeout(() => {
        if (typeof ChatBubble === 'undefined' && !window.chatBubble) {
          console.error('ChatBubble class not found — ensure app.js exposes ChatBubble (window.ChatBubble)');
          return;
        }
        instantiateAndWire();
      }, 250);
      return;
    }
    instantiateAndWire();
  }

  function instantiateAndWire() {
    try {
      if (!window.chatBubble) {
        // instantiate ChatBubble (if available)
        if (typeof ChatBubble === 'function') {
          window.chatBubble = new ChatBubble();
        } else {
          console.warn('ChatBubble constructor not found; assuming app.js created window.chatBubble automatically.');
          window.chatBubble = window.chatBubble || {};
        }
      }

      // ensure apiBase is set on instance
      if (window.chatBubble) {
        try { window.chatBubble.apiBaseUrl = CHAT_BUBBLE_CONFIG.apiUrl; } catch (e) { /* ignore */ }
      }

      addShopifyFeatures();
      applyThemeConfiguration();

      if (CHAT_BUBBLE_CONFIG.autoOpen && window.chatBubble && typeof window.chatBubble.openChat === 'function') {
        setTimeout(() => {
          try { window.chatBubble.openChat(); } catch (e) {}
        }, 1500);
      }

      window.chatBubbleLoaded = true;
      window.__chatBubble_loader_loaded = true;
      console.info('Chat bubble initialized — API base:', CHAT_BUBBLE_CONFIG.apiUrl);
    } catch (err) {
      console.error('Failed to initialize chat bubble:', err);
    }
  }

  function addShopifyFeatures() {
    // product-detection keywords
    const productKeywords = ['product','products','shirt','pants','dress','buy','price','show','find','add to cart','size','color','available','stock'];

    function isProductQuery(message) {
      if (!message) return false;
      const lower = message.toLowerCase();
      return productKeywords.some(k => lower.includes(k));
    }

    function isCartQuery(message) {
      if (!message) return false;
      const lower = message.toLowerCase();
      return ['add to cart', 'checkout', 'cart', 'buy now', 'purchase'].some(k => lower.includes(k));
    }

    // guard: ensure chatBubble exists
    if (!window.chatBubble) {
      console.warn('addShopifyFeatures: window.chatBubble not found');
      return;
    }

    // attach helpers if not present
    if (!window.chatBubble.sendToLLMChat) {
      window.chatBubble.sendToLLMChat = async function(message, sessionId = 'default') {
        try {
          const resp = await fetch(`${this.apiBaseUrl}/api/chat/llm`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message, sessionId })
          });
          if (!resp.ok) { console.error('LLM chat HTTP error', resp.status); return null; }
          const data = await resp.json();
          return data.response || null;
        } catch (err) {
          console.error('LLM chat error', err);
          return null;
        }
      };
    }

    if (!window.chatBubble.searchProductsLLM) {
      window.chatBubble.searchProductsLLM = async function(message) {
        try {
          const resp = await fetch(`${this.apiBaseUrl}/api/chat/llm_search`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message })
          });
          if (!resp.ok) { console.error('AI search HTTP error', resp.status); return []; }
          const data = await resp.json();
          return data.products || [];
        } catch (err) {
          console.error('AI-driven search error', err);
          return [];
        }
      };
    }

    if (!window.chatBubble.searchProductsDirect) {
      window.chatBubble.searchProductsDirect = async function(query) {
        try {
          const resp = await fetch(`${this.apiBaseUrl}/api/shopify/products/search?q=${encodeURIComponent(query)}`);
          if (!resp.ok) { console.error('Direct search HTTP error', resp.status); return []; }
          const data = await resp.json();
          if (Array.isArray(data.products)) return data.products;
          const edges = data?.data?.products?.edges || [];
          return edges.map(e => e.node || {});
        } catch (err) {
          console.error('Direct search error', err);
          return [];
        }
      };
    }

    if (!window.chatBubble.addVariantToCart) {
      window.chatBubble.addVariantToCart = async function(variantGid, quantity = 1) {
        try {
          let numeric = variantGid;
          if (typeof variantGid === 'string' && variantGid.includes('/')) {
            const parts = variantGid.split('/');
            numeric = parts[parts.length - 1];
          }
          const resp = await fetch('/cart/add.js', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: numeric, quantity })
          });
          if (!resp.ok) {
            console.error('Add to cart failed', await resp.text().catch(() => ''));
            return false;
          }
          await resp.json().catch(() => {});
          return true;
        } catch (err) {
          console.error('Add to cart error', err);
          return false;
        }
      };
    }

    // Override or wrap sendMessage on the chatBubble instance so product/cart queries route properly
    if (window.chatBubble && typeof window.chatBubble.sendMessage === 'function') {
      const originalSend = window.chatBubble.sendMessage.bind(window.chatBubble);
      window.chatBubble.sendMessage = async function() {
        const message = (this.chatInput && this.chatInput.value) ? this.chatInput.value.trim() : '';
        if (!message) return;

        // Product queries handled by llm_search pipeline
        if (isProductQuery(message)) {
          try {
            this.addMessage('user', message);
          } catch (e) {}
          try {
            if (this.chatInput) this.chatInput.value = '';
            this.setLoading(true);
            this.showTypingIndicator();

            const products = await this.searchProductsLLM(message);
            let results = products;
            if (!results || results.length === 0) {
              // fallback to direct keyword search
              const fallback = await this.searchProductsDirect(message);
              results = fallback && fallback.length ? fallback : [];
            }

            this.hideTypingIndicator();

            if (!results || results.length === 0) {
              try { this.addMessage('assistant', 'I couldnt find matching products. Try different keywords.'); } catch(e){}
              return;
            }

            // Render product cards (basic HTML)
            const html = results.slice(0,6).map(p => {
              const title = p.title || 'Untitled';
              const handle = p.handle || '';
              const img = p.featuredImage?.url || '';
              const variant = p.variants?.[0] || {};
              const price = variant.price || p.priceRange?.minVariantPrice?.amount || '';
              const currency = variant.currency || p.priceRange?.minVariantPrice?.currencyCode || '';
              const productUrl = `https://${(Shopify?.shop || window.location.host)}/products/${handle}`;
              const variantAttr = variant.id ? `data-variant="${variant.id}"` : '';
              return `
                <div class="chat-product-card" style="display:flex;gap:10px;align-items:flex-start;margin:8px 0;">
                  ${img ? `<img src="${img}" alt="${title}" style="width:72px;height:72px;object-fit:cover;border-radius:8px;">` : ''}
                  <div style="flex:1;">
                    <div style="font-weight:600;margin-bottom:6px;">${escapeHtml(title)}</div>
                    <div style="font-size:13px;color:#444;margin-bottom:6px;">${price} ${currency}</div>
                    <div style="display:flex;gap:8px;">
                      <a href="${productUrl}" target="_blank" style="color:${CHAT_BUBBLE_CONFIG.primaryColor};text-decoration:none;font-size:13px;">View</a>
                      <button class="cb-add-to-cart" ${variantAttr} style="background:${CHAT_BUBBLE_CONFIG.primaryColor};color:#fff;border:none;padding:6px 8px;border-radius:6px;cursor:pointer;font-size:13px;">Add to cart</button>
                    </div>
                  </div>
                </div>
              `;
            }).join('<hr style="border:0.5px solid #eee;margin:8px 0;">');

            try { this.addMessage('assistant', `<div style="font-weight:600;margin-bottom:8px;">I found these products:</div>${html}`); } catch(e){}

            // Attach click handlers to add-to-cart buttons
            setTimeout(() => {
              document.querySelectorAll('.cb-add-to-cart').forEach(btn => {
                btn.onclick = async (ev) => {
                  const variantId = ev.currentTarget.getAttribute('data-variant');
                  if (!variantId) {
                    try { this.addMessage('assistant', 'Sorry, that item cannot be added to cart automatically.'); } catch(e){}
                    return;
                  }
                  const added = await this.addVariantToCart(variantId, 1);
                  if (added) try { this.addMessage('assistant', 'Added to cart!'); } catch(e){} else try { this.addMessage('assistant', 'Failed to add to cart.'); } catch(e){}
                };
              });
            }, 250);

          } catch (err) {
            console.error('Product routing error', err);
            try { this.hideTypingIndicator(); this.setLoading(false); this.addMessage('assistant', 'Sorry, I had trouble finding products.'); } catch(e){}
          } finally {
            try { this.hideTypingIndicator(); this.setLoading(false); } catch(e){}
          }
          return;
        }

        // Cart queries (simple flows)
        if (isCartQuery(message)) {
          try { this.addMessage('user', message); } catch(e){}
          if (this.chatInput) this.chatInput.value = '';
          try { this.setLoading(true); this.showTypingIndicator(); } catch(e){}
          try {
            if (message.toLowerCase().includes('add to cart')) {
              try { this.addMessage('assistant', 'Tell me the product name and quantity and I can add it for you.'); } catch(e){}
            } else if (message.toLowerCase().includes('checkout')) {
              try { this.addMessage('assistant', 'You can proceed to checkout from your cart page. Would you like me to show you the cart?'); } catch(e){}
            } else {
              try { this.addMessage('assistant', 'I can help with cart and checkout tasks. What would you like to do?'); } catch(e){}
            }
          } catch (err) {
            console.error('cart handler error', err);
            try { this.addMessage('assistant', "Sorry, I couldn't process your cart request."); } catch(e){}
          } finally {
            try { this.hideTypingIndicator(); this.setLoading(false); } catch(e){}
          }
          return;
        }

        // Default: general chat via LLM endpoint
        try {
          const assistantResp = await this.sendToLLMChat(message);
          if (assistantResp) try { this.addMessage('assistant', assistantResp); } catch(e){}
          if (this.chatInput) this.chatInput.value = '';
        } catch (err) {
          console.error('Fallback LLM chat error', err);
          try { this.addMessage('assistant', "Sorry — I couldn't reach the assistant right now."); } catch(e){}
        }
      };
    }
  }

  function applyThemeConfiguration() {
    const style = document.createElement('style');
    style.textContent = `
      .chat-product-card { display:flex; align-items:center; gap:10px; }
      .chat-product-card img { border-radius:8px; }
      .chat-toggle, .chat-header, .message.user .message-content, .send-button {
        background: linear-gradient(135deg, ${CHAT_BUBBLE_CONFIG.primaryColor} 0%, ${CHAT_BUBBLE_CONFIG.secondaryColor} 100%);
      }
    `;
    document.head.appendChild(style);
  }

  // small helper: escape HTML inside template strings
  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, (s) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
  }

  // initialization: wait for DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadChatBubble);
  } else {
    loadChatBubble();
  }

  // expose config globally
  window.ChatBubbleConfig = CHAT_BUBBLE_CONFIG;

})();
