'use client'
// Resumen completo de la ficha del paciente, pensado para imprimir (o guardar como PDF).
// Se monta solo al apretar "Imprimir resumen": carga todo, abre el diálogo de impresión y se desmonta.
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import DOMPurify from 'isomorphic-dompurify'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'

const ROLES_FINANZAS = ['ADMIN', 'RECEPCIONISTA']
const TZ = 'America/Santiago'

type Datos = {
  paciente: any
  antecedentes: any[]
  presupuestos: any[]
  items: any[]
  evoluciones: any[]
  citas: any[]
  pagos: any[] | null // null = el usuario no ve finanzas
  documentos: any[]
  profesionales: Record<string, string>
}

const pesos = (n: any) => `$${Math.round(Number(n || 0)).toLocaleString('es-CL')}`

// Fechas con zona horaria (timestamptz)
const fechaTz = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString('es-CL', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'
const horaTz = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleTimeString('es-CL', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }) : ''

// Fechas sin zona horaria (citas.inicio, fecha_nacimiento): se leen tal cual vienen
const fechaLocal = (s?: string | null) => {
  if (!s) return '—'
  const [a, m, d] = s.slice(0, 10).split('-')
  return d && m && a ? `${d}-${m}-${a}` : s
}
const horaLocal = (s?: string | null) => (s && s.length >= 16 ? s.slice(11, 16) : '')

// 187005795 -> 18.700.579-5
const formatoRut = (rut?: string | null) => {
  const limpio = (rut || '').replace(/[^0-9kK]/g, '').toUpperCase()
  if (limpio.length < 2) return rut || ''
  const cuerpo = limpio.slice(0, -1).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${cuerpo}-${limpio.slice(-1)}`
}

const edad = (nac?: string | null) => {
  if (!nac) return null
  const [a, m, d] = nac.slice(0, 10).split('-').map(Number)
  if (!a) return null
  const hoy = new Date()
  let e = hoy.getFullYear() - a
  if (hoy.getMonth() + 1 < m || (hoy.getMonth() + 1 === m && hoy.getDate() < d)) e--
  return e
}

const CATEGORIAS: { clave: string; titulo: string }[] = [
  { clave: 'alerta', titulo: 'Alertas médicas' },
  { clave: 'enfermedad', titulo: 'Enfermedades' },
  { clave: 'medicamento', titulo: 'Medicamentos' },
  { clave: 'habito', titulo: 'Hábitos' },
  { clave: 'comentario', titulo: 'Comentarios' },
]
const categoriaDe = (c?: string | null) => {
  const t = (c || '').toLowerCase()
  if (t.startsWith('alerta')) return 'alerta'
  if (t.startsWith('enfermedad')) return 'enfermedad'
  if (t.startsWith('medicamento')) return 'medicamento'
  if (t.startsWith('hábito') || t.startsWith('habito')) return 'habito'
  return 'comentario'
}

const estadoPresupuesto = (p: any) => {
  const e = (p.estado || '').toLowerCase()
  if (e.includes('finaliz')) return 'Finalizado'
  if (e.includes('activo') || e.includes('curso')) return 'En tratamiento'
  return p.aprobado ? 'Aprobado' : 'Sin aprobar'
}

const estadoItem = (i: any) => {
  if (i.estado === 'realizado') return 'Realizado'
  if (i.estado === 'cancelada') return 'Cancelado'
  if (Number(i.progreso) > 0) return `En progreso (${i.progreso}%)`
  return 'Pendiente'
}

const piezaTexto = (pieza: any, cara?: string | null, zona?: string | null) => {
  const partes = [pieza ? `Pieza ${pieza}` : zona || null, cara ? `cara ${cara}` : null].filter(Boolean)
  return partes.length ? partes.join(', ') : '—'
}

// Los nombres de prestación guardan datos internos después de " | " (fase, fechas, ids): se muestra solo el nombre
const limpiarNombre = (n?: string | null) => (n || '').split(' | ')[0].trim() || '—'

const estadoCita = (e?: string | null) => {
  const t = (e || '').replace(/_/g, ' ').trim()
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : '—'
}

// Observación automática que agrega el sistema al evolucionar: no aporta en el papel
const esObservacionAutomatica = (o?: string | null) => /^Evoluci[oó]n de \d+ prestaci/i.test(o || '')

// El comentario del pago guarda en JSON qué prestaciones se pagaron
const detallePrestacionesPago = (comentario?: string | null) => {
  if (!comentario || !comentario.trim().startsWith('[')) return comentario || ''
  try {
    const lista = JSON.parse(comentario)
    if (!Array.isArray(lista)) return comentario
    return lista.map((x: any) => `${limpiarNombre(x.prestacion)}${x.diente ? ` (pieza ${x.diente})` : ''}`).join('; ')
  } catch { return comentario }
}

const esHtml = (t: string) => /<[a-z][\s\S]*>/i.test(t)

const pagoNoCuenta = (p: any) => p.estado === 'Anulado' || (p.estado || '').toLowerCase().includes('saldo a favor')

export default function ResumenFichaImpresion({ pacienteId, onTerminar }: { pacienteId: string; onTerminar: () => void }) {
  const [datos, setDatos] = useState<Datos | null>(null)
  const [error, setError] = useState(false)
  const terminarRef = useRef(onTerminar)
  terminarRef.current = onTerminar

  useEffect(() => {
    let cancelado = false
    ;(async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        let rol = ''
        if (session) {
          const { data: perfil } = await supabase.from('perfiles').select('rol').eq('id', session.user.id).single()
          rol = perfil?.rol || ''
        }
        const verFinanzas = ROLES_FINANZAS.includes(rol)

        const [pac, ant, pres, evo, cit, pag, docs, profs] = await Promise.all([
          supabase.from('pacientes').select('*').eq('id', pacienteId).single(),
          supabase.from('antecedentes').select('categoria, contenido, fecha_registro').eq('paciente_id', pacienteId).order('fecha_registro'),
          supabase.from('presupuestos').select('id, created_at, nombre_tratamiento, total, total_abonado, estado, aprobado, especialista_id').eq('paciente_id', pacienteId).order('created_at'),
          supabase.from('evoluciones').select('id, fecha_registro, descripcion_procedimiento, observaciones, prestaciones, profesional_id, especialista_id, creado_por, estado').eq('paciente_id', pacienteId).order('fecha_registro'),
          supabase.from('citas').select('id, inicio, estado, motivo, profesional_id').eq('paciente_id', pacienteId).order('inicio'),
          verFinanzas
            ? supabase.from('pagos').select('id, fecha_pago, monto, metodo_pago, comentario, nota, detalle_cuota, numero_boleta, estado, presupuesto_id').eq('paciente_id', pacienteId).order('fecha_pago')
            : Promise.resolve({ data: null, error: null }),
          supabase.from('documentos_pacientes').select('id, titulo, nombre_archivo, fecha_subida').eq('paciente_id', pacienteId).order('fecha_subida'),
          supabase.from('profesionales').select('id, user_id, nombre, apellido'),
        ])
        if (pac.error || !pac.data) throw pac.error || new Error('Paciente no encontrado')

        const idsPres = (pres.data || []).map((p: any) => p.id)
        const items = idsPres.length
          ? (await supabase.from('presupuesto_items')
              .select('id, presupuesto_id, nombre_prestacion, diente_id, cara, zona, estado, progreso, precio_pactado, abonado, cantidad, profesional_id')
              .in('presupuesto_id', idsPres)).data || []
          : []

        const profesionales: Record<string, string> = {}
        // Algunas tablas guardan el user_id del profesional y otras el id de la tabla profesionales
        ;(profs.data || []).forEach((p: any) => {
          const nombre = `${p.nombre || ''} ${p.apellido || ''}`.replace(/\s+/g, ' ').trim()
          if (p.id) profesionales[p.id] = nombre
          if (p.user_id) profesionales[p.user_id] = nombre
        })

        if (!cancelado) setDatos({
          paciente: pac.data,
          antecedentes: ant.data || [],
          presupuestos: pres.data || [],
          items,
          evoluciones: (evo.data || []).filter((e: any) => e.estado !== 'anulada'),
          citas: cit.data || [],
          pagos: verFinanzas ? (pag.data || []) : null,
          documentos: docs.data || [],
          profesionales,
        })
      } catch (e) {
        console.error('Resumen para imprimir:', e)
        if (!cancelado) { toast.error('No se pudo preparar el resumen para imprimir'); setError(true) }
      }
    })()
    return () => { cancelado = true }
  }, [pacienteId])

  // Cuando ya está todo cargado y dibujado, se abre la impresión
  useEffect(() => {
    if (error) { terminarRef.current(); return }
    if (!datos) return
    const alTerminar = () => terminarRef.current()
    window.addEventListener('afterprint', alTerminar)
    document.body.classList.add('imprimiendo-resumen')
    const t = setTimeout(() => window.print(), 300)
    return () => {
      clearTimeout(t)
      window.removeEventListener('afterprint', alTerminar)
      document.body.classList.remove('imprimiendo-resumen')
    }
  }, [datos, error])

  if (!datos) return null

  const { paciente: p, profesionales } = datos
  const nombreProf = (...ids: any[]) => {
    for (const id of ids) if (id && profesionales[id]) return profesionales[id]
    return '—'
  }
  const nombrePaciente = `${p.nombre || ''} ${p.apellido || ''}`.trim()
  const e = edad(p.fecha_nacimiento)
  const ahora = new Date().toISOString()

  const presPorId: Record<string, any> = {}
  datos.presupuestos.forEach(pr => { presPorId[pr.id] = pr })

  const itemsDe = (presId: string) =>
    datos.items
      .filter(i => i.presupuesto_id === presId)
      .sort((a, b) => (a.diente_id ?? 999) - (b.diente_id ?? 999) || limpiarNombre(a.nombre_prestacion).localeCompare(limpiarNombre(b.nombre_prestacion)))

  const antecedentesPorCat = CATEGORIAS
    .map(c => ({ ...c, lista: datos.antecedentes.filter(a => categoriaDe(a.categoria) === c.clave && (a.contenido || '').trim()) }))
    .filter(c => c.lista.length)

  const totalPresupuestado = datos.presupuestos.reduce((s, pr) => s + Number(pr.total || 0), 0)
  const totalRealizado = datos.items.filter(i => i.estado === 'realizado').reduce((s, i) => s + Number(i.precio_pactado || 0), 0)
  const pagosValidos = (datos.pagos || []).filter(pg => !pagoNoCuenta(pg))
  const totalPagado = pagosValidos.reduce((s, pg) => s + Number(pg.monto || 0), 0)

  const dato = (etiqueta: string, valor: any) => (
    <div className="rf-dato"><span>{etiqueta}</span><b>{valor || '—'}</b></div>
  )

  return createPortal(
    <div className="resumen-impresion">
      {/* ENCABEZADO */}
      <header className="rf-encabezado">
        <img src="/logo.png" alt="Clínica Dignidad" />
        <div className="rf-clinica">
          <strong>Centro Médico y Dental Dignidad SpA</strong>
          <span>Av. Venancia Leiva 1871, La Pintana · +56 9 6646 7641</span>
        </div>
        <div className="rf-titulo">
          <strong>Resumen de ficha clínica</strong>
          <span>Impreso el {fechaTz(ahora)} a las {horaTz(ahora)}</span>
        </div>
      </header>

      {/* 1. DATOS DEL PACIENTE */}
      <section className="rf-seccion">
        <h2>1. Datos del paciente</h2>
        <div className="rf-datos">
          {dato('Nombre', nombrePaciente + (p.nombre_social ? ` (${p.nombre_social})` : ''))}
          {dato('RUT', formatoRut(p.rut))}
          {dato('Fecha de nacimiento', p.fecha_nacimiento ? `${fechaLocal(p.fecha_nacimiento)}${e !== null ? ` (${e} años)` : ''}` : null)}
          {dato('Sexo / género', p.sexo || p.genero)}
          {dato('Teléfono', [p.telefono, p.telefono_fijo].filter(Boolean).join(' / '))}
          {dato('Email', p.email)}
          {dato('Dirección', [p.direccion, p.comuna, p.ciudad].filter(Boolean).join(', '))}
          {dato('Previsión / convenio', p.prevision)}
          {(p.apoderado_nombre || p.apoderado_rut) && dato('Apoderado', [p.apoderado_nombre, p.apoderado_rut].filter(Boolean).join(' · '))}
          {p.actividad_profesion && dato('Actividad / profesión', p.actividad_profesion)}
          {p.numero_interno && dato('N° interno', p.numero_interno)}
          {dato('Paciente desde', fechaTz(p.created_at))}
        </div>
        {p.observaciones_personales && <p className="rf-nota"><b>Observaciones:</b> {p.observaciones_personales}</p>}
      </section>

      {/* 2. ANTECEDENTES */}
      <section className="rf-seccion">
        <h2>2. Antecedentes médicos</h2>
        {p.antecedentes_medicos && <p className="rf-nota">{p.antecedentes_medicos}</p>}
        {antecedentesPorCat.length === 0 && !p.antecedentes_medicos ? (
          <p className="rf-vacio">Sin antecedentes registrados.</p>
        ) : (
          <div className="rf-antecedentes">
            {antecedentesPorCat.map(c => (
              <div key={c.clave}>
                <h3>{c.titulo}</h3>
                <ul>{c.lista.map((a, i) => <li key={i}>{a.contenido}</li>)}</ul>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 3. RESUMEN */}
      <section className="rf-seccion">
        <h2>3. Resumen</h2>
        <div className="rf-resumen">
          <div><span>Planes de tratamiento</span><b>{datos.presupuestos.length}</b></div>
          <div><span>Prestaciones realizadas</span><b>{datos.items.filter(i => i.estado === 'realizado').length} de {datos.items.filter(i => i.estado !== 'cancelada').length}</b></div>
          <div><span>Evoluciones</span><b>{datos.evoluciones.length}</b></div>
          <div><span>Citas</span><b>{datos.citas.length}</b></div>
          {datos.pagos && <>
            <div><span>Total presupuestado</span><b>{pesos(totalPresupuestado)}</b></div>
            <div><span>Total realizado</span><b>{pesos(totalRealizado)}</b></div>
            <div><span>Total pagado</span><b>{pesos(totalPagado)}</b></div>
            <div><span>Saldo a favor</span><b>{pesos(p.saldo_a_favor)}</b></div>
          </>}
        </div>
      </section>

      {/* 4. PLANES DE TRATAMIENTO */}
      <section className="rf-seccion">
        <h2>4. Planes de tratamiento</h2>
        {datos.presupuestos.length === 0 && <p className="rf-vacio">Sin planes de tratamiento.</p>}
        {datos.presupuestos.map((pr, n) => {
          const lista = itemsDe(pr.id)
          return (
            <div key={pr.id} className="rf-plan">
              <div className="rf-plan-cab">
                <b>Plan {n + 1}: {pr.nombre_tratamiento || 'Sin nombre'}</b>
                <span>Creado el {fechaTz(pr.created_at)} · {estadoPresupuesto(pr)} · Especialista: {nombreProf(pr.especialista_id)}</span>
              </div>
              <table>
                <thead>
                  <tr><th style={{ width: '4%' }}>#</th><th>Prestación</th><th style={{ width: '16%' }}>Pieza</th><th style={{ width: '17%' }}>Estado</th><th style={{ width: '20%' }}>Profesional</th><th className="rf-num" style={{ width: '12%' }}>Valor</th></tr>
                </thead>
                <tbody>
                  {lista.length === 0 && <tr><td colSpan={6} className="rf-vacio">Sin prestaciones.</td></tr>}
                  {lista.map((i, k) => (
                    <tr key={i.id} className={i.estado === 'cancelada' ? 'rf-tachado' : ''}>
                      <td>{k + 1}</td>
                      <td>{limpiarNombre(i.nombre_prestacion)}{Number(i.cantidad) > 1 ? ` (x${i.cantidad})` : ''}</td>
                      <td>{piezaTexto(i.diente_id, i.cara, i.zona)}</td>
                      <td>{estadoItem(i)}</td>
                      <td>{nombreProf(i.profesional_id)}</td>
                      <td className="rf-num">{pesos(i.precio_pactado)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr><td colSpan={5} className="rf-num">Total del plan</td><td className="rf-num">{pesos(pr.total)}</td></tr>
                  {datos.pagos && <>
                    <tr><td colSpan={5} className="rf-num">Abonado</td><td className="rf-num">{pesos(pr.total_abonado)}</td></tr>
                    <tr><td colSpan={5} className="rf-num">Saldo del plan</td><td className="rf-num">{pesos(Number(pr.total || 0) - Number(pr.total_abonado || 0))}</td></tr>
                  </>}
                </tfoot>
              </table>
            </div>
          )
        })}
      </section>

      {/* 5. EVOLUCIONES */}
      <section className="rf-seccion">
        <h2>5. Evoluciones clínicas</h2>
        {datos.evoluciones.length === 0 && <p className="rf-vacio">Sin evoluciones registradas.</p>}
        {datos.evoluciones.map(ev => {
          const prestaciones = Array.isArray(ev.prestaciones) ? ev.prestaciones : []
          return (
            <div key={ev.id} className="rf-evolucion">
              <div className="rf-evo-cab">
                <b>{fechaTz(ev.fecha_registro)} {horaTz(ev.fecha_registro)}</b>
                <span>{nombreProf(ev.profesional_id, ev.especialista_id, ev.creado_por)}</span>
              </div>
              {prestaciones.length > 0 && (
                <ul className="rf-evo-prest">
                  {prestaciones.map((pp: any, k: number) => (
                    <li key={k}>{limpiarNombre(pp.nombre)}{pp.pieza || pp.cara || pp.zona ? ` — ${piezaTexto(pp.pieza, pp.cara, pp.zona)}` : ''}{pp.avance != null ? ` · avance ${pp.avance}%` : ''}</li>
                  ))}
                </ul>
              )}
              {ev.descripcion_procedimiento && (esHtml(ev.descripcion_procedimiento)
                ? <div className="rf-evo-texto" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(ev.descripcion_procedimiento) }} />
                : <div className="rf-evo-texto rf-texto-plano">{ev.descripcion_procedimiento}</div>
              )}
              {ev.observaciones && !esObservacionAutomatica(ev.observaciones) && <p className="rf-evo-obs"><b>Observaciones:</b> {ev.observaciones}</p>}
            </div>
          )
        })}
      </section>

      {/* 6. PAGOS (solo administración y recepción) */}
      {datos.pagos && (
        <section className="rf-seccion">
          <h2>6. Pagos</h2>
          {datos.pagos.length === 0 ? <p className="rf-vacio">Sin pagos registrados.</p> : (
            <table>
              <thead>
                <tr><th style={{ width: '12%' }}>Fecha</th><th>Detalle</th><th style={{ width: '15%' }}>Método</th><th style={{ width: '11%' }}>Boleta</th><th className="rf-num" style={{ width: '13%' }}>Monto</th></tr>
              </thead>
              <tbody>
                {datos.pagos.map(pg => {
                  const plan = pg.presupuesto_id ? presPorId[pg.presupuesto_id] : null
                  const detalle = [plan ? `Plan: ${plan.nombre_tratamiento || 'Sin nombre'}` : null, detallePrestacionesPago(pg.comentario), pg.detalle_cuota, pg.nota].filter(Boolean).join(' · ') || 'Abono general'
                  const noCuenta = pagoNoCuenta(pg)
                  return (
                    <tr key={pg.id} className={noCuenta ? 'rf-tachado' : ''}>
                      <td>{fechaTz(pg.fecha_pago)}</td>
                      <td>{detalle}{noCuenta ? ` (${pg.estado})` : ''}</td>
                      <td>{pg.metodo_pago || '—'}</td>
                      <td>{pg.numero_boleta || '—'}</td>
                      <td className="rf-num">{pesos(pg.monto)}</td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr><td colSpan={4} className="rf-num">Total pagado</td><td className="rf-num">{pesos(totalPagado)}</td></tr>
              </tfoot>
            </table>
          )}
        </section>
      )}

      {/* 7. CITAS */}
      <section className="rf-seccion">
        <h2>{datos.pagos ? '7' : '6'}. Citas</h2>
        {datos.citas.length === 0 ? <p className="rf-vacio">Sin citas registradas.</p> : (
          <table>
            <thead>
              <tr><th style={{ width: '12%' }}>Fecha</th><th style={{ width: '7%' }}>Hora</th><th style={{ width: '22%' }}>Profesional</th><th>Motivo</th><th style={{ width: '18%' }}>Estado</th></tr>
            </thead>
            <tbody>
              {datos.citas.map(c => (
                <tr key={c.id}>
                  <td>{fechaLocal(c.inicio)}</td>
                  <td>{horaLocal(c.inicio)}</td>
                  <td>{nombreProf(c.profesional_id)}</td>
                  <td>{c.motivo || '—'}</td>
                  <td>{estadoCita(c.estado)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* 8. DOCUMENTOS */}
      <section className="rf-seccion">
        <h2>{datos.pagos ? '8' : '7'}. Documentos y archivos</h2>
        {datos.documentos.length === 0 ? <p className="rf-vacio">Sin documentos.</p> : (
          <ul className="rf-docs">
            {datos.documentos.map(d => <li key={d.id}><span>{fechaTz(d.fecha_subida)}</span> {d.titulo || d.nombre_archivo || 'Archivo'}</li>)}
          </ul>
        )}
      </section>

      <footer className="rf-pie">
        Documento generado desde AureoDent · {nombrePaciente} · RUT {formatoRut(p.rut) || '—'}
      </footer>

      <style dangerouslySetInnerHTML={{ __html: ESTILOS }} />
    </div>,
    document.body
  )
}

const ESTILOS = `
  .resumen-impresion { display: none; }
  @media print {
    @page { size: letter; margin: 12mm 12mm 14mm 12mm; }
    html, body { height: auto !important; overflow: visible !important; background: #fff !important; }
    body.imprimiendo-resumen > *:not(.resumen-impresion) { display: none !important; }
    body.imprimiendo-resumen > .resumen-impresion { display: block !important; }
  }
  .resumen-impresion { font-family: Arial, Helvetica, sans-serif; color: #0f172a; font-size: 10.5px; line-height: 1.4; }
  .resumen-impresion * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .rf-encabezado { display: flex; align-items: center; gap: 12px; border-bottom: 2px solid #0B2136; padding-bottom: 8px; margin-bottom: 12px; }
  .rf-encabezado img { height: 46px; width: auto; }
  .rf-clinica { display: flex; flex-direction: column; flex: 1; }
  .rf-clinica strong { font-size: 13px; color: #0B2136; }
  .rf-clinica span, .rf-titulo span { font-size: 9.5px; color: #475569; }
  .rf-titulo { display: flex; flex-direction: column; text-align: right; }
  .rf-titulo strong { font-size: 15px; color: #0B2136; text-transform: uppercase; letter-spacing: .3px; }
  .rf-seccion { margin-bottom: 14px; }
  .rf-seccion h2 { font-size: 12px; font-weight: 800; color: #fff; background: #0B2136; padding: 4px 8px; border-radius: 3px; margin: 0 0 7px; text-transform: uppercase; letter-spacing: .4px; break-after: avoid; page-break-after: avoid; }
  .rf-seccion h3 { font-size: 10.5px; font-weight: 800; color: #104a5a; margin: 0 0 2px; }
  .rf-datos { display: grid; grid-template-columns: 1fr 1fr; gap: 3px 18px; }
  .rf-dato { display: flex; gap: 6px; border-bottom: 1px dotted #cbd5e1; padding: 2px 0; }
  .rf-dato span { color: #64748b; min-width: 120px; }
  .rf-nota { margin: 6px 0 0; }
  .rf-vacio { color: #94a3b8; font-style: italic; margin: 0; }
  .rf-antecedentes { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px 16px; }
  .rf-antecedentes ul, .rf-evo-prest, .rf-docs { margin: 0; padding-left: 16px; }
  .rf-resumen { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
  .rf-resumen div { border: 1px solid #cbd5e1; border-radius: 4px; padding: 5px 7px; display: flex; flex-direction: column; }
  .rf-resumen span { color: #64748b; font-size: 9px; text-transform: uppercase; }
  .rf-resumen b { font-size: 12px; }
  .rf-plan { margin-bottom: 10px; }
  .rf-plan-cab { break-after: avoid; page-break-after: avoid; }
  .rf-plan-cab { display: flex; flex-direction: column; margin-bottom: 3px; }
  .rf-plan-cab b { font-size: 11px; color: #0B2136; }
  .rf-plan-cab span { color: #475569; font-size: 9.5px; }
  .resumen-impresion table { width: 100%; border-collapse: collapse; }
  .resumen-impresion th { background: #e6f2f2; color: #104a5a; text-align: left; font-size: 9.5px; text-transform: uppercase; padding: 3px 5px; border: 1px solid #cbd5e1; }
  .resumen-impresion td { padding: 3px 5px; border: 1px solid #e2e8f0; vertical-align: top; }
  .resumen-impresion tr { break-inside: avoid; page-break-inside: avoid; }
  .resumen-impresion tfoot td { font-weight: 800; background: #f8fafc; }
  .rf-num { text-align: right; white-space: nowrap; }
  .rf-tachado td { color: #94a3b8; text-decoration: line-through; }
  .rf-evolucion { border-left: 3px solid #4361ee; padding: 3px 0 4px 8px; margin-bottom: 7px; break-inside: avoid; page-break-inside: avoid; }
  .rf-evo-cab { display: flex; justify-content: space-between; gap: 10px; }
  .rf-evo-cab span { color: #475569; }
  .rf-evo-prest { color: #104a5a; margin-top: 2px; }
  .rf-evo-texto { margin-top: 2px; }
  .rf-texto-plano { white-space: pre-line; }
  .rf-evo-texto ul { list-style: disc; padding-left: 16px; margin: 2px 0; }
  .rf-evo-texto b, .rf-evo-texto strong { font-weight: 800; }
  .rf-evo-obs { margin: 2px 0 0; color: #475569; }
  .rf-docs span { color: #64748b; margin-right: 6px; }
  .rf-pie { margin-top: 16px; padding-top: 6px; border-top: 1px solid #cbd5e1; color: #94a3b8; font-size: 9px; text-align: center; }
`
