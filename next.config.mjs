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

  // @sparticuz/chromium loads its Chromium binary from bin/*.br via a path it
  // computes at runtime, so Next's output file tracing (which only follows
  // static require/import) never bundles it — the deployed Vercel function is
  // missing the binary and executablePath() fails. Force the whole package
  // (bin + build) into the PDF function. The `*` matches the [id] segment;
  // a literal "[id]" would be parsed as a glob character class.
  outputFileTracingIncludes: {
    '/api/reports/*/pdf': ['./node_modules/@sparticuz/chromium/**'],
  },
};

export default nextConfig;
