'use client';

import { useState, useRef, KeyboardEvent } from 'react';

const SUGGESTIONS = [
  'action', 'ceremony', 'match', 'player', 'portrait',
  'press', 'sponsor', 'stadium', 'team', 'training',
];

export default function TagInput({
  tags,
  onChange,
  placeholder = 'Add tag…',
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
}) {
  const [input, setInput] = useState('');
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function addTag(raw: string) {
    const tag = raw.trim().toLowerCase();
    if (tag && !tags.includes(tag)) onChange([...tags, tag]);
    setInput('');
    setOpen(false);
  }

  function removeTag(tag: string) {
    onChange(tags.filter((t) => t !== tag));
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if ((e.key === 'Enter' || e.key === ',') && input.trim()) {
      e.preventDefault();
      addTag(input);
    }
    if (e.key === 'Backspace' && !input && tags.length > 0) {
      removeTag(tags[tags.length - 1]);
    }
  }

  const filtered = SUGGESTIONS.filter(
    (s) => !tags.includes(s) && s.startsWith(input.toLowerCase()),
  );

  return (
    <div className="tag-input-wrap">
      <div className="tag-input-box" onClick={() => inputRef.current?.focus()}>
        {tags.map((tag) => (
          <span key={tag} className="tag-chip">
            {tag}
            <button
              type="button"
              className="tag-remove"
              onClick={(e) => { e.stopPropagation(); removeTag(tag); }}
              aria-label={`Remove ${tag}`}
            >
              ×
            </button>
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
          placeholder={tags.length === 0 ? placeholder : ''}
        />
      </div>
      {open && filtered.length > 0 && (
        <div className="tag-suggestions">
          {filtered.map((s) => (
            <button
              key={s}
              type="button"
              className="tag-suggestion-item"
              onMouseDown={() => addTag(s)}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
