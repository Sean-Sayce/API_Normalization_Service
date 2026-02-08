// Provider interface + params
import type { ListStoriesParams, NewsProvider } from "./NewsProvider.js";

// Normalized story type
import type { Story } from "../types.js";

// Shared provider utilities
import {fetchJson, fetchManySettled, safeHost, buildUrl, UpstreamHttpError, UpstreamTimeoutError} from "./providerUtils.js";

// Raw Hacker News shape
type HNItem = {
  by?: string;
  descendants?: number;
  id: number;
  kids?: number[];
  score?: number;
  time?: number;
  title?: string;
  type?: string;
  url?: string;
};

// Hacker News implementation
export class HackerNewsProvider implements NewsProvider {
  // Hacker News base URL
  private readonly baseUrl = "https://hacker-news.firebaseio.com/v0";

  // Main fetch entrypoint
  async listStories(
    params: ListStoriesParams
  ): Promise<{ items: Story[]; droppedCount: number }> {

    // Clamp requested limit
    const limit = Math.max(1, Math.min(Math.trunc(params.limit), 50));

    // Optional score filter
    const minScore = params.minScore ?? 0;

    // Story ID accumulator
    let ids: number[] = [];

    // Fetch top story IDs
    try {
      const raw = await fetchJson<unknown>(
        buildUrl(this.baseUrl, "/topstories.json")
      );

      // Validate upstream shape
      if (!Array.isArray(raw)) {
        throw new Error("topstories response was not an array");
      }

      // Keep numeric IDs
      ids = raw.filter((x): x is number => typeof x === "number");

    } catch (err) {
      // Preserve upstream failures
      if (err instanceof UpstreamTimeoutError || err instanceof UpstreamHttpError) {
        throw err;
      }

      // Wrap unknown errors
      throw new Error(`Failed to fetch top stories: ${(err as Error).message}`);
    }

    // Fetch item details
    const { ok: fulfilled, droppedCount } =
      await fetchManySettled<number, HNItem>(
        ids.slice(0, limit),
        (id) =>
          fetchJson<HNItem>(
            buildUrl(this.baseUrl, `/item/${id}.json`)
          )
      );

    // Normalize + filter stories
    const stories = fulfilled
      .filter((it) => it?.type === "story") // Keep stories only
      .map((it) => this.normalizeItem(it)) // Normalize fields
      .filter((s) => s.score >= minScore); // Apply score filter

    // Return normalized result
    return { items: stories, droppedCount };
  }

  // Map HN → Story
  private normalizeItem(item: HNItem): Story {
    // Optional URL field
    const url = item.url ?? null;

    // Construct normalized object
    return {
      id: item.id,
      title: item.title ?? "(untitled)",
      url,
      author: item.by ?? "unknown",
      score: item.score ?? 0,
      commentCount: item.descendants ?? 0,
      createdAt: item.time
        ? new Date(item.time * 1000).toISOString()
        : null,
      source: safeHost(url), // Extract hostname
    };
  }
}
