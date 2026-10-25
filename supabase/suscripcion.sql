-- PLANES DE SUSCRIPCIÓN
-- Ejecutar en Supabase → SQL Editor. Es seguro ejecutarlo más de una vez.
-- Mientras esta tabla no exista (o esté vacía) la app sigue funcionando sin límites de usuarios.

create table if not exists public.suscripcion (
  id             int primary key default 1 check (id = 1),         -- una sola fila por clínica
  plan           text not null default 'CLINICA'
                 check (plan in ('BASICO', 'CLINICA', 'CENTRO', 'EMPRESARIAL')),
  estado         text not null default 'PRUEBA'
                 check (estado in ('PRUEBA', 'ACTIVA', 'VENCIDA', 'SUSPENDIDA')),
  ciclo          text not null default 'MENSUAL' check (ciclo in ('MENSUAL', 'ANUAL')),
  vence_el       date,                                              -- pasada esta fecha se considera VENCIDA
  cupos_extra    jsonb not null default '{}'::jsonb,                -- ej: {"DENTISTA": 2, "ASISTENTE": 1}
  actualizado_el timestamptz not null default now()
);

alter table public.suscripcion enable row level security;

-- Cualquier usuario con sesión puede VER el plan; nadie puede cambiarlo desde la app
-- (solo desde el SQL Editor o con la llave service_role, p. ej. un webhook de pagos).
drop policy if exists "suscripcion_lectura" on public.suscripcion;
create policy "suscripcion_lectura" on public.suscripcion
  for select to authenticated using (true);

-- Fila inicial: 14 días de prueba del plan Clínica
insert into public.suscripcion (id, plan, estado, vence_el)
values (1, 'CLINICA', 'PRUEBA', current_date + 14)
on conflict (id) do nothing;

-- EJEMPLOS DE USO
-- Activar plan Centro Dental anual:
--   update public.suscripcion set plan = 'CENTRO', estado = 'ACTIVA', ciclo = 'ANUAL',
--          vence_el = current_date + 365, actualizado_el = now() where id = 1;
-- Agregar 2 cupos extra de dentista:
--   update public.suscripcion set cupos_extra = cupos_extra || '{"DENTISTA": 2}', actualizado_el = now() where id = 1;
