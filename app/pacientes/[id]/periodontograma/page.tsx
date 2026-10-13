'use client'
import React, { useState, useEffect, useMemo } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { 
  Loader2, ChevronDown, Trash2, Save, Spline, LineChart, Plus, Printer, ArrowRightLeft
} from 'lucide-react'
import { toast } from 'sonner'

const DIENTES_SUPERIORES = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
const DIENTES_INFERIORES = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];
const ESTADOS_PIEZA = ['presente', 'ausente', 'implante'] as const;

// Dimensiones Universales (Alineación Perfecta)
const STICKY_WIDTH = 120;
const TOOTH_WIDTH = 86;
const CENTER_GAP = 20;
const CONTENT_WIDTH = (16 * TOOTH_WIDTH) + CENTER_GAP; // 1396
const TOTAL_WIDTH = STICKY_WIDTH + CONTENT_WIDTH; // 1516

const getInitialPiezaData = () => ({
  estado: 'presente',
  vestibular: {
    profundidad: [null, null, null],
    margen: [null, null, null],
    sangrado: [0, 0, 0],
  },
  palatino: {
    profundidad: [null, null, null],
    margen: [null, null, null],
    sangrado: [0, 0, 0],
  },
  lingual: {
    profundidad: [null, null, null],
    margen: [null, null, null],
    sangrado: [0, 0, 0],
  },
  furca: null,
  movilidad: null,
  anchuraEncia: null,
  placa: [false, false, false, false, false, false]
});

const normalizarPieza = (piezaData: any) => {
  const base = getInitialPiezaData();
  if (!piezaData) return base;

  const merged: any = { ...base, ...piezaData };

  (['vestibular', 'palatino', 'lingual'] as const).forEach((cara) => {
    const caraData = piezaData[cara] || {};
    let sangrado = caraData.sangrado;

    if (!Array.isArray(sangrado)) {
      const sangramiento = caraData.sangramiento || [false, false, false];
      const exudado = caraData.exudado || [false, false, false];
      sangrado = [0, 1, 2].map((i) => (exudado[i] ? 2 : sangramiento[i] ? 1 : 0));
    }

    merged[cara] = {
      profundidad: caraData.profundidad || [null, null, null],
      margen: caraData.margen || [null, null, null],
      sangrado,
    };
  });

  merged.estado = piezaData.estado || 'presente';
  merged.anchuraEncia = piezaData.anchuraEncia ?? null;

  return merged;
};

const normalizarDatos = (rawData: any) => {
  const result: Record<string, any> = {};
  Object.keys(rawData || {}).forEach((piezaStr) => {
    result[piezaStr] = normalizarPieza(rawData[piezaStr]);
  });
  return result;
};

const generarCurvaSuave = (puntos: { x: number, y: number }[], esContinuacion: boolean = false) => {
  if (puntos.length === 0) return '';
  if (puntos.length === 1) return `${esContinuacion ? 'L' : 'M'} ${puntos[0].x},${puntos[0].y}`;

  let path = `${esContinuacion ? 'L' : 'M'} ${puntos[0].x},${puntos[0].y}`;
  
  for (let i = 0; i < puntos.length - 1; i++) {
    const p0 = i === 0 ? puntos[0] : puntos[i - 1];
    const p1 = puntos[i];
    const p2 = puntos[i + 1];
    const p3 = i + 2 < puntos.length ? puntos[i + 2] : p2;

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    path += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
  }
  return path;
};

const PeriodontogramaChart = ({ arcada, dientes, data }: { arcada: string, dientes: number[], data: any }) => {
  const isUpper = arcada === 'superior';
  const CHART_HEIGHT = 160;
  const MM_TO_PX = 5;
  const UAC_Y = CHART_HEIGHT / 2;

  const generatePath = (cara: 'vestibular' | 'palatino' | 'lingual', medida: 'margen' | 'profundidad') => {
    const segments: { x: number, y: number }[][] = [];
    let currentSegment: { x: number, y: number }[] = [];

    dientes.forEach((pieza, idx) => {
      const piezaData = data[pieza];
      const xBase = (idx * TOOTH_WIDTH) + (idx >= 8 ? CENTER_GAP : 0);

      if (piezaData?.estado === 'ausente') {
        if (currentSegment.length) { segments.push(currentSegment); currentSegment = []; }
        return;
      }

      const mediciones = piezaData?.[cara]?.[medida] || [null, null, null];
      mediciones.forEach((val: any, pointIdx: number) => {
        if (typeof val === 'number') {
          const x = xBase + (pointIdx * (TOOTH_WIDTH / 3)) + (TOOTH_WIDTH / 6);
          let y;
          if (medida === 'margen') {
            y = UAC_Y - (val * MM_TO_PX);
          } else { 
            const margenVal = piezaData?.[cara]?.margen?.[pointIdx];
            if (typeof margenVal === 'number') {
              y = UAC_Y - ((margenVal - val) * MM_TO_PX);
            } else return;
          }
          currentSegment.push({ x, y });
        }
      });
    });

    if (currentSegment.length) segments.push(currentSegment);
    return segments.map(seg => generarCurvaSuave(seg)).join(' ');
  };

  const generatePocketArea = (cara: 'vestibular' | 'palatino' | 'lingual') => {
    const segments: { x: number, yMargen: number, yProf: number }[][] = [];
    let currentSegment: { x: number, yMargen: number, yProf: number }[] = [];

    dientes.forEach((pieza, idx) => {
      const piezaData = data[pieza];
      if (piezaData?.estado === 'ausente') {
        if (currentSegment.length) { segments.push(currentSegment); currentSegment = []; }
        return;
      }

      const margenData = piezaData?.[cara]?.margen || [null, null, null];
      const profData = piezaData?.[cara]?.profundidad || [null, null, null];
      const xBase = (idx * TOOTH_WIDTH) + (idx >= 8 ? CENTER_GAP : 0);

      for (let pointIdx = 0; pointIdx < 3; pointIdx++) {
        const m = margenData[pointIdx];
        const p = profData[pointIdx];
        if (typeof m === 'number' && typeof p === 'number') {
          const x = xBase + (pointIdx * (TOOTH_WIDTH / 3)) + (TOOTH_WIDTH / 6);
          const yMargen = UAC_Y - (m * MM_TO_PX);
          const yProf = UAC_Y - ((m - p) * MM_TO_PX);
          currentSegment.push({ x, yMargen, yProf });
        }
      }
    });

    if (currentSegment.length) segments.push(currentSegment);

    return segments.filter(seg => seg.length >= 2).map(seg => {
      const topPoints = seg.map(p => ({ x: p.x, y: p.yMargen }));
      const bottomPoints = seg.map(p => ({ x: p.x, y: p.yProf })).reverse();
      const topPath = generarCurvaSuave(topPoints);
      const bottomPath = generarCurvaSuave(bottomPoints, true);
      return `${topPath} ${bottomPath} Z`;
    }).join(' ');
  };

  const caraLingual = isUpper ? 'palatino' : 'lingual';
  const margenPathV = generatePath('vestibular', 'margen');
  const profundidadPathV = generatePath('vestibular', 'profundidad');
  const pocketAreaV = generatePocketArea('vestibular');
  const margenPathL = generatePath(caraLingual, 'margen');
  const profundidadPathL = generatePath(caraLingual, 'profundidad');
  const pocketAreaL = generatePocketArea(caraLingual);

  return (
    <div className={`w-[${TOTAL_WIDTH}px] min-w-[${TOTAL_WIDTH}px] flex relative bg-white border border-slate-200 rounded-2xl shadow-sm my-6 print-no-break print:shadow-none print:border-slate-300`}>
      <div className={`sticky left-0 z-20 w-[${STICKY_WIDTH}px] min-w-[${STICKY_WIDTH}px] flex justify-center items-center bg-slate-50 border-r border-slate-200 shadow-[4px_0_15px_-3px_rgba(0,0,0,0.08)] print:static print:shadow-none`}>
        <span className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Tendencia</span>
      </div>
      
      <div className="relative flex-1 bg-slate-50/30">
        <svg width={CONTENT_WIDTH} height={CHART_HEIGHT} className="block">
          {Array.from({ length: 15 }).map((_, i) => {
            const y = UAC_Y - ((7 - i) * MM_TO_PX);
            const isZeroLine = (7 - i) === 0;
            return <line key={`h-${i}`} x1="0" y1={y} x2="100%" y2={y} stroke={isZeroLine ? '#ef4444' : '#e2e8f0'} strokeWidth={isZeroLine ? 1.5 : 1} />;
          })}
          {dientes.map((pieza, idx) => {
            const x = (idx * TOOTH_WIDTH) + (idx >= 8 ? CENTER_GAP : 0);
            const ausente = data[pieza]?.estado === 'ausente';
            return (
              <React.Fragment key={`v-${idx}`}>
                <line x1={x} y1="0" x2={x} y2="100%" stroke="#f1f5f9" strokeWidth="1" />
                {ausente && <rect x={x} y="0" width={TOOTH_WIDTH} height="100%" fill="#94a3b8" fillOpacity="0.15" />}
              </React.Fragment>
            );
          })}
          <line x1={8 * TOOTH_WIDTH} y1="0" x2={8 * TOOTH_WIDTH} y2="100%" stroke="#cbd5e1" strokeWidth="1" />
          <line x1={8 * TOOTH_WIDTH + CENTER_GAP} y1="0" x2={8 * TOOTH_WIDTH + CENTER_GAP} y2="100%" stroke="#cbd5e1" strokeWidth="1" />
          
          <path d={pocketAreaV} fill="rgba(37, 99, 235, 0.15)" />
          <path d={margenPathV} stroke="#ef4444" strokeWidth="2" fill="none" strokeLinejoin="round" strokeLinecap="round" />
          <path d={profundidadPathV} stroke="#3b82f6" strokeWidth="2" fill="none" strokeLinejoin="round" strokeLinecap="round" />

          <path d={pocketAreaL} fill="rgba(234, 179, 8, 0.15)" />
          <path d={margenPathL} stroke="#ca8a04" strokeWidth="2" fill="none" strokeDasharray="3 3" strokeLinejoin="round" strokeLinecap="round" />
          <path d={profundidadPathL} stroke="#a16207" strokeWidth="2" fill="none" strokeDasharray="3 3" strokeLinejoin="round" strokeLinecap="round" />
        </svg>
      </div>
    </div>
  );
};

const colorSeveridadBolsa = (profundidad: number | null | undefined) => {
  if (typeof profundidad !== 'number') return null;
  if (profundidad >= 6) return '#dc2626'; 
  if (profundidad >= 4) return '#eab308'; 
  return '#22c55e'; 
};

type TipoDiente = 'incisivo' | 'canino' | 'premolar' | 'molar';

const tipoDientePorFDI = (pieza: number): TipoDiente => {
  const ultimoDigito = pieza % 10;
  if (ultimoDigito === 3) return 'canino';
  if (ultimoDigito === 4 || ultimoDigito === 5) return 'premolar';
  if (ultimoDigito >= 6) return 'molar';
  return 'incisivo';
};

const generarDienteSVG = (tipo: TipoDiente, cx: number, baselineY: number, dir: 1 | -1) => {
  const anchoCorona = tipo === 'molar' ? 44 : tipo === 'premolar' ? 32 : tipo === 'canino' ? 26 : 22;
  const altoCorona = tipo === 'molar' ? 28 : tipo === 'canino' ? 36 : 26;
  const altoRaiz = tipo === 'canino' ? 66 : tipo === 'molar' ? 52 : 46;

  const xL = cx - anchoCorona / 2;
  const xR = cx + anchoCorona / 2;
  const yNeck = baselineY;
  const yCoronaTope = baselineY - dir * altoCorona;
  const yRaizPunta = baselineY + dir * altoRaiz;
  const yRaizMedia = baselineY + dir * (altoRaiz * 0.55);

  let corona: string;
  if (tipo === 'molar') {
    const yCusp = baselineY - dir * (altoCorona * 0.6);
    corona =
      `M ${xL} ${yNeck} C ${xL} ${yCusp} ${xL + 4} ${yCoronaTope} ${cx - anchoCorona * 0.22} ${yCoronaTope} ` +
      `C ${cx - 7} ${yCoronaTope + dir * 4} ${cx + 7} ${yCoronaTope + dir * 4} ${cx + anchoCorona * 0.22} ${yCoronaTope} ` +
      `C ${xR - 4} ${yCoronaTope} ${xR} ${yCusp} ${xR} ${yNeck} Z`;
  } else if (tipo === 'canino') {
    corona = `M ${xL} ${yNeck} Q ${xL} ${yCoronaTope + dir * 12} ${cx} ${yCoronaTope} Q ${xR} ${yCoronaTope + dir * 12} ${xR} ${yNeck} Z`;
  } else {
    corona = `M ${xL} ${yNeck} Q ${xL} ${yCoronaTope} ${cx} ${yCoronaTope} Q ${xR} ${yCoronaTope} ${xR} ${yNeck} Z`;
  }

  const raices: string[] = [];
  if (tipo === 'molar') {
    const xM = cx - anchoCorona * 0.26;
    const xD = cx + anchoCorona * 0.26;
    raices.push(
      `M ${xL + 3} ${yNeck} Q ${xL} ${yRaizMedia} ${xM} ${yRaizPunta} L ${xM + 5} ${yRaizPunta} Q ${cx - 3} ${yRaizMedia} ${cx - 1} ${yNeck} Z`
    );
    raices.push(
      `M ${xR - 3} ${yNeck} Q ${xR} ${yRaizMedia} ${xD} ${yRaizPunta} L ${xD - 5} ${yRaizPunta} Q ${cx + 3} ${yRaizMedia} ${cx + 1} ${yNeck} Z`
    );
  } else {
    raices.push(
      `M ${xL + 3} ${yNeck} Q ${xL + 4} ${yRaizMedia} ${cx} ${yRaizPunta} Q ${xR - 4} ${yRaizMedia} ${xR - 3} ${yNeck} Z`
    );
  }

  return { corona, raices };
};

const generarAreaBolsaFila = (
  dientes: number[],
  data: any,
  cara: 'vestibular' | 'palatino' | 'lingual',
  dir: 1 | -1,
  baselineY: number,
  MM_TO_PX: number,
  TOOTH_WIDTH: number,
  offsetX: number = 0
) => {
  const segments: { x: number, yMargen: number, yProf: number }[][] = [];
  let currentSegment: { x: number, yMargen: number, yProf: number }[] = [];

  dientes.forEach((pieza, idx) => {
    const piezaData = data[pieza];
    const estado = piezaData?.estado || 'presente';
    const cx = offsetX + (idx * TOOTH_WIDTH) + (idx >= 8 ? CENTER_GAP : 0) + TOOTH_WIDTH / 2;

    if (estado === 'ausente') {
      if (currentSegment.length) { segments.push(currentSegment); currentSegment = []; }
      return;
    }

    const caraData = piezaData?.[cara] || {};
    const margenArr = caraData.margen || [null, null, null];
    const profArr = caraData.profundidad || [null, null, null];

    for (let i = 0; i < 3; i++) {
      const m = typeof margenArr[i] === 'number' ? margenArr[i] : 0;
      const p = profArr[i];
      if (typeof p === 'number') {
        const px = cx - (TOOTH_WIDTH * 0.28) + i * (TOOTH_WIDTH * 0.28);
        const yMargen = baselineY - dir * m * MM_TO_PX;
        const yProf = yMargen + dir * p * MM_TO_PX;
        currentSegment.push({ x: px, yMargen, yProf });
      }
    }
  });

  if (currentSegment.length) segments.push(currentSegment);

  return segments.filter(seg => seg.length >= 2).map(seg => {
    const topPoints = seg.map(p => ({ x: p.x, y: p.yMargen }));
    const bottomPoints = seg.map(p => ({ x: p.x, y: p.yProf })).reverse();
    const topPath = generarCurvaSuave(topPoints);
    const bottomPath = generarCurvaSuave(bottomPoints, true);
    return `${topPath} ${bottomPath} Z`;
  }).join(' ');
};

const ESTILO_CARA: Record<'vestibular' | 'palatino' | 'lingual', {
  etiqueta: string; header: string; headerText: string; cardBorder: string; rowTint: string;
}> = {
  vestibular: { etiqueta: 'Vestibular', header: 'bg-blue-600', headerText: 'text-white', cardBorder: 'border-blue-100', rowTint: 'bg-blue-50/20' },
  palatino: { etiqueta: 'Palatino', header: 'bg-teal-600', headerText: 'text-white', cardBorder: 'border-teal-100', rowTint: 'bg-teal-50/20' },
  lingual: { etiqueta: 'Lingual', header: 'bg-amber-600', headerText: 'text-white', cardBorder: 'border-amber-100', rowTint: 'bg-amber-50/20' },
};

const FilaDientesAnatomicos = ({
  dientes, data, cara, dir
}: {
  dientes: number[], data: any, cara: 'vestibular' | 'palatino' | 'lingual', dir: 1 | -1
}) => {
  const PANEL_HEIGHT = 220;
  const HEADER_HEIGHT = 32;
  const MM_TO_PX = 6;
  const baselineY = dir === 1 ? 70 : PANEL_HEIGHT - 70;
  const estilo = ESTILO_CARA[cara];

  const areaBolsaPath = useMemo(
    () => generarAreaBolsaFila(dientes, data, cara, dir, baselineY, MM_TO_PX, TOOTH_WIDTH, 0),
    [dientes, data, cara, dir, baselineY]
  );

  return (
    <div className={`w-[${TOTAL_WIDTH}px] min-w-[${TOTAL_WIDTH}px] flex flex-col relative bg-white border ${estilo.cardBorder} rounded-2xl shadow-sm print-no-break print:border-slate-300 print:shadow-none`}>
      
      <div className={`w-full h-[${HEADER_HEIGHT}px] ${estilo.header} rounded-t-2xl relative print:bg-slate-200 print:rounded-none`}>
         <div className={`sticky left-0 z-30 h-full w-[${STICKY_WIDTH}px] flex items-center justify-between px-3 ${estilo.headerText} print:text-black print:static`}>
            <span className="text-[10px] font-black uppercase tracking-[0.15em]">{estilo.etiqueta}</span>
            <span className="text-[8px] font-bold uppercase tracking-widest opacity-90">mm</span>
         </div>
      </div>

      <div className={`flex w-full relative h-[${PANEL_HEIGHT}px] ${estilo.rowTint} rounded-b-2xl print:bg-white`}>
        
        <div className={`sticky left-0 z-20 w-[${STICKY_WIDTH}px] min-w-[${STICKY_WIDTH}px] h-full bg-white border-r border-slate-200 shadow-[4px_0_15px_-3px_rgba(0,0,0,0.08)] print:static print:shadow-none`}>
          <div className="relative w-full h-full">
            {[0, 3, 6, 9].map((mm) => {
              const y = baselineY + dir * mm * MM_TO_PX;
              return (
                <div key={mm} className="absolute w-full flex justify-end pr-2" style={{ top: y - 6 }}>
                  <span className="text-[8px] font-bold text-slate-500">{mm}</span>
                </div>
              );
            })}
            <div className="absolute w-full h-[1.5px] bg-red-500" style={{ top: baselineY }}></div>
          </div>
        </div>

        <div className="relative flex-1">
          <svg width={CONTENT_WIDTH} height={PANEL_HEIGHT} className="block">
            {Array.from({ length: 16 }).map((_, i) => {
              const y = 16 + i * (MM_TO_PX * 2);
              return <line key={`g-${i}`} x1="0" y1={y} x2="100%" y2={y} stroke="rgba(100,116,139,0.15)" strokeWidth="1" />;
            })}
            
            <line x1="0" y1={baselineY} x2="100%" y2={baselineY} stroke="#ef4444" strokeWidth="1.5" />
            
            <line x1={8 * TOOTH_WIDTH} y1="0" x2={8 * TOOTH_WIDTH} y2={PANEL_HEIGHT} stroke="rgba(100,116,139,0.3)" strokeWidth="1" />
            <line x1={8 * TOOTH_WIDTH + CENTER_GAP} y1="0" x2={8 * TOOTH_WIDTH + CENTER_GAP} y2={PANEL_HEIGHT} stroke="rgba(100,116,139,0.3)" strokeWidth="1" />

            {dientes.map((pieza, idx) => {
              const cx = (idx * TOOTH_WIDTH) + (idx >= 8 ? CENTER_GAP : 0) + TOOTH_WIDTH / 2;
              const piezaData = data[pieza];
              const estado = piezaData?.estado || 'presente';
              const tipo = tipoDientePorFDI(pieza);

              if (estado === 'ausente') {
                const yA = baselineY - dir * 18;
                return (
                  <ellipse
                    key={pieza}
                    cx={cx} cy={yA} rx={14} ry={12}
                    fill="none" stroke="#94a3b8" strokeDasharray="3 2" strokeWidth="1.25" opacity={0.6}
                  />
                );
              }

              const { corona, raices } = generarDienteSVG(tipo, cx, baselineY, dir);
              const relleno = estado === 'implante' ? '#eff6ff' : '#ffffff';
              const trazo = estado === 'implante' ? '#3b82f6' : '#94a3b8';

              const caraData = piezaData?.[cara] || {};
              const margenArr = caraData.margen || [null, null, null];
              const profArr = caraData.profundidad || [null, null, null];
              const sangradoArr = caraData.sangrado || [0, 0, 0];

              return (
                <g key={pieza}>
                  {estado === 'implante' ? (
                    <g>
                      <rect x={cx - 4.5} y={Math.min(baselineY, baselineY + dir * 40)} width={9} height={40} fill="#eff6ff" stroke="#3b82f6" strokeWidth="1.1" />
                      {[10, 20, 30].map((offset, i) => {
                        const y = baselineY + dir * offset;
                        return <line key={i} x1={cx - 4.5} y1={y} x2={cx + 4.5} y2={y} stroke="#3b82f6" strokeWidth="0.75" />;
                      })}
                    </g>
                  ) : (
                    raices.map((r, i) => <path key={i} d={r} fill={relleno} stroke={trazo} strokeWidth="1" />)
                  )}
                  <path d={corona} fill={relleno} stroke={trazo} strokeWidth="1.25" />

                  {[0, 1, 2].map((i) => {
                    const px = cx - (TOOTH_WIDTH * 0.28) + i * (TOOTH_WIDTH * 0.28);
                    const m = margenArr[i];
                    const p = profArr[i];
                    const s = sangradoArr[i] || 0;
                    const yM = typeof m === 'number' ? baselineY - dir * m * MM_TO_PX : baselineY;
                    const yP = (typeof p === 'number' && typeof m === 'number') ? yM + dir * p * MM_TO_PX : null;
                    const colorBolsa = colorSeveridadBolsa(p);
                    const hayRecesionOHiperplasia = typeof m === 'number' && m !== 0;

                    return (
                      <g key={i}>
                        {yP !== null && colorBolsa && (
                          <line x1={px} y1={yM} x2={px} y2={yP} stroke={colorBolsa} strokeWidth="2.5" strokeLinecap="round" />
                        )}
                        <circle cx={px} cy={yM} r="2.5" fill={hayRecesionOHiperplasia ? '#ef4444' : '#94a3b8'} />
                        {s > 0 && (
                          <circle cx={px} cy={yP !== null ? yP : yM} r="3.5" fill={s === 1 ? '#ef4444' : '#f59e0b'} stroke="white" strokeWidth="1" />
                        )}
                      </g>
                    );
                  })}
                </g>
              );
            })}

            {areaBolsaPath && (
              <path d={areaBolsaPath} fill="rgba(37, 99, 235, 0.22)" stroke="#2563eb" strokeWidth="1" strokeOpacity="0.4" />
            )}
          </svg>
        </div>
      </div>
    </div>
  );
};

const PeriodontogramaAnatomico = ({ arcada, dientes, data }: { arcada: string, dientes: number[], data: any }) => {
  const caraSecundaria: 'palatino' | 'lingual' = arcada === 'superior' ? 'palatino' : 'lingual';
  return (
    <div className="w-full my-3 space-y-4">
      <FilaDientesAnatomicos dientes={dientes} data={data} cara="vestibular" dir={1} />
      <FilaDientesAnatomicos dientes={dientes} data={data} cara={caraSecundaria} dir={-1} />
    </div>
  );
};

const PeriodontogramaTable = ({ arcada, cara, dientes, data, onDataChange }: any) => {
  const caraLabel = cara === 'palatino' ? 'Palatino' : cara === 'lingual' ? 'Lingual' : 'Vestibular';

  const handleTextChange = (pieza: number, medida: 'profundidad' | 'margen', indice: number, valor: string) => {
    if (valor === '' || valor === '-' || valor === '+') {
      onDataChange(pieza, cara, medida, indice, valor === '' ? null : valor);
      return;
    }
    const numValor = parseInt(valor, 10);
    if (isNaN(numValor)) return;
    if (medida === 'margen') {
      if (numValor < -9 || numValor > 9) return;
    } else {
      if (numValor < 0 || numValor > 15) return;
    }
    onDataChange(pieza, cara, medida, indice, numValor);
  };

  const handleFurcaChange = (pieza: number, valor: string) => {
    if (valor === '') return onDataChange(pieza, null, 'furca', null, null);
    const numValor = parseInt(valor, 10);
    if (isNaN(numValor) || numValor < 0 || numValor > 3) return;
    onDataChange(pieza, null, 'furca', null, numValor);
  };

  const handleMovilidadChange = (pieza: number, valor: string) => {
    if (valor === '' || valor === '-') {
      return onDataChange(pieza, null, 'movilidad', null, valor === '' ? null : valor);
    }
    const numValor = parseInt(valor, 10);
    if (isNaN(numValor) || numValor < -3 || numValor > 3) return;
    onDataChange(pieza, null, 'movilidad', null, numValor);
  };

  const handleAnchuraChange = (pieza: number, valor: string) => {
    if (valor === '') return onDataChange(pieza, null, 'anchuraEncia', null, null);
    const numValor = parseInt(valor, 10);
    if (isNaN(numValor) || numValor < 0 || numValor > 15) return;
    onDataChange(pieza, null, 'anchuraEncia', null, numValor);
  };

  const handleSangradoChange = (pieza: number, indice: number) => {
    const actual = data[pieza]?.[cara]?.sangrado?.[indice] || 0;
    const siguiente = (actual + 1) % 3;
    onDataChange(pieza, cara, 'sangrado', indice, siguiente);
  };

  const handleEstadoClick = (pieza: number) => {
    const actual = data[pieza]?.estado || 'presente';
    const idx = ESTADOS_PIEZA.indexOf(actual as any);
    const siguiente = ESTADOS_PIEZA[(idx + 1) % ESTADOS_PIEZA.length];
    onDataChange(pieza, null, 'estado', null, siguiente);
  };

  const inputClass = "w-full h-8 text-center bg-transparent outline-none text-xs font-bold transition-colors";
  
  const stickyTdClasses = `sticky left-0 z-20 w-[${STICKY_WIDTH}px] min-w-[${STICKY_WIDTH}px] max-w-[${STICKY_WIDTH}px] border-r border-slate-200/80 shadow-[4px_0_15px_-3px_rgba(0,0,0,0.08)] print:static print:shadow-none`;

  return (
    <div className="overflow-x-auto w-full custom-scrollbar print-no-break print:overflow-visible relative" style={{ WebkitOverflowScrolling: 'touch' }}>
      <table className="border-collapse text-[10px]" style={{ tableLayout: 'fixed', width: `${TOTAL_WIDTH}px` }}>
        <colgroup>
          <col style={{ width: `${STICKY_WIDTH}px` }} />
          {Array.from({length: 24}).map((_, i) => <col key={`c1-${i}`} style={{ width: `${TOOTH_WIDTH / 3}px` }} />)}
          <col style={{ width: `${CENTER_GAP}px` }} />
          {Array.from({length: 24}).map((_, i) => <col key={`c2-${i}`} style={{ width: `${TOOTH_WIDTH / 3}px` }} />)}
        </colgroup>
        <tbody>
          <tr>
            <td className={`${stickyTdClasses} p-2.5 font-bold text-slate-500 bg-slate-50 text-left align-bottom uppercase text-[9px] tracking-widest border-y print:bg-slate-100`}>
              # Pieza <span className="text-[8px] font-normal text-slate-400 lowercase ml-1 block md:inline">({caraLabel})</span>
            </td>
            {dientes.map((pieza: number, idx: number) => {
              const estado = data[pieza]?.estado || 'presente';
              return (
                <React.Fragment key={`head-${pieza}`}>
                  <td
                    colSpan={3}
                    onClick={() => handleEstadoClick(pieza)}
                    title="Click para marcar: presente → ausente → implante"
                    className={`text-center border border-slate-200/80 p-0 cursor-pointer select-none transition-colors
                      ${estado === 'ausente' ? 'bg-slate-100 text-slate-400 line-through' : ''}
                      ${estado === 'implante' ? 'bg-blue-50/60 text-blue-600' : ''}
                      ${estado === 'presente' ? 'bg-white hover:bg-slate-50 text-slate-700' : ''}
                    `}
                  >
                    <div className="flex flex-col items-center py-2">
                      <span className="text-sm font-black leading-none">
                        {pieza.toString().split('').join('.')}
                      </span>
                      {estado === 'implante' && <span className="text-[6px] font-black text-blue-500 mt-0.5 tracking-tighter">IMPL</span>}
                      {estado === 'ausente' && <span className="text-[6px] font-black text-slate-400 mt-0.5 tracking-tighter">AUS</span>}
                    </div>
                  </td>
                  {idx === 7 && <td className="border-none bg-transparent" rowSpan={8}></td>}
                </React.Fragment>
              );
            })}
          </tr>

          <tr>
            <td className={`${stickyTdClasses} p-2.5 font-bold text-blue-600 border-y text-left bg-white print:text-black`}>Profundidad Surco</td>
            {dientes.map((pieza: number) => {
              const ausente = data[pieza]?.estado === 'ausente';
              return (
                <React.Fragment key={`prof-${pieza}`}>
                  {[0, 1, 2].map(i => {
                    const val = data[pieza]?.[cara]?.profundidad?.[i];
                    const isPatologica = typeof val === 'number' && val >= 4;
                    return (
                      <td key={`p-${pieza}-${i}`} className={`border border-slate-200/80 p-0 transition-colors ${ausente ? 'bg-slate-100 print:bg-slate-100' : 'bg-blue-50/20 hover:bg-blue-50/50 print:bg-white'}`}>
                        <input
                          type="text" inputMode="numeric" disabled={ausente}
                          value={val !== null && val !== undefined ? val : ''}
                          onChange={(e) => handleTextChange(pieza, 'profundidad', i, e.target.value)}
                          className={`${inputClass} ${ausente ? 'cursor-not-allowed opacity-40' : 'cursor-text'} ${isPatologica ? 'text-red-600 font-black' : 'text-blue-600 print:text-black'} focus:bg-blue-100/50 rounded-lg`}
                        />
                      </td>
                    )
                  })}
                </React.Fragment>
              );
            })}
          </tr>

          <tr>
            <td className={`${stickyTdClasses} p-2.5 font-bold text-red-500 border-y text-left bg-white print:text-black`}>Margen Gingival</td>
            {dientes.map((pieza: number) => {
              const ausente = data[pieza]?.estado === 'ausente';
              return (
                <React.Fragment key={`marg-${pieza}`}>
                  {[0, 1, 2].map(i => {
                    const val = data[pieza]?.[cara]?.margen?.[i];
                    return (
                      <td key={`m-${pieza}-${i}`} className={`border border-slate-200/80 p-0 transition-colors ${ausente ? 'bg-slate-100' : 'bg-red-50/20 hover:bg-red-50/50 print:bg-white'}`}>
                        <input
                          type="text" inputMode="numeric" disabled={ausente}
                          value={val !== null && val !== undefined ? val : ''}
                          onChange={(e) => handleTextChange(pieza, 'margen', i, e.target.value)}
                          className={`${inputClass} ${ausente ? 'cursor-not-allowed opacity-40' : 'cursor-text'} text-red-500 print:text-black focus:bg-red-100/50 rounded-lg`}
                        />
                      </td>
                    )
                  })}
                </React.Fragment>
              );
            })}
          </tr>

          <tr>
            <td className={`${stickyTdClasses} p-2.5 font-bold text-slate-700 border-y text-left bg-slate-50 print:bg-slate-50`}>NIC (Inserción)</td>
            {dientes.map((pieza: number) => (
              <React.Fragment key={`nic-${pieza}`}>
                {[0, 1, 2].map(i => {
                  const p = data[pieza]?.[cara]?.profundidad?.[i];
                  const m = data[pieza]?.[cara]?.margen?.[i];
                  let nicVal: string | number = '';
                  if (typeof p === 'number' && typeof m === 'number') nicVal = p - m;
                  const isHigh = typeof nicVal === 'number' && nicVal >= 4;
                  return (
                    <td key={`n-${pieza}-${i}`} className={`border border-slate-200/80 p-0 text-center align-middle font-bold bg-slate-50/30 print:bg-slate-50 h-8 text-xs ${isHigh ? 'text-red-600 font-black' : 'text-slate-600 print:text-black'}`}>
                      {nicVal}
                    </td>
                  )
                })}
              </React.Fragment>
            ))}
          </tr>

          <tr>
            <td className={`${stickyTdClasses} p-2.5 font-bold text-teal-700 border-y text-left bg-[#f4fafa] print:bg-white print:text-black`}>Ancho Encía Quer.</td>
            {dientes.map((pieza: number) => {
              const val = data[pieza]?.anchuraEncia;
              const ausente = data[pieza]?.estado === 'ausente';
              const isAbnormal = typeof val === 'number' && val < 3;
              return (
                <td key={`ae-${pieza}`} colSpan={3} className={`border border-slate-200/80 p-0 h-8 ${ausente ? 'bg-slate-100' : 'hover:bg-teal-50/30'}`}>
                  <input
                    type="text" inputMode="numeric" disabled={ausente}
                    value={val !== null && val !== undefined ? val : ''}
                    onChange={e => handleAnchuraChange(pieza, e.target.value)}
                    className={`${inputClass} ${ausente ? 'cursor-not-allowed opacity-40' : 'cursor-text'} ${isAbnormal ? 'text-red-600 font-black' : 'text-teal-700 print:text-black'} focus:bg-teal-100/50 rounded-lg`}
                  />
                </td>
              )
            })}
          </tr>

          <tr>
            <td className={`${stickyTdClasses} p-2.5 font-bold text-slate-600 border-y text-left bg-white print:text-black`}>Furca</td>
            {dientes.map((pieza: number) => {
              const val = data[pieza]?.furca;
              const ausente = data[pieza]?.estado === 'ausente';
              return (
                <td key={`furca-${pieza}`} colSpan={3} className={`border border-slate-200/80 p-0 h-8 ${ausente ? 'bg-slate-100' : 'hover:bg-slate-50'}`}>
                  <input
                    type="text" inputMode="numeric" disabled={ausente}
                    value={val !== null && val !== undefined ? val : ''}
                    onChange={e => handleFurcaChange(pieza, e.target.value)}
                    className={`${inputClass} ${ausente ? 'cursor-not-allowed opacity-40' : 'cursor-text'} text-slate-600 focus:bg-slate-100 rounded-lg print:text-black`}
                  />
                </td>
              )
            })}
          </tr>

          <tr>
            <td className={`${stickyTdClasses} p-2.5 font-bold text-slate-600 border-y text-left bg-white print:text-black`}>
              Sangrado / Sup.
              <div className="text-[7px] font-normal text-slate-400 normal-case mt-0.5 print:hidden">click p/ cambiar</div>
            </td>
            {dientes.map((pieza: number) => {
              const ausente = data[pieza]?.estado === 'ausente';
              return (
                <React.Fragment key={`sang-${pieza}`}>
                  {[0, 1, 2].map(i => {
                    const estadoSangrado = data[pieza]?.[cara]?.sangrado?.[i] || 0;
                    const bgClass = estadoSangrado === 1 ? 'bg-red-500 shadow-inner' : estadoSangrado === 2 ? 'bg-amber-400 shadow-inner' : 'hover:bg-slate-100';
                    return (
                      <td
                        key={`s-${pieza}-${i}`}
                        onClick={() => !ausente && handleSangradoChange(pieza, i)}
                        className={`border border-slate-200/80 p-0 h-8 transition-colors ${ausente ? 'bg-slate-100 cursor-not-allowed opacity-40' : `cursor-pointer ${bgClass}`} print:opacity-100`}
                        style={estadoSangrado === 1 ? { backgroundColor: '#ef4444' } : estadoSangrado === 2 ? { backgroundColor: '#fbbf24' } : {}}
                      />
                    )
                  })}
                </React.Fragment>
              );
            })}
          </tr>

          <tr>
            <td className={`${stickyTdClasses} p-2.5 font-bold text-slate-600 border-y text-left bg-white print:text-black`}>Movilidad</td>
            {dientes.map((pieza: number) => {
              const val = data[pieza]?.movilidad;
              const ausente = data[pieza]?.estado === 'ausente';
              return (
                <td key={`mov-${pieza}`} colSpan={3} className={`border border-slate-200/80 p-0 h-8 ${ausente ? 'bg-slate-100' : 'hover:bg-slate-50'}`}>
                  <input
                    type="text" inputMode="numeric" disabled={ausente}
                    value={val !== null && val !== undefined ? val : ''}
                    onChange={e => handleMovilidadChange(pieza, e.target.value)}
                    className={`${inputClass} ${ausente ? 'cursor-not-allowed opacity-40' : 'cursor-text'} text-slate-600 focus:bg-slate-100 rounded-lg print:text-black`}
                  />
                </td>
              )
            })}
          </tr>
        </tbody>
      </table>
    </div>
  );
};

export default function PeriodontogramaPage() {
  const params = useParams()
  const paciente_id = params.id as string
  
  const [paciente, setPaciente] = useState<any>(null)
  const [profesional, setProfesional] = useState<any>(null)

  const [historial, setHistorial] = useState<any[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [data, setData] = useState<Record<string, any>>({})
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [mostrarGrafico, setMostrarGrafico] = useState(false)

  // ESTADOS PARA AUDITORÍA
  const [sessionUser, setSessionUser] = useState<any>(null)
  const [sessionUserProfile, setSessionUserProfile] = useState<any>(null)

  useEffect(() => {
    if (paciente_id) {
      cargarContexto();
      fetchHistorial();
    }
  }, [paciente_id]);

  const cargarContexto = async () => {
    const { data: pac } = await supabase.from('pacientes').select('*').eq('id', paciente_id).single();
    if (pac) setPaciente(pac);
    
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      setSessionUser(session.user);
      const { data: prof } = await supabase.from('perfiles').select('nombre_completo, nombre, apellido, rol, rut').eq('id', session.user.id).single();
      if (prof) {
          setProfesional(prof); 
          setSessionUserProfile(prof);
      }
    }
  };

  // FUNCIÓN CENTRAL DE AUDITORÍA
  const registrarAuditoria = async (accion: string, registroId: string | null, datosAnteriores: any, datosNuevos: any, detalles: string) => {
    try {
      await supabase.from('auditoria_clinica').insert([{
        usuario_id: sessionUser?.id,
        accion,
        tabla: 'periodontogramas',
        detalles,
        paciente_id: paciente_id,
        registro_afectado_id: registroId,
        user_agent: window.navigator.userAgent,
        rut_usuario: sessionUserProfile?.rut || null,
        nombre_usuario: sessionUserProfile?.nombre_completo || sessionUser?.email || 'Sistema',
        rol_al_momento: sessionUserProfile?.rol || null,
        datos_anteriores: datosAnteriores,
        datos_nuevos: datosNuevos
      }]);
    } catch (error) {
      console.error("No se pudo registrar la auditoría:", error);
    }
  };

  const fetchHistorial = async (idToSelect?: string) => {
    setCargando(true);
    const { data: examenes, error } = await supabase
      .from('periodontogramas')
      .select('*')
      .eq('paciente_id', paciente_id)
      .order('fecha_examen', { ascending: false });

    if (error) {
      toast.error("Error al cargar el historial.");
      console.error(error);
    } else if (examenes && examenes.length > 0) {
      setHistorial(examenes);
      const targetId = idToSelect || examenes[0].id;
      const targetExamen = examenes.find(e => e.id === targetId) || examenes[0];
      setSelectedId(targetExamen.id);
      setData(normalizarDatos(targetExamen.datos || {}));
    } else {
      crearNuevoExamenVacio([]);
    }
    setCargando(false);
  };

  const crearNuevoExamenVacio = (historialActual: any[]) => {
    const nuevoId = 'nuevo-examen';
    // Fecha de hoy en hora de Chile (toISOString usa UTC: después de las 21:00 ponía la fecha de mañana)
    const fechaHoy = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` })();
    const nuevoExamen = { id: nuevoId, fecha_examen: fechaHoy, paciente_id: paciente_id, datos: {} };
    
    const nuevoHistorial = [nuevoExamen, ...historialActual.filter(h => h.id !== nuevoId)];
    setHistorial(nuevoHistorial);
    setSelectedId(nuevoId);
    setData(normalizarDatos({}));
  };

  const handleNuevoExamen = () => {
    crearNuevoExamenVacio(historial);
  };

  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    setSelectedId(id);
    const ex = historial.find(h => h.id === id);
    if (ex) setData(normalizarDatos(ex.datos || {}));
  };

  const handleDataChange = (pieza: number, cara: string | null, medida: string, indice: number | null, valor: any) => {
    setData(prevData => {
      const newData = JSON.parse(JSON.stringify(prevData));
      const piezaStr = pieza.toString();

      if (!newData[piezaStr]) newData[piezaStr] = JSON.parse(JSON.stringify(getInitialPiezaData()));

      if (cara) {
        if (!newData[piezaStr][cara]) newData[piezaStr][cara] = {};
        if (indice !== null) {
          if (!newData[piezaStr][cara][medida]) newData[piezaStr][cara][medida] = [null, null, null];
          newData[piezaStr][cara][medida][indice] = valor;
        } else {
          newData[piezaStr][cara][medida] = valor;
        }
      } else {
        newData[piezaStr][medida] = valor;
      }
      return newData;
    });
  };

  const handleGuardar = async () => {
    if (!selectedId) return;
    setGuardando(true);

    const examenActual = historial.find(h => h.id === selectedId);
    if (!examenActual) return;

    const payload = { paciente_id: paciente_id, fecha_examen: examenActual.fecha_examen, datos: data };
    let response;

    if (selectedId === 'nuevo-examen') {
      response = await supabase.from('periodontogramas').insert(payload).select().single();
      if (!response.error && response.data) {
         // AUDITORÍA: CREACIÓN
         await registrarAuditoria(
           'CREAR_PERIODONTOGRAMA',
           response.data.id,
           null,
           payload,
           `Se registró un nuevo periodontograma para el paciente ${paciente?.nombre} ${paciente?.apellido}`
         );
      }
    } else {
      const datosAntiguos = examenActual.datos;
      response = await supabase.from('periodontogramas').update(payload).eq('id', selectedId).select().single();
      if (!response.error && response.data) {
         // AUDITORÍA: ACTUALIZACIÓN
         await registrarAuditoria(
           'ACTUALIZAR_PERIODONTOGRAMA',
           response.data.id,
           { datos: datosAntiguos },
           payload,
           `Se actualizó el periodontograma del ${examenActual.fecha_examen}`
         );
      }
    }

    if (response.error) {
      toast.error("Error al guardar.");
      console.error(response.error);
    } else {
      toast.success("Guardado con éxito.");
      await fetchHistorial(response.data.id);
    }
    setGuardando(false);
  };
  
  const handleEliminar = async () => {
    if (!selectedId || selectedId === 'nuevo-examen') return toast.info("No guardado aún.");
    if (!confirm("¿Eliminar este periodontograma? No se puede deshacer.")) return;

    const examenActual = historial.find(h => h.id === selectedId);
    const datosAntiguos = examenActual?.datos;
    const fechaEx = examenActual?.fecha_examen;

    const { error } = await supabase.from('periodontogramas').delete().eq('id', selectedId);
    if (error) {
      toast.error("Error al eliminar.");
    } else {
      toast.success("Eliminado.");
      
      // AUDITORÍA: ELIMINACIÓN
      await registrarAuditoria(
        'ELIMINAR_PERIODONTOGRAMA',
        selectedId,
        { datos: datosAntiguos },
        null,
        `Se eliminó el periodontograma del ${fechaEx}`
      );

      await fetchHistorial(); 
    }
  };

  const handleImprimir = () => {
    toast.dismiss(); 
    setTimeout(() => {
      window.print();
    }, 150); 
  };

  if (cargando) return (
    <div className="h-[500px] flex flex-col items-center justify-center gap-4">
      <Loader2 className="animate-spin text-blue-600" size={45} />
      <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest italic">Cargando Periodontograma...</p>
    </div>
  )

  return (
    <div className="min-h-screen p-4 md:p-10 font-sans text-left pb-24 print:p-0 print:m-0 print:bg-white print:overflow-visible" style={{ backgroundImage: "url('/fondo-pacientes.png')", backgroundSize: 'cover', backgroundPosition: 'center', backgroundAttachment: 'fixed' }}>
      
      {/* 
        =========================================================================
        SÚPER CSS DE IMPRESIÓN (SIN BARRAS DE SCROLL, SIN RECORTES)
        ========================================================================== 
      */}
      <style dangerouslySetInnerHTML={{__html: `
        @media print {
          @page { size: landscape; margin: 8mm; }
          
          html, body, div#__next, main {
            height: auto !important;
            min-height: auto !important;
            max-height: none !important;
            overflow: visible !important;
            position: static !important;
            background: white !important;
          }

          * {
            background-image: none !important;
          }
          
          [data-sonner-toaster], [data-sonner-toast], #sonner-toaster, header, nav, footer, button { 
            display: none !important; 
          }

          /* Destruye barras de scroll en impresión para evitar el efecto visual molesto */
          ::-webkit-scrollbar { display: none !important; }
          * { scrollbar-width: none !important; }

          /* ESCALA PRECISA PARA UN ANCHO DE 1540px */
          .print-area {
            width: 1540px !important; 
            max-width: 1540px !important;
            zoom: 0.65; /* Reduce visualmente el lienzo a un ancho compatible con A4 */
            margin: 0 auto !important;
            padding: 0 !important;
            display: block !important;
          }

          /* Libera cualquier contenedor atascado en un ancho pequeño */
          .overflow-x-auto, .custom-scrollbar {
            overflow: visible !important;
            overflow-x: visible !important;
          }

          /* PREVIENE CORTAR TABLAS Y GRÁFICOS A LA MITAD */
          .print-no-break {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            margin-bottom: 20px !important;
          }

          /* FUERZA EL INICIO DEL MAXILAR INFERIOR A LA SIGUIENTE PÁGINA */
          .print-page-break {
            page-break-before: always !important;
            break-before: page !important;
            margin-top: 0 !important;
            padding-top: 0 !important;
          }
        }
      `}} />

      <div className="max-w-7xl mx-auto space-y-6 md:space-y-8 print:space-y-6 print-area">
        
        {/* ENCABEZADO EXCLUSIVO PARA IMPRESIÓN */}
        <div className="hidden print:block print:mb-6 print:border-b print:border-slate-300 print:pb-4 text-black">
          <div className="flex justify-between items-end mb-4">
            <div>
              <h1 className="text-2xl font-black uppercase tracking-tighter text-slate-800">Periodontograma Clínico</h1>
              <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Documento Clínico Oficial</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-bold uppercase text-slate-600">Fecha de Impresión: {new Date().toLocaleDateString('es-CL')}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm mt-4 p-4 bg-slate-50 rounded-xl border border-slate-200">
            <div>
              <p className="text-[9px] text-slate-500 uppercase font-bold tracking-widest mb-1">Datos del Paciente</p>
              <p className="font-bold text-base">{paciente?.nombre} {paciente?.apellido}</p>
              {paciente?.rut && <p className="text-xs text-slate-600 mt-1">RUT: {paciente.rut}</p>}
            </div>
            <div className="text-right">
              <p className="text-[9px] text-slate-500 uppercase font-bold tracking-widest mb-1">Profesional Tratante</p>
              <p className="font-bold text-base">{profesional?.nombre} {profesional?.apellido}</p>
            </div>
          </div>
        </div>

        {/* HEADER / NAVEGACIÓN */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white/90 backdrop-blur-xl p-5 md:p-8 rounded-[2.5rem] shadow-xl border border-white/60 print:hidden">
          <div className="flex items-center gap-4">
            <div className="bg-gradient-to-br from-blue-600 to-blue-800 p-3 md:p-4 rounded-[1.2rem] md:rounded-[1.5rem] text-white shadow-xl shadow-blue-600/20">
              <Spline size={24} strokeWidth={2.5} />
            </div>
            <div>
              <h2 className="text-xl md:text-2xl font-black uppercase italic tracking-tighter text-slate-800 leading-none">Periodontograma</h2>
              <p className="text-slate-400 text-[9px] md:text-[10px] font-bold uppercase tracking-widest mt-1">Historial Clínico del Paciente</p>
            </div>
          </div>
          <div className="flex w-full md:w-auto items-center gap-2 md:gap-3">
            <button onClick={handleImprimir} className="flex-1 md:flex-none justify-center bg-white/90 backdrop-blur-xl text-slate-600 border border-slate-200/80 px-4 py-3.5 rounded-2xl font-black text-[10px] uppercase shadow-sm hover:bg-slate-50 transition-all flex items-center gap-2">
              <Printer size={16} strokeWidth={2.5} /> <span className="hidden md:inline">Imprimir</span>
            </button>
            <button onClick={handleGuardar} disabled={guardando} className="flex-1 md:flex-none justify-center bg-gradient-to-r from-blue-600 to-blue-700 text-white px-6 py-3.5 rounded-2xl font-black text-[10px] uppercase shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 hover:from-slate-900 hover:to-slate-900 transition-all flex items-center gap-2 disabled:opacity-50 border border-blue-500">
              {guardando ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} strokeWidth={2.5} />} Guardar
            </button>
            <button onClick={handleEliminar} disabled={!selectedId || selectedId === 'nuevo-examen'} className="flex-none bg-white/90 backdrop-blur-xl text-red-500 border border-white/80 px-4 py-3.5 rounded-2xl font-black text-[10px] uppercase shadow-lg hover:bg-red-50 transition-all flex items-center justify-center gap-2 disabled:opacity-50">
              <Trash2 size={16} />
            </button>
          </div>
        </div>

        {/* SELECTOR DE EXÁMENES Y ACCIONES */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3 md:gap-4 bg-white/90 backdrop-blur-xl p-5 md:p-6 rounded-[2.5rem] shadow-xl border border-white/60 print:hidden">
          <div className="relative flex-1 md:flex-none">
            <select 
              value={selectedId || ''}
              onChange={handleSelectChange}
              className="w-full appearance-none bg-slate-50/80 hover:bg-white focus:bg-white border border-slate-200/60 rounded-2xl px-6 py-4 font-black text-xs uppercase text-slate-700 outline-none focus:border-blue-500 transition-all cursor-pointer pr-12 shadow-sm"
            >
              {historial.map(h => (
                <option key={h.id} value={h.id}>
                  Examen del {new Date(h.fecha_examen + 'T00:00:00').toLocaleDateString('es-CL')} {h.id === 'nuevo-examen' ? '(Nuevo)' : ''}
                </option>
              ))}
            </select>
            <ChevronDown size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>

          <div className="flex gap-3">
            <button onClick={handleNuevoExamen} className="flex-1 bg-slate-50/80 hover:bg-white text-slate-600 border border-slate-200/60 px-4 md:px-6 py-4 rounded-2xl font-black text-[10px] uppercase shadow-sm hover:border-blue-500 transition-all flex items-center justify-center gap-2">
              <Plus size={16} strokeWidth={2.5} /> Nuevo
            </button>

            <button onClick={() => setMostrarGrafico(!mostrarGrafico)} className={`flex-1 border px-4 md:px-6 py-4 rounded-2xl font-black text-[10px] uppercase shadow-sm transition-all flex items-center justify-center gap-2 ${mostrarGrafico ? 'bg-slate-900 text-white border-slate-900' : 'bg-slate-50/80 hover:bg-white text-slate-600 border-slate-200/60'}`}>
              <LineChart size={16} strokeWidth={2.5} /> {mostrarGrafico ? 'Ocultar' : 'Tendencia'}
            </button>
          </div>
        </div>

        {/* LEYENDA */}
        <div className="flex flex-wrap items-center justify-center md:justify-start gap-3 md:gap-4 bg-white/80 backdrop-blur-md px-4 md:px-6 py-4 rounded-2xl text-[8px] md:text-[9px] font-bold uppercase text-slate-600 shadow-sm border border-white/60 print:border-slate-300 print:shadow-none print:bg-white print:text-black print:mb-6">
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-green-500 inline-block shadow-sm print:shadow-none print:border print:border-green-600" style={{WebkitPrintColorAdjust: 'exact', colorAdjust: 'exact'}}></span> Bolsa ≤3mm</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-yellow-500 inline-block shadow-sm print:shadow-none print:border print:border-yellow-600" style={{WebkitPrintColorAdjust: 'exact', colorAdjust: 'exact'}}></span> Bolsa 4-5mm</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-red-600 inline-block shadow-sm print:shadow-none print:border print:border-red-700" style={{WebkitPrintColorAdjust: 'exact', colorAdjust: 'exact'}}></span> Bolsa ≥6mm</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block"></span> Margen</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-red-500 inline-block shadow-sm print:shadow-none"></span> Sangrado</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-amber-400 inline-block shadow-sm print:shadow-none"></span> Supuración</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-slate-300 inline-block shadow-sm print:shadow-none print:border print:border-slate-400"></span> Ausente</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-blue-100 border border-blue-400 inline-block shadow-sm print:shadow-none"></span> Implante</span>
        </div>

        {/* MENSAJE EXCLUSIVO PARA TELÉFONO (Oculto en print) */}
        <div className="md:hidden flex items-center justify-center gap-3 mb-2 bg-blue-50/90 border border-blue-100 text-blue-600 py-3 px-4 rounded-xl text-[9px] font-black uppercase tracking-widest shadow-sm print:hidden">
          <span className="text-sm animate-pulse"><ArrowRightLeft size={16} /></span>
          <span className="text-center">Desliza el gráfico horizontalmente</span>
          <span className="text-sm animate-pulse"><ArrowRightLeft size={16} /></span>
        </div>

        {/* CONTENEDORES DE MAXILARES */}
        <div className="space-y-6 md:space-y-8 print:space-y-6">
          
          {/* Maxilar Superior */}
          <div className="bg-white/90 backdrop-blur-xl pt-6 pb-2 px-0 md:px-8 rounded-[2rem] md:rounded-[3rem] shadow-2xl border border-white/60 print:shadow-none print:border-none print:p-0 print:bg-transparent">
            <h3 className="text-base md:text-lg font-black text-slate-800 uppercase italic mb-4 md:mb-6 px-4 md:px-0 print:text-black">Maxilar Superior</h3>
            
            <div className="w-full overflow-x-auto custom-scrollbar print:overflow-visible print:w-auto">
               <div className="flex flex-col gap-2 min-w-max px-4 md:px-0 pb-4 print:min-w-fit print-w-auto">
                 <PeriodontogramaTable arcada="superior" cara="vestibular" dientes={DIENTES_SUPERIORES} data={data} onDataChange={handleDataChange} />
                 <PeriodontogramaAnatomico arcada="superior" dientes={DIENTES_SUPERIORES} data={data} />
                 <PeriodontogramaTable arcada="superior" cara="palatino" dientes={DIENTES_SUPERIORES} data={data} onDataChange={handleDataChange} />
                 {mostrarGrafico && <PeriodontogramaChart arcada="superior" dientes={DIENTES_SUPERIORES} data={data} />}
               </div>
            </div>
          </div>

          {/* Maxilar Inferior */}
          <div className="bg-white/90 backdrop-blur-xl pt-6 pb-2 px-0 md:px-8 rounded-[2rem] md:rounded-[3rem] shadow-2xl border border-white/60 print-page-break print:shadow-none print:border-none print:p-0 print:bg-transparent">
            <h3 className="text-base md:text-lg font-black text-slate-800 uppercase italic mb-4 md:mb-6 px-4 md:px-0 print:text-black">Maxilar Inferior</h3>
            
            <div className="w-full overflow-x-auto custom-scrollbar print:overflow-visible print:w-auto">
               <div className="flex flex-col gap-2 min-w-max px-4 md:px-0 pb-4 print:min-w-fit print-w-auto">
                 <PeriodontogramaTable arcada="inferior" cara="vestibular" dientes={DIENTES_INFERIORES} data={data} onDataChange={handleDataChange} />
                 <PeriodontogramaAnatomico arcada="inferior" dientes={DIENTES_INFERIORES} data={data} />
                 <PeriodontogramaTable arcada="inferior" cara="lingual" dientes={DIENTES_INFERIORES} data={data} onDataChange={handleDataChange} />
                 {mostrarGrafico && <PeriodontogramaChart arcada="inferior" dientes={DIENTES_INFERIORES} data={data} />}
               </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
