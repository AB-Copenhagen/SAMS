/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [{ protocol: 'https', hostname: '**' }],
  },
  experimental: {
    serverComponentsExternalPackages: ['exifr'],
  },
};

module.exports = nextConfig;
