const http = require('http');
const https = require('https');
const url = require('url');

const PORT = 3001;
const BRAVE_API_KEY = process.env.BRAVE_API_KEY || '';
const LM_STUDIO_URL = process.env.LM_STUDIO_URL || 'http://localhost:1234/v1';

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// Simple HTTP request helper
function request(method, requestUrl, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const parsed = url.parse(requestUrl);
    const options = {
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.path,
      method: method,
      headers: headers,
    };

    const client = parsed.protocol === 'https:' ? https : http;
    const req = client.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });

    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

// Search with Brave
async function searchBrave(query) {
  if (!BRAVE_API_KEY) return null;
  
  try {
    const searchUrl = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=3`;
    const response = await request('GET', searchUrl, {
      'Accept': 'application/json',
      'X-Subscription-Token': BRAVE_API_KEY,
    });
    
    if (response.status !== 200) return null;
    
    const data = JSON.parse(response.body);
    const results = data.web?.results || [];
    
    if (results.length === 0) return null;
    
    return results.map(r => `- ${r.title}: ${r.description} (${r.url})`).join('\n');
  } catch (e) {
    console.error('Brave search error:', e.message);
    return null;
  }
}

const server = http.createServer(async (req, res) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders);
    res.end();
    return;
  }

  // Add CORS headers to all responses
  Object.entries(corsHeaders).forEach(([key, value]) => {
    res.setHeader(key, value);
  });

  const parsedUrl = url.parse(req.url, true);
  
  // GET /v1/models - proxy to LM Studio (OpenAI compatible)
  if (parsedUrl.pathname === '/v1/models' && req.method === 'GET') {
    try {
      const response = await request('GET', `${LM_STUDIO_URL}/models`);
      res.writeHead(response.status, { 'Content-Type': 'application/json' });
      res.end(response.body);
    } catch (e) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to connect to LM Studio' }));
    }
    return;
  }

  // POST /v1/chat/completions - chat with optional web search (OpenAI compatible)
  if (parsedUrl.pathname === '/v1/chat/completions' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        const { messages, enableSearch, model } = data;
        
        // Get the last user message
        const lastUserMsg = messages.slice().reverse().find(m => m.role === 'user');
        
        // Search if enabled
        let searchContext = '';
        if (enableSearch && lastUserMsg) {
          console.log('Searching for:', lastUserMsg.content);
          const searchResults = await searchBrave(lastUserMsg.content);
          if (searchResults) {
            searchContext = '\n\nWeb search results:\n' + searchResults;
            console.log('Found search results');
          }
        }
        
        // Modify system message with search context
        const modifiedMessages = messages.map(m => {
          if (m.role === 'system') {
            return { ...m, content: m.content + searchContext };
          }
          return m;
        });
        
        // Forward to LM Studio
        const response = await request(
          'POST',
          `${LM_STUDIO_URL}/chat/completions`,
          { 'Content-Type': 'application/json' },
          JSON.stringify({
            model: model || 'default',
            messages: modifiedMessages,
            temperature: 0.7,
            max_tokens: 1000,
          })
        );
        
        res.writeHead(response.status, { 'Content-Type': 'application/json' });
        res.end(response.body);
      } catch (e) {
        console.error('Chat error:', e.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // 404 for everything else
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, () => {
  console.log(`Proxy server running on http://localhost:${PORT}`);
  console.log('Environment variables:');
  console.log('  BRAVE_API_KEY:', BRAVE_API_KEY ? 'Set' : 'Not set');
  console.log('  LM_STUDIO_URL:', LM_STUDIO_URL);
  console.log('');
  console.log('Endpoints:');
  console.log('  GET  /v1/models           - List available models');
  console.log('  POST /v1/chat/completions - Chat with optional web search');
});
