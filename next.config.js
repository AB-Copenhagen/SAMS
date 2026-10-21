/** @type {import('next').NextConfig} */
const nextConfig = {
  // The app has no next/image usage — all image delivery goes through short-TTL Wasabi presigned
  // URLs instead. unoptimized disables the built-in /_next/image endpoint outright; a wildcard
  // remotePatterns hostname would otherwise make that endpoint an open, unauthenticated proxy for
  // fetching and relaying back any HTTPS URL.
  images: {
    unoptimized: true,
  },
  // Packages with a native/compiled addon must be excluded from the server bundle — bundling
  // sharp's JS wrapper breaks the relative-path lookup its native binding uses to find the
  // co-located libvips shared library at runtime (ERR_DLOPEN_FAILED on Vercel's Linux runtime).
  serverExternalPackages: ['exifr', 'sharp'],
};

module.exports = nextConfig;
