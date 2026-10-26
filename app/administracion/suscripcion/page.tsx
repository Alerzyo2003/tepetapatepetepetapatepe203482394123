'use client'
import { useState, useEffect } from 'react'
import { obtenerResumenSuscripcion, iniciarPagoPlan } from '../actions'
import { PLANES, ROLES_STAFF, NOMBRE_ROL, PRECIO_CUPO_EXTRA, formatoCLP, conIVA, type RolStaff } from '@/lib/planes'
import { Crown, Check, Loader2, AlertTriangle, ShieldCheck, Stethoscope, Activity, UserCircle, CreditCard, Mail, Clock } from 'lucide-react'
import { toast } from 'sonner'

type Resumen = Exclude<Awaited<ReturnType<typeof obtenerResumenSuscripcion>>, { error: string }>

const ICONO_ROL: Record<RolStaff, React.ReactNode> = {
  ADMIN: <ShieldCheck size={18}/>,
  DENTISTA: <Stethoscope size={18}/>,
  ASISTENTE: <Activity size={18}/>,
  RECEPCIONISTA: <UserCircle size={18}/>,
}

const NOMBRE_ROL_SINGULAR: Record<RolStaff, string> = {
  ADMIN: 'Administrativo', DENTISTA: 'Dentista', ASISTENTE: 'Asistente', RECEPCIONISTA: 'Recepcionista',
}

const ESTADO_LABEL: Record<string, { texto: string, clase: string }> = {
  PRUEBA: { texto: 'Periodo de prueba', clase: 'bg-blue-50 text-blue-600 border-blue-200' },
  ACTIVA: { texto: 'Activa', clase: 'bg-emerald-50 text-emerald-600 border-emerald-200' },
  VENCIDA: { texto: 'Vencida', clase: 'bg-red-50 text-red-600 border-red-200' },
  SUSPENDIDA: { texto: 'Suspendida', clase: 'bg-red-50 text-red-600 border-red-200' },
}

export default function SuscripcionPage() {
  const [resumen, setResumen] = useState<Resumen | null>(null)
  const [cargando, setCargando] = useState(true)
  const [anual, setAnual] = useState(false)
  const [email, setEmail] = useState('')
  const [pagando, setPagando] = useState<string | null>(null)
  const [volvioDePago, setVolvioDePago] = useState(false)

  useEffect(() => {
    setVolvioDePago(new URLSearchParams(window.location.search).get('pago') === 'retorno')
    obtenerResumenSuscripcion().then(res => {
      if ('error' in res) toast.error('No se pudo cargar la suscripción: ' + res.error)
      else {
        setResumen(res)
        setAnual(res.ciclo === 'ANUAL')
      }
      setCargando(false)
    })
  }, [])

  // Lleva a Mercado Pago (a través del portal central) para pagar el plan con cobro automático
  const pagar = async (planId: string) => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return toast.error('Ingresa el correo con el que pagarás en Mercado Pago')
    setPagando(planId)
    const res = await iniciarPagoPlan(planId, anual ? 'ANUAL' : 'MENSUAL', email.trim())
    if (res.url) { window.location.href = res.url; return }
    toast.error(res.error || 'No se pudo iniciar el pago')
    setPagando(null)
  }

  const planActual = PLANES.find(p => p.id === resumen?.planId)
  const estado = resumen?.estado ? ESTADO_LABEL[resumen.estado] : null

  return (
    <main className="min-h-screen bg-[#FBF8F2] p-6 md:p-10 font-sans text-slate-900">
      <div className="max-w-7xl mx-auto space-y-8">

        <header className="bg-white/90 p-6 md:p-8 rounded-[2.5rem] shadow-sm border border-slate-100 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-5 w-full md:w-auto">
            <div className="bg-[#0A111F] w-16 h-16 rounded-full flex items-center justify-center text-[#C9A24B] shadow-lg shrink-0">
              <Crown size={28} />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-black text-[#0A111F] uppercase italic leading-none tracking-tight">Suscripción</h1>
              <p className="text-slate-400 text-[10px] md:text-xs font-bold uppercase tracking-widest mt-1.5">
                {planActual ? `Plan ${planActual.nombre}` : 'Sin plan configurado'}
                {resumen?.venceEl ? ` · vence el ${resumen.venceEl.split('-').reverse().join('-')}` : ''}
              </p>
            </div>
          </div>
          {estado && (
            <span className={`px-4 py-2 rounded-full border text-[10px] font-black uppercase tracking-widest ${estado.clase}`}>{estado.texto}</span>
          )}
        </header>

        {cargando ? (
          <div className="flex justify-center py-20"><Loader2 className="animate-spin text-[#C9A24B]" size={40}/></div>
        ) : (
          <>
            {volvioDePago && (
              <div className="bg-blue-50 border border-blue-200 text-blue-800 rounded-3xl p-5 flex items-center gap-3 text-sm font-bold">
                <Clock size={20}/> Recibimos tu autorización de pago. El plan se actualiza apenas Mercado Pago confirme el cobro (puede tardar unos minutos).
              </div>
            )}
            {resumen?.cobroAutomatico && (
              <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-3xl p-5 flex items-center gap-3 text-sm font-bold">
                <CreditCard size={20}/> Cobro automático activo con Mercado Pago: el plan se renueva solo en cada periodo.
              </div>
            )}
            {(resumen?.estado === 'VENCIDA' || resumen?.estado === 'SUSPENDIDA') && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-3xl p-5 flex items-center gap-3 text-sm font-bold">
                <AlertTriangle size={20}/> La suscripción no está vigente: no se pueden crear cuentas nuevas hasta renovarla.
              </div>
            )}
            {!planActual && (
              <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-3xl p-5 flex items-center gap-3 text-sm font-bold">
                <AlertTriangle size={20}/> No hay un plan configurado: por ahora no se aplican límites de usuarios.
              </div>
            )}

            {/* USO DE CUPOS */}
            {resumen && (
              <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {ROLES_STAFF.map(rol => {
                  const { usados, limite } = resumen.cupos[rol]
                  const pct = limite ? Math.min(100, Math.round((usados / limite) * 100)) : 0
                  const lleno = limite !== null && usados >= limite
                  return (
                    <div key={rol} className="bg-white rounded-[2rem] p-6 border border-slate-100 shadow-sm">
                      <div className="flex items-center gap-2 text-[#C9A24B] mb-3">
                        {ICONO_ROL[rol]}
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">{NOMBRE_ROL[rol]}</span>
                      </div>
                      <p className="text-3xl font-black text-[#0A111F]">
                        {usados}<span className="text-base text-slate-400"> / {limite ?? '∞'}</span>
                      </p>
                      {limite !== null && (
                        <div className="h-2 bg-slate-100 rounded-full mt-3 overflow-hidden">
                          <div className={`h-full rounded-full ${lleno ? 'bg-red-500' : 'bg-[#C9A24B]'}`} style={{ width: `${pct}%` }} />
                        </div>
                      )}
                      {!!resumen.cuposExtra[rol] && (
                        <p className="text-[10px] font-bold text-slate-400 mt-2">Incluye {resumen.cuposExtra[rol]} cupo(s) extra</p>
                      )}
                    </div>
                  )
                })}
              </section>
            )}

            {/* PLANES */}
            <section className="space-y-5">
              <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
                <h2 className="text-lg font-black text-[#0A111F] uppercase italic">Planes disponibles</h2>
                <div className="bg-white border border-slate-200 rounded-full p-1 flex text-[11px] font-black uppercase tracking-wider">
                  <button onClick={() => setAnual(false)} className={`px-5 py-2 rounded-full transition-all ${!anual ? 'bg-[#0A111F] text-white' : 'text-slate-500'}`}>Mensual</button>
                  <button onClick={() => setAnual(true)} className={`px-5 py-2 rounded-full transition-all ${anual ? 'bg-[#0A111F] text-white' : 'text-slate-500'}`}>Anual · 2 meses gratis</button>
                </div>
              </div>

              {resumen?.pagosEnLinea && (
                <label className="bg-white border border-slate-200 rounded-full px-5 py-3 flex items-center gap-3 max-w-xl">
                  <Mail size={16} className="text-[#C9A24B] shrink-0"/>
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 shrink-0">Correo para el cobro</span>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="pagos@tuclinica.cl"
                    className="flex-1 min-w-0 bg-transparent outline-none text-sm font-bold text-slate-900 placeholder:text-slate-300"/>
                </label>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
                {PLANES.map(plan => {
                  const esActual = plan.id === planActual?.id
                  const precio = anual ? plan.precioAnual : plan.precioMensual
                  return (
                    <div key={plan.id} className={`bg-white rounded-[2rem] p-7 border shadow-sm flex flex-col relative ${esActual ? 'border-[#C9A24B] ring-2 ring-[#C9A24B]/30' : plan.destacado ? 'border-[#0A111F]/30' : 'border-slate-100'}`}>
                      {(esActual || plan.destacado) && (
                        <span className={`absolute -top-3 left-7 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest text-white ${esActual ? 'bg-[#C9A24B]' : 'bg-[#0A111F]'}`}>
                          {esActual ? 'Tu plan' : 'Más elegido'}
                        </span>
                      )}
                      <h3 className="text-xl font-black text-[#0A111F] uppercase">{plan.nombre}</h3>
                      <p className="text-xs text-slate-500 mt-1 min-h-[32px]">{plan.descripcion}</p>

                      <div className="mt-5">
                        <p className="text-3xl font-black text-[#0A111F]">{formatoCLP(precio)}</p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-1">
                          + IVA / {anual ? 'año' : 'mes'} · {formatoCLP(conIVA(precio))} IVA incl.
                        </p>
                      </div>

                      <ul className="mt-6 space-y-2 border-t border-slate-100 pt-5">
                        {ROLES_STAFF.map(rol => (
                          <li key={rol} className="flex justify-between text-xs">
                            <span className="text-slate-500 font-medium">{NOMBRE_ROL[rol]}</span>
                            <span className="font-black text-[#0A111F]">{plan.limites[rol] ?? 'Ilimitados'}</span>
                          </li>
                        ))}
                      </ul>

                      <ul className="mt-5 space-y-2 flex-1">
                        {plan.modulos.map(m => (
                          <li key={m} className="flex items-start gap-2 text-xs text-slate-600">
                            <Check size={14} className="text-[#C9A24B] shrink-0 mt-0.5"/> {m}
                          </li>
                        ))}
                      </ul>

                      {resumen?.pagosEnLinea && (() => {
                        const yaPagado = esActual && resumen.cobroAutomatico && (resumen.ciclo === 'ANUAL') === anual
                        return (
                          <button onClick={() => pagar(plan.id)} disabled={yaPagado || !!pagando}
                            className={`mt-6 w-full py-3.5 rounded-2xl text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all ${yaPagado ? 'bg-emerald-50 text-emerald-700' : 'bg-[#0A111F] text-white hover:bg-[#1a2538] disabled:opacity-50'}`}>
                            {pagando === plan.id ? <Loader2 size={14} className="animate-spin"/> : yaPagado ? <Check size={14}/> : <CreditCard size={14}/>}
                            {yaPagado ? 'Pagado con cobro automático' : esActual ? 'Pagar este plan' : 'Cambiar a este plan'}
                          </button>
                        )
                      })()}
                    </div>
                  )
                })}
              </div>
            </section>

            {/* CUPOS EXTRA */}
            <section className="bg-white rounded-[2rem] p-7 border border-slate-100 shadow-sm">
              <h2 className="text-lg font-black text-[#0A111F] uppercase italic">Cupos adicionales</h2>
              <p className="text-xs text-slate-500 mt-1">¿Te falta un usuario y no quieres cambiar de plan? Agrega cupos sueltos a tu plan actual.</p>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-5">
                {ROLES_STAFF.map(rol => (
                  <div key={rol} className="bg-[#FBF8F2] rounded-2xl p-4 border border-[#C9A24B]/20">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{NOMBRE_ROL_SINGULAR[rol]} extra</p>
                    <p className="text-lg font-black text-[#0A111F] mt-1">{formatoCLP(PRECIO_CUPO_EXTRA[rol])}<span className="text-[10px] text-slate-400"> + IVA / mes</span></p>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  )
}
