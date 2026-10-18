import { safeText } from "./utils.js";

const VALID_GENDERS = new Set(["Male", "Female", "Other", "Prefer not to say"]);
const VALID_PREFERENCES = new Set(["Anyone", "Male", "Female", "Other"]);
const MOODS = ["funny", "chill", "deep", "supportive"];

export function normalizeProfile(raw = {}) {
  const interests = Array.isArray(raw.interests)
    ? [
        ...new Set(
          raw.interests
            .filter((item) => typeof item === "string")
            .map((item) => item.trim().slice(0, 30))
            .filter(Boolean)
        )
      ].slice(0, 5)
    : [];

  return {
    nickname:
      safeText(raw.nickname, 24) || `Guest${Math.floor(10 + Math.random() * 90)}`,
    country: safeText(raw.country, 60) || "Any country",
    gender: VALID_GENDERS.has(raw.gender) ? raw.gender : "Prefer not to say",
    preferredGender: VALID_PREFERENCES.has(raw.preferredGender)
      ? raw.preferredGender
      : "Anyone",
    interests,
    mood: MOODS.includes(raw.mood) ? raw.mood : "chill",
    fallback: null
  };
}

const genderAllows = (preference, gender) =>
  preference === "Anyone" || preference === gender;

export function compatible(a, b) {
  return (
    genderAllows(a.preferredGender, b.gender) &&
    genderAllows(b.preferredGender, a.gender)
  );
}

export function matchScore(a, b) {
  let score = 0;
  if (a.country !== "Any country" && a.country === b.country) score += 2;
  score += a.interests.filter((i) => b.interests.includes(i)).length * 3;
  if (a.mood === b.mood) score += 1;
  return score;
}