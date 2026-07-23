/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [{ protocol: 'https', hostname: '**' }],
  },
  serverExternalPackages: ['exifr'],
};

module.exports = nextConfig;
