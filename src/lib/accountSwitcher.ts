// Multi-account login persistence (client-side, opt-in).
// Stores email + a label so users can quickly switch between saved accounts.
// Passwords are NOT stored — switching prompts re-login if the session is gone.

import { clearToken } from "@/lib/api";

export interface SavedAccount {
  email: string;
  username: string;
  role: "admin" | "seller" | "user";
  savedAt: number;
}

const KEY = "zorushop.accounts";

export function getSavedAccounts(): SavedAccount[] {
  try {
    const raw = localStorage.getItem(KEY) || localStorage.getItem("cruzercc.accounts");
    return JSON.parse(raw ?? "[]");
  } catch {
    return [];
  }
}

export function saveAccount(acc: SavedAccount) {
  const existing = getSavedAccounts().filter((a) => a.email !== acc.email);
  existing.unshift(acc);
  localStorage.setItem(KEY, JSON.stringify(existing.slice(0, 5)));
}

export function removeSavedAccount(email: string) {
  localStorage.setItem(KEY, JSON.stringify(getSavedAccounts().filter((a) => a.email !== email)));
}

/** Sign out current session and redirect to /auth with email prefilled */
export async function switchAccount(email: string) {
  clearToken();
  sessionStorage.setItem("zorushop.prefillEmail", email);
  sessionStorage.setItem("cruzercc.prefillEmail", email);
  window.location.href = "/auth";
}
