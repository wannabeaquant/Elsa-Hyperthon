import { EventEmitter } from "events";

// Singleton event bus — display.ts emits here, dashboardServer.ts listens
export const eventBus = new EventEmitter();
eventBus.setMaxListeners(50);
