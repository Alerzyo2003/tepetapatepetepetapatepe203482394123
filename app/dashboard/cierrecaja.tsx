'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { 
  Wallet, Banknote, CreditCard, ArrowRightLeft, 
  TrendingUp, CheckCircle2, Loader2, DollarSign 
} from 'lucide-react'

export default function CierreCaja() {
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({
    total: 0,
    efectivo: 0,
    transferencia: 0,
    tarjeta: 0,
    cantidad: 0
  })

  useEffect(() => {
    fetchPagosHoy()
  }, [])

  async function fetchPagosHoy() {
    setLoading(true)
    // Usamos la fecha local del navegador para el filtro
    const hoy = new Date().toLocaleDateString('en-CA') // Formato YYYY-MM-DD
    
    try {
      const { data, error } = await supabase
        .from('pagos')
        .select('monto, metodo_pago')
        .gte('fecha_pago', `${hoy}T00:00:00`)
        .lte('fecha_pago', `${hoy}T23:59:59`)

      if (error) throw error

      if (data) {
        const resumen = data.reduce((acc, curr) => {
          const monto = Number(curr.monto || 0)
          acc.total += monto
          acc.cantidad += 1
          
          // Normalizamos a minúsculas para que la comparación sea más segura
          const metodo = curr.metodo_pago?.toLowerCase()
          
          if (metodo === 'efectivo') acc.efectivo += monto
          else if (metodo === 'transferencia') acc.transferencia += monto
          else acc.tarjeta += monto
          
          return acc
        }, { total: 0, efectivo: 0, transferencia: 0, tarjeta: 0, cantidad: 0 })
        
        setStats(resumen)
      }
    } catch (err) {
      console.error("Error al calcular caja:", err)
    } finally {
      setLoading(false)
    }
  }

  if (loading) return (
    <div className="p-12 text-center flex flex-col items-center justify-center gap-3">
      <Loader2 className="animate-spin text-blue-500" size={32} />
      <p className="animate-pulse text-slate-400 font-black uppercase text-[10px] tracking-widest">Calculando caja...</p>
    </div>
  )

  return (
    <div className="bg-white rounded-[3rem] p-8 shadow-xl border border-slate-100 overflow-hidden relative text-left">
      {/* Decoración de fondo */}
      <div className="absolute -top-10 -right-10 text-slate-50 opacity-[0.03] pointer-events-none">
        <DollarSign size={200} />
      </div>

      <div className="relative z-10">
        <header className="flex justify-between items-center mb-8">
          <div className="text-left">
            <h3 className="text-2xl font-black text-slate-900 tracking-tighter text-left">Cierre de Caja</h3>
            <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-1 text-left">Resumen del día</p>
          </div>
          <div className="bg-emerald-100 text-emerald-600 p-3 rounded-2xl">
            <TrendingUp size={24} />
          </div>
        </header>

        <div className="space-y-6">
          {/* TOTAL PRINCIPAL */}
          <div className="bg-slate-900 rounded-[2rem] p-6 text-white shadow-2xl shadow-slate-200 text-left">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-50 mb-1 text-left">Recaudación Total</p>
            <p className="text-4xl font-black tracking-tighter text-left">${stats.total.toLocaleString('es-CL')}</p>
            <div className="mt-4 flex items-center gap-2 text-emerald-400 text-xs font-bold text-left">
              <CheckCircle2 size={14} /> {stats.cantidad} transacciones hoy
            </div>
          </div>

          {/* DESGLOSE POR MÉTODO */}
          <div className="grid grid-cols-1 gap-3">
            <MetodoRow 
              icon={<Banknote className="text-orange-500" size={18} />} 
              label="Efectivo" 
              valor={stats.efectivo} 
            />
            <MetodoRow 
              icon={<ArrowRightLeft className="text-blue-500" size={18} />} 
              label="Transferencias" 
              valor={stats.transferencia} 
            />
            <MetodoRow 
              icon={<CreditCard className="text-purple-500" size={18} />} 
              label="Tarjetas" 
              valor={stats.tarjeta} 
            />
          </div>
        </div>

        <button 
          onClick={() => fetchPagosHoy()}
          className="w-full mt-8 py-4 bg-slate-50 text-slate-400 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-100 hover:text-slate-600 transition-all text-center"
        >
          Actualizar Cierre
        </button>
      </div>
    </div>
  )
}

function MetodoRow({ icon, label, valor }: any) {
  return (
    <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-transparent hover:border-slate-100 transition-all">
      <div className="flex items-center gap-3">
        <div className="bg-white p-2 rounded-xl shadow-sm border border-slate-100">{icon}</div>
        <span className="font-bold text-slate-600 text-sm">{label}</span>
      </div>
      <span className="font-black text-slate-900">${valor.toLocaleString('es-CL')}</span>
    </div>
  )
}
