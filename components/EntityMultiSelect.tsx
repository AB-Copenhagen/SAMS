'use client';

import { useState, useRef, KeyboardEvent } from 'react';

export interface EntityOption {
  id: string;
  label: string;
}

export default function EntityMultiSelect({
  options,
  selected,
  onChange,
  placeholder = 'Add…',
}: {
  options: EntityOption[];
  selected: string[];
  onChange: (ids: string[]) => void;
  placeholder?: string;
}) {
  const [input, setInput] = useState('');
  const [open, setOpen]   = useState(false);
  const inputRef          = useRef<HTMLInputElement>(null);

  const selectedOptions = [...new Set(selected)]
    .map((id) => options.find((o) => o.id === id))
    .filter((o): o is EntityOption => !!o);

  function add(id: string) {
    if (!selected.includes(id)) onChange([...selected, id]);
    setInput('');
    setOpen(false);
  }

  function remove(id: string) {
    onChange(selected.filter((s) => s !== id));
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !input && selected.length > 0) {
      remove(selected[selected.length - 1]);
    }
  }

  const query = input.toLowerCase();
  const filtered = options.filter(
    (o) => !selected.includes(o.id) && o.label.toLowerCase().includes(query),
  );

  return (
    <div className="tag-input-wrap">
      <div className="tag-input-box" onClick={() => inputRef.current?.focus()}>
        {selectedOptions.map((o) => (
          <span key={o.id} className="tag-chip">
            {o.label}
            <button
              type="button"
              className="tag-remove"
              onClick={(e) => { e.stopPropagation(); remove(o.id); }}
              aria-label={`Remove ${o.label}`}
            >×</button>
          </span>
        ))}
        <input
          ref={inputRef}
          className="tag-text-input"
          value={input}
          onChange={(e) => { setInput(e.target.value); setOpen(true); }}
          onKeyDown={onKeyDown}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder={selectedOptions.length === 0 ? placeholder : ''}
        />
      </div>

      {open && filtered.length > 0 && (
        <div className="tag-suggestions">
          {filtered.map((o) => (
            <button
              key={o.id}
              type="button"
              className="tag-suggestion-item"
              onMouseDown={() => add(o.id)}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
