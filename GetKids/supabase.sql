-- ==========================================================
-- Getsemaní Kids · Base de datos para Supabase
-- Cómo usarlo: Supabase → SQL Editor → New query → pega todo → Run
-- ==========================================================

-- 1) TABLAS ---------------------------------------------------

create table if not exists public.students (
  id          uuid primary key default gen_random_uuid(),
  full_name   text not null check (char_length(full_name) between 1 and 80),
  sex         text not null check (sex in ('F', 'M')),          -- F = niña, M = niño
  salon       text not null check (salon in ('eden', 'betel', 'sinai', 'sion', 'emaus')),
  active      boolean not null default true,                    -- false = quitado de la lista
  created_at  timestamptz not null default now()
);

create table if not exists public.attendance (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references public.students(id) on delete cascade,
  date        date not null,
  status      text not null check (status in ('P', 'F')),       -- P = presente, F = falta
  created_at  timestamptz not null default now(),
  unique (student_id, date)
);

create index if not exists attendance_date_idx    on public.attendance (date);
create index if not exists students_salon_idx     on public.students (salon) where active;

-- 2) SEGURIDAD (Row Level Security) ---------------------------

alter table public.students   enable row level security;
alter table public.attendance enable row level security;

-- Limpia políticas anteriores por si vuelves a ejecutar este archivo
drop policy if exists "students_leer"        on public.students;
drop policy if exists "students_admin"       on public.students;
drop policy if exists "attendance_todo"      on public.attendance;

-- ---------- MODO NORMAL (el que usa la app por defecto) ----------
-- · Cualquiera con el enlace puede VER las listas y TOMAR asistencia.
-- · Solo el administrador (con sesión) puede agregar, editar o quitar estudiantes.

create policy "students_leer" on public.students
  for select to anon, authenticated using (true);

create policy "students_admin" on public.students
  for all to authenticated using (true) with check (true);

create policy "attendance_todo" on public.attendance
  for all to anon, authenticated using (true) with check (true);

-- ---------- MODO PRIVADO (opcional) ----------
-- Si prefieres que los nombres de los niños NO sean públicos, borra las 3 políticas
-- de arriba y usa estas. Luego pon REQUIRE_LOGIN_TO_ENTER_SALON: true en js/config.js.
-- Con esto, cualquier persona con usuario en Supabase (maestros o administradores)
-- puede ver y tomar asistencia, y nadie sin sesión ve nada.
--
-- create policy "students_leer" on public.students
--   for select to authenticated using (true);
-- create policy "students_admin" on public.students
--   for all to authenticated using (true) with check (true);
-- create policy "attendance_todo" on public.attendance
--   for all to authenticated using (true) with check (true);