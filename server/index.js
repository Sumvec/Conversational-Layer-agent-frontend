// server/index.js
// Full server that uses server/prompts.js for LLM prompts (CommonJS)

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const axios = require('axios');
require('dotenv').config();

const prompts = require('./prompts');
// weaviate integration removed — handled by separate service
// const weaviateUtils = require('./weaviate');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({ origin: true, credentials: true }));
app.use(bodyParser.json());
app.use(express.static('public'));
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', req.get('origin') || '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  next();
});

// Config
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.1:latest';
const SHOP = process.env.SHOPIFY_STORE_DOMAIN || process.env.SHOPIFY_SHOP_DOMAIN || process.env.DOMAIN;
const STOREFRONT_TOKEN = process.env.SHOPIFY_STOREFRONT_ACCESS_TOKEN;
const API_VERSION = process.env.SHOPIFY_API_VERSION || '2024-10';

// New: external python services configuration
const HF_EMBED_URL = process.env.HF_EMBED_URL || 'http://localhost:7000';
const VECTOR_SERVICE_URL = process.env.VECTOR_SERVICE_URL || 'http://localhost:8000';
const VECTOR_SHOP_ID = process.env.VECTOR_SHOP_ID || SHOP || '';
const VECTOR_API_KEY = process.env.VECTOR_API_KEY || process.env.VECTOR_SERVICE_API_KEY || '';

console.log('🚀 Server starting');
console.log('   🏬 Shopify Domain:', SHOP);
console.log('   🔑 Storefront Token:', STOREFRONT_TOKEN ? '✅ Set' : '❌ Missing');
console.log('   💬 Ollama Model:', OLLAMA_MODEL);
console.log('   🌐 Ollama Base URL:', OLLAMA_BASE_URL);
console.log('   🧠 HF Embed URL:', HF_EMBED_URL);
console.log('   📡 Vector Service URL:', VECTOR_SERVICE_URL);

// In-memory chat history
const chatHistory = new Map();

async function shopifyStorefrontGraphQL(query, variables = {}) {
  if (!SHOP || !STOREFRONT_TOKEN) throw new Error('Shopify configuration missing');
  const url = `https://${SHOP}/api/${API_VERSION}/graphql.json`;
  console.log('🔗 Shopify GraphQL call:', url);
  const resp = await axios.post(url, { query, variables }, {
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Storefront-Access-Token': STOREFRONT_TOKEN
    },
    timeout: 20000
  });
  if (resp.data?.errors) {
    console.error('⚠️ Shopify returned errors:', resp.data.errors);
    throw new Error('Shopify GraphQL error');
  }
  return resp.data;
}

// Health
app.get('/health', (req, res) => res.json({ status: 'OK', ts: new Date().toISOString() }));

app.get('/debug/shopify/test', async (req, res) => {
  try {
    const r = await shopifyStorefrontGraphQL('{ shop { name } }');
    res.json({ ok: true, data: r });
  } catch (e) {
    console.error('DEBUG SHOP ERROR', e.message || e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Frontend helpers
app.get('/api/chat/:sessionId', (req, res) => {
  const sessionId = req.params.sessionId;
  const history = chatHistory.get(sessionId) || [];
  console.log(`📥 GET /api/chat/${sessionId} → ${history.length} messages`);
  res.json({ history });
});

app.get('/api/shopify/store', (req, res) => {
  res.json({ storeDomain: SHOP || req.get('host') });
});

// General chat route (uses prompts.buildChatPrompt)
app.post('/api/chat/llm', async (req, res) => {
  try {
    const { message, sessionId = 'default' } = req.body;
    if (!message) return res.status(400).json({ error: 'Message is required' });

    console.log(`💬 /api/chat/llm [${sessionId}] User:`, message);

    const history = chatHistory.get(sessionId) || [];
    const prompt = prompts.buildChatPrompt(message, history);

    // Using generate endpoint (if your Ollama supports /api/chat you can change accordingly)
    const response = await axios.post(`${OLLAMA_BASE_URL}/api/generate`, {
      model: OLLAMA_MODEL,
      prompt,
      stream: false
    }, { headers: { 'Content-Type': 'application/json' }, timeout: 20000 });

    const reply = response.data?.response || response.data?.message?.content || 'Sorry, I could not process that.';
    console.log('🤖 Assistant reply (truncated):', reply.substring(0, 200));

    // Save history limited to last 50 messages
    const newHist = [...history, { role: 'user', content: message }, { role: 'assistant', content: reply }];
    chatHistory.set(sessionId, newHist.slice(-50));

    res.json({ response: reply });
  } catch (err) {
    console.error('❌ /api/chat/llm error:', err.response?.data || err.message || err);
    res.status(500).json({ error: 'LLM chat failed', details: err.message || err });
  }
});

// Products list
app.get('/api/shopify/products', async (req, res) => {
  try {
    console.log('📦 /api/shopify/products - fetching');
    const first = Math.min(parseInt(req.query.first || '25', 10), 250);
    const data = await shopifyStorefrontGraphQL(`
      query Products($first: Int!) {
        products(first: $first) {
          edges {
            node {
              id title description handle productType:productType featuredImage { url altText }
              priceRange { minVariantPrice { amount currencyCode } }
              variants(first: 5) { edges { node { id priceV2 { amount currencyCode } } } }
            }
          }
        }
      }
    `, { first });

    const edges = data?.data?.products?.edges || [];
    const products = edges.map(e => {
      const node = e.node || {};
      node.product_type = node.productType || node.product_type || '';
      node.variants = (node.variants?.edges || []).map(v => {
        const vn = v.node || {};
        if (vn.priceV2) { vn.price = parseFloat(vn.priceV2.amount); vn.currency = vn.priceV2.currencyCode; }
        return vn;
      });
      if (node.priceRange?.minVariantPrice?.amount) node.minVariantPrice = parseFloat(node.priceRange.minVariantPrice.amount);
      return node;
    });

    const valid = products.filter(p => p.description && p.description.trim().length > 0);
    console.log(`✅ /api/shopify/products → fetched ${products.length}, with description ${valid.length}`);
    res.json({ products: valid });
  } catch (err) {
    console.error('❌ /api/shopify/products error:', err.message || err);
    res.status(500).json({ error: 'Failed to fetch products', details: err.message || err });
  }
});

// LLM-driven product search (uses prompts.buildIntentPrompt)
app.post('/api/chat/llm_search', async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'Message is required' });

    console.log(`🧠 LLM-driven search request: "${message}"`);

    const prompt = prompts.buildIntentPrompt(message);

    let llmResp;
    try {
      llmResp = await axios.post(`${OLLAMA_BASE_URL}/api/generate`, {
        model: OLLAMA_MODEL,
        prompt,
        stream: false,
        temperature: 0.0
      }, { headers: { 'Content-Type': 'application/json' }, timeout: 20000 });
    } catch (err) {
      console.warn('⚠️ LLM generate call failed:', err.message || err);
      llmResp = { data: { response: '{}' } };
    }

    const raw = (llmResp.data?.response || llmResp.data?.output || '').toString().trim();
    console.log('🧩 Raw LLM output (first 800 chars):', raw.length > 800 ? raw.substring(0,800) + '...' : raw);

    // Clean and extract first JSON object
    const cleaned = raw.replace(/```(?:json)?/gi, '').trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    let intentData = null;
    if (jsonMatch) {
      const jsonText = jsonMatch[0];
      try {
        intentData = JSON.parse(jsonText);
        console.log('✅ Parsed intent JSON from LLM:', intentData);
      } catch (parseErr) {
        console.warn('⚠️ JSON.parse failed on LLM block:', parseErr.message);
        intentData = null;
      }
    } else {
      console.warn('⚠️ No JSON block found in LLM output.');
    }

    // Fallback heuristic extraction if LLM parse fails
    if (!intentData) {
      console.log('🔁 Falling back to heuristic intent extraction.');
      const stopWords = new Set(['can','you','show','me','some','a','an','the','please','find','want','see','with','and','for','in','on','of']);
      const tokens = message.toLowerCase().replace(/[^a-z0-9\s₹₨₹.,]/g, ' ').split(/\s+/).filter(Boolean);
      const keywords = tokens.filter(t => t.length > 2 && !stopWords.has(t));

      let price_min = null, price_max = null, currency = null;
      const mUnder = message.match(/(?:under|below|less than|<)\s*([₹₹₨RsRs.,\d]+)/i);
      const mOver = message.match(/(?:over|above|more than|>)\s*([₹₹₨RsRs.,\d]+)/i);
      const anyNum = message.match(/([₹₹₨RsRs.,]?\d{2,}(?:[.,]\d{1,2})?)/);

      if (mUnder) price_max = parseInt(mUnder[1].replace(/[^\d]/g,''), 10);
      if (mOver) price_min = parseInt(mOver[1].replace(/[^\d]/g,''), 10);
      if (/rupee|rupees|\brs\b|₹/i.test(message)) currency = 'INR';
      if (!price_min && !price_max && anyNum) price_max = parseInt(anyNum[1].replace(/[^\d]/g,''), 10);

      intentData = { intent: 'product_search', keywords, filters: {} };
      if (price_min) intentData.filters.price_min = price_min;
      if (price_max) intentData.filters.price_max = price_max;
      if (currency) intentData.filters.currency = currency;

      // detect color and gender heuristics from keywords if not present
      const colorList = ['red','blue','black','white','green','yellow','pink','purple','brown','grey','gray','orange','maroon','navy','beige','teal','olive','gold','silver'];
      for (const k of keywords) {
        if (!intentData.filters.color && colorList.includes(k)) intentData.filters.color = k;
        if (!intentData.filters.gender && ['men','men\'s','mens','male','man'].includes(k)) intentData.filters.gender = 'male';
        if (!intentData.filters.gender && ['women','women\'s','womens','female','lady','ladies'].includes(k)) intentData.filters.gender = 'female';
      }

      console.log('✅ Fallback intentData:', intentData);
    }

    // Build terms (include singulars)
    const rawTerms = (Array.isArray(intentData.keywords) && intentData.keywords.length) ? intentData.keywords.slice() : message.toLowerCase().split(/\s+/).filter(Boolean);
    const termsSet = new Set();
    rawTerms.forEach(t => {
      if (!t) return;
      const w = t.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (!w) return;
      termsSet.add(w);
      if (w.length > 3 && w.endsWith('s')) termsSet.add(w.slice(0,-1));
    });
    const terms = Array.from(termsSet);
    console.log('🔎 Search terms (with singulars):', terms);

    // Build Shopify query per-term
    const perTermClauses = terms.map(t => {
      const safe = t.replace(/["']/g,'');
      return `(title:*${safe}* OR handle:*${safe}* OR tag:*${safe}* OR product_type:*${safe}*)`;
    });
    const shopifyQuery = perTermClauses.join(' OR ') || message;
    console.log('🔍 Shopify query built:', shopifyQuery);

    // Fetch candidates
    const first = Math.min(parseInt(req.query.first || '100', 10), 250);
    const shopData = await shopifyStorefrontGraphQL(`
      query SearchProducts($first: Int!, $query: String!) {
        products(first: $first, query: $query) {
          edges {
            node {
              id title handle description productType:productType featuredImage { url altText }
              priceRange { minVariantPrice { amount currencyCode } }
              variants(first: 5) { edges { node { id priceV2 { amount currencyCode } } } }
            }
          }
        }
      }`, { first, query: shopifyQuery });

    const edges = shopData?.data?.products?.edges || [];
    let products = edges.map(e => {
      const node = e.node || {};
      node.product_type = node.productType || node.product_type || '';
      node.variants = (node.variants?.edges || []).map(v => {
        const vn = v.node || {};
        if (vn.priceV2) { vn.price = parseFloat(vn.priceV2.amount); vn.currency = vn.priceV2.currencyCode; }
        return vn;
      });
      if (node.priceRange?.minVariantPrice?.amount) node.minVariantPrice = parseFloat(node.priceRange.minVariantPrice.amount);
      return node;
    });

    console.log(`📥 Retrieved ${products.length} candidate(s) from Shopify.`);

    // Term presence filter
    const loweredTerms = terms.map(t => t.toLowerCase());
    let filtered = products.filter(p => {
      const title = (p.title || '').toLowerCase();
      const desc = (p.description || '').toLowerCase();
      const handle = (p.handle || '').toLowerCase();
      return loweredTerms.some(t => title.includes(t) || desc.includes(t) || handle.includes(t));
    });

    console.log(`🔎 After basic term filter: ${filtered.length} products`);

    // Color preference
    const colorFromIntent = intentData.filters?.color ? String(intentData.filters.color).toLowerCase() : null;
    if (colorFromIntent) {
      const color = colorFromIntent.toLowerCase();
      const colorMatches = [];
      const others = [];
      filtered.forEach(p => {
        const title = (p.title || '').toLowerCase();
        const desc = (p.description || '').toLowerCase();
        const handle = (p.handle || '').toLowerCase();
        const tagsString = ((p.tags && p.tags.join(' ')) || '').toLowerCase();
        const productType = (p.product_type || '').toLowerCase();
        const found = title.includes(color) || desc.includes(color) || handle.includes(color) || tagsString.includes(color) || productType.includes(color);
        if (found) colorMatches.push(p); else others.push(p);
      });
      console.log(`🔴 Color matches: ${colorMatches.length}, other matches: ${others.length}`);
      const strictColorMatch = false;
      filtered = strictColorMatch ? colorMatches : [...colorMatches, ...others];
    }

    // Gender preference
    let genderFromIntent = intentData.filters?.gender ? String(intentData.filters.gender).toLowerCase() : null;
    if (!genderFromIntent && Array.isArray(intentData.keywords)) {
      for (const k of intentData.keywords) {
        const kl = String(k).toLowerCase();
        if (['men','mens','men\'s','male','man'].includes(kl)) { genderFromIntent = 'male'; break; }
        if (['women','womens','women\'s','female','lady','ladies'].includes(kl)) { genderFromIntent = 'female'; break; }
        if (['unisex','all'].includes(kl)) { genderFromIntent = 'unisex'; break; }
      }
    }

    if (genderFromIntent) {
      const gender = genderFromIntent.toLowerCase();
      const genderMatches = [];
      const others = [];
      filtered.forEach(p => {
        const title = (p.title || '').toLowerCase();
        const desc = (p.description || '').toLowerCase();
        const handle = (p.handle || '').toLowerCase();
        const tagsString = ((p.tags && p.tags.join(' ')) || '').toLowerCase();
        const productType = (p.product_type || '').toLowerCase();
        let found = false;
        if (gender === 'male') {
          const maleWords = ['men','man','mens','male','boy'];
          if (maleWords.some(w => title.includes(w) || desc.includes(w) || handle.includes(w) || tagsString.includes(w) || productType.includes(w))) found = true;
        } else if (gender === 'female') {
          const femaleWords = ['women','woman','womens','female','lady','ladies','girl'];
          if (femaleWords.some(w => title.includes(w) || desc.includes(w) || handle.includes(w) || tagsString.includes(w) || productType.includes(w))) found = true;
        } else if (gender === 'unisex') {
          if (['unisex','all'].some(w => title.includes(w) || desc.includes(w) || handle.includes(w) || tagsString.includes(w) || productType.includes(w))) found = true;
        }
        if (found) genderMatches.push(p); else others.push(p);
      });
      console.log(`🔴 Gender matches: ${genderMatches.length}, other matches: ${others.length}`);
      const strictGenderMatch = false;
      filtered = strictGenderMatch ? genderMatches : [...genderMatches, ...others];
    }

    // Numeric price filters
    const price_min = intentData.filters?.price_min != null ? Number(intentData.filters.price_min) : null;
    const price_max = intentData.filters?.price_max != null ? Number(intentData.filters.price_max) : null;
    if (price_min != null || price_max != null) {
      console.log(`🔢 Applying numeric price filters: min=${price_min}, max=${price_max}`);
      filtered = filtered.filter(p => {
        const variantPrice = (p.variants && p.variants[0] && p.variants[0].price) ? Number(p.variants[0].price) : (p.minVariantPrice || null);
        if (variantPrice == null) return false;
        if (price_min != null && variantPrice < price_min) return false;
        if (price_max != null && variantPrice > price_max) return false;
        return true;
      });
    }

    // Ensure descriptions present
    filtered = filtered.filter(p => p.description && p.description.trim().length > 0);
    console.log(`🛍️ Final matched products (with description): ${filtered.length}`);

    res.json({ intent: intentData, products: filtered });
  } catch (err) {
    console.error('❌ /api/chat/llm_search error:', err.response?.data || err.message || err);
    res.status(500).json({ error: 'LLM-driven search failed', details: err.message || err });
  }
});

// Proxy: Embeddings endpoint -> forwards to hf-embed-service /embed
app.post('/api/embeddings', async (req, res) => {
  try {
    const body = req.body || {};
    // Ensure body.texts is present as array
    if (!Array.isArray(body.texts) || body.texts.length === 0) {
      return res.status(400).json({ error: 'Request must include "texts": ["..."]' });
    }
    const resp = await axios.post(`${HF_EMBED_URL.replace(/\/+$/,'')}/embed`, body, { headers: { 'Content-Type': 'application/json' }, timeout: 20000 });
    return res.json(resp.data);
  } catch (err) {
    console.error('❌ /api/embeddings proxy error', err.response?.data || err.message || err);
    return res.status(500).json({ error: 'Embedding service error', details: err.message || err });
  }
});

// Proxy: Vector search -> forwards to vector-services /search/products
app.get('/api/vector/search', async (req, res) => {
  try {
    const query = req.query.query || '';
    if (!query) return res.status(400).json({ error: 'query parameter is required' });

    const params = {
      query,
      limit: req.query.limit || 20,
      offset: req.query.offset || 0,
      min_score: req.query.min_score || undefined
    };

    const headers = {
      'x-shop-id': VECTOR_SHOP_ID,
      'x-api-key': VECTOR_API_KEY
    };

    const resp = await axios.get(`${VECTOR_SERVICE_URL.replace(/\/+$/,'')}/api/v1/search/products`, { params, headers, timeout: 20000 });

    // Return the vector service response as-is so frontend can decide how to use it
    return res.json(resp.data);
  } catch (err) {
    console.error('❌ /api/vector/search proxy error', err.response?.data || err.message || err);
    return res.status(500).json({ error: 'Vector search error', details: err.message || err });
  }
});

// Simple health checks for the proxied services
app.get('/api/health/embed', async (req, res) => {
  try {
    const resp = await axios.get(`${HF_EMBED_URL.replace(/\/+$/,'')}/health`, { timeout: 5000 });
    return res.json({ ok: true, service: 'hf-embed', upstream: resp.data });
  } catch (err) {
    return res.status(502).json({ ok: false, service: 'hf-embed', error: err.message || err });
  }
});

app.get('/api/health/vector', async (req, res) => {
  try {
    const resp = await axios.get(`${VECTOR_SERVICE_URL.replace(/\/+$/,'')}/health`, { timeout: 5000 });
    return res.json({ ok: true, service: 'vector-service', upstream: resp.data });
  } catch (err) {
    return res.status(502).json({ ok: false, service: 'vector-service', error: err.message || err });
  }
});

// Start
app.listen(PORT, () => {
  console.log(`💬 Chat Bubble Server running on http://localhost:${PORT}`);
  console.log(`⚙️ Health: http://localhost:${PORT}/health`);
});
