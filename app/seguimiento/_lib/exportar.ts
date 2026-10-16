// Excel del Panel de Seguimiento: una hoja de resumen y una hoja por lista (con el mensaje sugerido de WhatsApp)
import { descargarXlsx, type Hoja } from '@/app/reportes/desempeno/_lib/xlsx'
import type { DefLista } from './config'
import type { Oportunidad } from './reglas'
import { nombrePaciente } from './util'

export function exportarSeguimiento(o: {
  nombreArchivo: string
  listas: { def: DefLista; filas: Oportunidad[] }[]
  pacientes: Record<string, any>
  proximaHora: (pacienteId: string) => string
  doctor: (fila: Oportunidad) => string
  contacto: (fila: Oportunidad) => string
}) {
  const conFilas = o.listas.filter(l => l.filas.length)
  const hojas: Hoja[] = [{
    nombre: 'Resumen', columnasPesos: [3], anchos: [16, 34, 12, 18],
    filas: [
      ['Grupo', 'Lista', 'Pacientes', 'Monto'],
      ...o.listas.map(l => [l.def.grupo, l.def.titulo, l.filas.length, l.filas.reduce((s, f) => s + f.monto, 0)]),
      [],
      ['Montos: presupuestos por cerrar = valor del presupuesto; detenidos, implantes, endodoncias y extracciones = lo que falta cobrar de lo presupuestado; saldos = deuda de lo ya realizado.'],
    ],
  }]
  for (const l of conFilas) {
    hojas.push({
      nombre: l.def.titulo.replace(/[[\]:*?/\\]/g, ' ').slice(0, 31),
      columnasPesos: [6], anchos: [30, 13, 15, 34, 30, 26, 14, 22, 22, 30, 60],
      filas: [
        ['Paciente', 'RUT', 'Teléfono', 'Detalle', 'Etapa', 'Cuándo', 'Monto', 'Próxima hora', 'Doctor', 'Último contacto', 'Mensaje sugerido'],
        ...l.filas.map(f => {
          const p = o.pacientes[f.pacienteId]
          return [nombrePaciente(p), p?.rut || '', p?.telefono || '', f.detalle, f.etapa, f.fechaTexto, f.monto || '',
            o.proximaHora(f.pacienteId), o.doctor(f), o.contacto(f), f.mensaje(p)]
        }),
      ],
    })
  }
  descargarXlsx(o.nombreArchivo, hojas)
}
