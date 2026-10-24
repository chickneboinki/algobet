import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL || 'https://amcabbkmleopssafszbj.supabase.co'
const key = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFtY2FiYmttbGVvcHNzYWZzemJqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI4NjgxMzYsImV4cCI6MjEwODQ0NDEzNn0.xUDH0Kl1QZ0S_CVInNt5tPPx6WTB1SuVAYtavucOEvg'

export const supabase = createClient(url, key)
