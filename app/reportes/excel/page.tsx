'use client'

import { useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import * as XLSX from 'xlsx';

export default function ExportDataPage() {
  // Inicialización de Supabase con SSR
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  
  const [loading, setLoading] = useState<string | null>(null);

  // Función genérica para descargar el Excel
  const downloadExcel = (data: any[], filename: string) => {
    if (!data || data.length === 0) {
      alert('No hay datos para exportar en este reporte.');
      return;
    }
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Datos');
    XLSX.writeFile(workbook, `${filename}_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  // ==========================================
  // 1. MÓDULO PACIENTES Y CONVENIOS
  // ==========================================
  const exportPacientes = async () => {
    setLoading('pacientes');
    try {
      let allPacientes: any[] = [];
      let from = 0;
      const step = 1000;
      let fetchMore = true;

      while (fetchMore) {
        const { data, error } = await supabase
          .from('pacientes')
          .select('rut, nombre, apellido, fecha_nacimiento, telefono, email, prevision, comuna, activo, saldo_pendiente, saldo_a_favor')
          .order('apellido', { ascending: true })
          .range(from, from + step - 1);

        if (error) throw error;
        allPacientes = [...allPacientes, ...data];
        if (data.length < step) fetchMore = false;
        else from += step;
      }

      const formattedData = allPacientes.map(item => ({
        'RUT': item.rut,
        'Nombre Completo': `${item.nombre} ${item.apellido}`,
        'Fecha Nacimiento': item.fecha_nacimiento || '-',
        'Teléfono': item.telefono || '-',
        'Email': item.email || '-',
        'Comuna': item.comuna || '-',
        'Previsión': item.prevision || 'Particular',
        'Saldo Pendiente ($)': item.saldo_pendiente || 0,
        'Saldo a Favor ($)': item.saldo_a_favor || 0,
        'Estado': item.activo ? 'Activo' : 'Inactivo'
      }));

      downloadExcel(formattedData, 'Directorio_Pacientes_Completo');
    } catch (error) {
      console.error(error);
      alert('Hubo un error al descargar los pacientes.');
    } finally { setLoading(null); }
  };

  const exportMorosos = async () => {
    setLoading('morosos');
    try {
      const { data, error } = await supabase
        .from('pacientes_morosos')
        .select('rut_paciente, nombre_paciente, telefono, profesional_nombre, nombre_prestacion, mora, fecha_generacion')
        .order('mora', { ascending: false });
      if (error) throw error;

      const formattedData = data.map(item => ({
        'RUT': item.rut_paciente,
        'Paciente': item.nombre_paciente,
        'Teléfono': item.telefono || '-',
        'Deuda Total ($)': item.mora,
        'Tratamiento/Prestación': item.nombre_prestacion,
        'Profesional a Cargo': item.profesional_nombre,
        'Fecha Registro': item.fecha_generacion
      }));
      downloadExcel(formattedData, 'Pacientes_Morosos');
    } catch (error) {
      console.error(error);
    } finally { setLoading(null); }
  };

  const exportConvenios = async () => {
    setLoading('convenios');
    try {
      const { data, error } = await supabase
        .from('convenios')
        .select('nombre_empresa, nombre_convenio, rut, telefono_1, email, persona_contacto, estado, porcentaje_descuento')
        .order('nombre_empresa', { ascending: true });
      if (error) throw error;

      const formattedData = data.map(item => ({
        'Empresa': item.nombre_empresa,
        'Nombre Convenio': item.nombre_convenio,
        'RUT': item.rut || '-',
        'Contacto': item.persona_contacto || '-',
        'Teléfono': item.telefono_1 || '-',
        'Email': item.email || '-',
        'Descuento (%)': item.porcentaje_descuento || 0,
        'Estado': item.estado
      }));
      downloadExcel(formattedData, 'Convenios_Empresas');
    } catch (error) {
      console.error(error);
    } finally { setLoading(null); }
  };

  // ==========================================
  // 2. MÓDULO FINANZAS Y PRESUPUESTOS
  // ==========================================
  const exportPagos = async () => {
    setLoading('pagos');
    try {
      const { data, error } = await supabase
        .from('pagos')
        .select('monto, metodo_pago, fecha_pago, estado, numero_boleta, pacientes(nombre, apellido, rut)')
        .order('fecha_pago', { ascending: false });
      if (error) throw error;

      const formattedData = data.map((item: any) => ({
        'Fecha Pago': new Date(item.fecha_pago).toLocaleDateString('es-CL'),
        'RUT Paciente': item.pacientes?.rut || '-',
        'Paciente': item.pacientes ? `${item.pacientes.nombre} ${item.pacientes.apellido}` : '-',
        'Monto Ingreso ($)': item.monto,
        'Método Pago': item.metodo_pago,
        'N° Boleta/Voucher': item.numero_boleta || '-',
        'Estado': item.estado
      }));
      downloadExcel(formattedData, 'Ingresos_Pagos');
    } catch (error) {
      console.error(error);
    } finally { setLoading(null); }
  };

  const exportPresupuestos = async () => {
    setLoading('presupuestos');
    try {
      const { data, error } = await supabase
        .from('presupuestos')
        .select('nombre_tratamiento, estado, total, total_abonado, aprobado, fecha_creacion, pacientes(nombre, apellido, rut)')
        .order('fecha_creacion', { ascending: false });
      if (error) throw error;

      const formattedData = data.map((item: any) => ({
        'Fecha Creación': new Date(item.fecha_creacion).toLocaleDateString('es-CL'),
        'RUT Paciente': item.pacientes?.rut || '-',
        'Paciente': item.pacientes ? `${item.pacientes.nombre} ${item.pacientes.apellido}` : '-',
        'Tratamiento': item.nombre_tratamiento || 'Sin nombre',
        'Total Presupuesto ($)': item.total || 0,
        'Total Abonado ($)': item.total_abonado || 0,
        'Deuda Restante ($)': (item.total || 0) - (item.total_abonado || 0),
        'Estado': item.estado,
        'Aprobado': item.aprobado ? 'Sí' : 'No'
      }));
      downloadExcel(formattedData, 'Presupuestos_Tratamientos');
    } catch (error) {
      console.error(error);
    } finally { setLoading(null); }
  };

  const exportEgresos = async () => {
    setLoading('egresos');
    try {
      const { data, error } = await supabase
        .from('egresos')
        .select('fecha, categoria, monto, descripcion')
        .order('fecha', { ascending: false });
      if (error) throw error;

      const formattedData = data.map(item => ({
        'Fecha Gasto': new Date(item.fecha).toLocaleDateString('es-CL'),
        'Categoría': item.categoria,
        'Monto Egreso ($)': item.monto,
        'Descripción': item.descripcion || '-'
      }));
      downloadExcel(formattedData, 'Egresos_Gastos');
    } catch (error) {
      console.error(error);
    } finally { setLoading(null); }
  };

  // ==========================================
  // 3. MÓDULO CLÍNICA Y ARANCELES
  // ==========================================
  const exportAranceles = async () => {
    setLoading('aranceles');
    try {
      const { data, error } = await supabase
        .from('prestaciones')
        .select('"Nombre", "Nombre Categoria", "Precio", "UCO", "Habilitado", "tipo_reparto"')
        .order('Nombre Categoria', { ascending: true });
      if (error) throw error;

      const formattedData = data.map((item: any) => ({
        'Prestación': item.Nombre || '-',
        'Categoría': item['Nombre Categoria'] || '-',
        'Precio ($)': item.Precio || 0,
        'UCO': item.UCO || 0,
        'Estado Habilitado': item.Habilitado || 'Sí',
        'Tipo Reparto': item.tipo_reparto || 'general'
      }));
      downloadExcel(formattedData, 'Aranceles_Prestaciones');
    } catch (error) {
      console.error(error);
    } finally { setLoading(null); }
  };

  const exportCitas = async () => {
    setLoading('citas');
    try {
      const { data, error } = await supabase
        .from('citas')
        .select('inicio, fin, estado, estado_confirmacion, motivo, box_id, pacientes(nombre, apellido, rut)')
        .order('inicio', { ascending: false });
      if (error) throw error;

      const formattedData = data.map((item: any) => ({
        'Fecha Cita': new Date(item.inicio).toLocaleDateString('es-CL'),
        'Hora Inicio': new Date(item.inicio).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }),
        'RUT Paciente': item.pacientes?.rut || '-',
        'Paciente': item.pacientes ? `${item.pacientes.nombre} ${item.pacientes.apellido}` : '-',
        'Motivo': item.motivo || '-',
        'Box': item.box_id || '-',
        'Confirmación': item.estado_confirmacion,
        'Asistencia': item.estado
      }));
      downloadExcel(formattedData, 'Agenda_Citas');
    } catch (error) {
      console.error(error);
    } finally { setLoading(null); }
  };

  const exportEvoluciones = async () => {
    setLoading('evoluciones');
    try {
      const { data, error } = await supabase
        .from('evoluciones')
        .select('fecha_registro, descripcion_procedimiento, observaciones, estado, pacientes(nombre, apellido, rut)')
        .order('fecha_registro', { ascending: false });
      if (error) throw error;

      const formattedData = data.map((item: any) => ({
        'Fecha Atención': new Date(item.fecha_registro).toLocaleDateString('es-CL'),
        'RUT Paciente': item.pacientes?.rut || '-',
        'Paciente': item.pacientes ? `${item.pacientes.nombre} ${item.pacientes.apellido}` : '-',
        'Procedimiento Realizado': item.descripcion_procedimiento,
        'Observaciones Clínicas': item.observaciones || '-',
        'Estado': item.estado
      }));
      downloadExcel(formattedData, 'Fichas_Evoluciones');
    } catch (error) {
      console.error(error);
    } finally { setLoading(null); }
  };

  // ==========================================
  // 4. MÓDULO INVENTARIO Y STOCK
  // ==========================================
  const exportInventario = async () => {
    setLoading('inventario');
    try {
      const { data, error } = await supabase
        .from('inventario_productos')
        .select('nombre, stock_actual, stock_seguridad, precio_promedio_compra, precio_venta')
        .order('nombre', { ascending: true });
      if (error) throw error;

      const formattedData = data.map(item => ({
        'Producto': item.nombre,
        'Stock Actual': item.stock_actual,
        'Stock Seguridad (Mínimo)': item.stock_seguridad,
        'Precio Compra Promedio ($)': item.precio_promedio_compra,
        'Precio Venta ($)': item.precio_venta,
        'Estado Stock': item.stock_actual <= item.stock_seguridad ? 'CRÍTICO / REPONER' : 'Óptimo'
      }));
      downloadExcel(formattedData, 'Inventario_Productos');
    } catch (error) {
      console.error(error);
    } finally { setLoading(null); }
  };

  // ==========================================
  // 5. MÓDULO RRHH (Producción / Doctores desde presupuesto_items)
  // ==========================================
  const exportLiquidaciones = async () => {
    setLoading('liquidaciones');
    try {
      let allItems: any[] = [];
      let from = 0;
      const step = 1000;
      let fetchMore = true;

      // Paginación para asegurar que traiga toda la producción sin límite de 1000
      while (fetchMore) {
        const { data, error } = await supabase
          .from('presupuesto_items')
          .select(`
            id,
            nombre_prestacion,
            precio_pactado,
            abonado,
            estado,
            diente_id,
            cara,
            tipo_reparto,
            profesionales (nombre, apellido),
            presupuestos (
              pacientes (nombre, apellido, rut)
            )
          `)
          .range(from, from + step - 1);

        if (error) throw error;
        if (data && data.length > 0) {
          allItems = [...allItems, ...data];
          if (data.length < step) fetchMore = false;
          else from += step;
        } else {
          fetchMore = false;
        }
      }

      if (allItems.length === 0) {
        alert('No hay ítems de tratamientos registrados en el sistema.');
        return;
      }

      const formattedData = allItems.map((item: any) => {
        const prof = item.profesionales;
        const pac = item.presupuestos?.pacientes;
        return {
          'Profesional': prof ? `Dr. ${prof.nombre} ${prof.apellido}` : 'Sin asignar',
          'RUT Paciente': pac?.rut || '-',
          'Paciente': pac ? `${pac.nombre} ${pac.apellido}` : '-',
          'Prestación / Tratamiento': item.nombre_prestacion || 'Sin nombre',
          'Ubicación': `${item.diente_id ? 'Diente ' + item.diente_id : 'General'}${item.cara ? ' (' + item.cara + ')' : ''}`,
          'Precio Pactado ($)': item.precio_pactado || 0,
          'Total Abonado ($)': item.abonado || 0,
          'Saldo Deuda ($)': (item.precio_pactado || 0) - (item.abonado || 0),
          'Tipo Reparto': item.tipo_reparto || 'general',
          'Estado': item.estado || 'Pendiente'
        };
      });
      
      downloadExcel(formattedData, 'Produccion_Tratamientos_Doctores');
    } catch (error) {
      console.error("Error al exportar producción:", error);
      alert('Hubo un error al exportar la producción de los doctores.');
    } finally { 
      setLoading(null); 
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto min-h-screen bg-gray-50">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Centro de Reportes y Exportación</h1>
        <p className="text-gray-600">Descarga la información operativa, clínica, financiera e inventario de la clínica en formato Excel.</p>
      </div>

      <div className="space-y-10">
        
        {/* SECCIÓN 1: PACIENTES */}
        <section>
          <h2 className="text-xl font-bold text-gray-800 mb-4 border-b pb-2 border-gray-200">1. Listados de Pacientes y Convenios</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <ExportCard title="Directorio Completo" desc="Información personal y demográfica de todos los pacientes." action={exportPacientes} loading={loading === 'pacientes'} color="bg-blue-600 hover:bg-blue-700" />
            <ExportCard title="Pacientes Morosos" desc="Cartera de deudores, saldos pendientes y tratamientos." action={exportMorosos} loading={loading === 'morosos'} color="bg-red-600 hover:bg-red-700" />
            <ExportCard title="Convenios y Empresas" desc="Listado de empresas con convenios activos y descuentos." action={exportConvenios} loading={loading === 'convenios'} color="bg-sky-600 hover:bg-sky-700" />
          </div>
        </section>

        {/* SECCIÓN 2: FINANZAS */}
        <section>
          <h2 className="text-xl font-bold text-gray-800 mb-4 border-b pb-2 border-gray-200">2. Información Financiera y Presupuestos</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <ExportCard title="Ingresos y Pagos" desc="Recibos de pago, ingresos diarios y boletas." action={exportPagos} loading={loading === 'pagos'} color="bg-emerald-600 hover:bg-emerald-700" />
            <ExportCard title="Estado de Presupuestos" desc="Planes de tratamiento, montos totales, abonados y deudas." action={exportPresupuestos} loading={loading === 'presupuestos'} color="bg-amber-600 hover:bg-amber-700" />
            <ExportCard title="Egresos y Gastos" desc="Salidas de caja, pago de insumos, sueldos y arriendos." action={exportEgresos} loading={loading === 'egresos'} color="bg-teal-600 hover:bg-teal-700" />
          </div>
        </section>

        {/* SECCIÓN 3: CLÍNICA */}
        <section>
          <h2 className="text-xl font-bold text-gray-800 mb-4 border-b pb-2 border-gray-200">3. Operación y Aranceles Clínicos</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <ExportCard title="Aranceles y Prestaciones" desc="Lista de tratamientos, precios, UCOs y estado de habilitación." action={exportAranceles} loading={loading === 'aranceles'} color="bg-indigo-600 hover:bg-indigo-700" />
            <ExportCard title="Agenda y Citas" desc="Asistencias, cancelaciones y uso de los boxes." action={exportCitas} loading={loading === 'citas'} color="bg-violet-600 hover:bg-violet-700" />
            <ExportCard title="Fichas y Evoluciones" desc="Historial clínico y procedimientos médicos realizados." action={exportEvoluciones} loading={loading === 'evoluciones'} color="bg-purple-600 hover:bg-purple-700" />
          </div>
        </section>

        {/* SECCIÓN 4: INVENTARIO */}
        <section>
          <h2 className="text-xl font-bold text-gray-800 mb-4 border-b pb-2 border-gray-200">4. Inventario y Stock</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <ExportCard title="Inventario de Productos" desc="Stock actual, stock crítico de seguridad y precios de venta." action={exportInventario} loading={loading === 'inventario'} color="bg-cyan-600 hover:bg-cyan-700" />
          </div>
        </section>

        {/* SECCIÓN 5: RRHH */}
        <section>
          <h2 className="text-xl font-bold text-gray-800 mb-4 border-b pb-2 border-gray-200">5. Equipo Médico</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <ExportCard title="Producción Doctores (En Vivo)" desc="Cálculo de atenciones y comisiones por profesional." action={exportLiquidaciones} loading={loading === 'liquidaciones'} color="bg-slate-700 hover:bg-slate-800" />
          </div>
        </section>

      </div>
    </div>
  );
}

// Componente Tarjeta UI reutilizable
function ExportCard({ title, desc, action, loading, color }: { title: string, desc: string, action: () => void, loading: boolean, color: string }) {
  return (
    <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col justify-between">
      <div className="mb-4">
        <h3 className="font-semibold text-gray-900">{title}</h3>
        <p className="text-sm text-gray-500 mt-1">{desc}</p>
      </div>
      <button 
        onClick={action}
        disabled={loading}
        className={`w-full text-white font-medium py-2 px-4 rounded-lg transition-colors flex items-center justify-center gap-2 ${color} ${loading ? 'opacity-70 cursor-not-allowed' : ''}`}
      >
        {loading ? (
          <>
            <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Exportando...
          </>
        ) : 'Descargar Excel'}
      </button>
    </div>
  );
}