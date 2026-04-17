# Elsa Agentic Hyperthon — Codex-Powered DeFi Trading Agent

## Project Overview

**What:** An autonomous AI trading agent that buys crypto dips on Base network, powered by Codex Sonnet 4.6 using the Codex Agent SDK + Elsa x402 micropayment protocol.

**Why:** Track 3 of the ElsaAI "Agentic Hyperthon" hackathon. The agent demonstrates:
- Codex as reasoning layer (not hardcoded rules)
- On-chain micropayments for every API call (x402 protocol)
- Codex OAuth approach (no per-token billing)
- Multi-token intelligence with memory-driven learning
- Conviction-based position sizing, DCA strategy, take-profit laddering

**Status:** ✅ Core agent complete and functional. Ready for live demo.

---

## Architecture At A Glance

```
Every 60 seconds (configurable):

1. Codex reads memory.json                        (free — local file)
   ↓ (understand past trades, prices, patterns)
2. Run analytics.ts                                (free — local computation)
   ↓ (signals, momentum, conviction, seasonality pre-computed from memory)
3. Get current balances ($0.005)
4. Check gas prices ($0.001)
   ↓ (if gas > 0.15 gwei, skip ALL price checks and sleep)
5. Check WETH price ($0.002) → sets ETH baseline for adjusted dips
6. Check token prices selectively ($0.002 each)
   ↓ (only tokens analytics flagged OR tokens currently held)
7. Codex reasons with conviction scoring:
   - Count 5 signals → low/medium/high conviction
   - Size position by conviction (15%/25%/30%)
   - Check time-of-day seasonality
   - Apply DCA strategy for dip entries
8. Execute if conviction ≥ 3 signals:
   - Get quote ($0.01) → execute swap ($0.10)
   - Deploy in tranches (40% → 40% → 20% as dip worsens)
9. Take profit via laddering:
   - Sell 15% at +10%, 25% at +15%, 30% at +25%, 30% at +40%
10. Codex writes memory.json                      (free — local file)
    ↓ (snapshot, trade record, price obs, signals, conviction, seasonality)
```

**Key insight:** Codex makes all decisions. The system prompt describes *goals and constraints*, not *steps*. Codex decides which tokens to check, when to trade, how much, and when to sell — narrating every cost decision out loud for demo visibility.

---

## Core Files & Their Purpose

### Main Agent Loop
- **`src/agent.ts`** — The heart. Uses `query()` from `@anthropic-ai/Codex-agent-sdk`. Contains:
  - System prompt (goal-based, not scripted): conviction framework, DCA, laddering, seasonality
  - Allowed tools: `["Bash", "Read", "Write"]`
  - `detectHelper()` — maps Bash commands to tool names for display
  - Message iteration, tool display, memory read/write detection
  - `runAgent()` export called by index.ts

### Configuration & Display
- **`src/config.ts`** — Token registry (DEGEN, BRETT, TOSHI, WETH, USDC with Base mainnet addresses)
- **`src/display.ts`** — Terminal UI:
  - Every x402 payment shows: tool name, cost ($0.00X), session running total
  - `paymentResult()` — formats result per tool (price change, gas level, balances)
  - ETH-adjusted dip label on token price results (vs WETH baseline)
  - `analyticsResult()` — displays conviction levels, signals, open positions P&L
  - Cycle summary: portfolio delta and net P&L after API costs
  - `TOOL_COSTS` map: source of truth for per-call pricing

### Bash Helper Scripts (x402 Micropayment API Calls)
Each helper is a standalone script, reads env vars, makes one Elsa API call, prints JSON to stdout.
Codex invokes these via Bash; the x402 interceptor handles payment transparently.

**Free (local computation, no API):**
- `src/helpers/analytics.ts` — reads memory.json, outputs pre-computed signals, momentum, volatility bands, time-of-day seasonality, conviction count. Runs first every cycle. Includes **data-sufficiency gates**: `win_rate` is suppressed (set to `null` with a `win_rate_note`) until ≥3 completed exits; `trajectory` is `"insufficient_data"` until ≥5 price observations; seasonality is withheld until ≥3 hour buckets have data. Every token with thin history gets a `📊 LEARNING` signal so Codex (and judges) know signals are directional, not statistically validated.

**Portfolio Data:**
- `src/helpers/balances.ts` — Quick balance check ($0.005)
- `src/helpers/portfolio.ts` — Full analysis + risk score ($0.010)
- `src/helpers/history.ts` — On-chain transaction history ($0.003)

**Market Data:**
- `src/helpers/gas.ts` — Base gas prices in gwei ($0.001)
- `src/helpers/price.ts <address>` — Token price + 24h % change ($0.002)
- `src/helpers/search.ts <query>` — Search/verify token address ($0.001)

**Trading:**
- `src/helpers/quote.ts <from> <to> <amount> <slippage>` — Swap quote ($0.010)
- `src/helpers/swap.ts <from> <to> <amount> <slippage>` — Execute swap ($0.100)

**Utilities:**
- `src/helpers/client.ts` — Shared x402 client factory. Creates viem walletClient from PRIVATE_KEY, wraps axios with `withPaymentInterceptor()`. Every helper imports `createX402Client()`.

### Other Files
- **`src/index.ts`** — Entry point. Validates env vars, sets up 60s interval, calls `runAgent()`
- **`memory.json`** — Persistent agent memory (full schema documented below)
- **`.env`** — (DO NOT COMMIT) PRIVATE_KEY, WALLET_ADDRESS, CLAUDE_CODE_OAUTH_TOKEN
- **`.env.example`** — Template for .env setup
- **`generate-wallet.ts`** — Helper to generate new Ethereum wallet

---

## Setup & Running

### 1. Environment Setup
```bash
cp .env.example .env

# Generate fresh wallet (or use existing)
npx tsx generate-wallet.ts
# Output: PRIVATE_KEY, WALLET_ADDRESS — copy into .env
```

### 2. Install & Build
```bash
npm install
npm run build     # compiles TypeScript to dist/
```

### 3. Wallet Funding
- Share `WALLET_ADDRESS` with hackathon organizers
- They fund: **0.003 ETH + $25 USDC on Base mainnet**
- ETH covers gas, USDC is trading capital

### 4. OAuth Token
- Get `CLAUDE_CODE_OAUTH_TOKEN` from Codex settings (Settings → Account)
- Fill into `.env`
- Enables Codex Agent SDK using your Codex Max/Pro subscription — no per-token billing

### 5. Run Agent
```bash
# Dev mode (dry-run — no real swaps)
DRY_RUN=true npm run dev

# Live trading mode
DRY_RUN=false npm run dev

# Custom interval (default 60000ms)
INTERVAL_MS=30000 npm run dev

# Or run compiled build:
DRY_RUN=true npm start
```

---

## How the Agent Works

### Analytics-First Approach (Free Computation)

Before spending a cent on API calls, Codex runs `src/helpers/analytics.ts` — a free local script that reads `memory.json` and pre-computes:

1. **Price momentum** — classifies the last 3-5 price observations as `accelerating_down`, `falling`, `decelerating_down`, `flat`, `bouncing`, or `recovering`. Timing entries around "decelerating_down" is the core edge.

2. **ETH-adjusted dip** — `token_change_24h − WETH_change_24h`. Strips market-wide moves so we only react to *relative* weakness. DEGEN -6% when WETH is -5% = real signal only -1%. DEGEN -6% when WETH is +1% = real signal -7%.

3. **Volatility bands** — ATR (Average True Range) and Bollinger Bands (±2 STD) computed from price_observations in memory. Tells Codex whether the current move is large or small relative to recent history.

4. **Time-of-day seasonality** — scans past trades grouped by UTC hour, computes average recovery % and win rate per hour. Learns that DEGEN dips at 08-10 UTC recover better than 20-21 UTC. **Requires ≥3 completed hour buckets before reporting best/worst hours** — suppressed with a `seasonality_note` until then.

5. **Signal counting** — aggregates 5 binary signals into conviction score.

### Signal Strength & Conviction

5 signals Codex checks per token:
- ETH-adjusted dip ≤ -5%
- Momentum = decelerating_down, flat, or bouncing
- Gas acceptable (< 0.05 gwei normally, < 0.10 for large dips)
- USDC available, not over-concentrated
- Historical win rate supports this dip magnitude

| Signals Aligned | Conviction | Max Position Size |
|-----------------|------------|------------------|
| 3 signals       | LOW        | 15% of USDC      |
| 4 signals       | MEDIUM     | 25% of USDC      |
| 5 signals       | HIGH       | 30% of USDC      |

### DCA Entry Strategy

Rather than all-in on first signal:
- **Tranche 1** (40% of target size): deploy when ETH-adj ≤ -5% + 3+ signals
- **Tranche 2** (40% more): add if dip worsens to ≤ -6% next cycle
- **Tranche 3** (final 20%): add if dip reaches ≤ -7%

Seasonality adjusts sizing: +10% if current hour matches `best_buy_hours_utc` for that token, -25% if it matches `avoid_hours_utc`.

### Take-Profit Laddering

Rather than all-out at one target:
- Sell 15% at +10% from entry
- Sell 25% at +15% from entry
- Sell 30% at +25% from entry
- Remaining 30% at +40% from entry (or rotate to better opportunity)

Stop-loss: sell 30% at -10%, full position at -15%.

### Memory as Experience

Every cycle Codex records:
- **Portfolio snapshot** — USDC + holdings + total USD
- **Price observations** — price, 24h change, vs_weth_pct, velocity assessment
- **Trades** — with entry_signals (conviction level, signal count, dip %, momentum, seasonality applied), milestones (1h/4h price), ladder_executed
- **Skipped opportunities** — token, reason, conviction, outcome (did it recover?)
- **Agent notes** — freeform pattern observations Codex writes itself

Over time memory becomes the agent's "experience" — win rates per dip magnitude, recovery times per token, best trading hours.

### WETH Baseline

Every cycle (when gas permits), Codex checks WETH price *before* any memecoins. This sets `_lastWethChange` in display.ts, which is then used to label every subsequent token price result with its ETH-adjusted dip. Visible in terminal as `ETH-adj: -7.2% ← REAL DIP`.

### Cost Narration (Critical for Demo)

Codex speaks every spending decision out loud:
- `"Analytics shows BRETT flat. Skipping — saving $0.002."`
- `"Gas is 0.14 gwei. Skipping all price checks — saving $0.006."`
- `"ETH-adjusted dip is -7.2%, decelerating. Spending $0.01 + $0.10 to act."`

---

## Memory Schema

Full `memory.json` schema (write all fields on every update):

```json
{
  "version": 1,
  "cycle_count": number,
  "last_updated": "ISO string",
  "portfolio_snapshots": [
    { "ts": "ISO", "usdc": number, "holdings": { "SYMBOL": { "amount": string, "value_usd": number } }, "total_usd": number }
  ],
  "trades": [
    {
      "ts": "ISO", "action": "buy"|"sell", "token": "SYMBOL",
      "from_amount": string, "to_amount": string, "reason": string,
      "gas_gwei": number,
      "entry_price_usd": number,              // buy only
      "exit_price_usd": number,               // sell only
      "pnl_usd": number,                      // sell only
      "entry_signals": {                      // buy only
        "eth_adjusted_dip_pct": number,
        "momentum": string,
        "gas_gwei": number,
        "win_rate": number | null,
        "signal_count": number,
        "conviction_level": "low"|"medium"|"high"
      },
      "seasonality_applied": string,          // e.g. "best_buy_window" | "neutral_hour"
      "position_size_pct": number,            // % of USDC used
      "milestones": { "1h_price": number, "4h_price": number, "24h_price": number },
      "exit_reason": string,                  // e.g. "take_profit_ladder_3"
      "ladder_executed": { ... },             // sell only
      "hold_duration_hours": number           // sell only
    }
  ],
  "price_observations": {
    "SYMBOL": [{ "ts": "ISO", "price_usd": number, "change_24h": number }]
  },
  "gas_observations": [{ "ts": "ISO", "gwei": number, "action": string }],
  "skipped_opportunities": [
    { "ts": "ISO", "token": string, "eth_adjusted_dip_pct": number, "reason": string, "gas_gwei": number, "conviction_level": string, "outcome": string }
  ],
  "performance": {
    "total_trades": number, "profitable_exits": number,
    "total_pnl_usd": number, "win_rate": number,
    "max_drawdown_pct": number,
    "best_trade_pnl": number,
    "total_x402_spent": number, "pnl_after_api_costs": number
  },
  "token_config": {
    "SYMBOL": {
      "min_eth_adj_dip": number,
      "target_conviction": string,
      "max_position_pct": number,
      "best_buy_hours_utc": number[],
      "avoid_hours_utc": number[]
    }
  },
  "agent_notes": [string]
}
```

---

## Token Addresses (Base Mainnet)

| Token | Address | Role |
|-------|---------|------|
| USDC | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` | Base currency (never sell all) |
| WETH | `0x4200000000000000000000000000000000000006` | ETH baseline — check every cycle |
| DEGEN | `0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed` | Primary target (Base OG memecoin) |
| BRETT | `0x532f27101965dd16442E59d40670FaF5eBB142E4` | Secondary target |
| TOSHI | `0xAC1Bd2486aAf3B5C0fc3Fd868558b082a531B2B4` | Tertiary target (verify before live) |

> ⚠️ Before going live: `npx tsx src/helpers/search.ts BRETT` to verify addresses via Elsa API.

---

## Elsa x402 API

**How it works:** Every helper uses `withPaymentInterceptor(axiosInstance, walletClient)` from `x402-axios`. The flow:
1. Helper makes HTTP request to Elsa API
2. Server returns HTTP 402 Payment Required
3. x402-axios interceptor fires, signs a USDC micropayment with viem walletClient
4. Payment verified on-chain
5. Original request retried → response returned

Codex doesn't see any of this — it just calls `npx tsx src/helpers/gas.ts` and gets JSON back.

**Endpoints used:**
- `/api/get_balances` — token balances for wallet
- `/api/get_portfolio` — full portfolio analysis + risk score
- `/api/get_transaction_history` — on-chain tx history
- `/api/get_gas_prices` — Base gas prices
- `/api/get_token_price` — token price + 24h change
- `/api/search_token` — find/verify token by name
- `/api/get_swap_quote` — swap routing + expected output
- `/api/execute_swap` — execute swap on-chain

**Server:** `https://x402-api.heyelsa.ai`

---

## Development Workflow

### Making Changes
1. Edit `src/` files
2. `npm run build` (compiles TypeScript)
3. Test with `DRY_RUN=true npm start`
4. Verify `memory.json` updates correctly
5. Check terminal output for correct conviction/signal display
6. **Push frequently** — after each feature/fix, run:
   ```bash
   git add .
   git commit -m "Describe what changed"
   git push origin main
   ```
   This ensures work is backed up and available to other Codex sessions.

### Testing Analytics Independently
```bash
# Run just the analytics pre-processor against current memory.json
npx tsx src/helpers/analytics.ts
```

### Testing Individual Helpers
```bash
# Requires .env to be set up
npx tsx src/helpers/gas.ts
npx tsx src/helpers/price.ts 0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed
npx tsx src/helpers/balances.ts
```

### Building New Features
1. Add new bash helper if calling a new Elsa API endpoint
2. Add cost to `TOOL_COSTS` in `src/display.ts`
3. Add detection in `detectHelper()` in `src/agent.ts`
4. Update system prompt with new tool description and when to use it
5. Add display formatting in `formatResult()` if needed
6. Test with `DRY_RUN=true`

---

## Next Steps / TODO

### Before Live Demo
- [ ] Verify BRETT and TOSHI addresses on-chain via search helper
- [ ] Run 3-5 dry-run cycles to confirm memory.json writes correctly
- [ ] Confirm Elsa API routes and pricing match current endpoint list
- [ ] Test with real $25 USDC on mainnet

### Nice-to-Have (Post-Hackathon)
- [ ] CoW Protocol limit orders (`/create_limit_order` at $0.05)
- [ ] Yield/staking suggestions (`/get_yield_suggestions` at $0.02)
- [ ] On-chain whale detection (large transfer monitoring)
- [ ] Self-adjusting dip thresholds based on historical win rates
- [ ] Multi-chain expansion (Ethereum, Arbitrum supported by Elsa)
- [ ] Memory pruning (cap price_observations per token, keep last 50)
- [ ] Web dashboard for live monitoring

### Known Limitations
- Only monitors 3 tokens (DEGEN, BRETT, TOSHI) by default
- memory.json is a local file — no backup, no cloud sync
- DRY_RUN controls ALL swaps — no per-trade simulation override
- Seasonality patterns need ≥3 completed hour buckets to report; analytics explicitly withholds and labels thin data with `📊 LEARNING` signals
- No limit orders — all entries are market orders

---

## Key Decisions & Trade-offs

### Why Codex Sonnet 4.6 (not Opus)?
- Sonnet is faster and significantly cheaper per token
- For this use case (trading decisions with structured memory context) Sonnet's reasoning is sufficient
- Opus would be worth it for more complex multi-step research tasks

### Why Codex Agent SDK + OAuth?
- OAuth approach: flat $20/month Codex Max subscription, no per-token billing
- Agent SDK: built-in tool handling, message iteration, managed loop
- Alternative: raw `@anthropic-ai/sdk` with manual streaming — more code, same capability

### Why analytics.ts as a free pre-processor?
- Most intelligence (momentum, seasonality, signal counting) doesn't need fresh API data — it runs from memory
- Running analytics first avoids spending $0.002-0.01 on tokens that analytics already shows as "flat, no signal"
- Every cycle that analytics saves one price check pays for itself 2x over (analytics is free)

### Why Bash helpers instead of in-process tools?
- Isolation: each API call is self-contained, no shared state
- Debuggable: `npx tsx src/helpers/price.ts <addr>` works independently
- Simple permission model: Codex runs tools via Codex Bash

### Why memory.json instead of vector DB?
- Local JSON, no external dependencies, zero setup
- Codex reads/writes readable JSON — easy to inspect, debug, and pre-seed
- For a hackathon: transparency beats sophistication

### Why goal-based prompt over step-by-step script?
- Flexibility: Codex adapts (checks gas before prices, skips flat tokens)
- Intelligence: Codex weighs tradeoffs ("is -4% dip worth 0.08 gwei gas?")
- Learning: memory patterns improve decision quality over cycles

---

## How to Continue On Another Codex Account

1. **Clone the repo:**
   ```bash
   git clone https://github.com/wannabeaquant/Elsa-Hyperthon.git
   cd Elsa-Hyperthon
   ```

2. **Set up environment:**
   ```bash
   cp .env.example .env
   # Fill in: PRIVATE_KEY, WALLET_ADDRESS, CLAUDE_CODE_OAUTH_TOKEN
   # USE_MAINNET=true, X402_SERVER_URL=https://x402-api.heyelsa.ai
   ```

3. **Install and build:**
   ```bash
   npm install
   npm run build
   ```

4. **Orient yourself:**
   - Read this AGENTS.md ← you're here
   - Read `src/agent.ts` system prompt for the decision logic (~200 lines starting at `const SYSTEM_PROMPT`)
   - Run `cat memory.json` to see agent history (pre-seeded with 14 realistic cycles)
   - Run `npx tsx src/helpers/analytics.ts` to see what signals the memory produces

5. **Test before going live:**
   ```bash
   DRY_RUN=true npm start
   ```

---

## For the Hackathon Demo

**Goal:** Show judges that Codex is making real, intelligent trading decisions on Base using Elsa's x402 micropayment protocol — with every cost decision narrated out loud.

**Demo script:**
1. Show the terminal starting up — cycle header, memory read
2. Watch analytics run (free, instant) → signals appear with conviction levels
3. Watch gas check ($0.001 micropayment → 402 → signed → verified → result)
4. Watch WETH price check ($0.002) → ETH baseline set
5. Watch token price for any flagged token — ETH-adjusted dip label appears
6. Read Codex's reasoning out loud — it narrates costs, skips, and decisions
7. If a trade fires: watch quote ($0.010) then swap ($0.100) execute
8. Watch memory write — cycle recorded
9. Show memory.json — trade recorded with conviction, signals, seasonality

**Flip to live:**
```bash
DRY_RUN=false npm start
```
Show tx hash → BaseScan link in terminal → confirmed on-chain.

**Talking points:**
- "Codex reads its own memory first — it knows what worked last time"
- "The analytics pre-processor runs for free before we spend a cent"
- "Every API call is a real USDC micropayment, signed locally with the wallet"
- "Conviction scoring: 3 signals = small position, 5 signals = full size"
- "DCA strategy: deploys in tranches as dips deepen — not all-in at once"
- "Take-profit laddering: sells in stages to capture upside without going all-out"
- "If this runs for weeks, it gets smarter — more seasonality data, better win rates"

---

## Contact & Context

- **Repo:** `https://github.com/wannabeaquant/Elsa-Hyperthon`
- **System prompt:** `src/agent.ts` → `SYSTEM_PROMPT` constant (~210 lines)
- **Decision logic detail:** Signal counting, DCA, laddering all in system prompt
- **Seeded history:** `memory.json` has 14 pre-built cycles including 3 trades (1 profitable DEGEN exit +$1.72, BRETT position currently held -5.5% from entry). Note: this is seed data for demo bootstrapping — analytics.ts will label it `📊 LEARNING` and suppress win-rate/seasonality signals until real trade history accumulates.

---

**Last Updated:** April 17, 2026
**Model:** Codex Sonnet 4.6 (`Codex-sonnet-4-6`)
**Status:** Production-ready for hackathon demo. Analytics-first conviction framework live. Data-sufficiency gates in analytics.ts prevent thin-sample signals from appearing statistically validated.
