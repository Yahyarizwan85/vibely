// In-memory state. If you ever run more than one server instance,
// move this to Redis.

export const waiting = new Map();      // socketId -> profile (searching for a human)
export const sessions = new Map();     // roomId   -> session
export const socketRoom = new Map();   // socketId -> roomId

// Rotation: what kind of partner the user got last ("human" | "ai").
// The next chat is always the opposite kind.
export const lastChatType = new Map(); // socketId -> "human" | "ai"

// Remember the last AI persona per user so the next one is always different.
export const lastPersona = new Map();  // socketId -> persona name

export function forgetSocket(socketId) {
  waiting.delete(socketId);
  socketRoom.delete(socketId);
  lastChatType.delete(socketId);
  lastPersona.delete(socketId);
}