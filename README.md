# openclaw-plugin-searxng

An [OpenClaw](https://openclaw.ai) plugin that adds web search via your self-hosted [SearXNG](https://docs.searxng.org/) instance. Privacy-preserving, aggregated results from 70+ search engines.

## Prerequisites

- OpenClaw 2026.2.17+
- A running SearXNG instance with JSON API enabled

Your SearXNG `settings.yml` must include:

```yaml
search:
  formats:
    - html
    - json
```

## Installation

Copy the plugin to your OpenClaw extensions directory:

```bash
# Clone the repo
git clone https://github.com/5p00kyy/openclaw-plugin-searxng.git

# Copy to extensions
cp -r openclaw-plugin-searxng ~/.openclaw/extensions/searxng-search

# Install dependencies
cd ~/.openclaw/extensions/searxng-search
npm install --omit=dev
```

Enable the plugin in `~/.openclaw/openclaw.json`:

```json
{
  "plugins": {
    "entries": {
      "searxng-search": {
        "enabled": true
      }
    }
  }
}
```

Then restart the gateway:

```bash
openclaw gateway restart
```

## Configuration

### Plugin config (optional)

Add config under the plugin entry in `openclaw.json`:

```json
{
  "plugins": {
    "entries": {
      "searxng-search": {
        "enabled": true,
        "config": {
          "baseUrl": "http://192.168.1.100:8080",
          "timeoutMs": 15000,
          "defaultCount": 5
        }
      }
    }
  }
}
```

### Environment variable

Alternatively, set the `SEARXNG_URL` environment variable:

```bash
export SEARXNG_URL="http://192.168.1.100:8080"
```

### Resolution order

1. Plugin `config.baseUrl` in `openclaw.json`
2. `SEARXNG_URL` environment variable
3. `http://localhost:8080` (default)

## Tool: `searxng_search`

The plugin registers a `searxng_search` tool available to agents.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | string | yes | Search query |
| `count` | number | no | Number of results (1-20, default 5) |
| `categories` | string | no | Comma-separated: general, images, news, videos, it, science, files, music, social media |
| `language` | string | no | Language code (en, de, fr, etc.) |
| `time_range` | string | no | Time range: day, week, month, year |

### Response format

```json
{
  "query": "search terms",
  "provider": "searxng",
  "count": 5,
  "results": [
    {
      "title": "Result Title",
      "url": "https://example.com",
      "description": "Snippet text...",
      "published": "2026-02-15T00:00:00Z",
      "engines": "google, duckduckgo",
      "score": 8.5,
      "category": "general"
    }
  ]
}
```

## Coexistence with built-in search

This plugin registers a separate `searxng_search` tool alongside the built-in `web_search` (Brave/Perplexity/Grok). Both tools are available to agents simultaneously -- the LLM can choose which to use based on context.

## Recommended Usage Pattern: Dual-Provider Setup

For the best experience, configure **both** search tools and let them complement each other:

| Tool | Best For | Limitations |
|------|----------|-------------|
| `searxng_search` | Primary searches, privacy-sensitive queries, high-volume research | Requires your SearXNG instance to be running |
| `web_search` (Brave) | Fallback when SearXNG is down, occasional queries if you prefer not to self-host | Rate limits (2000 queries/month on free tier) |

**Why this pattern works:**
- Use `searxng_search` for most searches — unlimited, private, no rate limits
- Keep `web_search` (Brave) configured as a fallback — if your SearXNG instance goes down, the agent can still search
- No single point of failure — your agent remains functional even if one provider fails

**Agent behavior:** When both tools are available, the agent typically prefers `searxng_search` for general web searches due to its privacy benefits and lack of rate limiting. If SearXNG returns an error, the agent can transparently fall back to Brave.

## License

MIT
