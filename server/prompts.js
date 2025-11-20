// server/prompts.js
// Prompt builders for intent extraction, reranking and conversational chat.
// Designed to be required by server/index.js (CommonJS).

const EXAMPLES = {
  intent_examples: [
    {
      input: 'Show me red shirts under 1000 rupees',
      output: {
        
        intent: 'product_search',
        keywords: ['red', 'shirt'],
        filters: { price_min: null, price_max: 1000, currency: 'INR', color: 'red', gender: null, size: null },
        raw_query: 'Show me red shirts under 1000 rupees'
      }
    },
    {
      input: "I want men's blue jeans, size 32",
      output: {
        intent: 'product_search',
        keywords: ['blue', 'jeans'],
        filters: { gender: 'male', size: '32', price_min: null, price_max: null, currency: null, color: 'blue' },
        raw_query: "I want men's blue jeans, size 32"
      }
    },
    {
      input: 'Do you have a return policy?',
      output: {
        intent: 'general_query',
        keywords: ['return', 'policy'],
        filters: {},
        raw_query: 'Do you have a return policy?'
      }
    },
    {
      input: "Men's red shirts",
      output: {
        intent: 'product_search',
        keywords: ['red', 'shirt'],
        filters: { color: 'red', gender: 'male', price_min: null, price_max: null, currency: null, size: null },
        raw_query: "Men's red shirts"
      }
    },
    {
      input: "Men formal red shirts",
      output: {
        intent: 'product_search',
        keywords: ['men', 'formal', 'red', 'shirt'],
        filters: { color: 'red', gender: 'male', price_min: null, price_max: null, currency: null, size: null },
        raw_query: "Men formal red shirts"
      }
    },
    {
      input: "Looking for women's black dresses under 3000 INR",
      output: {
        intent: 'product_search',
        keywords: ['black', 'dress'],
        filters: { color: 'black', gender: 'female', price_min: null, price_max: 3000, currency: 'INR', size: null },
        raw_query: "Looking for women's black dresses under 3000 INR"
      }
    },
    {
      input: 'Recommend something similar to this blazer I liked',
      output: {
        intent: 'recommendation',
        keywords: ['blazer', 'similar'],
        filters: {},
        raw_query: 'Recommend something similar to this blazer I liked'
      }
    }
  ]
};

function sanitizeInputForPrompt(s) {
  if (!s) return '';
  return String(s)
    .replace(/\r/g, ' ')
    .replace(/[\u0000-\u001F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildIntentPrompt(userText) {
  const clean = sanitizeInputForPrompt(userText);
  const examplesText = EXAMPLES.intent_examples
    .map(ex => `Input: "${ex.input}"\nOutput:\n${JSON.stringify(ex.output)}`)
    .join('\n\n');

  return `
You are a strict assistant that MUST convert a customer's natural language request into a single JSON object describing intent and normalized filters.
Return ONLY valid JSON (a single JSON object) and nothing else — no code fences, no explanation, no extra text.

Rules:
- The JSON object must follow this exact shape:
{
  "intent": "product_search" | "recommendation" | "general_query" | null,
  "keywords": [ "keyword1", "keyword2", ... ],
  "filters": {
    "price_min": <integer|null>,
    "price_max": <integer|null>,
    "currency": <string|null>,     // ISO code when available (INR, USD)
    "color": <string|null>,        // single canonical color name if present
    "gender": <"male"|"female"|"unisex"|null>,
    "size": <string|null>
  },
  "raw_query": "<original text>"
}

Normalization rules (be conservative, prefer null when ambiguous):
- Numeric fields: return integers for price_min/price_max. If a range or words like "under 1000 rupees", interpret as price_max: 1000, currency: "INR".
- Gender: map variants to "male", "female", "unisex", or null. (e.g., "men's" -> "male", "women" -> "female")
- Color: return single canonical color if clear (e.g., "red", "blue", "black"). If multiple colors are requested, list the primary color mentioned.
- If query mentions "similar" or "like this", set intent to "recommendation".
- If the query is a non-product question (policy, shipping), set intent to "general_query" and leave filters empty.

Be conservative: produce null for numeric or optional fields if not explicitly mentioned.

Examples:
${examplesText}

Now process this input and return the single JSON object (no extra text):
"${clean}"
`;
}

function buildRerankPrompt(userText, candidates, requiredFilters = {}) {
  const clean = sanitizeInputForPrompt(userText);

  const candJson = JSON.stringify(
    candidates.map(p => ({
      handle: p.handle,
      title: p.title,
      description: p.description || '',
      price: p.minVariantPrice || p.variants?.[0]?.price || null,
      colors: p.colors || null,
      genders: p.genders || null
    })),
    null,
    2
  );

  const filtersText = JSON.stringify(requiredFilters || {}, null, 2);

  return `
You are a product relevance scorer. Given the user's request, the required search filters, and a short list of product objects, return ONLY a JSON array (no text) of candidate objects sorted by relevance.
Each returned object must include:
- handle (string)
- score (number, 0.0 - 1.0, higher is better)

Important scoring rules:
1. If the user's filters explicitly require a gender (male/female/unisex), any candidate that clearly conflicts with that gender should be penalized heavily (score close to 0.0).
2. If the user's filters require a color and the product metadata indicates a different color, penalize that candidate.
3. Favor products whose title or description contains the user's keywords.
4. If price filters exist, prefer products within the price range.
5. Use 1.0 as the maximum relevancy for the best match; scale others accordingly.
6. Return results sorted by score (highest first).

User request:
"${clean}"

Required filters:
${filtersText}

Candidates:
${candJson}

Return the ranked array only. Example:
[{"handle":"ocean-blue-shirt","score":0.95},{"handle":"red-plaid","score":0.60}]
`;
}

function buildChatPrompt(userText, history = [], structuredIntent = null) {
  const clean = sanitizeInputForPrompt(userText);
  const historyText = (history || [])
    .map(h => `${h.role}: ${sanitizeInputForPrompt(h.content)}`)
    .join('\n');

  const structuredText = structuredIntent ? `Structured intent (from intent-extractor): ${JSON.stringify(structuredIntent)}\n` : '';

  return `
You are a helpful AI assistant for an e-commerce store. Use the conversation history and any structured intent data to answer the user's query helpfully and accurately.
History:
${historyText}

${structuredText}
User: "${clean}"

Guidelines:
- If structured intent includes filters (gender, color, price), ensure any product suggestions match those filters. Do not suggest products that conflict with explicit filters.
- Do not invent product attributes (sizes, discounts, availability). If information is missing, ask a clarifying question.
- Keep responses conversational and concise when speaking to users. If returning product lists, include title, price, and a short 1-line reason why it's relevant.
- If the user asks for a clarification (e.g., "Do you mean men's or women's?"), respond with a direct clarifying question.

Respond conversationally in plain text. Do not include JSON unless explicitly asked for.
`;
}

module.exports = {
  buildIntentPrompt,
  buildRerankPrompt,
  buildChatPrompt,
  EXAMPLES
};
