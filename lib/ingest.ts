import type { User } from './auth';
import type { IngestJob } from '@prisma/client';

export function sanitizeObjectKey(fileName: string): string {
  return `assets/${Date.now()}-${fileName.replace(/[^a-zA-Z0-9_\-.]/g, '_')}`;
}

export function isMediaType(fileType: string): boolean {
  return fileType.startsWith('image/') || fileType.startsWith('video/');
}

export function canAccessJob(actor: User, job: Pick<IngestJob, 'uploaderEmail'>): boolean {
  return actor.role === 'ADMIN' || actor.email === job.uploaderEmail;
}

export interface IngestMetadata {
  title?: string;
  eventName?: string;
  eventDate?: string;
  location?: string;
  manualTags?: string[];
  collectionId?: string;
  seasonId?: string;
}
