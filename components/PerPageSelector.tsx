'use client';

import { useRouter, useSearchParams } from 'next/navigation';

export default function PerPageSelector({ options, current }: { options: number[]; current: number }) {
  const router      = useRouter();
  const searchParams = useSearchParams();

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = new URLSearchParams(searchParams.toString());
    next.set('perPage', e.target.value);
    next.delete('page');
    router.push('?' + next.toString());
  }

  return (
    <select
      value={current}
      onChange={onChange}
      style={{
        fontSize: 12,
        padding: '3px 6px',
        borderRadius: 5,
        border: '1px solid #d8dcea',
        background: 'white',
        color: '#6b7491',
        cursor: 'pointer',
        height: 28,
      }}
    >
      {options.map((n) => (
        <option key={n} value={n}>{n} / page</option>
      ))}
    </select>
  );
}
