"use client";
import { supabase } from "@/lib/supabase";

export const SECURITY_V2_ENABLED = process.env.NEXT_PUBLIC_VAULT_SECURITY_V2 === "true";
const RENEW_AFTER_MS = 12 * 60 * 1000;
let lastIssuedAt = 0;
let lastUserId = "";
let pending = null;

// Share a single renewal between simultaneous requests and refresh well before
// the 30-minute cookie expires. Never persist the Supabase access token here.
export async function ensureProxySession(existingSession = null, { force = false } = {}) {
  if (!SECURITY_V2_ENABLED) return null;
  const session = existingSession || (await supabase?.auth.getSession())?.data?.session;
  const token = session?.access_token;
  const userId = session?.user?.id || "";
  if (!token || !userId) throw new Error("Sign in again to access secure media and search.");

  if (pending && lastUserId === userId) return pending;
  if (!force && lastUserId === userId && Date.now() - lastIssuedAt < RENEW_AFTER_MS) return lastIssuedAt;

  lastUserId = userId;
  pending = (async () => {
    const response = await fetch("/api/security/session", {
      method: "POST",
      credentials: "same-origin",
      headers: { Authorization: "Bearer " + token },
      cache: "no-store",
    });
    if (!response.ok) throw new Error("Could not renew the secure session. Sign in again.");
    lastIssuedAt = Date.now();
    if (typeof window !== "undefined") window.__VAULT_PROXY_SESSION_EPOCH = lastIssuedAt;
    return lastIssuedAt;
  })();
  try { return await pending; }
  catch (error) { lastIssuedAt = 0; throw error; }
  finally { pending = null; }
}
