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
        fontSize: 13,
        padding: '5px 10px',
        borderRadius: 6,
        border: '1px solid #d8dcea',
        background: 'white',
        color: '#3b4070',
        cursor: 'pointer',
      }}
    >
      {options.map((n) => (
        <option key={n} value={n}>{n} per page</option>
      ))}
    </select>
  );
}
