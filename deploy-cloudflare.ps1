# Production Cloudflare deployment for Folia.
# Vite variables are build-time inputs; wrangler cannot restore them after `vite build`.
$ErrorActionPreference = 'Stop'
if (-not $env:VITE_QQ_API_BASE) { $env:VITE_QQ_API_BASE = '/api/qq' }
if ($env:VITE_QQ_API_BASE -ne '/api/qq') { throw "Refusing to deploy without VITE_QQ_API_BASE=/api/qq" }
Write-Host "Building Folia with VITE_QQ_API_BASE=$env:VITE_QQ_API_BASE"
npm run build
npx wrangler deploy

