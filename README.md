# DegenAI

An autonomous DeFi trading agent for the ElsaAI Agentic Hyperthon that buys crypto dips on Base, pays for each market-data or trading API call via the Elsa x402 micropayment flow, and uses an LLM as the decision-maker instead of hardcoded trading rules.

## Description

This project is a demonstration of what an agent-native trading system can look like when reasoning, payment, execution, and memory are combined into one loop.

The agent wakes up on a fixed interval, reads its local trading memory, runs free analytics against historical observations, decides whether the current market setup is worth paying to inspect further, and only then spends tiny on-chain payments to fetch live data or execute swaps. When conditions line up, it enters positions in tranches, manages exits with take-profit ladders, and records the entire cycle back into memory so the next decision is informed by prior outcomes.

At a high level, the project is trying to prove three things:

1. An LLM can operate as the reasoning layer of a trading agent without being reduced to a thin wrapper around a rigid rules engine.
2. On-chain micropayments make it viable to meter agent actions at the tool-call level, so every API request has an explicit, visible economic cost.
3. Local memory plus cheap pre-computation can make an autonomous agent more selective, more explainable, and more capital-efficient over time.

## The Goal Of The Project

The goal is to build a live, demo-ready autonomous trading agent that:

- Runs on Base network with real wallet state and real token prices.
- Uses Elsa's x402 payment flow to pay for each helper call on demand.
- Uses an LLM to decide what to inspect, what to ignore, when to buy, how much to buy, and when to sell.
- Narrates those decisions clearly enough that a judge or operator can understand why money is or is not being spent.
- Improves decision quality over time by persisting observations, trades, skipped opportunities, and notes in `memory.json`.

This is not meant to be a high-frequency trading bot or a claim of guaranteed profit. It is a practical hackathon system that showcases agentic reasoning, explicit tool economics, and memory-driven decision-making in a DeFi setting.

## The Problem It Tries To Solve

Most automated crypto trading bots fall into one of two buckets:

- They are heavily scripted, with thresholds and actions hardcoded ahead of time.
- They are expensive and opaque, making many API calls without a clear explanation of why those calls were worth the cost.

That creates several problems:

- Market conditions change faster than brittle scripts adapt.
- Small portfolios are highly sensitive to execution costs, quote costs, and unnecessary data fetching.
- Traders and demo judges cannot easily see the decision chain behind each action.
- Many "AI agents" are only cosmetic layers on top of fixed logic rather than true decision systems.

This project addresses those problems by combining:

- A free local analytics pass before spending anything.
- Selective paid data collection only when the setup looks promising.
- Relative-strength reasoning using WETH as a market baseline.
- Conviction-based sizing rather than uniform position sizes.
- Persistent memory so the agent can reference what happened in prior cycles.
- Visible cost narration so every payment has a rationale.

In short: the project tries to solve the gap between "smart trading logic" and "economically disciplined agent behavior."

## Why This Approach Matters

The interesting part of this repo is not just that it can place swaps. The interesting part is that the agent is forced to think economically at every step:

- Is gas cheap enough to even bother checking more prices?
- Is a token underperforming ETH, or is the whole market simply red?
- Is the dip still accelerating down, or is selling pressure weakening?
- Is this worth a `$0.002` price lookup?
- Is this setup strong enough to justify a `$0.010` quote and a `$0.100` swap?

That makes the agent closer to a capital allocator than a polling script.

## How The System Works

Each cycle follows this pattern:

1. Read `memory.json`.
2. Run `src/helpers/analytics.ts` locally for free.
3. Check balances.
4. Check gas on Base.
5. If gas is acceptable, fetch WETH price as the market baseline.
6. Fetch token prices selectively for flagged or held tokens.
7. Compute ETH-adjusted dips, conviction, and sizing.
8. Execute buy, hold, take-profit, or stop-loss logic.
9. Write the updated memory back to disk.

The core design choice is that the model receives goals, constraints, tools, and context. It is not hardcoded to blindly query every endpoint every minute.

## Core Strategy

### 1. Analytics First

`src/helpers/analytics.ts` reads local memory and computes:

- Price trajectory and momentum.
- Volatility context.
- Signal counts.
- Open-position summaries.
- Performance after API costs.
- Data-sufficiency gates so weak historical samples are not presented as strong statistics.

Because this is local computation, the agent gets a first-pass market view without paying x402 costs.

### 2. Relative Strength With WETH Baseline

The bot does not rely only on raw 24h token change. It compares a token's move against WETH:

`ETH-adjusted dip = token_change_24h - WETH_change_24h`

This helps separate true token-specific weakness from broad market moves.

### 3. Conviction-Based Entries

The strategy counts aligned signals such as:

- ETH-adjusted dip magnitude.
- Momentum quality.
- Gas affordability.
- Available USDC and concentration limits.
- Historical support from prior outcomes.

More aligned signals allow a larger allocation.

### 4. DCA Tranche Deployment

Instead of going all-in on the first entry, the agent can average into deeper dips in stages.

### 5. Laddered Profit Taking

Instead of waiting for one exit point, the strategy takes profit in stages, which reduces the risk of round-tripping a winning trade.

### 6. Memory-Driven Learning

The agent stores:

- Portfolio snapshots.
- Price observations.
- Trades and PnL.
- Gas observations.
- Skipped opportunities.
- Configuration and notes.

This makes each cycle stateful rather than stateless.

## Architecture

### Main Runtime

- `src/index.ts`: bootstraps env validation, starts the dashboard server, and schedules trading cycles.
- `src/agent.ts`: contains the system prompt, tool usage model, helper detection, and the main agent loop.
- `src/display.ts`: terminal UI, payment narration, analytics summaries, and cycle-level reporting.
- `src/dashboardServer.ts`: lightweight Express + WebSocket server for the local dashboard.
- `src/eventBus.ts`: bridges terminal events to the dashboard.

### Helpers

Each helper is a focused script that performs one task and prints JSON.

- `src/helpers/analytics.ts`: free local analytics from memory.
- `src/helpers/balances.ts`: wallet balances.
- `src/helpers/portfolio.ts`: portfolio analysis and risk.
- `src/helpers/history.ts`: transaction history.
- `src/helpers/gas.ts`: Base gas pricing.
- `src/helpers/price.ts`: token price lookup.
- `src/helpers/search.ts`: token discovery or address verification.
- `src/helpers/quote.ts`: swap quote.
- `src/helpers/swap.ts`: swap execution or simulation.
- `src/helpers/client.ts`: shared x402-enabled HTTP client.

### State

- `memory.json`: persistent experience store for the agent.
- `.env`: runtime secrets and configuration.
- `public/index.html`: local web dashboard.

## Project Features

- Autonomous recurring trading loop.
- Memory-aware decision-making.
- Analytics-before-spend architecture.
- x402 micropayment-gated market data and trading calls.
- Conviction scoring and adaptive sizing.
- DCA entries.
- Laddered exits.
- Dry-run mode for safe demo and testing.
- Live terminal narration of cost decisions.
- Local dashboard streaming agent events in real time.

## Tech Stack

- TypeScript
- Node.js
- `@anthropic-ai/claude-agent-sdk`
- `axios`
- `x402-axios`
- `viem`
- `express`
- `ws`
- `chalk`

## Cost Model

The terminal display tracks per-tool cost so the economics stay visible.

Typical helper pricing in the current implementation:

- Balances: `$0.005`
- Portfolio: `$0.010`
- History: `$0.003`
- Gas: `$0.001`
- Token price: `$0.002`
- Search: `$0.001`
- Quote: `$0.010`
- Swap: `$0.100`

This matters because the system is designed to avoid wasteful calls, not just make correct calls.

## Repository Layout

```text
.
├─ src/
│  ├─ agent.ts
│  ├─ config.ts
│  ├─ dashboardServer.ts
│  ├─ display.ts
│  ├─ eventBus.ts
│  ├─ index.ts
│  └─ helpers/
│     ├─ analytics.ts
│     ├─ balances.ts
│     ├─ client.ts
│     ├─ gas.ts
│     ├─ history.ts
│     ├─ portfolio.ts
│     ├─ price.ts
│     ├─ quote.ts
│     ├─ search.ts
│     └─ swap.ts
├─ public/
│  └─ index.html
├─ memory.json
├─ generate-wallet.ts
├─ package.json
├─ AGENTS.md
└─ README.md
```

## Setup

### Prerequisites

- Node.js 18+
- A Base wallet with:
  - ETH for gas
  - USDC for trading and x402 micropayments
- A valid `CLAUDE_CODE_OAUTH_TOKEN`

### Installation

```bash
npm install
```

### Environment

Copy the example env file:

```bash
cp .env.example .env
```

Fill in:

- `PRIVATE_KEY`
- `WALLET_ADDRESS`
- `CLAUDE_CODE_OAUTH_TOKEN`
- `USE_MAINNET`
- `BASE_RPC_URL`
- `X402_SERVER_URL`
- `DRY_RUN`
- `INTERVAL_MS`
- `DASHBOARD_PORT`

### Generate A Wallet

```bash
npx tsx generate-wallet.ts
```

### Build

```bash
npm run build
```

## Running The Agent

### Dry Run

```bash
DRY_RUN=true npm run dev
```

### Live Trading

```bash
DRY_RUN=false npm run dev
```

### Production Build

```bash
npm start
```

### Limit The Number Of Cycles

The code supports `MAX_CYCLES`, which is useful for testing:

```bash
MAX_CYCLES=1 DRY_RUN=true npm run dev
```

## Dashboard

When the app starts, it also launches a local dashboard server. By default it is available at:

[`http://localhost:3000`](http://localhost:3000)

The dashboard receives live events over WebSocket and can bootstrap itself from `memory.json` on connection.

## Example Development Commands

Run analytics directly:

```bash
npx tsx src/helpers/analytics.ts
```

Check gas:

```bash
npx tsx src/helpers/gas.ts
```

Check a token price:

```bash
npx tsx src/helpers/price.ts 0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed
```

Verify a token symbol or address:

```bash
npx tsx src/helpers/search.ts BRETT
```

## Token Universe

The current watchlist is defined in `src/config.ts` and includes:

- USDC
- WETH
- DEGEN
- BRETT
- TOSHI

The active monitored buy-side watchlist is `DEGEN`, `BRETT`, and `TOSHI`, while `WETH` is used as the relative-strength baseline and `USDC` is the base currency.

## Memory Model

`memory.json` is the agent's persistent state. It stores more than trade logs. It stores the context the model needs to reason well over time.

Key categories include:

- Cycle count and timestamps.
- Portfolio snapshots.
- Trades.
- Price observations.
- Gas observations.
- Skipped opportunities.
- Aggregate performance.
- Token configuration.
- Freeform agent notes.

This is what makes the system experience-based rather than purely reactive.

## Safety And Constraints

The strategy includes explicit operational guardrails:

- Max single trade capped as a share of current USDC.
- Minimum trade sizing.
- Max token concentration.
- Gas-aware skipping.
- Dry-run mode for non-destructive testing.
- Selective data fetching instead of querying everything every cycle.

These do not eliminate risk. They only reduce obvious operational mistakes.

## Limitations

- This is a hackathon project, not a production trading platform.
- The strategy watches a small token universe by default.
- `memory.json` is local state, not a durable distributed datastore.
- No limit-order workflow in the current main loop.
- Strategy quality is sensitive to the quality and quantity of historical observations.
- Live trading still carries market, slippage, smart contract, and model-risk exposure.

## Who This Project Is For

This repo is useful for people who want to explore:

- LLM-based autonomous agents with tool use.
- DeFi automation on Base.
- Agent economics and pay-per-tool workflows.
- Memory-driven decision systems.
- Demoable, inspectable agent architectures for hackathons.

## Summary

DegenAI is a practical demonstration of an autonomous crypto agent that treats reasoning, execution, payment, and memory as one system.

Its central thesis is simple: an agent should not just know how to trade, it should know when a decision is worth paying to make.
