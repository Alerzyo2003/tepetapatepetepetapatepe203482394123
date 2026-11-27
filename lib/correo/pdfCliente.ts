'use client'
// Convierte un elemento de la página en PDF (Blob) para adjuntarlo a un correo. Mismo motor que "Descargar PDF".
export async function pdfDeElemento(elemento: HTMLElement, opciones: Record<string, any> = {}, alTerminar?: (pdf: any) => void): Promise<Blob> {
  const html2pdf = (await import('html2pdf.js')).default
  const opt = {
    margin: [12, 12, 15, 12],
    image: { type: 'jpeg', quality: 0.92 },
    html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff', scrollY: 0 },
    jsPDF: { unit: 'mm', format: 'letter', orientation: 'portrait' },
    pagebreak: { mode: ['css', 'legacy'] },
    ...opciones,
  }
  const worker: any = html2pdf().set(opt as any).from(elemento).toPdf()
  if (alTerminar) await worker.get('pdf').then((pdf: any) => alTerminar(pdf))
  return await worker.outputPdf('blob')
}

// Para documentos que en pantalla están ocultos (solo se muestran al imprimir): se clona, se muestra fuera de la vista y se convierte.
export async function pdfDeElementoOculto(elemento: HTMLElement, anchoPx = 780, opciones: Record<string, any> = {}, alTerminar?: (pdf: any) => void): Promise<Blob> {
  const contenedor = document.createElement('div')
  contenedor.style.cssText = `position:absolute;left:-10000px;top:0;width:${anchoPx}px;background:#fff`
  const copia = elemento.cloneNode(true) as HTMLElement
  copia.classList.remove('hidden')
  copia.style.display = 'block'
  copia.style.width = `${anchoPx}px`
  contenedor.appendChild(copia)
  document.body.appendChild(contenedor)
  try {
    await new Promise(r => setTimeout(r, 100))
    return await pdfDeElemento(copia, opciones, alTerminar)
  } finally {
    contenedor.remove()
  }
}

// Numera las páginas igual que el PDF descargado
export const numerarPaginas = (pdf: any) => {
  const total = pdf.internal.getNumberOfPages()
  for (let i = 1; i <= total; i++) {
    pdf.setPage(i); pdf.setFontSize(9); pdf.setTextColor(120, 120, 120)
    pdf.text(`Página ${i} de ${total}`, pdf.internal.pageSize.getWidth() - 35, pdf.internal.pageSize.getHeight() - 8)
  }
}
