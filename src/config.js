// The publishable key is designed to be public: row-level security in the database decides what each user can see.
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://fhavuqvrcauktimkjppb.supabase.co';
export const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_nbQdMIs2h6fGUSGRFNnTeg_h3wgSy_i';
