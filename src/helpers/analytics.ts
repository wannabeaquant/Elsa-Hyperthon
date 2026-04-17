#!/usr/bin/env tsx
/**
 * Free local signal computation — reads memory.json, outputs pre-computed analytics.
 * No API call, no x402 cost. Run at cycle start before spending anything.
 */
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");

// ── Types ─────────────────────────────────────────────────────────────────────

interface PriceObs {
  ts: string;
  price_usd: number;
  change_24h: number;
  vs_weth_pct?: number;
  velocity_obs?: string;
}

interface Trade {
  ts: string;
  action: "buy" | "sell";
  token: string;
  entry_price_usd?: number;
  exit_price_usd?: number;
  pnl_usd?: number;
}

interface GasObs {
  ts: string;
  gwei: number;
}

interface Memory {
  cycle_count?: number;
  trades?: Trade[];
  price_observations?: Record<string, PriceObs[]>;
  gas_observations?: GasObs[];
  performance?: {
    total_trades?: number;
    profitable_exits?: number;
    total_pnl_usd?: number;
    total_x402_spent?: number;
  };
}

// ── Core computation ──────────────────────────────────────────────────────────

function priceMomentum(obs: PriceObs[]): string {
  if (obs.length < 3) return "insufficient_data";
  const recent = obs.slice(-4);
  const deltas: number[] = [];
  for (let i = 1; i < recent.length; i++) {
    deltas.push(
      ((recent[i].price_usd - recent[i - 1].price_usd) / recent[i - 1].price_usd) * 100
    );
  }
  const last = deltas[deltas.length - 1];
  const prev = deltas.length >= 2 ? deltas[deltas.length - 2] : last;

  if (last > 0.8 && prev > 0)                             return "recovering";
  if (last > 0.3 && prev < 0)                             return "bouncing";
  if (last < -1 && Math.abs(last) > Math.abs(prev) * 1.3) return "accelerating_down";
  if (last < -0.5 && Math.abs(last) < Math.abs(prev) * 0.7) return "decelerating_down";
  if (last < -0.5)                                         return "falling";
  if (Math.abs(last) <= 0.5)                               return "flat";
  return "mixed";
}

function openPositions(trades: Trade[]): Record<string, { entry_price: number; entry_ts: string }> {
  const pos: Record<string, { entry_price: number; entry_ts: string }> = {};
  for (const t of trades) {
    if (t.action === "buy" && t.entry_price_usd) {
      pos[t.token] = { entry_price: t.entry_price_usd, entry_ts: t.ts };
    } else if (t.action === "sell") {
      delete pos[t.token];
    }
  }
  return pos;
}

function analyze(mem: Memory) {
  const now = new Date();
  const trades  = mem.trades  ?? [];
  const priceObs = mem.price_observations ?? {};
  const gasObs  = mem.gas_observations   ?? [];

  // ── Open positions ───────────────────────────────────────────────────────────
  const open = openPositions(trades);
  const positions: Record<string, object> = {};

  for (const [token, { entry_price, entry_ts }] of Object.entries(open)) {
    const obs: PriceObs[] = priceObs[token] ?? [];
    const lastObs  = obs[obs.length - 1];
    const curPrice = lastObs?.price_usd ?? entry_price;
    const pnlPct   = ((curPrice - entry_price) / entry_price) * 100;
    const daysHeld = (now.getTime() - new Date(entry_ts).getTime()) / 86_400_000;

    const recentPrices = obs.slice(-8).map(o => o.price_usd);
    const support    = recentPrices.length ? Math.min(...recentPrices) : null;
    const resistance = recentPrices.length ? Math.max(...recentPrices) : null;

    const tpTarget = entry_price * 1.20;
    const slTarget = entry_price * 0.85;

    positions[token] = {
      entry_price,
      current_price_est:  round6(curPrice),
      pnl_pct:            round1(pnlPct),
      days_held:          round1(daysHeld),
      trajectory:         priceMomentum(obs),
      support_est:        support  !== null ? round6(support)    : null,
      resistance_est:     resistance !== null ? round6(resistance) : null,
      tp_target:          round6(tpTarget),
      sl_target:          round6(slTarget),
      pct_to_tp:          round1(((tpTarget - curPrice) / curPrice) * 100),
      pct_to_sl:          round1(((curPrice - slTarget) / slTarget) * 100),
      data_age_hours:     lastObs ? round1(ageMins(lastObs.ts, now) / 60) : null,
    };
  }

  // ── Per-token analytics ──────────────────────────────────────────────────────
  const tokenAnalytics: Record<string, object> = {};

  for (const [token, obs] of Object.entries(priceObs)) {
    if (!obs.length) continue;
    const last = obs[obs.length - 1];

    const recentPrices = obs.slice(-8).map(o => o.price_usd);
    const support    = Math.min(...recentPrices);
    const resistance = Math.max(...recentPrices);

    // Completed exits for this token
    const exits  = trades.filter(t => t.token === token && t.action === "sell");
    const buyMap = trades.filter(t => t.token === token && t.action === "buy");

    let wins = 0, sumRecovPct = 0, sumRecovHrs = 0, sumDipAtEntry = 0, exitCount = 0;
    for (const sell of exits) {
      const matchBuy = [...buyMap].reverse().find(b => b.ts < sell.ts);
      if (!matchBuy?.entry_price_usd || !sell.exit_price_usd) continue;
      exitCount++;
      if ((sell.pnl_usd ?? 0) > 0) wins++;
      sumRecovPct += ((sell.exit_price_usd - matchBuy.entry_price_usd) / matchBuy.entry_price_usd) * 100;
      sumRecovHrs += (new Date(sell.ts).getTime() - new Date(matchBuy.ts).getTime()) / 3_600_000;
      // Get 24h change at entry time from price obs
      const nearBuy = obs
        .filter(o => o.ts <= matchBuy.ts)
        .sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime())[0];
      if (nearBuy?.change_24h) sumDipAtEntry += nearBuy.change_24h;
    }

    // ETH-adjusted dip (if we stored vs_weth_pct)
    const recentAdjusted = obs
      .slice(-4)
      .filter(o => o.vs_weth_pct != null)
      .map(o => o.vs_weth_pct!);
    const avgAdjusted = recentAdjusted.length
      ? round1(recentAdjusted.reduce((a, b) => a + b, 0) / recentAdjusted.length)
      : null;

    tokenAnalytics[token] = {
      obs_count:              obs.length,
      last_price:             last.price_usd,
      last_change_24h:        last.change_24h,
      last_vs_weth_pct:       last.vs_weth_pct ?? null,
      avg_recent_vs_weth_pct: avgAdjusted,
      data_age_hours:         round1(ageMins(last.ts, now) / 60),
      trajectory:             priceMomentum(obs),
      support_est:            round6(support),
      resistance_est:         round6(resistance),
      range_pct:              round1(((resistance - support) / support) * 100),
      currently_held:         token in open,
      completed_exits:        exitCount,
      win_rate:               exitCount ? round2(wins / exitCount) : null,
      avg_recovery_pct:       exitCount ? round1(sumRecovPct / exitCount) : null,
      avg_recovery_hours:     exitCount ? round1(sumRecovHrs / exitCount) : null,
      avg_dip_at_entry_pct:   exitCount ? round1(sumDipAtEntry / exitCount) : null,
    };
  }

  // ── Gas analytics ────────────────────────────────────────────────────────────
  const cheapCount = gasObs.filter(g => g.gwei < 0.05).length;
  const hourBuckets: Record<number, number[]> = {};
  for (const g of gasObs) {
    const hr = new Date(g.ts).getUTCHours();
    (hourBuckets[hr] ??= []).push(g.gwei);
  }
  const cheapHoursUTC = Object.entries(hourBuckets)
    .filter(([, vals]) => vals.reduce((a, b) => a + b, 0) / vals.length < 0.05)
    .map(([hr]) => `${hr.toString().padStart(2, "0")}:00 UTC`)
    .sort();

  // ── Signals ──────────────────────────────────────────────────────────────────
  const signals: string[] = [];

  for (const [token, ta] of Object.entries(tokenAnalytics) as [string, any][]) {
    const traj    = ta.trajectory as string;
    const last24h = ta.last_change_24h as number;
    const adjDip  = ta.last_vs_weth_pct as number | null;
    const ageHrs  = ta.data_age_hours as number;

    if (ageHrs > 3) {
      signals.push(
        `${token}: ⚠ price data is ${ageHrs}h old — verify with live check before acting`
      );
    }

    if (!ta.currently_held) {
      // ETH-adjusted dip signals (stronger signal)
      if (adjDip !== null && adjDip <= -5 && traj === "decelerating_down") {
        signals.push(
          `${token}: 🔥 STRONG BUY — ETH-adjusted dip ${adjDip}% with decelerating momentum. ` +
          `Historical: ${ta.avg_recovery_pct ?? "?"}% recovery in ${ta.avg_recovery_hours ?? "?"}h avg. Entry zone confirmed.`
        );
      } else if (adjDip !== null && adjDip <= -5 && traj !== "accelerating_down") {
        signals.push(
          `${token}: ✅ BUY SIGNAL — ETH-adjusted dip ${adjDip}%. Win rate: ${ta.win_rate !== null ? (ta.win_rate * 100) + "%" : "no history"}. Momentum: ${traj}.`
        );
      } else if (adjDip !== null && adjDip > -3 && last24h <= -5) {
        signals.push(
          `${token}: ⚠ WEAK DIP — ${last24h}% absolute but only ${adjDip}% vs ETH. Market-wide move, not idiosyncratic. Low conviction.`
        );
      } else if (last24h <= -6 && adjDip === null && traj === "decelerating_down") {
        signals.push(
          `${token}: BUY CANDIDATE — ${last24h}% dip, decelerating. No ETH baseline yet — check WETH to confirm.`
        );
      } else if (last24h <= -5 && traj === "accelerating_down") {
        signals.push(
          `${token}: ⏳ WAIT — ${last24h}% dip but momentum still accelerating. Don't catch a falling knife.`
        );
      }
    } else {
      // Position management signals
      const pos = (positions[token] ?? {}) as any;
      if (pos.pnl_pct >= 20) {
        signals.push(
          `${token}: 💰 TAKE PROFIT — position up ${pos.pnl_pct}% from entry. Target hit.`
        );
      } else if (pos.pnl_pct <= -15) {
        signals.push(
          `${token}: 🛑 STOP LOSS — position down ${pos.pnl_pct}% from entry. Review immediately.`
        );
      } else if (traj === "recovering" || traj === "bouncing") {
        signals.push(
          `${token}: ↗ held position showing ${traj} — hold, trend turning in our favour.`
        );
      } else if (pos.days_held > 2 && traj === "flat") {
        signals.push(
          `${token}: ⏸ flat for ${pos.days_held} days. Consolidation. Watch for breakout — could go either way.`
        );
      } else {
        signals.push(
          `${token}: holding at ${pos.pnl_pct}% P&L, ${pos.days_held}d held, ${pos.pct_to_tp}% to take-profit target.`
        );
      }
    }
  }

  if (!signals.length) {
    signals.push("No strong signals. Default: hold and re-check next cycle.");
  }

  return {
    generated_at:   now.toISOString(),
    cycles_analyzed: mem.cycle_count ?? 0,
    open_positions:  positions,
    token_analytics: tokenAnalytics,
    gas_summary: {
      total_observations: gasObs.length,
      cheap_pct: gasObs.length ? Math.round((cheapCount / gasObs.length) * 100) : null,
      cheapest_hours_utc: cheapHoursUTC,
    },
    performance_summary: {
      total_realized_pnl:  mem.performance?.total_pnl_usd ?? 0,
      total_x402_spent:    mem.performance?.total_x402_spent ?? 0,
      net_pnl_after_costs: round2(
        (mem.performance?.total_pnl_usd ?? 0) - (mem.performance?.total_x402_spent ?? 0)
      ),
    },
    signals,
    note: "All prices from memory — stale by definition. Always verify high-conviction signals with live check before executing.",
  };
}

// ── Utilities ─────────────────────────────────────────────────────────────────

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;
const round6 = (n: number) => Math.round(n * 1_000_000) / 1_000_000;
const ageMins = (ts: string, now: Date) =>
  (now.getTime() - new Date(ts).getTime()) / 60_000;

// ── Entry point ───────────────────────────────────────────────────────────────

try {
  const raw = readFileSync(path.join(ROOT, "memory.json"), "utf-8");
  const mem: Memory = JSON.parse(raw);
  console.log(JSON.stringify(analyze(mem), null, 2));
} catch (err) {
  console.error(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
  process.exit(1);
}
