#!/usr/bin/env tsx
// Search for a token by name/symbol to discover or verify contract addresses ($0.001)
// Usage: search.ts <query>
import "dotenv/config";
import { createX402Client } from "./client.js";

const query = process.argv[2];
if (!query) { console.error(JSON.stringify({ error: "Usage: search.ts <query>" })); process.exit(1); }

try {
  const client = createX402Client();
  const res = await client.post("/api/search_token", { query });
  console.log(JSON.stringify(res.data));
} catch (err) {
  console.error(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
  process.exit(1);
}
