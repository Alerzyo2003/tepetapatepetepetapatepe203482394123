'use client'
import { useState } from 'react'

const piezasSuperiores = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
const piezasInferiores = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];

export default function Odontograma() {
  // Estado para guardar la condición de cada diente
  // Ejemplo: { 18: 'caries', 11: 'sano' }
  const [dentadura, setDentadura] = useState<Record<number, string>>({});

  const cambiarEstadoDiente = (id: number) => {
    const estados = ['sano', 'caries', 'ausente', 'corona'];
    const estadoActual = dentadura[id] || 'sano';
    const siguienteEstado = estados[(estados.indexOf(estadoActual) + 1) % estados.length];
    
    setDentadura({ ...dentadura, [id]: siguienteEstado });
  };

  const getColor = (estado: string) => {
    if (estado === 'caries') return 'bg-red-500 text-white';
    if (estado === 'ausente') return 'bg-gray-800 text-white opacity-20';
    if (estado === 'corona') return 'bg-yellow-500 text-white';
    return 'bg-white text-blue-600 border-blue-200'; // Sano
  };

  const Diente = ({ id }: { id: number }) => (
    <div className="flex flex-col items-center gap-1">
      <span className="text-[10px] font-bold text-gray-400">{id}</span>
      <button
        onClick={() => cambiarEstadoDiente(id)}
        className={`w-8 h-10 md:w-10 md:h-12 rounded-b-lg border-2 shadow-sm transition-all flex items-center justify-center font-bold text-xs ${getColor(dentadura[id] || 'sano')}`}
      >
        {dentadura[id] === 'ausente' ? 'X' : ''}
        {dentadura[id] === 'caries' ? 'C' : ''}
        {dentadura[id] === 'corona' ? 'O' : ''}
      </button>
    </div>
  );

  return (
    <div className="bg-gray-50 p-6 rounded-2xl border border-gray-200 overflow-x-auto">
      <div className="min-w-[600px] flex flex-col gap-8">
        
        {/* Fila Superior */}
        <div className="flex justify-center gap-2 border-b pb-8">
          {piezasSuperiores.map(id => <Diente key={id} id={id} />)}
        </div>

        {/* Fila Inferior */}
        <div className="flex justify-center gap-2 pt-2">
          {piezasInferiores.map(id => <Diente key={id} id={id} />)}
        </div>

        {/* Leyenda */}
        <div className="flex justify-center gap-6 mt-4 text-xs font-medium text-gray-500">
          <div className="flex items-center gap-2"><div className="w-3 h-3 border rounded bg-white"></div> Sano</div>
          <div className="flex items-center gap-2"><div className="w-3 h-3 rounded bg-red-500"></div> Caries (C)</div>
          <div className="flex items-center gap-2"><div className="w-3 h-3 rounded bg-yellow-500"></div> Corona (O)</div>
          <div className="flex items-center gap-2"><div className="w-3 h-3 rounded bg-gray-800"></div> Ausente (X)</div>
        </div>
      </div>
    </div>
  );
}