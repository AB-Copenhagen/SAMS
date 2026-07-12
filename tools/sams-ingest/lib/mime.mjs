import path from 'node:path';

// Covers common photo/video formats plus camera RAW extensions, which browsers/OSes
// often report as application/octet-stream (or nothing at all) — the presign API only
// accepts image/* and video/* prefixes, so RAW files need an explicit synthetic type here.
const EXTENSION_MAP = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.heic': 'image/heic', '.heif': 'image/heif',
  '.tif': 'image/tiff', '.tiff': 'image/tiff',
  '.cr2': 'image/x-canon-cr2', '.cr3': 'image/x-canon-cr3',
  '.nef': 'image/x-nikon-nef',
  '.arw': 'image/x-sony-arw',
  '.raf': 'image/x-fuji-raf',
  '.dng': 'image/x-adobe-dng',
  '.orf': 'image/x-olympus-orf',
  '.rw2': 'image/x-panasonic-rw2',
  '.mp4': 'video/mp4', '.m4v': 'video/x-m4v',
  '.mov': 'video/quicktime',
  '.avi': 'video/x-msvideo',
  '.mkv': 'video/x-matroska',
  '.mxf': 'video/mxf',
};

export function guessContentType(filePath) {
  return EXTENSION_MAP[path.extname(filePath).toLowerCase()] ?? null;
}

export function isSupportedMediaFile(filePath) {
  return guessContentType(filePath) !== null;
}
