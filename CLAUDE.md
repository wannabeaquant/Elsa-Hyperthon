# Elsa Agentic Hyperthon — Claude-Powered DeFi Trading Agent

## Project Overview

**What:** An autonomous AI trading agent that buys crypto dips on Base network, powered by Claude Opus 4.7 using the Claude Agent SDK + Elsa x402 micropayment protocol.

**Why:** Track 3 of the ElsaAI "Agentic Hyperthon" hackathon. The agent demonstrates:
- Claude as reasoning layer (not hardcoded rules)
- On-chain micropayments for every API call (x402 protocol)
- Claude Code OAuth approach (no per-token billing)
- Multi-token intelligence with memory-driven learning

**Status:** ✅ Core agent complete and functional. Ready for live demo.

---

## Architecture At A Glance

```
Every 60 seconds (configurable):

1. Claude reads memory.json
   ↓ (understand past trades, prices, patterns)
2. Get current balances ($0.005)
3. Check gas prices ($0.001)
   ↓ (if gas > threshold, skip prices and wait)
4. Check token prices for relevant tokens ($0.002 each)
5. Claude reasons and decides: buy / sell / hold / rebalance
6. Execute if conviction is high (get quote → swap)
   - Quote: $0.01
   - Swap: $0.10
7. Claude writes memory.json
   ↓ (save portfolio snapshot, trade outcome, observations)
```

**Key insight:** Claude makes all decisions. The system prompt tells it *why* to trade (goals + constraints), not *how* (no 5-step script). Claude decides which tokens to check, when to trade, how much, when to sell.

---

## Core Files & Their Purpose

### Main Agent Loop
- **`src/agent.ts`** — The heart. Uses `query()` from `@anthropic-ai/claude-agent-sdk`. Orchestrates:
  - System prompt (goal-based, intelligent)
  - Allowed tools: `["Bash", "Read", "Write"]`
  - Message iteration from Claude
  - Tool detection & display logic
  - Memory read/write operations

### Configuration & Display
- **`src/config.ts`** — Token registry (DEGEN, BRETT, TOSHI with contract addresses)
- **`src/display.ts`** — Terminal UI:
  - Shows 402 payment requests + costs
  - Displays agent reasoning
  - Shows trade execution + tx hash
  - Memory operation notifications

### Bash Helper Scripts (x402 Micropayment API Calls)
Each helper is self-contained, reads env vars (PRIVATE_KEY, WALLET_ADDRESS), makes one API call, prints JSON to stdout.

**Portfolio Data:**
- `src/helpers/balances.ts` — Quick balance check ($0.005)
- `src/helpers/portfolio.ts` — Full analysis + risk score ($0.01)
- `src/helpers/history.ts` — On-chain transaction history ($0.003)

**Market Data:**
- `src/helpers/gas.ts` — Base gas prices in gwei ($0.001)
- `src/helpers/price.ts <address>` — Token price + 24h % change ($0.002)
- `src/helpers/search.ts <query>` — Search/verify token address ($0.001)

**Trading:**
- `src/helpers/quote.ts <from> <to> <amount> <slippage>` — Swap quote ($0.01)
- `src/helpers/swap.ts <from> <to> <amount> <slippage>` — Execute swap ($0.10)

**Utilities:**
- `src/helpers/client.ts` — Shared x402 client factory (viem wallet + axios interceptor)

### Other Files
- **`src/index.ts`** — Entry point. Validates env, sets up interval, calls `runAgent()`
- **`memory.json`** — Persistent agent memory:
  - Portfolio snapshots over time
  - Trade history with reasoning
  - Price observations by token
  - Performance metrics (P&L, win rate)
  - Agent notes & patterns discovered
- **`.env`** — (DO NOT COMMIT) Contains PRIVATE_KEY, WALLET_ADDRESS, CLAUDE_CODE_OAUTH_TOKEN
- **`.env.example`** — Template for .env setup
- **`generate-wallet.ts`** — Helper to generate new Ethereum wallet (PRIVATE_KEY + WALLET_ADDRESS)

---

## Setup & Running

### 1. Environment Setup
```bash
# Copy template
cp .env.example .env

# Generate fresh wallet (or use existing)
npx tsx generate-wallet.ts
# Output: PRIVATE_KEY, WALLET_ADDRESS
# Copy into .env
```

### 2. Install Dependencies
```bash
npm install
# Installs: viem, axios, chalk, dotenv, x402-axios, @anthropic-ai/claude-agent-sdk, typescript
```

### 3. Wallet Funding
- **Share wallet address with hackathon organizers** (from .env: WALLET_ADDRESS)
- They fund it with: **0.003 ETH + $25 USDC on Base mainnet**
- This covers gas (ETH) + trading capital (USDC)

### 4. OAuth Token
- Get `CLAUDE_CODE_OAUTH_TOKEN` from your Claude Code settings
- Fill it into `.env`
- This enables Claude Agent SDK to run using your Claude Max/Pro subscription (no per-token billing)

### 5. Run Agent
```bash
# Dev mode (dry-run simulation)
DRY_RUN=true npm run dev

# Live trading mode (real swaps)
DRY_RUN=false npm run dev

# Custom interval (default 60000ms = 60s)
INTERVAL_MS=30000 npm run dev
```

---

## How the Agent Works

### System Prompt Philosophy
**NOT:** "Follow these 5 steps in this order."  
**YES:** "Here's your goal. Here are your tools and constraints. Make intelligent decisions."

The agent reads:
- **Goals:** Grow USD portfolio value over time
- **Constraints:** Max 30% per trade, min $2, max 60% concentration, prefer gas < 0.05 gwei
- **Tools:** 10 bash helpers + Read/Write for memory + Bash for commands
- **Memory:** Past trades, prices, patterns, performance
- **Tokens:** DEGEN, BRETT, TOSHI (or discover new ones via search)

### Decision Framework
Claude evaluates:
1. **Recent trade history** — Did buying dips work before? How long did they take to recover?
2. **Current portfolio** — What do I hold? Am I over-concentrated?
3. **Gas conditions** — Is gas cheap enough to justify executing?
4. **Token prices** — Which has the best risk/reward *right now*?
5. **Time of day** — Market cycles. Some times better than others.

Then decides:
- **BUY** if: Token down >5%, gas good, USDC available, no over-concentration
- **SELL** if: Token up >20% from entry (take profit) OR down >15% from entry (cut loss)
- **HOLD** if: Conditions marginal OR recently bought this token OR already concentrated
- **REBALANCE** if: One token > 60% of portfolio

### Memory System
Every cycle, Claude:
1. **Reads** `memory.json` — understand what happened before
2. **Observes** current state — prices, balances, gas
3. **Decides** — buy, sell, hold, rebalance
4. **Executes** — or skips if conditions don't justify $$ cost
5. **Writes** — records everything: portfolio snapshot, prices, trade decision, reasoning

Over time, memory becomes Claude's "experience." It spots patterns, learns which dips recover quickest, recognizes market hours.

---

## Token Addresses (Base Mainnet)

| Token | Address | Role |
|-------|---------|------|
| USDC | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` | Base currency (never sell all) |
| DEGEN | `0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed` | Primary target (Base OG memecoin) |
| BRETT | `0x532f27101965dd16442E59d40670FaF5eBB142E4` | Secondary target |
| TOSHI | `0xAC1Bd2486aAf3B5C0fc3Fd868558b082a531B2B4` | Tertiary target (verify before live) |
| WETH | `0x4200000000000000000000000000000000000006` | Watchlist / baseline |

> ⚠️ Before going live: Use `npx tsx src/helpers/search.ts BRETT` to verify token addresses via Elsa API.

---

## Elsa x402 API

**What it is:** Micropayment protocol. Client makes request → server returns HTTP 402 → x402-axios interceptor automatically signs USDC payment with your wallet → request succeeds.

**Endpoints we use:**
- `/api/get_balances` — Token balances for wallet
- `/api/get_portfolio` — Full portfolio analysis
- `/api/get_transaction_history` — On-chain tx history
- `/api/get_gas_prices` — Base gas prices
- `/api/get_token_price` — Token price + 24h change
- `/api/search_token` — Find/verify token by name
- `/api/get_swap_quote` — Swap routing + expected output
- `/api/execute_swap` — Execute swap on-chain

**Costs:** $0.001 — $0.10 per call. Each is a real USDC micropayment signed locally.

**Server:** `https://x402-api.heyelsa.ai`

---

## Development Workflow

### Making Changes
1. Edit source files in `src/`
2. Test locally with `DRY_RUN=true npm run dev`
3. Verify memory.json updates correctly
4. Check terminal output (display is comprehensive)

### Testing Agent Logic
- Run a few cycles with `DRY_RUN=true` to see decision-making
- Check `memory.json` to see what Claude recorded
- Verify displayed agent text makes sense

### Debugging
- **Agent reasoning visible:** System prompt output shows Claude's thinking
- **Memory tracking:** All observations go to `memory.json`
- **Tool costs clear:** Each helper shows its Elsa cost
- **Terminal output:** Beautiful chalk-based UI with timestamps

### Building New Features
1. Implement new bash helper (if calling Elsa API)
2. Add detection in `agent.ts` detectHelper()
3. Update system prompt with new tool description
4. Add display logic if needed
5. Test with `DRY_RUN=true`
6. Commit & push

---

## Next Steps / TODO

### Before Live Demo
- [ ] Verify BRETT and TOSHI addresses on-chain
- [ ] Stress-test with multiple cycles (memory.json growth)
- [ ] Confirm Elsa API routes and pricing
- [ ] Test with real $25 USDC on mainnet

### Nice-to-Have (Post-Hackathon)
- [ ] Add CoW Protocol limit orders (Elsa supports `/create_limit_order` at $0.05)
- [ ] Implement yield/staking suggestions (Elsa endpoint: `/get_yield_suggestions` at $0.02)
- [ ] Add on-chain whale detection (large transfer monitoring)
- [ ] Self-adjusting thresholds based on performance
- [ ] Multi-chain expansion (Ethereum, Arbitrum also supported by Elsa)
- [ ] Better memory pruning (don't let memory.json grow infinitely)
- [ ] Web dashboard for live monitoring

### Known Limitations
- Only monitors 3 tokens (DEGEN, BRETT, TOSHI) by default
- Memory is local file only (no backup)
- No stop-loss orders, only reactive selling
- No slippage protection beyond tolerance setting
- DRY_RUN flag controls all swaps (no selective simulation)

---

## Key Decisions & Trade-offs

### Why Claude Agent SDK + OAuth?
- **OAuth approach:** Claude Code subscription model, no per-token billing. Cost = flat $20/month regardless of tokens used.
- **Agent SDK:** Built-in tool handling, message iteration, managed loop. No need for manual streaming.
- **Alternative considered:** Raw `@anthropic-ai/sdk` with manual `messages.stream()` loop — more verbose, less elegant.

### Why Bash helpers instead of in-process tools?
- **Isolation:** Each API call is self-contained, no cross-contamination.
- **Debugging:** Easy to test helpers independently: `npx tsx src/helpers/price.ts <address>`
- **Permissions:** Claude runs tools via Claude Code's Bash, clean permission model.
- **Alternative considered:** In-process TypeScript tool definitions — tighter coupling, harder to debug.

### Why memory.json instead of vector DB?
- **Simplicity:** Local JSON file, no external dependencies.
- **Transparency:** Claude reads/writes readable JSON, easy to inspect and debug.
- **Hackathon:** Fast iteration. Real-time production system would use proper DB.

### Why goal-based prompt instead of step-by-step script?
- **Flexibility:** Claude adapts to market conditions. A hardcoded script would miss opportunities.
- **Intelligence:** Claude reasons about tradeoffs (is this 4% dip worth 0.08 gwei gas?).
- **Learning:** Memory lets Claude recognize patterns and improve over time.

---

## How to Continue On Another Claude Account

1. **Prep this repo:**
   - Everything is in git ✅
   - `.env` is in `.gitignore` so private key won't be pushed ✅
   - CLAUDE.md documents everything (this file) ✅

2. **On the new Claude account:**
   - Clone the repo: `git clone https://github.com/wannabeaquant/Elsa-Hyperthon.git`
   - Read this CLAUDE.md file ← **you are here**
   - Copy `.env.example` to `.env` and fill in credentials
   - `npm install`
   - `npm run dev` with `DRY_RUN=true` first

3. **Context efficiency:**
   - This CLAUDE.md covers architecture, setup, and decisions
   - Agent system prompt has the detailed decision logic
   - Code is self-documenting (helper names, function names, comments)
   - You shouldn't need the full conversation history

---

## For the Hackathon Demo

**Goal:** Show judges that Claude is making real, intelligent trading decisions on Base network using Elsa's x402 micropayment protocol.

**Demo script:**
1. Show the `.env` with wallet address (funded by organizers)
2. Start agent: `npm run dev` with `DRY_RUN=true`
3. Walk through 2-3 cycles showing:
   - Claude reading memory
   - Claude checking gas/prices
   - Claude's reasoning (visible in terminal)
   - x402 payment flow (402 → signing → verified)
   - Trade execution or hold decision + why
   - Memory being updated
4. Flip `DRY_RUN=false` and execute one real trade live
5. Show tx hash on BaseScan

**Talking points:**
- "Claude reads its own memory to learn from past trades"
- "Every API call is an x402 micropayment, signed with the wallet locally"
- "Claude decides what to do, not a script — watch it reason"
- "If this runs for weeks, it'll accumulate trading patterns and get smarter"

---

## Contact & Context

- **Original context:** Full conversation available at session start if needed, but this CLAUDE.md should be sufficient.
- **For questions:** Read system prompt in `src/agent.ts` for decision logic.
- **For tech details:** Check inline comments in helper scripts, they're self-contained.

---

**Last Updated:** April 17, 2026  
**Status:** Production-ready for hackathon demo. Smart agent loop complete. Ready to learn and trade.
