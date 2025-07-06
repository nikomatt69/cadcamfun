import { SessionManager } from "./sessionManager";
import { ContextProcessor } from "./contextProcessor";
// Import other potentially shared services like logger if needed

// Create singleton instances
export const sessionManager = new SessionManager();
export const contextProcessor = new ContextProcessor();
// export const logger = createYourLogger();
