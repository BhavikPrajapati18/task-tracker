import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
export const isConfigured = Boolean(url && key && !url.includes("YOUR_PROJECT_REF"));

// Non-secret public key. RLS policies enforce database authorization.
// Placeholder values let the static site show setup guidance if env vars are missing.
export const supabase = createClient(
  isConfigured ? url : "https://placeholder.supabase.co",
  isConfigured ? key : "placeholder-key",
  { auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true } }
);
