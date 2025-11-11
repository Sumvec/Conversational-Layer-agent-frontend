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
    if (p.image) candidates.push(p.image);
    if (p.featured_image) candidates.push(p.featured_image);
    if (p.featuredImageUrl) candidates.push(p.featuredImageUrl);
    if (p.featured_image_url) candidates.push(p.featured_image_url);
    if (p.url) candidates.push(p.url);
    if (p.images && Array.isArray(p.images) && p.images.length) {
      const first = p.images[0];
      if (first && typeof first === 'string') candidates.push(first);
      if (first && first.src) candidates.push(first.src);
    }
    if (p.image && typeof p.image === 'object') {
      // some payloads use { src: '...' }
      if (p.image.src) candidates.push(p.image.src);
    }

    for (const c of candidates) {
      const n = normalizeImageUrl(c);
      if (n) return n;
    }
    // no image found
    return null;
  }

  // Use external webhook only for chat/search
  const VECTOR_WEBHOOK_URL = 'https://sage.sumvec.com/n8n/webhook/search-vector';

  async function postToWebhook(payload) {
    try {
      const res = await fetch(VECTOR_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) { console.warn('Webhook HTTP error', res.status); return null; }
      const data = await res.json().catch(() => null);
      return data;
    } catch (err) {
      console.warn('Webhook call failed', err);
      return null;
    }
  }

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
          const data = await postToWebhook({ type: 'chat', message, sessionId });
          if (!data) return null;
          return data.response || data.reply || null;
        } catch (err) {
          console.error('LLM chat error', err);
          return null;
        }
      };
    }

    if (!window.chatBubble.searchProductsLLM) {
      window.chatBubble.searchProductsLLM = async function(message) {
        try {
          const data = await postToWebhook({ type: 'search', query: message });
          if (!data) { console.error('AI search HTTP error'); return []; }
          return data.products || data.results || [];
        } catch (err) {
          console.error('AI-driven search error', err);
          return [];
        }
      };
    }

    // New: semantic vector search via external webhook
    if (!window.chatBubble.searchProductsSemantic) {
      window.chatBubble.searchProductsSemantic = async function(message) {
        try {
          const data = await postToWebhook({ type: 'search', query: message });
          if (!data) { console.warn('Semantic search HTTP error'); return []; }
          // Accept multiple response shapes
          if (Array.isArray(data.products) && data.products.length) return data.products;
          if (Array.isArray(data.results) && data.results.length) return data.results;
          if (Array.isArray(data)) return data;
          return [];
        } catch (err) {
          console.error('Semantic search error', err);
          return [];
        }
      };
    }

    if (!window.chatBubble.searchProductsDirect) {
      // fallback: use webhook to fetch products
      window.chatBubble.searchProductsDirect = async function(query) {
        try {
          const data = await postToWebhook({ type: 'search', query });
          if (!data) { console.error('Direct search HTTP error'); return []; }
          if (Array.isArray(data.products)) return data.products;
          if (Array.isArray(data.results)) return data.results.map(r => ({
            id: r.product_id || r.id,
            title: r.title || r.name || '',
            handle: r.handle || '',
            description: r.description || '',
            featuredImage: r.image ? { url: r.image } : (r.featuredImage || null),
            variants: r.variants || []
          }));
          if (Array.isArray(data)) return data;
          return [];
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

        // Product queries handled by semantic -> llm -> direct pipeline
        if (isProductQuery(message)) {
          try {
            this.addMessage('user', message);
          } catch (e) {}
          try {
            if (this.chatInput) this.chatInput.value = '';
            this.setLoading(true);
            this.showTypingIndicator();

            // FIRST: semantic vector search
            let results = await this.searchProductsSemantic(message);

            // SECOND: LLM-driven search if semantic returned nothing
            if (!results || results.length === 0) {
              results = await this.searchProductsLLM(message);
            }

            // LAST: fallback to direct product list search
            if (!results || results.length === 0) {
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
              const img = resolveImageFromProduct(p) || '';
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
