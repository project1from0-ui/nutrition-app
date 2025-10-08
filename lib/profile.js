// Lightweight profile storage using localStorage (client) with safe fallbacks.
// The module exposes getProfile and saveProfile, and handles migration of goal.

export const DEFAULT_PROFILE = {
  name: "",
  age: null,
  gender: "",
  heightCm: null,
  weightKg: null,
  // New field with default: stay
  goal: "stay", // 'slim' | 'stay' | 'bulk'
};

const STORAGE_KEY = "nutrition_profile";

function isBrowser() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function migrateGoal(oldProfile) {
  if (!oldProfile) return null;
  const migrated = { ...oldProfile };
  // Map legacy fields to new goal
  // legacy diet => slim, bulk => bulk, undefined => stay
  if (migrated.goal === undefined) {
    if (migrated.diet === true || migrated.diet === "diet") {
      migrated.goal = "slim";
    } else if (migrated.bulk === true || migrated.goal === "bulk") {
      migrated.goal = "bulk";
    } else {
      migrated.goal = "stay";
    }
  } else if (migrated.goal === "diet") {
    migrated.goal = "slim";
  }
  return migrated;
}

export function getProfile() {
  try {
    if (!isBrowser()) return { ...DEFAULT_PROFILE };
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PROFILE };
    const parsed = JSON.parse(raw);
    const migrated = migrateGoal(parsed) || parsed;
    return { ...DEFAULT_PROFILE, ...migrated };
  } catch {
    return { ...DEFAULT_PROFILE };
  }
}

export function saveProfile(partialProfile) {
  if (!isBrowser()) return;
  const current = getProfile();
  const next = { ...current, ...partialProfile };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

export function getGoal() {
  return getProfile().goal || "stay";
}

export function setGoal(goal) {
  if (!goal || !["slim", "stay", "bulk"].includes(goal)) return;
  saveProfile({ goal });
}


