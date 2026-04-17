import "dotenv/config";
import { runAgent } from "./agent.js";
import { display } from "./display.js";

// ── Env validation ────────────────────────────────────────────────────────────

function requireEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env variable: ${key}`);
  return val;
}

const WALLET_ADDRESS = requireEnv("WALLET_ADDRESS") as `0x${string}`;
requireEnv("PRIVATE_KEY");           // validated early; helpers use it directly
requireEnv("CLAUDE_CODE_OAUTH_TOKEN"); // validated early; agent passes it to query()

const USE_MAINNET = process.env.USE_MAINNET !== "false";
const DRY_RUN = process.env.DRY_RUN !== "false";
const INTERVAL_MS = parseInt(process.env.INTERVAL_MS ?? "60000", 10);

// ── Entry point ───────────────────────────────────────────────────────────────

async function main() {
  display.header();

  console.log(`  Network:    ${USE_MAINNET ? "Base Mainnet" : "Base Sepolia"}`);
  console.log(`  Wallet:     ${WALLET_ADDRESS}`);
  console.log(`  Dry Run:    ${DRY_RUN ? "YES (set DRY_RUN=false to trade for real)" : "NO — LIVE TRADES"}`);
  console.log(`  Interval:   ${INTERVAL_MS / 1000}s\n`);

  if (!DRY_RUN) {
    console.log("  ⚠️  LIVE MODE: Real swaps will execute on-chain.\n");
  }

  await runCycle();
  setInterval(runCycle, INTERVAL_MS);
}

async function runCycle() {
  try {
    await runAgent(WALLET_ADDRESS, DRY_RUN);
  } catch (err: unknown) {
    display.error(err instanceof Error ? err.message : String(err));
  }
}

main().catch((err) => {
  display.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
