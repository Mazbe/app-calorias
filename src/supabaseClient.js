import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://ozqvcvgyhzuaosjyklzz.supabase.co";
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im96cXZjdmd5aHp1YW9zanlrbHp6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3Mjk3NjcsImV4cCI6MjA4NzMwNTc2N30.Lw5hBMKSl8zh1yR9JvilNbP8LPMWDPnM4om-icz7U0A";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);