import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { LoginResponse, ServerInfo } from '../types/api';

// The access-key session (kubestoplight --web --auth-key). The server trades
// the key for a signed token that expires; the token lives in localStorage so
// the browser stays signed in until then. Every hook's request goes through
// apiFetch, which sends the token and locks the app when the server says 401.

const STORAGE_KEY = 'ksl.session';
/** Offered with the token when opening the WebSocket (webserver/auth.go). */
export const WS_AUTH_PROTOCOL = 'ksl.auth';
const MAX_TIMEOUT_MS = 2 ** 31 - 1;

interface Session {
  token: string;
  /** Unix milliseconds. */
  expiresAt: number;
}

// ── Store: the stored session, and whether this server asks for a key ──

let memory: string | null = null; // stands in when localStorage is blocked
let required: boolean | null = null; // null until /api/info answers
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function readRaw(): string | null {
  try { return localStorage.getItem(STORAGE_KEY); } catch { return memory; }
}

function writeSession(s: Session | null) {
  memory = s ? JSON.stringify(s) : null;
  try {
    if (memory) localStorage.setItem(STORAGE_KEY, memory);
    else localStorage.removeItem(STORAGE_KEY);
  } catch { /* storage blocked: the session lasts until the tab closes */ }
  emit();
}

function parse(raw: string | null): Session | null {
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as Partial<Session>;
    if (typeof s.token !== 'string' || typeof s.expiresAt !== 'number') return null;
    return s.expiresAt > Date.now() ? { token: s.token, expiresAt: s.expiresAt } : null;
  } catch {
    return null;
  }
}

function subscribe(l: () => void) {
  listeners.add(l);
  // Signing out (or in) in one tab reaches the others.
  window.addEventListener('storage', l);
  return () => {
    listeners.delete(l);
    window.removeEventListener('storage', l);
  };
}

/** The current token, or null when signed out, expired, or no key is needed. */
export function sessionToken(): string | null {
  return parse(readRaw())?.token ?? null;
}

/** fetch for the API: sends the session token, and a 401 locks the app. */
export async function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  const token = sessionToken();
  const headers = new Headers(init?.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const res = await fetch(input, { ...init, headers });
  if (res.status === 401) {
    required = true;
    writeSession(null);
  }
  return res;
}

/** Asks the server whether the stored token still works; if not, the app locks. */
export function checkSession(): void {
  if (sessionToken()) apiFetch('/api/session').catch(() => {});
}

export type AuthState = 'checking' | 'open' | 'locked' | 'authed';

export interface UseAuthResult {
  /** open: this server needs no key. authed: a key was entered and is still good. */
  state: AuthState;
  /** Trades the access key for a session. Rejects with the server's message. */
  login: (key: string) => Promise<void>;
  /** Forgets the session in this browser. */
  logout: () => void;
}

export function useAuth(): UseAuthResult {
  const raw = useSyncExternalStore(subscribe, readRaw);
  const needsKey = useSyncExternalStore(subscribe, () => required);
  const session = useMemo(() => parse(raw), [raw]);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (required !== null) return;
    fetch('/api/info')
      .then((r) => (r.ok ? (r.json() as Promise<ServerInfo>) : null))
      // An unreachable or older server counts as open; a later 401 corrects that.
      .then((info) => { required ??= !!info?.authRequired; }, () => { required ??= false; })
      .finally(emit);
  }, []);

  // Lock at the moment the session expires, not on the next failed request.
  useEffect(() => {
    if (!session) return;
    const left = session.expiresAt - Date.now();
    const t = setTimeout(() => {
      if (left > MAX_TIMEOUT_MS) setTick((n) => n + 1);
      else writeSession(null);
    }, Math.min(left, MAX_TIMEOUT_MS));
    return () => clearTimeout(t);
  }, [session, tick]);

  const login = useCallback(async (key: string) => {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? `HTTP ${res.status}`);
    }
    const { token, expiresAt } = (await res.json()) as LoginResponse;
    writeSession({ token, expiresAt });
  }, []);

  const logout = useCallback(() => writeSession(null), []);

  const state: AuthState = needsKey === null ? 'checking' : !needsKey ? 'open' : session ? 'authed' : 'locked';
  return { state, login, logout };
}
