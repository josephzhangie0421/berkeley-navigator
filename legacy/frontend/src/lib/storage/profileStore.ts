"use client";

/**
 * Profile persistence in localStorage (MVP: no accounts, no server storage).
 * Exposed as an external store so components can read it with
 * useSyncExternalStore without hydration mismatches.
 */
import { sanitizeProfile } from "@/lib/profileSanitize";
import { EMPTY_PROFILE, type StudentProfile } from "@/lib/types/profile";

const KEY = "berkeley-navigator.profile.v1";

export interface StoredProfileState {
  profile: StudentProfile;
  /** True once the student has finished or skipped onboarding. */
  onboarded: boolean;
}

const DEFAULT_STATE: StoredProfileState = { profile: EMPTY_PROFILE, onboarded: false };

let memoryFallback: string | null = null;
let cachedRaw: string | null | undefined;
let cachedValue: StoredProfileState = DEFAULT_STATE;
const listeners = new Set<() => void>();

function readRaw(): string | null {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return memoryFallback;
  }
}

function parse(raw: string | null): StoredProfileState {
  if (!raw) return DEFAULT_STATE;
  try {
    const v = JSON.parse(raw) as Partial<StoredProfileState>;
    return { profile: sanitizeProfile(v.profile), onboarded: v.onboarded === true };
  } catch {
    return DEFAULT_STATE;
  }
}

export function getProfileSnapshot(): StoredProfileState {
  const raw = readRaw();
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedValue = parse(raw);
  }
  return cachedValue;
}

export function getProfileServerSnapshot(): StoredProfileState | null {
  return null;
}

export function subscribeProfile(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function write(state: StoredProfileState | null) {
  const raw = state ? JSON.stringify(state) : null;
  try {
    if (raw) window.localStorage.setItem(KEY, raw);
    else window.localStorage.removeItem(KEY);
  } catch {
    memoryFallback = raw;
  }
  listeners.forEach((l) => l());
}

export function saveProfile(profile: StudentProfile) {
  write({ profile: sanitizeProfile(profile), onboarded: true });
}

export function clearProfile() {
  write(null);
}
