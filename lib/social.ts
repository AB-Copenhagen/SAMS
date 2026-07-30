/** AB's official social profiles — appended to share captions so posts credit/mention the club. */
export const AB_SOCIAL_LINKS = {
  facebook: 'https://www.facebook.com/akademiskboldklub/',
  instagram: 'https://www.instagram.com/abfodbold',
};

/**
 * Builds the caption end users get when sharing a photo — the admin's sample sharing text (or a
 * generic fallback) plus AB's Facebook/Instagram links, so club mentions stay consistent without
 * every admin having to type them in by hand.
 */
export function buildShareCaption(shareText: string | null | undefined, fallback: string): string {
  const base = (shareText && shareText.trim()) || fallback;
  return `${base}\n\n${AB_SOCIAL_LINKS.facebook}\n${AB_SOCIAL_LINKS.instagram}`;
}
