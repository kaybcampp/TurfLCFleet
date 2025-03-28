// supabase-init.js
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const supabase = createClient(
    'https://ygyihoulxucbffftfoqw.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlneWlob3VseHVjYmZmZnRmb3F3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDI3NDA2MzIsImV4cCI6MjA1ODMxNjYzMn0.bsa_OTDn85eoAC1koidAQhaPd9-sLgw9Y9kCRTYkyfY'
);

// Make it globally accessible
window.supabase = supabase;
