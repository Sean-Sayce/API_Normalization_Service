import express from "express";
import { createStoriesRouter } from "./routes/stories.js";
import { HackerNewsProvider } from "./providers/HackerNewsProvider.js";

// Create Express app
const app = express();

// Enable JSON parsing
app.use(express.json());

// Health check endpoint
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/", (_req, res) => {
  res.redirect("/stories");
});

// Register stories route
app.use("/stories", createStoriesRouter(
  // Inject news provider
  new HackerNewsProvider()
));

export default app;
