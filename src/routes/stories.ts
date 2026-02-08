import { Router } from "express";
import type { NewsProvider, ListStoriesParams } from "../providers/NewsProvider.js";
import { UpstreamHttpError, UpstreamTimeoutError} from "../providers/providerUtils.js";

// Parse and validate integers
function parseIntParam(value: unknown, name: string): number | undefined {
  // Missing query param
  if (value === undefined) return undefined;

  // Enforce single value
  if (typeof value !== "string") {
    throw new Error(`${name} must be a string`);
  }

  // Reject empty input
  if (value.trim() === "") {
    throw new Error(`${name} cannot be empty`);
  }

  // Convert to number
  const n = Number(value);

  // Enforce integer type
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    throw new Error(`${name} must be an integer`);
  }

  return n;
}

// Create stories router
export function createStoriesRouter(provider: NewsProvider) {
  const router = Router();

  // List normalized stories
  router.get("/", async (req, res) => {

    // Query validation
    let params: ListStoriesParams;
    try {
      // Parse query parameters
      const limit = parseIntParam(req.query.limit, "limit") ?? 10;
      const minScore = parseIntParam(req.query.minScore, "minScore");

      // Validate limit bounds
      if (limit < 1 || limit > 50) {
        return res.status(400).json({
          error: "Invalid query parameter",
          details: "limit must be between 1 and 50",
        });
      }

      // Validate score filter
      if (minScore !== undefined && minScore < 0) {
        return res.status(400).json({
          error: "Invalid query parameter",
          details: "minScore must be >= 0",
        });
      }

      // Build provider params
      params = { limit };
      if (minScore !== undefined) {
        params.minScore = minScore;
      }
    } catch (err) {
      // Handle invalid input
      return res.status(400).json({
        error: "Invalid query parameter",
        details: (err as Error).message,
      });
    }

    // --- Provider execution ---
    try {
      // Fetch normalized stories
      const result = await provider.listStories(params);

      // Return successful response
      return res.json({
        total: result.items.length,
        droppedCount: result.droppedCount,
        items: result.items,
      });
    } catch (err) {

      // Handle upstream timeout
      if (err instanceof UpstreamTimeoutError) {
        return res.status(504).json({ error: "Upstream timeout" });
      }

      // Handle upstream failure
      if (err instanceof UpstreamHttpError) {
        return res.status(502).json({
          error: "Upstream failure",
          details: `status=${err.status}`,
        });
      }

      // Handle unexpected error
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // Return configured router
  return router;
}
