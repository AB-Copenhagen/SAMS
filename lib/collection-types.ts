export const COLLECTION_TYPES = [
  { value: 'game',     label: 'Game',               icon: '⚽' },
  { value: 'training', label: 'Training',           icon: '🏃' },
  { value: 'social',   label: 'Social',             icon: '📣' },
  { value: 'investor', label: 'Investor',           icon: '💼' },
  { value: 'event',    label: 'Event',              icon: '🎟️' },
  { value: 'press',    label: 'Press',              icon: '📰' },
  { value: 'custom',   label: 'Custom / Shareable', icon: '✨' },
] as const;

export type CollectionTypeValue = (typeof COLLECTION_TYPES)[number]['value'];

const BY_VALUE = new Map(COLLECTION_TYPES.map((t) => [t.value, t]));

export function isKnownCollectionType(type: string): type is CollectionTypeValue {
  return BY_VALUE.has(type as CollectionTypeValue);
}

export function formatCollectionType(type: string): { label: string; icon: string } {
  const known = BY_VALUE.get(type as CollectionTypeValue);
  return known ? { label: known.label, icon: known.icon } : { label: type, icon: '' };
}
