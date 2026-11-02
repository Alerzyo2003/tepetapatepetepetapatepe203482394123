// Descarga de planillas como Excel moderno (.xlsx), que se abre en PC, Mac, iPhone, Android,
// Numbers y Google Sheets.
//
// Las liquidaciones arman su planilla en "XML de Excel 2003" (SpreadsheetML), que es fácil de escribir,
// pero guardado con extensión .xls hace que Excel avise "el formato y la extensión no coinciden" y que
// el iPhone no lo pueda abrir. Aquí ese XML se convierte a un .xlsx de verdad, sin librerías externas.
// Si algo fallara en la conversión, se descarga como antes (.xls) para no dejar a nadie sin su archivo.

const SS = 'urn:schemas-microsoft-com:office:spreadsheet';
const MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

interface Estilo { negrita?: boolean; tamano?: number; color?: string; fondo?: string; formato?: string; alineacion?: string }
interface Celda { col: number; tipo: 'n' | 's'; valor: number | string; estilo?: string; unirHasta?: number }
interface Fila { numero: number; celdas: Celda[] }
interface Hoja { nombre: string; columnas: { col: number; ancho: number }[]; filas: Fila[] }

// ─── Lectura del XML de Excel 2003 ───────────────────────────────────────────────

const hijos = (el: Element, nombre: string) => Array.from(el.children).filter(c => c.localName === nombre);
const hijo = (el: Element, nombre: string) => hijos(el, nombre)[0] as Element | undefined;
const atr = (el: Element | undefined, nombre: string): string | null => {
  if (!el) return null;
  if (el.hasAttributeNS(SS, nombre)) return el.getAttributeNS(SS, nombre);
  return el.getAttribute(`ss:${nombre}`) ?? el.getAttribute(nombre);
};
const entero = (v: string | null) => (v && /^\d+$/.test(v) ? Number(v) : null);

function leerSpreadsheetML(xml: string) {
  const doc = new DOMParser().parseFromString(xml.trim(), 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('XML de la planilla mal formado');
  const libro = doc.documentElement;
  if (libro.localName !== 'Workbook') throw new Error('No es una planilla de Excel 2003');

  const estilos: Record<string, Estilo> = {};
  for (const st of hijos(hijo(libro, 'Styles') || libro, 'Style')) {
    const id = atr(st, 'ID');
    if (!id) continue;
    const font = hijo(st, 'Font'), fondo = hijo(st, 'Interior'), num = hijo(st, 'NumberFormat'), al = hijo(st, 'Alignment');
    estilos[id] = {
      negrita: atr(font, 'Bold') === '1',
      tamano: Number(atr(font, 'Size')) || undefined,
      color: atr(font, 'Color') || undefined,
      fondo: fondo && (atr(fondo, 'Pattern') || 'Solid') !== 'None' ? atr(fondo, 'Color') || undefined : undefined,
      formato: atr(num, 'Format') || undefined,
      alineacion: atr(al, 'Horizontal')?.toLowerCase() || undefined,
    };
  }

  const hojas: Hoja[] = hijos(libro, 'Worksheet').map((ws, i) => {
    const hoja: Hoja = { nombre: atr(ws, 'Name') || `Hoja${i + 1}`, columnas: [], filas: [] };
    const tabla = hijo(ws, 'Table');
    if (!tabla) return hoja;

    let col = 0;
    for (const c of hijos(tabla, 'Column')) {
      col = entero(atr(c, 'Index')) ?? col + 1;
      const ancho = Number(atr(c, 'Width'));
      const span = entero(atr(c, 'Span')) ?? 0;
      for (let k = 0; k <= span; k++) if (ancho > 0) hoja.columnas.push({ col: col + k, ancho });
      col += span;
    }

    let numero = 0;
    for (const r of hijos(tabla, 'Row')) {
      numero = entero(atr(r, 'Index')) ?? numero + 1;
      const fila: Fila = { numero, celdas: [] };
      let c = 0;
      for (const cel of hijos(r, 'Cell')) {
        c = entero(atr(cel, 'Index')) ?? c + 1;
        const unir = entero(atr(cel, 'MergeAcross')) ?? 0;
        const dato = hijo(cel, 'Data');
        const estilo = atr(cel, 'StyleID') || undefined;
        if (dato) {
          const texto = dato.textContent ?? '';
          if (atr(dato, 'Type') === 'Number') {
            const n = Number(texto);
            if (texto.trim() !== '' && Number.isFinite(n)) fila.celdas.push({ col: c, tipo: 'n', valor: n, estilo, unirHasta: unir ? c + unir : undefined });
          } else {
            fila.celdas.push({ col: c, tipo: 's', valor: texto, estilo, unirHasta: unir ? c + unir : undefined });
          }
        } else if (estilo) {
          fila.celdas.push({ col: c, tipo: 's', valor: '', estilo, unirHasta: unir ? c + unir : undefined });
        }
        c += unir;
      }
      hoja.filas.push(fila);
    }
    return hoja;
  });

  if (!hojas.length) throw new Error('La planilla no tiene hojas');
  return { estilos, hojas };
}

// ─── Escritura del .xlsx (Office Open XML) ───────────────────────────────────────

const esc = (s: string) => s
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const letraColumna = (n: number) => { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
const argb = (hex?: string) => (hex && /^#?[0-9a-f]{6}$/i.test(hex) ? 'FF' + hex.replace('#', '').toUpperCase() : null);
const ALINEACIONES = ['left', 'center', 'right', 'justify'];

function nombresDeHoja(hojas: Hoja[]) {
  const usados = new Set<string>();
  return hojas.map((h, i) => {
    let base = h.nombre.replace(/[\[\]:*?\/\\]/g, '-').replace(/^'+|'+$/g, '').trim().slice(0, 31) || `Hoja${i + 1}`;
    let nombre = base, k = 2;
    while (usados.has(nombre.toLowerCase())) nombre = `${base.slice(0, 28)} (${k++})`;
    usados.add(nombre.toLowerCase());
    return nombre;
  });
}

function construirArchivos(estilos: Record<string, Estilo>, hojas: Hoja[]) {
  // Estilos → fonts / fills / numFmts / cellXfs (el índice 0 es el estilo normal)
  const fuentes = ['<font><sz val="11"/><name val="Calibri"/><family val="2"/></font>'];
  const rellenos = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'];
  const formatos: string[] = [];
  const xfs = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'];
  const indiceEstilo: Record<string, number> = {};
  const idx = (lista: string[], item: string) => { const i = lista.indexOf(item); return i >= 0 ? i : lista.push(item) - 1; };

  for (const [id, e] of Object.entries(estilos)) {
    const color = argb(e.color);
    const fuente = `<font>${e.negrita ? '<b/>' : ''}<sz val="${e.tamano || 11}"/>${color ? `<color rgb="${color}"/>` : ''}<name val="Calibri"/><family val="2"/></font>`;
    const fontId = idx(fuentes, fuente);
    const fondo = argb(e.fondo);
    const fillId = fondo ? idx(rellenos, `<fill><patternFill patternType="solid"><fgColor rgb="${fondo}"/><bgColor indexed="64"/></patternFill></fill>`) : 0;
    let numFmtId = 0;
    if (e.formato && e.formato !== 'General') numFmtId = 164 + idx(formatos, e.formato);
    const alin = e.alineacion && ALINEACIONES.includes(e.alineacion) ? e.alineacion : null;
    xfs.push(`<xf numFmtId="${numFmtId}" fontId="${fontId}" fillId="${fillId}" borderId="0" xfId="0"`
      + `${numFmtId ? ' applyNumberFormat="1"' : ''}${fontId ? ' applyFont="1"' : ''}${fillId ? ' applyFill="1"' : ''}`
      + (alin ? ` applyAlignment="1"><alignment horizontal="${alin}"/></xf>` : '/>'));
    indiceEstilo[id] = xfs.length - 1;
  }

  const stylesXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
    + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    + (formatos.length ? `<numFmts count="${formatos.length}">${formatos.map((f, i) => `<numFmt numFmtId="${164 + i}" formatCode="${esc(f)}"/>`).join('')}</numFmts>` : '')
    + `<fonts count="${fuentes.length}">${fuentes.join('')}</fonts>`
    + `<fills count="${rellenos.length}">${rellenos.join('')}</fills>`
    + '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
    + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
    + `<cellXfs count="${xfs.length}">${xfs.join('')}</cellXfs>`
    + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
    + '</styleSheet>';

  // Textos compartidos
  const textos: string[] = [];
  const posTexto = new Map<string, number>();
  let usosTexto = 0;
  const texto = (s: string) => {
    usosTexto++;
    let i = posTexto.get(s);
    if (i === undefined) { i = textos.push(s) - 1; posTexto.set(s, i); }
    return i;
  };

  const nombres = nombresDeHoja(hojas);
  const hojasXml = hojas.map((h, n) => {
    const uniones: string[] = [];
    const filas = [...h.filas].sort((a, b) => a.numero - b.numero).map(f => {
      const celdas = [...f.celdas].sort((a, b) => a.col - b.col).map(c => {
        const ref = `${letraColumna(c.col)}${f.numero}`;
        if (c.unirHasta) uniones.push(`<mergeCell ref="${ref}:${letraColumna(c.unirHasta)}${f.numero}"/>`);
        const s = c.estilo && indiceEstilo[c.estilo] ? ` s="${indiceEstilo[c.estilo]}"` : '';
        if (c.tipo === 'n') return `<c r="${ref}"${s}><v>${c.valor}</v></c>`;
        if (c.valor === '') return `<c r="${ref}"${s}/>`;
        return `<c r="${ref}"${s} t="s"><v>${texto(String(c.valor))}</v></c>`;
      }).join('');
      return `<row r="${f.numero}">${celdas}</row>`;
    }).join('');
    const cols = [...h.columnas].sort((a, b) => a.col - b.col)
      .map(c => `<col min="${c.col}" max="${c.col}" width="${Math.max(1, Math.round((c.ancho / 5.4) * 100) / 100)}" customWidth="1"/>`).join('');
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
      + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
      + '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>'
      + `<sheetViews><sheetView workbookViewId="0"${n === 0 ? ' tabSelected="1"' : ''}/></sheetViews>`
      + '<sheetFormatPr defaultRowHeight="15"/>'
      + (cols ? `<cols>${cols}</cols>` : '')
      + `<sheetData>${filas}</sheetData>`
      + (uniones.length ? `<mergeCells count="${uniones.length}">${uniones.join('')}</mergeCells>` : '')
      // Al imprimir: horizontal y todas las columnas en el ancho de la hoja
      + '<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/>'
      + '<pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/>'
      + '</worksheet>';
  });

  const sstXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
    + `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${usosTexto}" uniqueCount="${textos.length}">`
    + textos.map(t => `<si><t xml:space="preserve">${esc(t)}</t></si>`).join('')
    + '</sst>';

  const workbookXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
    + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
    + '<bookViews><workbookView/></bookViews>'
    + `<sheets>${nombres.map((nom, i) => `<sheet name="${esc(nom)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>`
    + '</workbook>';

  const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const workbookRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + hojas.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${R}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')
    + `<Relationship Id="rId${hojas.length + 1}" Type="${R}/styles" Target="styles.xml"/>`
    + `<Relationship Id="rId${hojas.length + 2}" Type="${R}/sharedStrings" Target="sharedStrings.xml"/>`
    + '</Relationships>';

  const rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + `<Relationship Id="rId1" Type="${R}/officeDocument" Target="xl/workbook.xml"/>`
    + `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>`
    + `<Relationship Id="rId3" Type="${R}/extended-properties" Target="docProps/app.xml"/>`
    + '</Relationships>';

  const ahora = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const core = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
    + '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">'
    + '<dc:creator>Clínica Dignidad</dc:creator>'
    + `<dcterms:created xsi:type="dcterms:W3CDTF">${ahora}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${ahora}</dcterms:modified>`
    + '</cp:coreProperties>';
  const app = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
    + '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Microsoft Excel</Application></Properties>';

  const SML = 'application/vnd.openxmlformats-officedocument.spreadsheetml';
  const contentTypes = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
    + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    + '<Default Extension="xml" ContentType="application/xml"/>'
    + `<Override PartName="/xl/workbook.xml" ContentType="${SML}.sheet.main+xml"/>`
    + hojas.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="${SML}.worksheet+xml"/>`).join('')
    + `<Override PartName="/xl/styles.xml" ContentType="${SML}.styles+xml"/>`
    + `<Override PartName="/xl/sharedStrings.xml" ContentType="${SML}.sharedStrings+xml"/>`
    + '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>'
    + '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>'
    + '</Types>';

  return [
    { nombre: '[Content_Types].xml', texto: contentTypes },
    { nombre: '_rels/.rels', texto: rels },
    { nombre: 'docProps/core.xml', texto: core },
    { nombre: 'docProps/app.xml', texto: app },
    { nombre: 'xl/workbook.xml', texto: workbookXml },
    { nombre: 'xl/_rels/workbook.xml.rels', texto: workbookRels },
    { nombre: 'xl/styles.xml', texto: stylesXml },
    { nombre: 'xl/sharedStrings.xml', texto: sstXml },
    ...hojasXml.map((t, i) => ({ nombre: `xl/worksheets/sheet${i + 1}.xml`, texto: t })),
  ];
}

// ─── ZIP (sin compresión: el .xlsx es un zip con los XML de arriba) ──────────────

let tablaCrc: Uint32Array | null = null;
function crc32(datos: Uint8Array) {
  if (!tablaCrc) {
    tablaCrc = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; tablaCrc[n] = c >>> 0; }
  }
  let c = 0xFFFFFFFF;
  for (let i = 0; i < datos.length; i++) c = tablaCrc[(c ^ datos[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function crearZip(archivos: { nombre: string; texto: string }[]): Uint8Array {
  const enc = new TextEncoder();
  const d = new Date();
  const hora = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
  const fecha = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  const locales: Uint8Array[] = [], centrales: Uint8Array[] = [];
  let offset = 0;

  for (const a of archivos) {
    const nombre = enc.encode(a.nombre), datos = enc.encode(a.texto), crc = crc32(datos);
    const local = new Uint8Array(30 + nombre.length + datos.length);
    const vl = new DataView(local.buffer);
    vl.setUint32(0, 0x04034b50, true); vl.setUint16(4, 20, true); vl.setUint16(6, 0, true); vl.setUint16(8, 0, true);
    vl.setUint16(10, hora, true); vl.setUint16(12, fecha, true); vl.setUint32(14, crc, true);
    vl.setUint32(18, datos.length, true); vl.setUint32(22, datos.length, true);
    vl.setUint16(26, nombre.length, true); vl.setUint16(28, 0, true);
    local.set(nombre, 30); local.set(datos, 30 + nombre.length);

    const central = new Uint8Array(46 + nombre.length);
    const vc = new DataView(central.buffer);
    vc.setUint32(0, 0x02014b50, true); vc.setUint16(4, 20, true); vc.setUint16(6, 20, true); vc.setUint16(8, 0, true);
    vc.setUint16(10, 0, true); vc.setUint16(12, hora, true); vc.setUint16(14, fecha, true); vc.setUint32(16, crc, true);
    vc.setUint32(20, datos.length, true); vc.setUint32(24, datos.length, true); vc.setUint16(28, nombre.length, true);
    vc.setUint32(42, offset, true);
    central.set(nombre, 46);

    locales.push(local); centrales.push(central);
    offset += local.length;
  }

  const tamCentral = centrales.reduce((s, c) => s + c.length, 0);
  const fin = new Uint8Array(22);
  const vf = new DataView(fin.buffer);
  vf.setUint32(0, 0x06054b50, true); vf.setUint16(8, archivos.length, true); vf.setUint16(10, archivos.length, true);
  vf.setUint32(12, tamCentral, true); vf.setUint32(16, offset, true);

  const zip = new Uint8Array(offset + tamCentral + 22);
  let p = 0;
  for (const parte of [...locales, ...centrales, fin]) { zip.set(parte, p); p += parte.length; }
  return zip;
}

// ─── Uso desde las páginas ───────────────────────────────────────────────────────

// Convierte el XML de Excel 2003 a un .xlsx (bytes). Lanza error si el XML no se puede leer.
export function spreadsheetMLaXlsx(xml: string): Uint8Array {
  const { estilos, hojas } = leerSpreadsheetML(xml);
  return crearZip(construirArchivos(estilos, hojas));
}

function descargar(blob: Blob, nombre: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000); // el iPhone necesita la dirección un rato más
}

// Descarga la planilla como .xlsx. nombreBase va sin extensión (ej.: "Liquidacion_Juan_Perez_2026-10").
export function descargarExcel(xmlSpreadsheetML: string, nombreBase: string) {
  const nombre = nombreBase.replace(/\.xlsx?$/i, '').replace(/[\\/:*?"<>|]+/g, '-').trim() || 'planilla';
  try {
    const bytes = spreadsheetMLaXlsx(xmlSpreadsheetML);
    descargar(new Blob([bytes as BlobPart], { type: MIME_XLSX }), `${nombre}.xlsx`);
  } catch (e) {
    console.error('No se pudo convertir la planilla a .xlsx; se descarga en el formato anterior', e);
    descargar(new Blob([xmlSpreadsheetML], { type: 'application/vnd.ms-excel' }), `${nombre}.xls`);
  }
}
