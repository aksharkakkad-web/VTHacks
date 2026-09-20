import { validatedProfile } from "../safecircle/demo-controller";
import type { SavedProfile } from "../safecircle/types";

export const PROFILE_STORAGE_KEY = "safecircle.profile.v1";
const HOME_KEY = "beacon.onboarding.home.v1";
let sessionProfile: SavedProfile | null = null;
let sessionHome: Pick<SavedProfile, "homeName" | "homeAddress"> | null = null;

export function readProfile(): SavedProfile | null {
  if (sessionProfile) return sessionProfile;
  try {
    const raw = localStorage.getItem(PROFILE_STORAGE_KEY);
    return (raw ? validatedProfile(JSON.parse(raw)) : null) ?? sessionProfile;
  } catch { return sessionProfile; }
}

export function saveProfile(profile: SavedProfile): boolean {
  const valid = validatedProfile(profile);
  if (!valid) return false;
  sessionProfile = valid;
  saveHomeDraft({ homeName: valid.homeName, homeAddress: valid.homeAddress });
  try { localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(valid)); return true; }
  catch { return false; }
}

export function clearProfile() {
  sessionProfile = null;
  sessionHome = null;
  try { localStorage.removeItem(PROFILE_STORAGE_KEY); } catch { /* Session-only mode. */ }
  try { sessionStorage.removeItem(HOME_KEY); } catch { /* Session-only mode. */ }
}

export function saveHomeDraft(home: Pick<SavedProfile, "homeName" | "homeAddress">) {
  sessionHome = home;
  try { sessionStorage.setItem(HOME_KEY, JSON.stringify(home)); } catch { /* Keep in memory. */ }
}

export function readHomeDraft() {
  if (sessionHome) return sessionHome;
  try {
    const raw = sessionStorage.getItem(HOME_KEY);
    const home = raw ? JSON.parse(raw) : null;
    if (home && typeof home.homeName === "string" && typeof home.homeAddress === "string" && home.homeName.trim() && home.homeAddress.trim()) return home as Pick<SavedProfile, "homeName" | "homeAddress">;
  } catch { /* Keep in memory. */ }
  return sessionHome ?? readProfile();
}
