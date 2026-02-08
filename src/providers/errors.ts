// Upstream request timeout
export class UpstreamTimeoutError extends Error {
  constructor(message = "Upstream request timed out") {
    super(message);
    this.name = "UpstreamTimeoutError";
  }
}

// Upstream HTTP failure
export class UpstreamHttpError extends Error {
  // HTTP status code
  status: number;

  constructor(status: number, message = "Upstream request failed") {
    super(message);
    this.name = "UpstreamHttpError";
    this.status = status;
  }
}
