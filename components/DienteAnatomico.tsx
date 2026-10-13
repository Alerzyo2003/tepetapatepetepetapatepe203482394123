// components/Odontograma/DienteAnatomico.tsx
import React, { useRef, useEffect, useState } from 'react';

interface DienteAnatomicoProps {
  numero: number;
  imagenUrl: string;
  colorPincel: string;
  trazosIniciales?: any[];
  onGuardarTrazos: (numeroDiente: number, trazos: any[]) => void;
}

export const DienteAnatomico = ({ 
  numero, 
  imagenUrl, 
  colorPincel, 
  trazosIniciales = [], 
  onGuardarTrazos 
}: DienteAnatomicoProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  // Aseguramos que trazos sea siempre un array, incluso si viene null de DB
  const [trazos, setTrazos] = useState<any[]>(trazosIniciales || []);
  const [lastPoint, setLastPoint] = useState<{ x: number, y: number } | null>(null);

  // Sincronizar estado local si los trazos iniciales cambian (al cargar desde DB)
  useEffect(() => {
    if (trazosIniciales) setTrazos(trazosIniciales);
  }, [trazosIniciales]);

  useEffect(() => {
    dibujarEscenaCompleta();
  }, [trazos, imagenUrl]);

  const dibujarEscenaCompleta = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx || !canvas) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const img = new Image();
    img.src = imagenUrl;
    img.onload = () => {
      ctx.drawImage(img, 5, 5, canvas.width - 10, canvas.height - 10);
      
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';

      trazos.forEach(trazo => {
        ctx.strokeStyle = trazo.color;
        ctx.beginPath();
        trazo.points.forEach((point: any, index: number) => {
          if (index === 0) ctx.moveTo(point.x, point.y);
          else ctx.lineTo(point.x, point.y);
        });
        ctx.stroke();
      });
    };
    
    img.onerror = () => {
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(0,0, canvas.width, canvas.height);
        ctx.fillStyle = '#cbd5e1';
        ctx.font = 'bold 10px sans-serif';
        ctx.fillText(`Pieza ${numero}`, 15, canvas.height/2);
    }
  };

  const getCoordinates = (event: any) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    // Soporte para mouse y touch
    const clientX = event.clientX || (event.touches && event.touches[0].clientX);
    const clientY = event.clientY || (event.touches && event.touches[0].clientY);
    return {
      x: clientX - rect.left,
      y: clientY - rect.top
    };
  };

  const startDrawing = (event: any) => {
    const coords = getCoordinates(event);
    setIsDrawing(true);
    setLastPoint(coords);
    setTrazos(prev => [...prev, { color: colorPincel, points: [coords] }]);
  };

  const draw = (event: any) => {
    if (!isDrawing || !lastPoint) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx) return;

    const currentCoords = getCoordinates(event);

    ctx.strokeStyle = colorPincel;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(lastPoint.x, lastPoint.y);
    ctx.lineTo(currentCoords.x, currentCoords.y);
    ctx.stroke();

    setTrazos(prev => {
      const newTrazos = [...prev];
      const lastTrazo = newTrazos[newTrazos.length - 1];
      if (lastTrazo) lastTrazo.points.push(currentCoords);
      return newTrazos;
    });

    setLastPoint(currentCoords);
  };

  const stopDrawing = () => {
    if (isDrawing) {
      setIsDrawing(false);
      setLastPoint(null);
      onGuardarTrazos(numero, trazos);
    }
  };

  return (
    <div className="flex flex-col items-center gap-1 group">
      <span className="text-[9px] font-black text-slate-400 group-hover:text-blue-600 transition-colors">{numero}</span>
      <div className="rounded-xl bg-white border border-slate-100 shadow-sm overflow-hidden hover:border-blue-300 transition-all">
        <canvas
          ref={canvasRef}
          width={60} 
          height={60}
          className="cursor-crosshair touch-none"
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
        />
      </div>
    </div>
  );
};