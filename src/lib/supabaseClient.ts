import { createClient } from '@supabase/supabase-js';

// ВРЕМЕННО: жёстко задаём ключи (работает 100%)
const supabaseUrl = 'https://uchithtrlvtawritbxrh.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVjaGl0aHRybHZ0YXdyaXRieHJoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1ODM2NzYsImV4cCI6MjA5MTE1OTY3Nn0.60QUNH2WH8X3fGqe3bBhAQgWZHQaMpoASXrj9LHL110';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  realtime: { params: { eventsPerSecond: 2 } }
});