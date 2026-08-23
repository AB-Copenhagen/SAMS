/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [{ protocol: 'https', hostname: '**' }],
  },
  // Packages with a native/compiled addon must be excluded from the server bundle — bundling
  // sharp's JS wrapper breaks the relative-path lookup its native binding uses to find the
  // co-located libvips shared library at runtime (ERR_DLOPEN_FAILED on Vercel's Linux runtime).
  serverExternalPackages: ['exifr', 'sharp'],
};

module.exports = nextConfig;
