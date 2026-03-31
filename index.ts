import { Type } from "@sinclair/typebox";
import { tavily } from "@tavily/core";

type PluginConfig = {
  baseUrl?: string;
  timeoutMs?: number;
  defaultCount?: number;
  tavilyApiKey?: string;
};

export default function register(api: any) {
  const cfg = (api.pluginConfig ?? {}) as PluginConfig;
  const baseUrl =
    cfg.baseUrl?.trim() ||
    process.env.SEARXNG_URL ||
    "http://localhost:8080";
  const timeoutMs = cfg.timeoutMs ?? 15_000;
  const defaultCount = cfg.defaultCount ?? 5;

  api.registerTool({
    name: "searxng_search",
    description:
      "Search the web via self-hosted SearXNG. Returns titles, URLs, and snippets. " +
      "Privacy-preserving, aggregated results from 70+ engines. " +
      "Use for web searches, especially when privacy matters or as an alternative to Brave.",
    parameters: Type.Object({
      query: Type.String({ description: "Search query string." }),
      count: Type.Optional(
        Type.Number({
          description: "Number of results (1-20, default 5).",
          minimum: 1,
          maximum: 20,
        })
      ),
      categories: Type.Optional(
        Type.String({
          description:
            "Comma-separated categories: general, images, news, videos, it, science, files, music, social media.",
        })
      ),
      language: Type.Optional(
        Type.String({
          description: "Language code (e.g. en, de, fr).",
        })
      ),
      time_range: Type.Optional(
        Type.String({
          description: "Time range: day, week, month, year.",
        })
      ),
    }),
    async execute(_toolCallId: string, args: Record<string, unknown>) {
      const query = args.query as string;
      const count = (args.count as number | undefined) ?? defaultCount;
      const params = new URLSearchParams({
        q: query,
        format: "json",
      });
      if (args.categories) params.set("categories", args.categories as string);
      if (args.language) params.set("language", args.language as string);
      if (args.time_range) params.set("time_range", args.time_range as string);

      try {
        const res = await fetch(`${baseUrl}/search?${params}`, {
          signal: AbortSignal.timeout(timeoutMs),
        });

        if (!res.ok) {
          const detail = await res.text().catch(() => "");
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  error: `SearXNG error (${res.status}): ${detail || res.statusText}`,
                }),
              },
            ],
          };
        }

        const data = (await res.json()) as {
          results?: Array<{
            title?: string;
            url?: string;
            content?: string;
            publishedDate?: string;
            engines?: string[];
            score?: number;
            category?: string;
          }>;
        };

        const results = (data.results ?? []).slice(0, count).map((r) => ({
          title: r.title ?? "",
          url: r.url ?? "",
          description: r.content ?? "",
          published: r.publishedDate ?? undefined,
          engines: r.engines?.join(", ") ?? undefined,
          score: r.score ?? undefined,
          category: r.category ?? undefined,
        }));

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                query,
                provider: "searxng",
                count: results.length,
                results,
              }),
            },
          ],
        };
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "Unknown error";
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: `SearXNG request failed: ${message}`,
              }),
            },
          ],
        };
      }
    },
  });

  // --- Tavily search tool (additive) ---
  const tavilyApiKey =
    cfg.tavilyApiKey?.trim() || process.env.TAVILY_API_KEY || "";

  if (!tavilyApiKey) {
    console.warn(
      "[openclaw-plugin-searxng] TAVILY_API_KEY not set — tavily_search tool will not be registered."
    );
  } else {
    const tvly = tavily({ apiKey: tavilyApiKey });

    api.registerTool({
      name: "tavily_search",
      description:
        "Search the web via Tavily, a search API optimised for LLMs. " +
        "Returns titles, URLs, snippets, and an optional AI-generated answer. " +
        "Use for web searches when you need high-relevance, LLM-friendly results.",
      parameters: Type.Object({
        query: Type.String({ description: "Search query string." }),
        max_results: Type.Optional(
          Type.Number({
            description: "Number of results (1-20, default 5).",
            minimum: 1,
            maximum: 20,
          })
        ),
        search_depth: Type.Optional(
          Type.Union(
            [Type.Literal("basic"), Type.Literal("advanced")],
            {
              description:
                "Search depth: basic (fast, 1 credit) or advanced (thorough, 2 credits). Default: basic.",
            }
          )
        ),
        include_answer: Type.Optional(
          Type.Boolean({
            description:
              "Include a short AI-generated answer summarising the results. Default: false.",
          })
        ),
      }),
      async execute(_toolCallId: string, args: Record<string, unknown>) {
        const query = args.query as string;
        const maxResults =
          (args.max_results as number | undefined) ?? defaultCount;
        const searchDepth =
          (args.search_depth as "basic" | "advanced" | undefined) ?? "basic";
        const includeAnswer =
          (args.include_answer as boolean | undefined) ?? false;

        try {
          const response = await tvly.search(query, {
            maxResults,
            searchDepth,
            includeAnswer,
          });

          const results = (response.results ?? []).map((r) => ({
            title: r.title ?? "",
            url: r.url ?? "",
            description: r.content ?? "",
            score: r.score ?? undefined,
          }));

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  query,
                  provider: "tavily",
                  count: results.length,
                  ...(includeAnswer && response.answer
                    ? { answer: response.answer }
                    : {}),
                  results,
                }),
              },
            ],
          };
        } catch (err: unknown) {
          const message =
            err instanceof Error ? err.message : "Unknown error";
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  error: `Tavily request failed: ${message}`,
                }),
              },
            ],
          };
        }
      },
    });
  }
}
