/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false, // Elimina la cabecera X-Powered-By


  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            // Definimos default-src 'self' para que sea el fallback obligatorio
            value: "default-src 'self'; " +
                   // Permite scripts de tu dominio, inline y eval (necesario para Next.js Dev)
                   "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
                   // Permite estilos inline (necesario para Tailwind/Framer Motion)
                   "style-src 'self' 'unsafe-inline'; " +
                   // Permite conectar a tu servidor y a Supabase
                   "connect-src 'self' *.supabase.co wss://*.supabase.co; " +
                   // Permite imágenes locales, base64 y de Supabase (fotos de pacientes)
                   "img-src 'self' data: blob: *.supabase.co; " +
                   "media-src 'self' https://assets.mixkit.co; " +
                   "font-src 'self' data:; " +
                   "object-src 'none'; " +
                   "base-uri 'self'; " +
                   "form-action 'self'; " +
                   "frame-ancestors 'none';"
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY', // Protege contra Clickjacking
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          }
        ],
      },
    ];
  },
};


export default nextConfig;
