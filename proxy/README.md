# Topic Cloud Proxy Server

This proxy server solves CORS issues and enables web search for Topic Cloud.

## Why?

- **Brave API** blocks direct browser requests (CORS)
- **This proxy** runs locally and forwards requests, avoiding CORS
- **Your API key stays safe** on your machine, not in the browser

## Setup

### 1. Get Brave Search API Key (free)

1. Go to https://brave.com/search/api
2. Sign up for free tier (2000 queries/month)
3. Copy your API key

### 2. Start LM Studio

Make sure LM Studio is running with the server enabled.

### 3. Start the Proxy

```bash
cd proxy
export BRAVE_API_KEY="your_key_here"
npm start
```

Or on Windows:
```cmd
cd proxy
set BRAVE_API_KEY=your_key_here
npm start
```

The proxy will run on `http://localhost:3001`

### 4. Configure Topic Cloud

In Topic Cloud Settings:
- **Base URL:** `http://localhost:3001`
- **Model Name:** `default` (or leave as default)
- **Enable auto web search:** ON
- **Brave API Key:** (leave empty - proxy has it)

That's it! Web search now works.

## How It Works

```
Browser → Proxy (localhost:3001) → Brave API (search)
                                    ↓
                                  LM Studio (chat)
```

The proxy:
1. Receives your chat message
2. Searches Brave if enabled
3. Adds results to the AI's context
4. Sends everything to LM Studio
5. Returns the response

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `BRAVE_API_KEY` | - | Your Brave Search API key |
| `LM_STUDIO_URL` | `http://localhost:1234/v1` | LM Studio server URL |
| `PORT` | `3001` | Proxy server port |

## Troubleshooting

**"BRAVE_API_KEY: Not set"**
→ Make sure you exported the environment variable before starting

**"Failed to connect to LM Studio"**
→ Check LM Studio is running and server is enabled

**"Unauthorized" on search**
→ Your Brave API key might be invalid or expired
