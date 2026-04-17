import { startDashboard } from "./dashboardServer.js";

startDashboard(parseInt(process.env.DASHBOARD_PORT ?? "3000", 10));

// Keep the process alive so the static dashboard and websocket server stay available.
setInterval(() => undefined, 1 << 30);
