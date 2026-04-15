const express = require('express');
const cors = require('cors');
const http = require('http');
const https = require('https');
const url = require('url');

const app = express();
const PORT = process.env.PROXY_PORT || 3001;

// Enable CORS for the React dev server
app.use(cors({
  origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
  credentials: true
}));

app.use(express.json({ limit: '50mb' }));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Proxy requests to LLM APIs
app.all(/^\/proxy(\?.*)?$/, async (req, res) => {
  const targetUrl = req.query.url;

  if (!targetUrl) {
    return res.status(400).json({ error: 'Missing url parameter' });
  }

  const parsedUrl = new URL(targetUrl);
  const options = {
    hostname: parsedUrl.hostname,
    port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
    path: parsedUrl.pathname + parsedUrl.search,
    method: req.method,
    headers: {
      'Content-Type': 'application/json',
      ...req.headers
    }
  };

  // Remove problematic headers
  delete options.headers.host;
  delete options.headers['content-length'];

  const protocol = parsedUrl.protocol === 'https:' ? https : http;

  const proxyReq = protocol.request(options, (proxyRes) => {
    res.status(proxyRes.statusCode);
    Object.keys(proxyRes.headers).forEach(key => {
      res.setHeader(key, proxyRes.headers[key]);
    });
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (error) => {
    console.error('Proxy error:', error);
    res.status(500).json({ error: 'Proxy request failed', message: error.message });
  });

  if (req.body) {
    proxyReq.write(JSON.stringify(req.body));
  }

  proxyReq.end();
});

// Brave Web Search proxy (hides API key)
app.post('/search', async (req, res) => {
  const { query, apiKey } = req.body;

  if (!query || !apiKey) {
    return res.status(400).json({ error: 'Missing query or apiKey' });
  }

  try {
    const searchUrl = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5`;

    const response = await fetch(searchUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip',
        'X-Subscription-Token': apiKey
      }
    });

    if (!response.ok) {
      throw new Error(`Brave API error: ${response.status}`);
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Search failed', message: error.message });
  }
});

// Local LLM endpoints with common paths
const LLM_ENDPOINTS = {
  ollama: {
    chat: '/api/chat',
    generate: '/api/generate',
    tags: '/api/tags'
  },
  lmstudio: {
    chat: '/v1/chat/completions',
    models: '/v1/models'
  },
  openai: {
    chat: '/v1/chat/completions',
    models: '/v1/models'
  }
};

// Generic LLM proxy endpoint
app.post(/^\/llm(\?.*)?$/, async (req, res) => {
  const targetBaseUrl = req.headers['x-llm-base-url'];

  if (!targetBaseUrl) {
    return res.status(400).json({ error: 'Missing X-LLM-Base-URL header' });
  }

  const path = req.params[0];
  const targetUrl = targetBaseUrl.replace(/\/$/, '') + '/' + path;

  try {
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': req.headers.authorization || ''
      },
      body: JSON.stringify(req.body)
    });

    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    console.error('LLM proxy error:', error);
    res.status(500).json({ error: 'LLM request failed', message: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Proxy server running on http://localhost:${PORT}`);
  console.log(`📡 Endpoints:`);
  console.log(`   - Health:     GET  /health`);
  console.log(`   - Proxy:      ALL  /proxy?url=<target>`);
  console.log(`   - Search:     POST /search`);
  console.log(`   - LLM:        POST /llm/*`);
});
