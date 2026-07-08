/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep these out of the bundler: pdf-parse/pdfjs-dist have runtime file
  // reads and @sparticuz/chromium ships a large brotli-compressed binary that
  // must be loaded from disk, not webpack. (The dev-only `puppeteer` package is
  // deliberately NOT listed — it's loaded via an opaque, webpackIgnore'd
  // dynamic import so it's never bundled or traced into the Vercel function.)
  serverExternalPackages: [
    'pdf-parse',
    'pdfjs-dist',
    '@sparticuz/chromium',
    'puppeteer-core',
  ],
};

export default nextConfig;
