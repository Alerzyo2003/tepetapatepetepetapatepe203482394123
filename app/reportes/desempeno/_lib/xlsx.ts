// Generador de Excel (.xlsx) propio, sin librerías externas.
// Arma el archivo (un ZIP con XML adentro) y lo descarga en el navegador.

export type Celda = string | number | null | undefined
export interface Hoja { nombre: string; filas: Celda[][]; columnasPesos?: number[]; anchos?: number[] }

const FORMATO_PESOS = '&quot;$&quot;#,##0'

// Estilos: 0 normal, 1 pesos, 2 negrita, 3 negrita + pesos
const ESTILOS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="${FORMATO_PESOS}"/></numFmts>
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="4">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="164" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyNumberFormat="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`

const esc = (s: string) =>
  s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function columna(n: number) {
  let s = ''
  for (n++; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s
  return s
}

// Nombre de hoja válido para Excel: máx 31 caracteres, sin : \ / ? * [ ]
const nombreHoja = (s: string, usados: Set<string>) => {
  const base = (s.replace(/[:\\/?*[\]]/g, ' ').trim() || 'Hoja').slice(0, 31)
  let n = base, i = 2
  while (usados.has(n.toLowerCase())) n = `${base.slice(0, 27)} (${i++})`
  usados.add(n.toLowerCase())
  return n
}

function xmlHoja(h: Hoja) {
  const pesos = new Set(h.columnasPesos || [])
  // Negrita: primera fila (encabezado) y filas que empiezan con "TOTAL"
  const filas = h.filas.map((fila, r) => {
    const negrita = r === 0 || String(fila?.[0] ?? '').toUpperCase() === 'TOTAL'
    const celdas = (fila || []).map((v, c) => {
      if (v === null || v === undefined || v === '') return ''
      const ref = `${columna(c)}${r + 1}`
      if (typeof v === 'number' && Number.isFinite(v)) {
        const s = pesos.has(c) ? (negrita ? 3 : 1) : (negrita ? 2 : 0)
        return `<c r="${ref}"${s ? ` s="${s}"` : ''}><v>${v}</v></c>`
      }
      return `<c r="${ref}" t="inlineStr"${negrita ? ' s="2"' : ''}><is><t xml:space="preserve">${esc(String(v))}</t></is></c>`
    }).join('')
    return `<row r="${r + 1}">${celdas}</row>`
  }).join('')
  const cols = h.anchos?.length
    ? `<cols>${h.anchos.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>`
    : ''
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>${cols}<sheetData>${filas}</sheetData></worksheet>`
}

// ── ZIP sin compresión ──
const TABLA_CRC = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()
function crc32(d: Uint8Array) {
  let c = 0xffffffff
  for (let i = 0; i < d.length; i++) c = TABLA_CRC[(c ^ d[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function zip(archivos: { nombre: string; contenido: string }[]): Uint8Array {
  const enc = new TextEncoder()
  const locales: Uint8Array[] = []
  const centrales: Uint8Array[] = []
  let offset = 0
  for (const a of archivos) {
    const nombre = enc.encode(a.nombre)
    const datos = enc.encode(a.contenido)
    const crc = crc32(datos)
    const local = new Uint8Array(30 + nombre.length + datos.length)
    const lv = new DataView(local.buffer)
    lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint16(6, 0x0800, true); lv.setUint16(8, 0, true)
    lv.setUint16(10, 0, true); lv.setUint16(12, 0x21, true)
    lv.setUint32(14, crc, true); lv.setUint32(18, datos.length, true); lv.setUint32(22, datos.length, true)
    lv.setUint16(26, nombre.length, true); lv.setUint16(28, 0, true)
    local.set(nombre, 30); local.set(datos, 30 + nombre.length)
    const central = new Uint8Array(46 + nombre.length)
    const cv = new DataView(central.buffer)
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, 0x0800, true)
    cv.setUint16(10, 0, true); cv.setUint16(12, 0, true); cv.setUint16(14, 0x21, true)
    cv.setUint32(16, crc, true); cv.setUint32(20, datos.length, true); cv.setUint32(24, datos.length, true)
    cv.setUint16(28, nombre.length, true); cv.setUint32(42, offset, true)
    central.set(nombre, 46)
    locales.push(local); centrales.push(central)
    offset += local.length
  }
  const tamCentral = centrales.reduce((s, c) => s + c.length, 0)
  const fin = new Uint8Array(22)
  const fv = new DataView(fin.buffer)
  fv.setUint32(0, 0x06054b50, true); fv.setUint16(8, archivos.length, true); fv.setUint16(10, archivos.length, true)
  fv.setUint32(12, tamCentral, true); fv.setUint32(16, offset, true)
  const total = new Uint8Array(offset + tamCentral + 22)
  let p = 0
  for (const b of [...locales, ...centrales, fin]) { total.set(b, p); p += b.length }
  return total
}

// Arma el .xlsx completo (devuelve los bytes)
export function crearXlsx(hojas: Hoja[]): Uint8Array {
  const usados = new Set<string>()
  const nombres = hojas.map(h => nombreHoja(h.nombre, usados))
  const archivos = [
    {
      nombre: '[Content_Types].xml',
      contenido: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${hojas.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`,
    },
    {
      nombre: '_rels/.rels',
      contenido: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    },
    {
      nombre: 'xl/workbook.xml',
      contenido: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${nombres.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`,
    },
    {
      nombre: 'xl/_rels/workbook.xml.rels',
      contenido: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${hojas.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${hojas.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    },
    { nombre: 'xl/styles.xml', contenido: ESTILOS },
    ...hojas.map((h, i) => ({ nombre: `xl/worksheets/sheet${i + 1}.xml`, contenido: xmlHoja(h) })),
  ]
  return zip(archivos)
}

// Descarga el archivo en el navegador
export function descargarXlsx(nombreArchivo: string, hojas: Hoja[]) {
  const bytes = crearXlsx(hojas)
  const blob = new Blob([bytes as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombreArchivo
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1500)
}
