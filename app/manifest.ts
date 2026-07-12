import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'SAMS Mobile Capture',
    short_name: 'SAMS Capture',
    description: 'Capture and upload photos/video to the SAMS asset library from the field.',
    start_url: '/ingest/mobile',
    display: 'standalone',
    background_color: '#0b0d1a',
    theme_color: '#0b0d1a',
    icons: [],
  };
}
