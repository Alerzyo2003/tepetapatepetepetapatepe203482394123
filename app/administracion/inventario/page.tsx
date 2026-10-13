'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { 
  Package, Plus, Minus, Search, Download, 
  AlertTriangle, History, Loader2, Filter, 
  ArrowUpRight, ArrowDownLeft, Trash2, X, Save,
  BadgeDollarSign, ShieldAlert
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

export default function InventarioPage() {
  const [productos, setProductos] = useState<any[]>([])
  const [cargando, setCargando] = useState(true)
  const [filtroStock, setFiltroStock] = useState('todos')
  const [busqueda, setBusqueda] = useState('')
  
  // Modales
  const [modalCrear, setModalCrear] = useState(false)
  const [modalEgreso, setModalEgreso] = useState(false)
  const [guardando, setGuardando] = useState(false)

  // Formulario Nuevo Producto
  const [nuevoProd, setNuevoProd] = useState({
    nombre: '',
    stock_actual: 0,
    stock_seguridad: 5,
    precio_promedio_compra: 0,
    precio_venta: 0
  })

  // Formulario Egreso
  const [egreso, setEgreso] = useState({ producto_id: '', cantidad: 0 })

  useEffect(() => {
    fetchProductos()
  }, [])

  async function fetchProductos() {
    setCargando(true)
    const { data } = await supabase.from('inventario_productos').select('*').order('nombre')
    if (data) setProductos(data)
    setCargando(false)
  }

  const handleCrearProducto = async () => {
    if (!nuevoProd.nombre) return alert("El nombre es obligatorio")
    setGuardando(true)
    try {
      const { error } = await supabase.from('inventario_productos').insert([nuevoProd])
      if (error) throw error
      setModalCrear(false)
      setNuevoProd({ nombre: '', stock_actual: 0, stock_seguridad: 5, precio_promedio_compra: 0, precio_venta: 0 })
      fetchProductos()
    } catch (error: any) { alert(error.message) }
    finally { setGuardando(false) }
  }

  const handleEgreso = async () => {
    const prod = productos.find(p => p.id === egreso.producto_id)
    if (!prod || egreso.cantidad <= 0) return alert("Datos inválidos")
    if (prod.stock_actual < egreso.cantidad) return alert("Stock insuficiente")

    setGuardando(true)
    try {
      await supabase.from('inventario_productos').update({ stock_actual: prod.stock_actual - egreso.cantidad }).eq('id', prod.id)
      await supabase.from('inventario_movimientos').insert([{
        producto_id: prod.id, tipo: 'Egreso', cantidad: egreso.cantidad, motivo: 'Uso clínico'
      }])
      setModalEgreso(false)
      setEgreso({ producto_id: '', cantidad: 0 })
      fetchProductos()
    } catch (error: any) { alert(error.message) }
    finally { setGuardando(false) }
  }

  const productosFiltrados = productos.filter(p => {
    const coincideBusqueda = p.nombre.toLowerCase().includes(busqueda.toLowerCase())
    if (filtroStock === 'con') return coincideBusqueda && p.stock_actual > 0
    if (filtroStock === 'sin') return coincideBusqueda && p.stock_actual <= 0
    return coincideBusqueda
  })

  return (
    <div className="min-h-screen bg-[#F8FAFC] p-8 pb-20 font-sans">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* HEADER */}
        <div className="bg-white p-10 rounded-[3rem] shadow-sm border border-slate-100 flex flex-col md:flex-row justify-between items-center gap-6 text-left">
          <div className="flex items-center gap-6 text-left">
            <div className="bg-blue-600 p-5 rounded-[2rem] text-white shadow-xl shadow-blue-100">
              <Package size={32} />
            </div>
            <div className="text-left">
              <h1 className="text-3xl font-black text-slate-800 uppercase italic leading-none text-left">Inventario</h1>
              <p className="text-slate-400 text-[10px] font-bold uppercase tracking-[0.3em] mt-3 text-left">Bodega Central - Centro Médico Dignidad</p>
            </div>
          </div>
          <div className="flex gap-4">
            <button 
              onClick={() => setModalCrear(true)}
              className="bg-emerald-500 text-white px-8 py-4 rounded-2xl font-black text-xs uppercase shadow-xl hover:bg-slate-900 transition-all flex items-center gap-2"
            >
              <Plus size={18}/> Ingresar Producto
            </button>
            <button 
              onClick={() => setModalEgreso(true)}
              className="bg-red-500 text-white px-8 py-4 rounded-2xl font-black text-xs uppercase shadow-xl hover:bg-slate-900 transition-all flex items-center gap-2"
            >
              <Minus size={18}/> Sacar Producto
            </button>
          </div>
        </div>

        {/* FILTROS Y BUSCADOR */}
        <div className="flex flex-col md:flex-row gap-4 items-center justify-between text-left">
          <div className="relative w-full md:w-96 text-left">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text" placeholder="Buscar insumo..." 
              className="w-full bg-white p-4 pl-12 rounded-2xl text-xs font-bold border-none outline-none shadow-sm text-slate-900"
              value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
            />
          </div>
          <div className="flex bg-white p-1.5 rounded-2xl shadow-sm border border-slate-100">
            {['todos', 'con', 'sin'].map((f) => (
              <button 
                key={f} onClick={() => setFiltroStock(f)}
                className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase transition-all ${filtroStock === f ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-400'}`}
              >
                {f === 'todos' ? 'Mostrar Todos' : f === 'con' ? 'Solo con Stock' : 'Sin Stock'}
              </button>
            ))}
          </div>
        </div>

        {/* TABLA */}
        <div className="bg-white rounded-[3rem] shadow-sm border border-slate-100 overflow-hidden text-left">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50">
                <th className="px-10 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest text-left">Nombre Producto</th>
                <th className="px-10 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Stock Seguridad</th>
                <th className="px-10 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Stock Actual</th>
                <th className="px-10 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest text-left">Precio Prom.</th>
                <th className="px-10 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest text-left">Precio Venta</th>
                <th className="px-10 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Estatus</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {productosFiltrados.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-10 py-6 font-black text-slate-700 uppercase text-xs italic text-left">{p.nombre}</td>
                  <td className="px-10 py-6 text-xs font-bold text-slate-400 text-center">{p.stock_seguridad}</td>
                  <td className={`px-10 py-6 text-sm font-black text-center ${p.stock_actual <= p.stock_seguridad ? 'text-red-500' : 'text-slate-800'}`}>
                    {p.stock_actual}
                  </td>
                  <td className="px-10 py-6 text-xs font-bold text-slate-400 text-left">${p.precio_promedio_compra.toLocaleString()}</td>
                  <td className="px-10 py-6 text-xs font-bold text-blue-600 text-left">${p.precio_venta.toLocaleString()}</td>
                  <td className="px-10 py-6 text-right">
                    {p.stock_actual <= p.stock_seguridad ? (
                      <span className="bg-red-50 text-red-500 px-4 py-1.5 rounded-full text-[9px] font-black uppercase inline-flex items-center gap-2">
                        <ShieldAlert size={12}/> Reabastecer
                      </span>
                    ) : (
                      <span className="bg-emerald-50 text-emerald-500 px-4 py-1.5 rounded-full text-[9px] font-black uppercase">Suficiente</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL CREAR PRODUCTO */}
      <AnimatePresence>
        {modalCrear && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[500] flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="bg-white w-full max-w-lg rounded-[3.5rem] shadow-2xl overflow-hidden text-left">
              <div className="p-8 border-b border-slate-50 flex justify-between items-center bg-slate-50/50">
                <h2 className="text-xl font-black text-slate-800 uppercase italic text-left">Nuevo Insumo</h2>
                <button onClick={() => setModalCrear(false)} className="text-slate-300 hover:text-red-500 transition-colors"><X size={24}/></button>
              </div>
              <div className="p-10 space-y-6 text-left">
                <Input label="Nombre del Producto" value={nuevoProd.nombre} onChange={(v: any) => setNuevoProd({...nuevoProd, nombre: v})} />
                <div className="grid grid-cols-2 gap-4 text-left">
                  <Input label="Stock Inicial" type="number" value={nuevoProd.stock_actual} onChange={(v: any) => setNuevoProd({...nuevoProd, stock_actual: parseInt(v)})} />
                  <Input label="Stock Seguridad" type="number" value={nuevoProd.stock_seguridad} onChange={(v: any) => setNuevoProd({...nuevoProd, stock_seguridad: parseInt(v)})} />
                  <Input label="Precio Compra ($)" type="number" value={nuevoProd.precio_promedio_compra} onChange={(v: any) => setNuevoProd({...nuevoProd, precio_promedio_compra: parseInt(v)})} />
                  <Input label="Precio Venta ($)" type="number" value={nuevoProd.precio_venta} onChange={(v: any) => setNuevoProd({...nuevoProd, precio_venta: parseInt(v)})} />
                </div>
                <button onClick={handleCrearProducto} disabled={guardando} className="w-full bg-blue-600 text-white py-5 rounded-2xl font-black text-xs uppercase shadow-xl hover:bg-slate-900 transition-all flex justify-center items-center gap-3">
                  {guardando ? <Loader2 className="animate-spin" /> : <Save size={18}/>} Registrar Producto
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL EGRESO */}
      <AnimatePresence>
        {modalEgreso && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[500] flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="bg-white w-full max-w-md rounded-[3rem] shadow-2xl p-10 text-left">
              <h2 className="text-xl font-black text-slate-800 uppercase italic mb-8 flex items-center gap-2 text-left"><ArrowDownLeft className="text-red-500" /> Salida de Insumo</h2>
              <div className="space-y-6 text-left">
                <div className="space-y-2 text-left">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2 italic text-left">Producto</label>
                  <select 
                    className="w-full bg-slate-50 p-5 rounded-2xl text-xs font-bold outline-none border-none shadow-inner text-slate-900"
                    value={egreso.producto_id} onChange={(e) => setEgreso({...egreso, producto_id: e.target.value})}
                  >
                    <option value="">Seleccionar...</option>
                    {productos.map(p => <option key={p.id} value={p.id}>{p.nombre} (Dispo: {p.stock_actual})</option>)}
                  </select>
                </div>
                <Input label="Cantidad a Retirar" type="number" value={egreso.cantidad} onChange={(v: any) => setEgreso({...egreso, cantidad: parseInt(v)})} />
                <div className="flex gap-4 pt-4 text-left">
                  <button onClick={() => setModalEgreso(false)} className="flex-1 py-5 text-slate-400 font-black text-[10px] uppercase">Cancelar</button>
                  <button onClick={handleEgreso} disabled={guardando} className="flex-1 bg-red-500 text-white py-5 rounded-2xl font-black text-[10px] uppercase shadow-lg shadow-red-100 active:scale-95">Confirmar Egreso</button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}

function Input({ label, value, onChange, type = "text" }: any) {
  return (
    <div className="space-y-2 text-left">
      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2 italic text-left">{label}</label>
      <input 
        type={type} value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full bg-slate-50 p-5 rounded-2xl text-xs font-bold border-none outline-none focus:ring-2 ring-blue-500/20 shadow-inner text-slate-900"
      />
    </div>
  )
}
