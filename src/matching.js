import { config } from "./config.js";
import {
  waiting,
  sessions,
  socketRoom,
  lastChatType,
  lastPersona
} from "./state.js";
import { normalizeProfile, compatible, matchScore } from "./profile.js";
import { createPersona } from "./personas.js";
import { createRoomId } from "./utils.js";

export function createMatcher(io) {
  const getSocket = (id) => io.sockets.sockets.get(id);

  function cancelSearch(socketId) {
    const pending = waiting.get(socketId);
    if (!pending) return;
    clearTimeout(pending.fallback);
    waiting.delete(socketId);
  }

  function clearSessionTimer(session) {
    if (session?.timer) {
      clearTimeout(session.timer);
      session.timer = null;
    }
  }

  function startSessionTimer(roomId) {
    const session = sessions.get(roomId);
    if (!session) return;
    session.startedAt = Date.now();
    session.timer = setTimeout(
      () => endRoom(roomId, "time"),
      config.durationSeconds * 1000
    );
  }

  function endRoom(roomId, reason = "time") {
    const session = sessions.get(roomId);
    if (!session) return;

    clearSessionTimer(session);
    sessions.delete(roomId);

    for (const socketId of session.members) {
      socketRoom.delete(socketId);
      getSocket(socketId)?.emit("session-ended", {
        reason,
        chatType: session.type
      });
    }
  }

  function detachUser(socketId, reason = "left") {
    const roomId = socketRoom.get(socketId);
    if (!roomId) return;

    const session = sessions.get(roomId);
    socketRoom.delete(socketId);
    if (!session) return;

    clearSessionTimer(session);
    sessions.delete(roomId);

    if (session.type === "human") {
      const otherId = session.members.find((id) => id !== socketId);
      if (otherId) {
        socketRoom.delete(otherId);
        getSocket(otherId)?.emit("partner-ended", { reason });
      }
    }
  }

  const publicHumanProfile = (p) => ({
    nickname: p.nickname,
    country: p.country,
    gender: p.gender,
    interests: p.interests,
    isAI: false
  });

  function humanMatch(idA, idB) {
    const socketA = getSocket(idA);
    const socketB = getSocket(idB);
    const a = waiting.get(idA);
    const b = waiting.get(idB);

    if (!socketA || !socketB || !a || !b || !compatible(a, b)) return false;

    cancelSearch(idA);
    cancelSearch(idB);

    const roomId = createRoomId();
    sessions.set(roomId, { type: "human", members: [idA, idB], timer: null });
    socketRoom.set(idA, roomId);
    socketRoom.set(idB, roomId);
    lastChatType.set(idA, "human");
    lastChatType.set(idB, "human");

    const base = { type: "human", roomId, duration: config.durationSeconds, opening: null };
    socketA.emit("matched", { ...base, partner: publicHumanProfile(b) });
    socketB.emit("matched", { ...base, partner: publicHumanProfile(a) });

    startSessionTimer(roomId);
    return true;
  }

  function startAI(socketId, profile, reason = "rotation") {
    const socket = getSocket(socketId);
    if (!socket) return;

    cancelSearch(socketId);
    detachUser(socketId);

    // A different personality every time.
    const persona = createPersona(profile, lastPersona.get(socketId));
    lastPersona.set(socketId, persona.name);
    lastChatType.set(socketId, "ai");

    const roomId = createRoomId();
    sessions.set(roomId, {
      type: "ai",
      members: [socketId],
      timer: null,
      persona,
      profile,
      history: []
    });
    socketRoom.set(socketId, roomId);

    socket.emit("matched", {
      type: "ai",
      roomId,
      duration: config.durationSeconds,
      partner: {
        nickname: persona.name,
        country: "Online",
        gender: persona.gender,
        interests: profile.interests,
        isAI: true,
        label: "AI companion"
      },
      notice: "You're chatting with an AI companion.",
      opening: persona.opener,
      handoffReason: reason
    });

    startSessionTimer(roomId);
  }

  function searchHuman(socket, profile) {
    const socketId = socket.id;
    waiting.set(socketId, profile);
    socket.emit("searching");

    const candidates = [...waiting.entries()]
      .filter(([id, other]) => id !== socketId && compatible(profile, other))
      .sort((a, b) => matchScore(profile, b[1]) - matchScore(profile, a[1]));

    for (const [candidateId] of candidates) {
      if (humanMatch(socketId, candidateId)) return;
    }

    // No human available: fall back to an AI companion after a short wait.
    profile.fallback = setTimeout(() => {
      if (waiting.has(socketId)) startAI(socketId, profile, "no-human-match");
    }, config.waitMs);
  }

  /**
   * The heart of the rotation.
   * Last chat was a human  -> next is an AI (instantly).
   * Last chat was an AI (or first chat) -> next is a human, with AI fallback.
   */
  function nextChat(socket, rawProfile = {}) {
    cancelSearch(socket.id);
    detachUser(socket.id, "left");

    const profile = normalizeProfile(rawProfile);
    const nextIsAI = lastChatType.get(socket.id) === "human";

    if (nextIsAI) startAI(socket.id, profile, "rotation");
    else searchHuman(socket, profile);
  }

  function forceAI(socketId, rawProfile = {}, reason = "manual") {
    startAI(socketId, normalizeProfile(rawProfile), reason);
  }

  function leave(socketId, reason = "left") {
    cancelSearch(socketId);
    detachUser(socketId, reason);
  }

  return { nextChat, forceAI, leave };
}