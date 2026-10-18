export const safeText = (value, maxLength = 1000) =>
  typeof value === "string" ? value.trim().slice(0, maxLength) : "";

export const createRoomId = () =>
  `room_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

export const pick = (list) => list[Math.floor(Math.random() * list.length)];

export const shuffle = (list) => {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));