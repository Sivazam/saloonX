import type { NextConfig } from "next"

const isDev = process.env.NODE_ENV === "development"

const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  // Firebase client SDK needs identitytoolkit/securetoken; base64 logos need
  // data: images; Google Fonts is used via next/font (self-hosted at build,
  // but the CSS fallback URL is kept for safety). 'unsafe-eval' is required
  // by React Refresh in dev only.
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' data: https://fonts.gstatic.com",
      "img-src 'self' data: blob:",
      "connect-src 'self' https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://*.googleapis.com wss:",
      "frame-ancestors 'self'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
]

const nextConfig: NextConfig = {
  output: "standalone",
  // NOTE: do NOT set typescript.ignoreBuildErrors — it masks real regressions
  // (a prior commit shipped 4 broken legacy routes that crashed tsc but the
  // build still passed). The app's src/ is type-clean; examples/ is excluded
  // in tsconfig.json so its socket.io reference snippets don't gate the build.
  reactStrictMode: false,
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }]
  },
}

export default nextConfig
