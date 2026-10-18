import { config } from "./config.js";
import { sessions, socketRoom, forgetSocket } from "./state.js";
import { createMatcher } from "./matching.js";
import { generateAIReply } from "./ai.js";
import { safeText, sleep } from "./utils.js";

const MAX_HISTORY = 40;

export function registerSocketHandlers(io) {
  const matcher = createMatcher(io);

  io.on("connection", (socket) => {
    let lastMessageAt = 0;

    socket.emit("server-ready", { duration: config.durationSeconds });

    // "Next" button: rotates human -> AI -> human -> AI ...
    socket.on("find-match", (rawProfile = {}) => {
      matcher.nextChat(socket, rawProfile);
    });

    // Manual AI start (kept for compatibility with your current frontend).
    socket.on("start-ai", (payload = {}) => {
      matcher.forceAI(
        socket.id,
        payload.profile || payload,
        safeText(payload.reason, 60) || "manual"
      );
    });

    socket.on("message", async (payload = {}) => {
      const text = safeText(payload.text);
      const roomId = socketRoom.get(socket.id);
      const session = roomId && sessions.get(roomId);
      if (!text || !session) return;

      // Basic spam protection.
      const now = Date.now();
      if (now - lastMessageAt < config.messageIntervalMs) return;
      lastMessageAt = now;

      if (session.type === "human") {
        const otherId = session.members.find((id) => id !== socket.id);
        io.sockets.sockets.get(otherId)?.emit("message", { from: "partner", text });
        return;
      }

      // AI session
      session.history.push({ role: "user", text });
      if (session.history.length > MAX_HISTORY) {
        session.history.splice(0, session.history.length - MAX_HISTORY);
      }

      socket.emit("typing", { isTyping: true });
      const startedAt = Date.now();
      const reply = await generateAIReply(session);

      // Short, natural pause so replies don't land instantly.
      const pause = Math.min(2500, 500 + reply.length * 12) - (Date.now() - startedAt);
      if (pause > 0) await sleep(pause);

      socket.emit("typing", { isTyping: false });

      // The user may have skipped or left while the AI was thinking.
      if (!sessions.has(roomId) || socketRoom.get(socket.id) !== roomId) return;

      session.history.push({ role: "model", text: reply });
      socket.emit("message", { from: "partner", text: reply });
    });

    socket.on("leave-chat", () => {
      matcher.leave(socket.id, "left");
      socket.emit("left-chat");
    });

    socket.on("report-partner", () => {
      console.warn(`[Vibely report] socket=${socket.id} time=${new Date().toISOString()}`);
      socket.emit("report-received");
    });

    socket.on("disconnect", () => {
      matcher.leave(socket.id, "disconnect");
      forgetSocket(socket.id);
    });
  });
}