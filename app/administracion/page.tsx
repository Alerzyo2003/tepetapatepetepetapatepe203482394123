import { redirect } from 'next/navigation'

// Esta ruta tenía una versión antigua de "Gestión de Staff" (fuera del menú y ya sin funcionar).
// Ahora lleva a la página vigente de Personal.
export default function AdministracionInicio() {
  redirect('/administracion/profesionales')
}
