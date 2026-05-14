/**
 * Traveler profile — a tiny prompt modifier the user can pick in the
 * Director wizard. It augments the personal-note section of the user
 * prompt so the AI's narration knows who is walking.
 *
 * Profiles are intentionally light. Heavy biographical detail leads
 * the model to hallucinate. Concrete shapes only: party size, age
 * bracket, whether this is a first visit.
 *
 * The profile is wrapped into the personal-context string, NOT a new
 * top-level field — this means the existing Worker /v1/script handler
 * needs no changes. Backwards compatible.
 */

export const TRAVELER_PROFILES = [
  {
    id: "first-time-pilgrim",
    label: "First-time pilgrim",
    blurb: "Coming here for the first time, with reverence.",
    promptInsert: "The pilgrim is on their first visit here; narrate with the sense of newness and arrival.",
  },
  {
    id: "returning-devotee",
    label: "Returning devotee",
    blurb: "A regular — this place feels like home.",
    promptInsert: "The pilgrim has been here many times; narrate with the sense of homecoming and familiarity.",
  },
  {
    id: "family-with-elder",
    label: "Family with an elder",
    blurb: "Walking with an elderly relative on their last visits.",
    promptInsert: "The pilgrim is with an elderly relative; narrate slowly and with care for the steps, the heat, and the meaning of being together.",
  },
  {
    id: "first-with-newborn",
    label: "First trip with a newborn",
    blurb: "A family bringing a new child for blessing.",
    promptInsert: "The pilgrim is with a newborn; narrate with the sense of beginnings and the weight of bringing a new life across this threshold.",
  },
  {
    id: "solo-trekker",
    label: "Solo trekker",
    blurb: "Walking alone — quiet, attentive.",
    promptInsert: "The pilgrim walks alone; narrate intimately and quietly, attentive to small sensations.",
  },
  {
    id: "skip",
    label: "Skip — let AI decide",
    blurb: "No profile; AI uses defaults.",
    promptInsert: "",
  },
];

export function getTravelerProfile(id) {
  return TRAVELER_PROFILES.find((p) => p.id === id) || null;
}

/**
 * Pure: weave the traveler profile into the personal note string.
 * Returns the augmented string. Empty inputs return empty.
 */
export function applyTravelerProfile(personalNote, profileId) {
  const profile = getTravelerProfile(profileId);
  const note = (personalNote || "").trim();
  const insert = profile?.promptInsert || "";
  if (!insert) return note;
  if (!note) return insert;
  return `${insert}\n\n${note}`;
}
