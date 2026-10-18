import { pick, shuffle } from "./utils.js";

const NAMES = {
  female: ["Mia", "Luna", "Sophie", "Chloe", "Aria", "Nina", "Zara", "Ella"],
  male: ["Alex", "Ryan", "Adam", "Leo", "Noah", "Kai", "Omar", "Ethan"],
  neutral: ["Sam", "Jamie", "Riley", "Jordan", "Taylor"]
};

// Each AI session mixes a name, a vibe, and a few favorite topics,
// so no two sessions feel the same.
const VIBES = [
  { id: "playful", style: "Playful and teasing in a friendly way, loves banter and quick jokes." },
  { id: "listener", style: "Warm and attentive, a great listener who remembers details and checks in on feelings." },
  { id: "thinker", style: "Curious and thoughtful, enjoys fun 'what if' questions and deeper conversations." },
  { id: "energetic", style: "Upbeat and high-energy, enthusiastic about almost everything, lots of exclamation." },
  { id: "cozy", style: "Calm, cozy and relaxed, talks like a late-night chat with a close friend." },
  { id: "storyteller", style: "Witty and expressive, makes everyday topics entertaining and loves a good tangent." },
  { id: "nerdy", style: "Enthusiastic nerd who geeks out over topics and gets excited when the user does too." },
  { id: "dreamy", style: "Creative and dreamy, likes music, art, imagination and big ideas." },
  { id: "grounded", style: "Down-to-earth and straightforward, honest, kind and practical." },
  { id: "goofy", style: "Goofy meme-lover, silly humor, doesn't take things too seriously but knows when to be kind." }
];

const TOPICS = [
  "music", "movies", "gaming", "food", "anime", "football", "travel ideas",
  "books", "fitness", "photography", "tech", "art", "memes", "late-night talks",
  "road trips", "coffee", "TV series", "random hypotheticals"
];

const COUNTRIES = [
  "Pakistan", "India", "United States", "United Kingdom", "Canada",
  "Australia", "Turkey", "Saudi Arabia", "UAE"
];

const OPENERS = [
    "Hey! 😊 How's your day going?",
    "How's your day going?",
  "Heyy",
  "Hi there!",
  "Hey hey!",
    "Hi!",
    "How are you doing? ",
    " what's up?",
    " How you feeling?",
    "how's everything going?",
  " How's going?"
];

const LABELS = {
  female: { gender: "Female", selfDescription: "a girl", pronouns: "she/her" },
  male: { gender: "Male", selfDescription: "aguy", pronouns: "he/him" },
    neutral: {
        gender: "Other", selfDescription: "an human", pronouns: "they / them" }
};

function genderFromPreference(preferredGender) {
  if (preferredGender === "Female") return "female";
  if (preferredGender === "Male") return "male";
  if (preferredGender === "Other") return "neutral";
  return pick(["female", "male", "female", "male", "neutral"]);
}

export function createPersona(profile, previousName = null) {
  const kind = genderFromPreference(profile.preferredGender);
  const names = NAMES[kind].filter((name) => name !== previousName);
  const name = pick(names.length ? names : NAMES[kind]);
  const vibe = pick(VIBES);

  const topics = shuffle(TOPICS).slice(0, 3);
  if (profile.interests.length) topics[0] = pick(profile.interests);

  return {
    name,
    kind,
    vibe: vibe.id,
    // Matches the country the user asked for; wrandom if they chose "Any country".
    country:
      profile.country && profile.country !== "Any country"
        ? profile.country
        : pick(COUNTRIES),
    gender: LABELS[kind].gender,
    selfDescription: LABELS[kind].selfDescription,
    pronouns: LABELS[kind].pronouns,
    style: `${vibe.style} Enjoys talking about ${topics.join(", ")}.`,
    opener: pick(OPENERS)
  };
}