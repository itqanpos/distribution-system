// js/supabase-config.js
const SUPABASE_URL = supabase link --project-ref emvqitmpdkkuyjzegyxf // استبدل بالرابط الخاص بك
const SUPABASE_ANON_KEY =  supabase migration new new-migration        // استبدل بالمفتاح العام

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
window.supabase = supabase;
console.log('✅ Supabase initialized');
