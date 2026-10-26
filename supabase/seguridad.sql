-- SEGURIDAD POR ROL EN LA BASE DE DATOS
-- Ejecutar en el SQL Editor DESPUÉS de esquema.sql y suscripcion.sql. Se puede ejecutar más de una vez.
--
-- Hasta ahora la app ocultaba botones según el rol, pero cualquier usuario con sesión podía escribir
-- directo en la base (por ejemplo un asistente cambiando el saldo a favor de un paciente o el precio de
-- una prestación). Estas reglas hacen que la base de datos misma lo impida.
--
-- IMPORTANTE EN UNA BASE QUE YA ESTÁ EN USO: en Postgres las políticas se suman (basta que UNA permita).
-- Antes de ejecutar, revisa las políticas existentes y elimina las que den acceso total:
--   select tablename, policyname, cmd, roles, qual from pg_policies where schemaname = 'public' order by 1, 2;

-- ───────────── Rol del usuario actual ─────────────

create or replace function public.rol_actual()
returns text language sql stable security definer set search_path = public as $$
  select rol from perfiles where id = auth.uid()
$$;
revoke execute on function public.rol_actual() from public, anon;
grant execute on function public.rol_actual() to authenticated;

-- Las funciones de pago marcan la transacción para que las protecciones de abajo las dejen pasar
create or replace function public._via_funcion()
returns boolean language sql stable as $$
  select coalesce(current_setting('app.via_funcion', true), '') = 'si'
$$;

-- ───────────── Rol en el token de sesión ─────────────
-- El proxy de la app lee el rol desde app_metadata, que solo puede cambiar el servidor.
-- (user_metadata lo puede editar el propio usuario: ahí NO debe decidirse el acceso)

create or replace function public.sincronizar_rol_auth()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update auth.users
     set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('rol', new.rol)
   where id = new.id;
  return new;
end $$;
revoke execute on function public.sincronizar_rol_auth() from public, anon, authenticated;

drop trigger if exists perfiles_sincronizar_rol on public.perfiles;
create trigger perfiles_sincronizar_rol after insert or update of rol on public.perfiles
  for each row execute function public.sincronizar_rol_auth();

update auth.users u
   set raw_app_meta_data = coalesce(u.raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('rol', p.rol)
  from public.perfiles p
 where p.id = u.id;

-- ───────────── Configuración de la clínica: solo ADMIN escribe ─────────────

do $$
declare t text;
begin
  foreach t in array array[
    'bancos', 'categorias_prestaciones', 'consentimientos', 'convenios', 'documentos_categorias',
    'documentos_plantillas', 'especialidades', 'inventario_movimientos', 'inventario_productos',
    'laboratorio_prestaciones', 'laboratorios', 'liquidaciones', 'disponibilidad_profesional'
  ] loop
    execute format('drop policy if exists "personal_con_sesion" on public.%I', t);
    execute format('drop policy if exists "lectura_personal" on public.%I', t);
    execute format('drop policy if exists "escritura_admin" on public.%I', t);
    execute format('create policy "lectura_personal" on public.%I for select to authenticated using (true)', t);
    execute format($p$create policy "escritura_admin" on public.%I for all to authenticated
                     using (public.rol_actual() = 'ADMIN') with check (public.rol_actual() = 'ADMIN')$p$, t);
  end loop;
end $$;

-- Planes de tratamiento predefinidos: ADMIN y DENTISTA
do $$
declare t text;
begin
  foreach t in array array['plantillas', 'plantilla_items'] loop
    execute format('drop policy if exists "personal_con_sesion" on public.%I', t);
    execute format('drop policy if exists "lectura_personal" on public.%I', t);
    execute format('drop policy if exists "escritura_clinica" on public.%I', t);
    execute format('create policy "lectura_personal" on public.%I for select to authenticated using (true)', t);
    execute format($p$create policy "escritura_clinica" on public.%I for all to authenticated
                     using (public.rol_actual() in ('ADMIN', 'DENTISTA')) with check (public.rol_actual() in ('ADMIN', 'DENTISTA'))$p$, t);
  end loop;
end $$;

-- Caja: ADMIN y RECEPCIONISTA
drop policy if exists "personal_con_sesion" on public.sesiones_caja;
drop policy if exists "lectura_personal" on public.sesiones_caja;
drop policy if exists "escritura_caja" on public.sesiones_caja;
create policy "lectura_personal" on public.sesiones_caja for select to authenticated using (true);
create policy "escritura_caja" on public.sesiones_caja for all to authenticated
  using (public.rol_actual() in ('ADMIN', 'RECEPCIONISTA')) with check (public.rol_actual() in ('ADMIN', 'RECEPCIONISTA'));

-- ───────────── Aranceles: precios solo ADMIN ─────────────
-- Los demás roles pueden cambiar solo el ícono de una prestación (lo hace la app al armar presupuestos).

drop policy if exists "personal_con_sesion" on public.prestaciones;
drop policy if exists "lectura_personal" on public.prestaciones;
drop policy if exists "crear_borrar_admin" on public.prestaciones;
drop policy if exists "borrar_admin" on public.prestaciones;
drop policy if exists "editar_personal" on public.prestaciones;
create policy "lectura_personal" on public.prestaciones for select to authenticated using (true);
create policy "crear_borrar_admin" on public.prestaciones for insert to authenticated with check (public.rol_actual() = 'ADMIN');
create policy "borrar_admin" on public.prestaciones for delete to authenticated using (public.rol_actual() = 'ADMIN');
create policy "editar_personal" on public.prestaciones for update to authenticated using (true) with check (true);

create or replace function public.proteger_prestaciones()
returns trigger language plpgsql set search_path = public as $$
begin
  if auth.uid() is not null and coalesce(rol_actual(), '') <> 'ADMIN'
     and (to_jsonb(new) - 'icono_tipo') is distinct from (to_jsonb(old) - 'icono_tipo') then
    raise exception 'Solo un administrador puede modificar precios y datos de las prestaciones';
  end if;
  return new;
end $$;
drop trigger if exists prestaciones_proteger on public.prestaciones;
create trigger prestaciones_proteger before update on public.prestaciones
  for each row execute function public.proteger_prestaciones();

-- ───────────── Profesionales: cada uno solo su firma ─────────────

drop policy if exists "personal_con_sesion" on public.profesionales;
drop policy if exists "lectura_personal" on public.profesionales;
drop policy if exists "crear_admin" on public.profesionales;
drop policy if exists "borrar_admin" on public.profesionales;
drop policy if exists "editar_admin_o_propio" on public.profesionales;
create policy "lectura_personal" on public.profesionales for select to authenticated using (true);
create policy "crear_admin" on public.profesionales for insert to authenticated with check (public.rol_actual() = 'ADMIN');
create policy "borrar_admin" on public.profesionales for delete to authenticated using (public.rol_actual() = 'ADMIN');
create policy "editar_admin_o_propio" on public.profesionales for update to authenticated
  using (public.rol_actual() = 'ADMIN' or user_id = auth.uid())
  with check (public.rol_actual() = 'ADMIN' or user_id = auth.uid());

create or replace function public.proteger_profesionales()
returns trigger language plpgsql set search_path = public as $$
begin
  if auth.uid() is not null and coalesce(rol_actual(), '') <> 'ADMIN'
     and (to_jsonb(new) - 'firma_base64') is distinct from (to_jsonb(old) - 'firma_base64') then
    raise exception 'Solo un administrador puede modificar comisión, especialidad o estado de un profesional';
  end if;
  return new;
end $$;
drop trigger if exists profesionales_proteger on public.profesionales;
create trigger profesionales_proteger before update on public.profesionales
  for each row execute function public.proteger_profesionales();

-- ───────────── Dinero: saldo a favor, abonos y pagos ─────────────

create or replace function public.proteger_saldo_paciente()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.saldo_a_favor is distinct from old.saldo_a_favor
     and auth.uid() is not null and not _via_funcion()
     and coalesce(rol_actual(), '') not in ('ADMIN', 'RECEPCIONISTA') then
    raise exception 'Solo administración o recepción pueden modificar el saldo a favor';
  end if;
  return new;
end $$;
drop trigger if exists pacientes_proteger_saldo on public.pacientes;
create trigger pacientes_proteger_saldo before update on public.pacientes
  for each row execute function public.proteger_saldo_paciente();

create or replace function public.proteger_abonos()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.abonado is distinct from old.abonado
     and auth.uid() is not null and not _via_funcion()
     and coalesce(rol_actual(), '') not in ('ADMIN', 'RECEPCIONISTA') then
    raise exception 'Solo administración o recepción pueden registrar abonos';
  end if;
  return new;
end $$;
drop trigger if exists items_proteger_abonos on public.presupuesto_items;
create trigger items_proteger_abonos before update on public.presupuesto_items
  for each row execute function public.proteger_abonos();

-- Pagos: se registran (ADMIN/RECEPCIONISTA) pero nunca se editan ni se borran desde la app.
-- Las anulaciones y traspasos a saldo pasan por las funciones, que dejan rastro.
drop policy if exists "personal_con_sesion" on public.pagos;
drop policy if exists "lectura_personal" on public.pagos;
drop policy if exists "registrar_caja" on public.pagos;
create policy "lectura_personal" on public.pagos for select to authenticated using (true);
create policy "registrar_caja" on public.pagos for insert to authenticated
  with check (public.rol_actual() in ('ADMIN', 'RECEPCIONISTA'));

-- ───────────── Auditoría: no se puede editar ni borrar ─────────────

drop policy if exists "personal_con_sesion" on public.auditoria_clinica;
drop policy if exists "registrar_propio" on public.auditoria_clinica;
drop policy if exists "lectura_admin" on public.auditoria_clinica;
create policy "registrar_propio" on public.auditoria_clinica for insert to authenticated
  with check (usuario_id is null or usuario_id = auth.uid());
create policy "lectura_admin" on public.auditoria_clinica for select to authenticated
  using (public.rol_actual() = 'ADMIN');

-- ───────────── Funciones de pago: rol y marca de transacción ─────────────

create or replace function public.registrar_pago(p_lineas jsonb, p_saldo_usado numeric default 0)
returns bigint[] language plpgsql security definer set search_path = public as $$
declare
  l jsonb;
  v_id bigint;
  v_ids bigint[] := '{}';
  v_paciente bigint;
  v_item bigint;
  v_monto numeric;
  v_saldo numeric;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  if coalesce(rol_actual(), '') not in ('ADMIN', 'RECEPCIONISTA') then
    raise exception 'Solo administración o recepción pueden registrar pagos';
  end if;
  perform set_config('app.via_funcion', 'si', true);
  if jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) = 0 then
    raise exception 'No hay líneas de pago';
  end if;

  for l in select * from jsonb_array_elements(p_lineas) loop
    v_paciente := (l->>'paciente_id')::bigint;
    v_item := nullif(l->>'item_id', '')::bigint;
    v_monto := (l->>'monto')::numeric;
    if v_monto is null or v_monto <= 0 then raise exception 'Monto inválido'; end if;

    insert into pagos (paciente_id, monto, metodo_pago, numero_boleta, numero_referencia, profesional_id,
                       item_id, fecha_pago, comentario, nota, caja_id)
    values (v_paciente, v_monto, l->>'metodo_pago', l->>'numero_boleta', l->>'numero_referencia',
            nullif(l->>'profesional_id', '')::uuid, v_item, coalesce((l->>'fecha_pago')::timestamptz, now()),
            l->>'comentario', l->>'nota', nullif(l->>'caja_id', '')::bigint)
    returning id into v_id;
    v_ids := v_ids || v_id;

    if v_item is not null then
      update presupuesto_items set abonado = coalesce(abonado, 0) + v_monto where id = v_item;
      perform _recalcular_abonado_plan((select presupuesto_id from presupuesto_items where id = v_item));
    elsif coalesce(l->>'metodo_pago', '') <> 'Saldo a Favor' then
      update pacientes set saldo_a_favor = coalesce(saldo_a_favor, 0) + v_monto where id = v_paciente;
    end if;
  end loop;

  if coalesce(p_saldo_usado, 0) > 0 then
    select saldo_a_favor into v_saldo from pacientes where id = v_paciente for update;
    if coalesce(v_saldo, 0) < p_saldo_usado then raise exception 'Saldo a favor insuficiente'; end if;
    update pacientes set saldo_a_favor = saldo_a_favor - p_saldo_usado where id = v_paciente;
  end if;

  return v_ids;
end $$;

create or replace function public.pasar_pagos_a_saldo(p_pago_ids text[], p_motivo text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  p record;
  v_paciente bigint;
  v_plan bigint;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  if coalesce(rol_actual(), '') not in ('ADMIN', 'RECEPCIONISTA') then
    raise exception 'Solo administración o recepción pueden anular pagos';
  end if;
  perform set_config('app.via_funcion', 'si', true);

  for p in select * from pagos where id = any(p_pago_ids::bigint[]) and coalesce(estado, '') <> 'Anulado' for update loop
    v_paciente := p.paciente_id;
    if p.item_id is not null then
      select presupuesto_id into v_plan from presupuesto_items where id = p.item_id;
      update presupuesto_items set abonado = greatest(coalesce(abonado, 0) - p.monto, 0) where id = p.item_id;
      update pagos set item_id = null, motivo = p_motivo where id = p.id;
      update pacientes set saldo_a_favor = coalesce(saldo_a_favor, 0) + p.monto where id = p.paciente_id;
      perform _recalcular_abonado_plan(v_plan);
    else
      update pagos set estado = 'Anulado', anulado_por = auth.uid(), motivo = p_motivo where id = p.id;
      update pacientes set saldo_a_favor = coalesce(saldo_a_favor, 0) - p.monto where id = p.paciente_id;
    end if;
  end loop;

  return jsonb_build_object('saldo_nuevo', (select saldo_a_favor from pacientes where id = v_paciente));
end $$;

-- Cancelar una prestación lo puede hacer el personal clínico; su dinero pasa al saldo a favor del paciente
create or replace function public.cancelar_prestacion(p_item_id text, p_motivo text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_item presupuesto_items;
  v_paciente bigint;
  v_total numeric;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  perform set_config('app.via_funcion', 'si', true);
  select * into v_item from presupuesto_items where id = p_item_id::bigint for update;
  if not found then raise exception 'Prestación no encontrada'; end if;
  select paciente_id into v_paciente from presupuestos where id = v_item.presupuesto_id;

  select coalesce(sum(monto), 0) into v_total
    from pagos where item_id = v_item.id and coalesce(estado, '') <> 'Anulado';

  update pagos set item_id = null, motivo = p_motivo
   where item_id = v_item.id and coalesce(estado, '') <> 'Anulado';
  if v_total > 0 then
    update pacientes set saldo_a_favor = coalesce(saldo_a_favor, 0) + v_total where id = v_paciente;
  end if;
  update presupuesto_items set estado = 'cancelada', abonado = 0 where id = v_item.id;
  perform _recalcular_abonado_plan(v_item.presupuesto_id);

  return jsonb_build_object('pasado_a_saldo', v_total);
end $$;

-- ───────────── Archivos de pacientes: bucket privado ─────────────
-- La app ahora los muestra con links temporales firmados (lib/archivos.ts).
update storage.buckets set public = false where id = 'documentos_pacientes';
