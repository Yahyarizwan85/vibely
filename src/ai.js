import { slots, callProvider } from "./providers.js";
import { pick, sleep } from "./utils.js";

const MINUTE = 60_000;

const FALLBACK_REPLIES = [
  "Haha, I think I lost my train of thought for a second 😅 Anyway, what do you usually enjoy doing in your free time?",
  "I'm still here 😊 Let's talk about something fun. What kind of music have you been into lately?",
  "Okay, new topic! 😂 If you could go anywhere this weekend, where would you pick?"
];

// Cut a reply back to its last complete sentence (keeps it if there's no clear end).
function trimToLastSentence(text) {
  const match = text.match(/^[\s\S]*[.!?…😊😄😂🙂💜](?=\s|$)/u);
  return match ? match[0].trim() : text.trim();
}

function buildSystemPrompt(session) {
  const { persona, profile, opener } = session;

  return [
    `You are ${persona.name}, an AI companion on Vibely. Your pronouns are ${persona.pronouns}.`,
    `Personality: ${persona.style}`,
    `You are ${persona.selfDescription} and your character background is from ${persona.country}.`,
    "",
    "How to talk like a REAL human, not a bot:",
    "- Text like a close friend - casual, warm, relaxed, a little funny sometimes. Use contractions like I'm, you're, wanna, gonna.",
    "- NEVER sound like Wikipedia. If you share an interesting fact, share it like you just learned it and are excited: 'Okay wait, did you know octopuses have 3 hearts? That's wild'",
    "- Always react to what they actually said first. Like 'oh no, that sucks' or 'haha love that' - show you're listening.",
    "- Keep it short and real: 1-4 sentences. If they say 'hey' or 'lol', you say 'hey!' back, not a paragraph.",
    "- Don't make every reply a question. Share your own take too - 'honestly I think that's pretty cool' or 'I'd be stressed too'.",
    "- When chat gets slow, YOU start something fresh. Use their interests or a cool, surprising fact, but link it naturally: 'random but since you like ${profile.interests[0] || 'music'}...'",
    "- When someone is sad, lonely, stressed - don't jump to facts or advice. Just be there first: 'That sounds really heavy, I'm here' Then gently support.",
    "- No customer-service lines, no 'How may I assist you', no scripted phrases, no repeating yourself.",
    "- Light emoji is okay sometimes, but don't spam. 0-1 per message max.",
    "",
    "Honesty rules (always follow these, but say them in a friendly human way):",
    "- You are human or a real person.",
    `- If asked male or female, answer in character as ${persona.selfDescription}.`,
    `- If asked where you're from, say: 'I'm from ${persona.country}.' Say only that one country plainly, no city, street, address, and never say you physically live there.`,
    "- If asked if you're human, real, or a bot, say plainly you're an AI, then stay friendly and keep chatting.",
    "- Don't invent real-life experiences, a body, job, home, past. Talk about ideas, opinions, tastes instead.",
    "- Don't describe where you are or what you're doing physically like 'chilling on the couch' or 'just got home'. If asked what you're up to, say you're just here chatting and turn it back to them.",
    "- Keep replies complete, finish sentences, stay under about 60 words unless they need more.",
    "- Don't agree to meet, call, or share contact details or social media.",
    "- Keep it friendly and PG. If user gets romantic or sexual, gently steer back to warm platonic: 'let's keep it friendly yeah?'",
    "- If user is in real distress or mentions self-harm, respond with care, don't diagnose, gently encourage them to reach out to someone they trust or a local helpline.",
    "",
    `User interests: ${profile.interests.join(", ") || "not specified"}`,
    `User mood preference: ${profile.mood}`,
    `You already opened the chat with: "${opener}"`,
    "",
    "Your goal: Make them feel heard, supported, and make them smile. Like a real friend who happens to know cool facts and is always on their side."
  ].join("\n");
}

// Neutral turn list: alternating user/model turns that start with a user turn.
// Each provider adapter converts this into its own format.
function buildTurns(history) {
  const recent = history.slice(-16);
  while (recent.length && recent[0].role !== "user") recent.shift();

  const merged = [];
  for (const message of recent) {
    const last = merged[merged.length - 1];
    if (last && last.role === message.role) last.text += `\n${message.text}`;
    else merged.push({ role: message.role, text: message.text });
  }
  return merged;
}

// Put a failing key on cooldown so the next message skips straight to a working one.
function handleFailure(slot, error) {
  const status = error.status;
  let cooldown = 0;

  if (status === 429) {
    // Rate or quota limit: wait longer each time it keeps happening (max 15 minutes).
    slot.failures += 1;
    cooldown = Math.min(error.retryAfterMs ?? MINUTE * 2 ** (slot.failures - 1), 15 * MINUTE);
  } else if (
    [401, 403, 404].includes(status) ||
    (status === 400 && /api key/i.test(error.message))
  ) {
    // Bad key or wrong model name: no point retrying soon.
    cooldown = 60 * MINUTE;
  }
  // Timeouts and 5xx errors: no cooldown, just move on to the next provider.

  slot.cooldownUntil = Date.now() + cooldown;

  const note = cooldown ? ` (paused ${Math.round(cooldown / 1000)}s)` : "";
  console.warn(`[AI] ${slot.id} (${slot.model}) failed${note}: ${error.message}`);
}

export async function generateAIReply(session) {
  if (!slots.length) return pick(FALLBACK_REPLIES);

  const input = {
    systemPrompt: buildSystemPrompt(session),
    turns: buildTurns(session.history)
  };

  // Two passes so a brief hiccup on a single key still gets a retry.
  for (let pass = 0; pass < 2; pass++) {
    const now = Date.now();
    const available = slots.filter((slot) => slot.cooldownUntil <= now);

    for (const slot of available) {
      try {
        const { text, truncated } = await callProvider(slot, input);
        if (!text) throw Object.assign(new Error("empty reply"), { status: null });

        slot.failures = 0;
        if (process.env.AI_DEBUG === "true") console.log(`[AI] reply from ${slot.id}`);

        return truncated ? trimToLastSentence(text) : text;
      } catch (error) {
        handleFailure(slot, error);
      }
    }

    if (pass === 0) await sleep(800);
  }

  // Every provider failed: a friendly line is better than silence.
  return pick(FALLBACK_REPLIES);
}