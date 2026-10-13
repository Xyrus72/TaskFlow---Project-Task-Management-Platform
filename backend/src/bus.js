import { EventEmitter } from 'node:events';

/** In-process event bus. Activity logging publishes here; the SSE hub (events.js) fans out to clients. */
export const bus = new EventEmitter();
bus.setMaxListeners(0);
