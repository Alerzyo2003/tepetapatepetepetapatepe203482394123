// Búsqueda de pacientes sin importar tildes, diéresis ni la ñ: "juan" encuentra "Juán", "munoz" encuentra
// "Muñoz" y "perez" encuentra "Pérez" (y al revés). El RUT se encuentra con o sin puntos y guion.
// Se usa con supabase: por cada palabra escrita → query.or(filtroPalabraPaciente(palabra))

const VARIANTES: Record<string, string> = {
  a: 'aáàäâAÁÀÄÂ', e: 'eéèëêEÉÈËÊ', i: 'iíìïîIÍÌÏÎ', o: 'oóòöôOÓÒÖÔ', u: 'uúùüûUÚÙÜÛ',
  n: 'nñNÑ', c: 'cçCÇ', y: 'yýÿYÝ',
};

export const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Cada letra se convierte en un grupo con todas sus variantes: a → [aáàäâAÁÀÄÂ]
const letra = (ch: string) => (VARIANTES[ch] ? `[${VARIANTES[ch]}]` : /[a-z0-9]/.test(ch) ? ch : `[${ch}]`);

// Expresión para nombre/apellido. Con subsecuencia, las letras pueden tener otras entre medio ("jn" encuentra "Juan").
export function expresionNombre(palabra: string, subsecuencia = false): string | null {
  const p = sinTildes(palabra).replace(/[^a-z0-9'.-]/g, '');
  if (!p) return null;
  return p.split('').map(letra).join(subsecuencia ? '.*' : '');
}

// Expresión para RUT (solo si la palabra tiene al menos 3 números): 12345678 encuentra 12.345.678-9
export function expresionRut(palabra: string): string | null {
  const r = palabra.replace(/[^0-9kK]/g, '').toUpperCase();
  if ((r.match(/\d/g) || []).length < 3) return null;
  return r.split('').map(c => (c === 'K' ? '[kK]' : c)).join('[.-]?');
}

// Filtro "or" de una palabra: nombre o apellido (sin importar tildes) o RUT
export function filtroPalabraPaciente(palabra: string, opciones: { subsecuencia?: boolean } = {}): string | null {
  const nombre = expresionNombre(palabra, opciones.subsecuencia);
  const rut = expresionRut(palabra);
  const partes: string[] = [];
  if (nombre) partes.push(`nombre.imatch."${nombre}"`, `apellido.imatch."${nombre}"`);
  if (rut) partes.push(`rut.imatch."${rut}"`);
  return partes.length ? partes.join(',') : null;
}
