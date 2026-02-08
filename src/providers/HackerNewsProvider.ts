import type { ListStoriesParams, NewsProvider } from "./NewsProvider.js";
import type { Story } from "../types.js";
import { UpstreamHttpError, UpstreamTimeoutError } from "./errors.js";

// Raw Hacker News item
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

// Hacker News provider
export class HackerNewsProvider implements NewsProvider {
  // Base API URL
  private readonly baseUrl = "https://hacker-news.firebaseio.com/v0";

  // Fetch normalized stories
  async listStories(
    params: ListStoriesParams
  ): Promise<{ items: Story[]; droppedCount: number }> {

    // Clamp query params
    const limit = Math.max(1, Math.min(Math.trunc(params.limit), 50));
    const minScore = params.minScore ?? 0;

    let ids: number[] = [];

    // Fetch top story IDs
    try {
      const raw = await this.fetchJson<unknown>(
        `${this.baseUrl}/topstories.json`
      );

      // Validate response shape
      if (!Array.isArray(raw)) {
        throw new Error("topstories response was not an array");
      }

      // Filter numeric IDs
      ids = raw.filter((x): x is number => typeof x === "number");
    } catch (err) {
      // Preserve upstream errors
      if (err instanceof UpstreamTimeoutError || err instanceof UpstreamHttpError) {
        throw err;
      }
      throw new Error(`Failed to fetch top stories: ${(err as Error).message}`);
    }

    // Fetch individual items
    const items = await Promise.allSettled(
      ids.slice(0, limit).map((id) =>
        this.fetchJson<HNItem>(`${this.baseUrl}/item/${id}.json`)
      )
    );

    // Count failed fetches
    const droppedCount = items.filter((r) => r.status === "rejected").length;

    // Extract successful items
    const fulfilled = items
      .filter((r): r is PromiseFulfilledResult<HNItem> => r.status === "fulfilled")
      .map((r) => r.value);

    // Normalize and filter stories
    const stories = fulfilled
      .filter((it) => it?.type === "story")
      .map((it) => this.normalizeItem(it))
      .filter((s) => s.score >= minScore);

    return {
      items: stories,
      droppedCount,
    };
  }

  // Normalize story fields
  private normalizeItem(item: HNItem): Story {
    const url = item.url ?? null;

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
      source: this.safeHost(url),
    };
  }

  // Safely extract hostname
  private safeHost(url: string | null): string | null {
    if (!url) return null;
    try {
      return new URL(url).host;
    } catch {
      return null;
    }
  }

  // Fetch JSON with timeout
  private async fetchJson<T>(url: string): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    try {
      const res = await fetch(url, { signal: controller.signal });

      // Handle non-OK responses
      if (!res.ok) {
        throw new UpstreamHttpError(res.status, `Upstream returned ${res.status}`);
      }

      return (await res.json()) as T;
    } catch (err) {
      // Convert abort to timeout
      if (err instanceof Error && err.name === "AbortError") {
        throw new UpstreamTimeoutError();
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
