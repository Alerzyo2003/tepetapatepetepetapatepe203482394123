-- DIAGNÓSTICO DE LA BASE REAL (solo lectura: no cambia nada)
-- Ejecutar en el SQL Editor del proyecto de Supabase que usa HOY la clínica.
-- Devuelve una sola celda con un JSON: cópiala completa y envíala.
-- No incluye datos de pacientes: solo estructura, reglas de acceso, funciones y cantidad de usuarios por rol.

select jsonb_pretty(jsonb_build_object(
  'tablas', (
    select jsonb_agg(table_name order by table_name)
    from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'),
  'columnas_necesarias', (
    select jsonb_object_agg(t || '.' || c, exists (
      select 1 from information_schema.columns where table_schema = 'public' and table_name = t and column_name = c))
    from (values ('perfiles', 'rol'), ('pacientes', 'saldo_a_favor'), ('presupuesto_items', 'abonado'),
                 ('prestaciones', 'icono_tipo'), ('profesionales', 'firma_base64'), ('profesionales', 'user_id'),
                 ('pagos', 'estado'), ('auditoria_clinica', 'usuario_id')) v(t, c)),
  'tablas_sin_rls', (
    select coalesce(jsonb_agg(c.relname order by c.relname), '[]'::jsonb)
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity),
  'politicas', (
    select jsonb_agg(jsonb_build_object('esquema', schemaname, 'tabla', tablename, 'nombre', policyname,
                                        'cmd', cmd, 'roles', roles, 'using', qual, 'check', with_check)
                     order by schemaname, tablename, policyname)
    from pg_policies where schemaname in ('public', 'storage')),
  'funciones_de_pago', (
    select jsonb_object_agg(p.proname, pg_get_functiondef(p.oid))
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('registrar_pago', 'pasar_pagos_a_saldo', 'cancelar_prestacion')),
  'triggers', (
    select coalesce(jsonb_agg(c.relname || ': ' || t.tgname order by c.relname), '[]'::jsonb)
    from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and not t.tgisinternal),
  'buckets', (select jsonb_agg(jsonb_build_object('id', id, 'publico', public)) from storage.buckets),
  'usuarios_por_rol', (
    select jsonb_object_agg(coalesce(rol, '(sin rol)'), n) from (select rol, count(*) n from public.perfiles group by rol) x),
  'existe_tabla_suscripcion', to_regclass('public.suscripcion') is not null
)) as diagnostico;
