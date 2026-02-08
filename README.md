# API Normalization Service (Hacker News)

A small **TypeScript + Express** service that consumes the public **Hacker News (Firebase)** JSON API, normalizes the upstream data into an opinionated `Story` model, and exposes it through a simplified REST endpoint.

The core design goal is **swap-ability**: the rest of the app depends on a provider interface, so the underlying data source can be replaced with minimal changes.

---

## Tech stack

- Node.js (recommended: **18+** since it uses built-in `fetch`)
- TypeScript
- Express

---

## Setup

```bash
# from the repo root
npm install
```

> Note: If your ZIP includes `node_modules`, you can delete it and run `npm install` to recreate a clean install.

---

## Run

### Dev (hot reload)

```bash
npm run dev
```

Server starts on `http://localhost:3000` by default.

### Production build

```bash
npm run build
npm start
```

You can override the port:

```bash
PORT=4000 npm run dev
```

---

## API

### Health check

`GET /health`

Response:

```json
{ "status": "ok" }
```

### List normalized stories

`GET /stories`

Query parameters:

- `limit` (integer, **1–50**, default: `10`) — number of top-story IDs to fan out into.
- `minScore` (integer, **>= 0**, optional) — filter out stories below this score.

Example:

```bash
curl "http://localhost:3000/stories?limit=15&minScore=100"
```

Response shape:

```json
{
  "total": 12,
  "droppedCount": 3,
  "items": [
    {
      "id": 123,
      "title": "...",
      "url": "https://example.com/post",
      "author": "some_user",
      "score": 250,
      "commentCount": 87,
      "createdAt": "2026-02-07T01:23:45.000Z",
      "source": "example.com"
    }
  ]
}
```

Notes:

- `total` is a **derived aggregation**: `items.length`.
- `droppedCount` is a **derived aggregation**: number of individual item fetches that failed (network errors, non-2xx, timeouts, etc.).
- Some fields may be `null` when upstream data is missing:
  - `url` can be `null` for HN posts without a URL (e.g., “Ask HN”).
  - `createdAt` can be `null` if the upstream timestamp is missing.
  - `source` is derived from the URL hostname and is `null` when the URL is missing/invalid.

---

## Normalization rules

Upstream Hacker News items (raw) are transformed into this normalized model:

```ts
export type Story = {
  id: number;
  title: string;
  url: string | null;
  author: string;
  score: number;
  commentCount: number;
  createdAt: string | null;   // ISO 8601
  source: string | null;      // hostname derived from url
};
```

Key transformations:

- `time` (unix seconds) → `createdAt` (ISO 8601 string)
- `descendants` → `commentCount`
- `by` → `author`
- `source` is computed as `new URL(url).host` (safe-parsed)
- Missing fields are defaulted to stable values:
  - `title`: `"(untitled)"`
  - `author`: `"unknown"`
  - `score`: `0`
  - `commentCount`: `0`

---

## Resilience & error handling

- Shared upstream behavior is centralized in `providerUtils.ts`.
- Each upstream request uses an `AbortController` timeout (currently **5s**).
- Upstream error mapping:
  - `504` for upstream timeouts
  - `502` for upstream non-OK HTTP responses
  - `500` for unexpected server errors
- Item fetch fanout uses `Promise.allSettled` so partial failures don’t crash the whole request; failures are counted in `droppedCount`.

---

## Architecture note (swap-ability)

### Separation of concerns

- `src/routes/stories.ts`
  - HTTP layer: query parsing/validation, response formatting, translating errors to HTTP status codes.
- `src/providers/NewsProvider.ts`
  - Provider contract (`NewsProvider`) and shared types (`ListStoriesParams`, `ListStoriesResult`).
- `src/providers/HackerNewsProvider.ts`
  - Data fetching + transformation for the Hacker News API.
- `src/providers/providerUtils.ts`  
  - Shared provider utilities for upstream HTTP access, timeouts, error handling, parallel fetch helpers, and safe URL parsing.
- `src/types.ts`
  - Normalized domain model (`Story`).
- `src/app.ts`
  - Composes the app and **injects** a provider into the router.

### If the API were swapped, what changes?

**Would change:**

- Add or replace a provider implementation (e.g., `src/providers/GitHubProvider.ts`) that implements `NewsProvider.listStories(params)` and maps the new upstreamresponse into the normalized `Story` model.
- Update `src/app.ts` to inject the new provider.

**Would NOT change:**

- The REST API (`/stories`), query parameters, or response shape.
- The router and provider interface (`NewsProvider`).
- Shared provider behavior in `providerUtils.ts` (timeouts, upstream error handling, parallel fetch helpers, URL parsing).

```ts
app.use("/stories", createStoriesRouter(new YourNewProvider()));
```

**Would stay the same:**

- `src/routes/stories.ts` (HTTP + validation)
- `src/providers/NewsProvider.ts` (provider interface)
- `src/types.ts` (normalized model), *unless* you intentionally change the public contract

This keeps the “business logic” (the normalized response + filtering semantics) insulated from the upstream API details.

---

# AI usage reflection

AI (ChatGPT) was used as a pair-programming and review assistant, not as a code generator of record. It primarily supported design iteration, identification of edge cases, and validation of TypeScript/Express best practices. All final implementation decisions and tradeoffs were made manually.

## Examples of Effective Prompts

### API design and separation of concerns

**Prompt:**
“Design a clean Express router that accepts a data provider via dependency injection so the data source can be swapped later.”

**Result:**
This led to the creation of a NewsProvider interface and a provider-agnostic router factory. The final interface shape and error boundaries were manually refined to better reflect real HTTP failure modes.

### Error handling and resilience

**Prompt:**
“What failure cases should be expected when calling an external JSON API, and how should they map to HTTP status codes?”

**Result:**
The AI highlighted timeout handling, upstream error propagation, and partial failure tolerance. These ideas were manually implemented using Promise.allSettled, along with a droppedCount field to make partial failures explicit.

### TypeScript data normalization

**Prompt:**
“Help normalize Hacker News item JSON into a strongly typed internal model with safe defaults.”

**Result:**
The AI assisted in identifying nullable fields and necessary type conversions (e.g., Unix timestamps). Manual decisions were made about which fields should default versus remain optional, and stricter typing (exactOptionalPropertyTypes) was enforced.

### Build configuration and project structure

**Prompt:**
“Given an API-only TypeScript service with no frontend assets, what is the cleanest build output strategy that avoids polluting src/ while keeping development and production entry points consistent?”

**Result:**
This clarified that the cleanest approach for an API-only TypeScript service is to keep all source files in src/, emit all compiled artifacts into dist/, and avoid mixing build output with source code. The final setup was manually validated to ensure development-time execution and production startup used consistent entry points and behaved identically.

## Where AI Required Extra Care:

- Ambiguous prompts (e.g., “How can I make my API more user friendly”) produced overly generic guidance that required refinement.

- Project-specific assumptions occasionally led to suggestions for unnecessary components (such as frontend assets or additional middleware).

- Over-abstraction such as excessive abstrraction layers or logging frameworks sometimes added complexity without clear benefit for the project scope; clarity and simplicity were favored instead.

## Manual Decision-Making and Overrides

- The AI initially proposed passing upstream fields through directly when names were similar. This was overridden in favor of explicit normalization to ensure the internal Story model remains stable even if upstream schemas change.

- AI-generated code was functional but tended to mask important edge cases (e.g., silently dropping failed upstream items). These implementations were overridden in favor of explicit error handling and observability so the client had greater understanding of the issue.

- The project was intentionally kept API-only to stay in-scope, despite suggestions to add a homepage or frontend.

- All AI-generated suggestions were reviewed for correctness, security, and alignment with the challenge requirements before integration.
