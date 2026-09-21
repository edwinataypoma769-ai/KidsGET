/* ==========================================================
   CONFIGURACIÓN
   Pega aquí los datos de tu proyecto de Supabase:
   Supabase → Project Settings → API
   ========================================================== */

window.CONFIG = {
  // "Project URL", por ejemplo: "https://abcdefghijk.supabase.co"
  SUPABASE_URL: "https://joixpiufsywvqkkhmnol.supabase.co",

  // Clave pública "anon" o "publishable" (NUNCA pegues la clave "service_role")
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpvaXhwaXVmc3l3dnFra2htbm9sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk5MjQ4OTgsImV4cCI6MjEwNTUwMDg5OH0.qYWvhUWHmpShfngJpVJXX1r8zOR5LmMVK1nlg1yDQaA",

  // false = los salones y la lista se ven sin iniciar sesión.
  // true  = hay que iniciar sesión para entrar a un salón.
  // (Si lo pones en true, usa también las políticas "modo privado" de supabase.sql)
  REQUIRE_LOGIN_TO_ENTER_SALON: false,
};

/* Si SUPABASE_URL y SUPABASE_ANON_KEY están vacíos, el sistema funciona en
   MODO DEMOSTRACIÓN: guarda todo en el navegador para que puedas probarlo.
   Acceso de administrador en demostración:
     correo:     admin@getsemani.pe
     contraseña: admin123
*/