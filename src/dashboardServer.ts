import express from "express";
import { WebSocketServer, WebSocket } from "ws";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import { eventBus } from "./eventBus.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function startDashboard(port = 3000): void {
  const app = express();
  const server = createServer(app);
  const wss = new WebSocketServer({ server });

  // Serve the public directory
  app.use(express.static(path.join(__dirname, "../public")));

  function broadcast(event: string, data: unknown): void {
    const msg = JSON.stringify({ event, data, ts: new Date().toISOString() });
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) client.send(msg);
    });
  }

  // Forward all display events to connected browser clients
  const events = [
    "header", "wake", "payment", "paymentResult", "paymentError",
    "analyticsRun", "analyticsResult", "memoryRead", "memoryWrite",
    "memoryDone", "agentText", "tradeExecuted", "dryRunResult",
    "cycleEnd", "error",
  ];
  for (const ev of events) {
    eventBus.on(ev, (data?: unknown) => broadcast(ev, data ?? {}));
  }

  // On connect: send full memory snapshot so the UI bootstraps immediately
  wss.on("connection", (ws) => {
    try {
      const memPath = path.join(__dirname, "../memory.json");
      if (fs.existsSync(memPath)) {
        const memory = JSON.parse(fs.readFileSync(memPath, "utf-8"));
        ws.send(JSON.stringify({ event: "initialState", data: memory, ts: new Date().toISOString() }));
      }
    } catch {
      // memory not readable yet — client will populate from live events
    }
  });

  server.listen(port, () => {
    console.log(`\n  🌐 Dashboard →  http://localhost:${port}\n`);
  });
}
