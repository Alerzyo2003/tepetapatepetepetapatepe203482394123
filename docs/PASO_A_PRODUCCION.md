# Paso a producción

Orden recomendado para activar los planes de suscripción, los cobros con Mercado Pago y las reglas de seguridad
en la clínica real, sin cortar el servicio. Las casillas marcadas con **(tú)** requieren entrar a un panel
(Supabase, Vercel, Mercado Pago); el resto lo prepara el equipo de desarrollo.

## 0. Antes de empezar

- [ ] **(tú)** Respaldo de la base real: Supabase → *Database → Backups* (plan Pro) o, en plan gratis,
      `supabase db dump` desde la línea de comandos. Sin respaldo no se toca nada.
- [ ] **(tú)** Plan Pro de Supabase (US$25/mes por organización) para la base de la clínica y la del portal:
      respaldos diarios automáticos y sin pausas por inactividad. Con datos de salud y pagos es lo mínimo.

## 1. Diagnóstico de la base real

- [ ] **(tú)** Ejecutar `supabase/diagnostico_produccion.sql` en el SQL Editor del proyecto que usa hoy la clínica
      y enviar el resultado. Es solo lectura y no incluye datos de pacientes.
- [ ] Con ese resultado se prepara `supabase/seguridad_produccion.sql`, adaptado a las reglas y funciones de pago
      que existen hoy (no se aplica `seguridad.sql` tal cual: reemplazaría las funciones de pago reales).

## 2. Mercado Pago en producción

- [ ] **(tú)** En la aplicación de Mercado Pago → *Producción → Credenciales de producción* → activarlas
      (rubro, sitio web = URL del portal). Usar la cuenta de Mercado Pago **donde quieres recibir el dinero**.
- [ ] **(tú)** *Webhooks* → pestaña **Modo productivo**: misma URL
      `https://portal-suscripciones.vercel.app/api/webhooks/mercadopago`, evento **Planes y suscripciones**.
- [ ] **(tú)** En Vercel (proyecto del portal) reemplazar `MP_ACCESS_TOKEN` por el de producción, revisar
      `MP_WEBHOOK_SECRET` y que exista `CRON_SECRET`. Volver a desplegar.

## 3. Portal limpio

- [ ] Borrar los datos de prueba del portal (Clínica de Prueba, su pago y los avisos de prueba).
- [ ] **(tú)** Cambiar la contraseña de tu usuario del panel.
- [ ] **(tú)** Opcional: dominio propio para el portal (p. ej. `portal.tudominio.cl`) en Vercel → *Domains*.
      Si lo cambias, actualiza `PORTAL_URL` y la URL del webhook en Mercado Pago.
- [ ] **(tú)** Dar de alta la clínica real en el portal. Para tu propia clínica: plan Empresarial, estado ACTIVA y
      vencimiento lejano (cortesía), así no se le cobra.

## 4. App de la clínica

1. [ ] **(tú)** Ejecutar `supabase/suscripcion.sql` en la base real (solo agrega una tabla; no cambia nada existente).
2. [ ] **(tú)** En Vercel (proyecto de la clínica) agregar `PORTAL_URL` y `PORTAL_LICENCIA` (las entrega el portal).
3. [ ] Revisar y aprobar el pull request de `feature/seguridad` hacia `main` (incluye los planes de suscripción).
       Al unirlo, Vercel publica la nueva versión.
4. [ ] **(tú)** Inmediatamente después, ejecutar `supabase/seguridad_produccion.sql` (paso 1). El bucket de
       archivos se vuelve privado recién aquí, cuando la app ya sabe mostrarlos con links temporales.
5. [ ] Prueba rápida con un usuario de cada rol: agendar una cita, registrar un pago, abrir un archivo de paciente,
       entrar a Administración (solo ADMIN).
6. [ ] Si algo falla: Vercel → *Deployments* → versión anterior → **Instant Rollback**. Las reglas de la base
       se revierten con el bloque “deshacer” que trae `seguridad_produccion.sql`.

## 5. Llaves y accesos

- [ ] **(tú)** Regenerar las llaves que se compartieron por chat durante las pruebas: Supabase (proyectos
      `clinica-dental-suscripciones` y `portal-suscripciones`) y el token de prueba de Mercado Pago.
- [ ] **(tú)** Supabase → *Authentication → Settings*: activar la protección contra contraseñas filtradas y
      longitud mínima 8 en ambos proyectos.

## 6. Temas legales y tributarios (Chile)

- [ ] **Boletas o facturas (SII):** Mercado Pago cobra, pero no emite el documento tributario. Cada cobro de
      suscripción necesita su boleta o factura electrónica (manual al inicio, o integrando un proveedor como
      OpenFactura, LibreDTE o Bsale).
- [ ] **Contrato y términos de servicio** con cada clínica, incluyendo el **encargo de tratamiento de datos**:
      la clínica es responsable de los datos de sus pacientes y tú los tratas por encargo. Son datos de salud
      (sensibles) bajo la Ley 19.628 y la Ley 21.719, que entra en vigencia en diciembre de 2026.
- [ ] Política de privacidad publicada.
