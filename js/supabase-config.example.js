// Copy to supabase-config.js and fill in from Supabase Dashboard → Settings → API
window.WAM_SUPABASE = {
  url: 'https://YOUR_PROJECT_REF.supabase.co',
  // Prefer publishable key (sb_publishable_...). Legacy anon JWT still works if you set anonKey instead.
  publishableKey: 'YOUR_PUBLISHABLE_KEY',
  // anonKey: 'YOUR_LEGACY_ANON_JWT', // optional fallback; omit if you use publishableKey only
};
