import { Type } from "@sinclair/typebox";

type PluginConfig = {
  baseUrl?: string;
  timeoutMs?: number;
  defaultCount?: number;
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
}
