// Upstream HTTP failure
export class UpstreamHttpError extends Error {
  // HTTP status code
  public readonly status: number;

  // Construct HTTP error
  constructor(status: number, message?: string) {
    super(message ?? `Upstream returned ${status}`);
    this.name = "UpstreamHttpError";
    this.status = status;
  }
}

// Upstream timeout error
export class UpstreamTimeoutError extends Error {
  // Construct timeout error
  constructor(message = "Upstream request timed out") {
    super(message);
    this.name = "UpstreamTimeoutError";
  }
}

// Optional fetch options
export type FetchJsonOptions = {
  timeoutMs?: number;
  init?: RequestInit;
};


// Fetch JSON safely
export async function fetchJson<T>(
  url: string,
  opts: FetchJsonOptions = {}
): Promise<T> {
  // Resolve timeout value
  const timeoutMs = opts.timeoutMs ?? 5000;

  // Setup abort controller
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // Perform HTTP request
    const res = await fetch(url, {
      ...(opts.init ?? {}), // Merge request options
      signal: controller.signal,
    });

    // Handle non-OK status
    if (!res.ok) {
      throw new UpstreamHttpError(res.status, `Upstream returned ${res.status}`);
    }

    // Parse JSON response
    return (await res.json()) as T;

  } catch (err) {
    // Convert abort to timeout
    if (err instanceof Error && err.name === "AbortError") {
      throw new UpstreamTimeoutError();
    }

    // Rethrow unknown errors
    throw err;

  } finally {
    // Clear timeout timer
    clearTimeout(timeoutId);
  }
}


//Parallel fanout helper
export async function fetchManySettled<I, O>(
  inputs: I[],
  fn: (input: I) => Promise<O>
): Promise<{ ok: O[]; droppedCount: number }> {

  // Execute tasks in parallel
  const results = await Promise.allSettled(inputs.map(fn));

  // Count failed tasks
  const droppedCount = results.filter((r) => r.status === "rejected").length;

  // Extract successful values
  const ok = results
    .filter((r): r is PromiseFulfilledResult<Awaited<O>> => r.status === "fulfilled")
    .map((r) => r.value);

  // Return partitioned results
  return { ok, droppedCount };
}

// Extract URL hostname
export function safeHost(url: string | null): string | null {
  // Handle missing URL
  if (!url) return null;
  try {
    // Parse hostname
    return new URL(url).host;
  } catch {
    // Handle invalid URL
    return null;
  }
}

//Join base URL
export function buildUrl(baseUrl: string, path: string): string {
  // Normalize base URL
  const base = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;

  // Normalize path
  const p = path.startsWith("/") ? path : `/${path}`;

  // Construct full URL
  return `${base}${p}`;
}
