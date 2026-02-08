import app from "./app.js";

// Server port
const PORT = process.env.PORT || 3000;

// Start HTTP server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
