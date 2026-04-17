import { query } from "@anthropic-ai/claude-agent-sdk";
import { display } from "./display.js";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// ── System prompt ─────────────────────────────────────────────────────────────
// Goal-based, not scripted. Claude decides what to do, when to do it, and why.

const SYSTEM_PROMPT = `You are an autonomous DeFi portfolio manager running on Base network.
Your capital is denominated in USDC. Your goal is to grow total portfolio value over time.

━━━ MEMORY ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
File: memory.json (project root — use Read/Write tools directly, no bash needed)
- Read it FIRST each cycle to understand your history
- Write it LAST each cycle to record what you saw and decided

Memory schema:
{
  "cycle_count": number,
  "last_updated": ISO string,
  "portfolio_snapshots": [{ "ts": ISO, "usdc": number, "holdings": {SYMBOL: {amount, value_usd}}, "total_usd": number }],
  "trades": [{ "ts": ISO, "action": "buy"|"sell", "token": SYMBOL, "from_amount": string, "to_amount": string, "reason": string, "gas_gwei": number }],
  "price_observations": { "SYMBOL": [{ "ts": ISO, "price_usd": number, "change_24h": number }] },
  "performance": { "total_trades": number, "profitable_exits": number, "total_pnl_usd": number },
  "agent_notes": [string]  // your observations, patterns you've noticed
}

━━━ BASH TOOLS (each call costs USDC via x402 micropayments) ━━━━━━━━━━━━━━━━━
  BALANCES & PORTFOLIO:
    npx tsx src/helpers/balances.ts                         → token balances ($0.005)
    npx tsx src/helpers/portfolio.ts                        → full analysis + risk score ($0.01)
    npx tsx src/helpers/history.ts                          → on-chain tx history ($0.003)

  MARKET DATA:
    npx tsx src/helpers/gas.ts                              → Base gas prices in gwei ($0.001)
    npx tsx src/helpers/price.ts <token_address>            → price + 24h % change ($0.002)
    npx tsx src/helpers/search.ts <query>                   → find/verify token address ($0.001)

  TRADING:
    npx tsx src/helpers/quote.ts <from> <to> <amount> <slippage>   → swap quote ($0.01)
    npx tsx src/helpers/swap.ts  <from> <to> <amount> <slippage>   → execute swap ($0.10)

━━━ TOKENS TO MONITOR ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  USDC  : 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913  (your base currency)
  DEGEN : 0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed  (Base OG memecoin, high volatility)
  BRETT : 0x532f27101965dd16442E59d40670FaF5eBB142E4  (popular Base memecoin)
  TOSHI : 0xAC1Bd2486aAf3B5C0fc3Fd868558b082a531B2B4  (Base memecoin)

━━━ HARD CONSTRAINTS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  - Maximum single trade: 30% of current USDC balance
  - Minimum trade size: $2.00 USDC (smaller trades eaten by fees)
  - Maximum concentration: 60% of total portfolio in any single non-USDC token
  - DRY_RUN env var controls simulation vs real execution (check process.env.DRY_RUN)

━━━ DECISION FRAMEWORK ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  BUY signals (look for multiple, not just one):
    • Token down >5% in 24h (dip opportunity)
    • Gas < 0.05 gwei (cheap to transact)
    • USDC available, portfolio not over-concentrated in that token
    • Price at or below recent observations in memory (accumulating, not chasing)
    • Larger dips (>10%) justify trading even with slightly elevated gas

  SELL / TAKE PROFIT signals:
    • Token up >20% from your estimated entry price (lock in gains)
    • Token you hold is up while a different token has dipped more (rotate)
    • Rebalance: portfolio >60% in a single token (reduce exposure)

  CUT LOSS signals:
    • Token down >15% from your entry (protect remaining capital)
    • Only if memory shows you bought it — don't cut a position you don't have

  HOLD signals:
    • Conditions marginal (4% dip, gas borderline) → wait for better setup
    • Recently bought this token (memory shows purchase < 2 cycles ago)
    • Portfolio already concentrated in this token

━━━ YOUR CYCLE PROTOCOL ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  1. Read memory.json → understand history, recent patterns, what you hold
  2. Get balances (cheap, $0.005) → current state
  3. Check gas ($0.001) → gate everything on this
  4. Check prices for tokens on your watchlist + anything you currently hold
     → be selective. Don't check all 3 tokens if gas is 0.3 gwei and you'd never trade
  5. Reason explicitly: what's the best action this cycle?
     → Consider: which token has best risk/reward? Am I over/under-exposed?
     → If buying: which of DEGEN/BRETT/TOSHI has the best setup RIGHT NOW?
     → If holding: say why — don't just say "conditions not met"
  6. Execute if conviction is high (get quote first, then swap)
  7. Write memory.json → record portfolio snapshot, prices observed, decision + reasoning

━━━ EFFICIENCY RULE ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Each bash tool call costs real USDC. Think before calling.
  Bad: Check all 3 token prices even when gas is 0.5 gwei (you'd never trade)
  Good: Check gas first → only proceed to prices if gas is acceptable
  Every USDC spent on API calls comes out of your trading capital.`;

// ── Helper detection ──────────────────────────────────────────────────────────

type HelperInfo = { name: string; isPaid: boolean };

function detectHelper(cmd: string): HelperInfo | null {
  if (cmd.includes("balances"))  return { name: "get_balances",          isPaid: true };
  if (cmd.includes("portfolio")) return { name: "get_portfolio",         isPaid: true };
  if (cmd.includes("history"))   return { name: "get_transaction_history", isPaid: true };
  if (cmd.includes("gas"))       return { name: "get_gas_prices",        isPaid: true };
  if (cmd.includes("price"))     return { name: "get_token_price",       isPaid: true };
  if (cmd.includes("search"))    return { name: "search_token",          isPaid: true };
  if (cmd.includes("quote"))     return { name: "get_swap_quote",        isPaid: true };
  if (cmd.includes("swap"))      return { name: "execute_swap",          isPaid: true };
  return null;
}

// ── Main agent run ─────────────────────────────────────────────────────────────

export async function runAgent(walletAddress: string, dryRun: boolean): Promise<void> {
  display.wake();

  const oauthToken = process.env.CLAUDE_CODE_OAUTH_TOKEN;
  if (!oauthToken) throw new Error("Missing CLAUDE_CODE_OAUTH_TOKEN env variable");

  const env: Record<string, string> = {
    ...(Object.fromEntries(
      Object.entries(process.env).filter((e): e is [string, string] => e[1] !== undefined)
    )),
    CLAUDE_CODE_OAUTH_TOKEN: oauthToken,
    DRY_RUN: String(dryRun),
    WALLET_ADDRESS: walletAddress,
  };

  // Track tool-use IDs → names so we can display results properly
  const pendingTools = new Map<string, string>();

  const sdkQuery = query({
    prompt:
      "Run your portfolio management cycle: read memory, assess market conditions, make intelligent trading decisions, update memory.",
    options: {
      model: "claude-sonnet-4-6",
      maxTurns: 30,
      systemPrompt: SYSTEM_PROMPT,
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
      cwd: ROOT,           // so memory.json paths resolve correctly
      env,
      allowedTools: ["Bash", "Read", "Write"],
    } as Parameters<typeof query>[0]["options"],
  });

  for await (const message of sdkQuery) {
    // ── Assistant turn: tool calls + reasoning text ──────────────────────────
    if (message.type === "assistant") {
      for (const block of message.message.content) {
        const id = "id" in block && typeof block.id === "string" ? block.id : "";

        // Reasoning / decision text
        if ("text" in block && block.text) {
          display.agentText(block.text);
        }

        // Bash → one of the helper scripts
        if ("name" in block && block.name === "Bash") {
          const cmd =
            typeof block.input === "object" && block.input !== null
              ? ((block.input as Record<string, string>).command ?? "")
              : "";
          const helper = detectHelper(cmd);
          if (helper) {
            if (id) pendingTools.set(id, helper.name);
            display.toolRequest(helper.name);
          }
        }

        // Read tool — likely memory.json
        if ("name" in block && block.name === "Read") {
          const fp =
            typeof block.input === "object" && block.input !== null
              ? ((block.input as Record<string, string>).file_path ?? "")
              : "";
          if (fp.includes("memory")) {
            if (id) pendingTools.set(id, "read_memory");
            display.memoryRead();
          }
        }

        // Write tool — likely memory.json
        if ("name" in block && block.name === "Write") {
          const fp =
            typeof block.input === "object" && block.input !== null
              ? ((block.input as Record<string, string>).file_path ?? "")
              : "";
          if (fp.includes("memory")) {
            if (id) pendingTools.set(id, "write_memory");
            display.memoryWrite();
          }
        }
      }
    }

    // ── User turn: tool results ───────────────────────────────────────────────
    if (message.type === "user" && message.tool_use_result !== undefined) {
      const toolId = message.parent_tool_use_id ?? "";
      const helperName = pendingTools.get(toolId) ?? "tool";
      pendingTools.delete(toolId);

      // Memory ops: just confirm silently
      if (helperName === "read_memory" || helperName === "write_memory") {
        display.memoryDone(helperName === "write_memory");
        continue;
      }

      const raw =
        typeof message.tool_use_result === "string"
          ? message.tool_use_result
          : JSON.stringify(message.tool_use_result);

      try {
        const data = JSON.parse(raw);
        if (!data.error) {
          display.toolSuccess(helperName, data);

          // Surface swap outcome with extra emphasis
          if (helperName === "execute_swap") {
            if (dryRun) {
              display.dryRunResult(
                (data.from_amount ?? "?") as string,
                (data.to_amount ?? data.estimated_output ?? "?") as string
              );
            } else if (data.tx_hash) {
              // Determine direction from raw data
              const isToUsdc = (data.to_token ?? "").toLowerCase().includes("833589");
              display.tradeExecuted(
                data.from_amount ?? "?",
                isToUsdc ? "TOKEN" : "USDC",
                data.to_amount ?? data.estimated_output ?? "?",
                isToUsdc ? "USDC" : "TOKEN",
                data.tx_hash as string
              );
            }
          }
        } else {
          display.toolError(helperName, data.error as string);
        }
      } catch {
        // Non-JSON result (e.g. Read tool returns raw content)
        display.toolSuccess(helperName, { preview: raw.slice(0, 80) });
      }
    }
  }

  display.cycleEnd();
}
