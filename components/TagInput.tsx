'use client';

import { useState, useRef, KeyboardEvent } from 'react';

export interface TagSuggestion {
  value: string;
  label?: string;
  type?: 'player' | 'sponsor' | 'generic';
}

const GENERIC_SUGGESTIONS: TagSuggestion[] = [
  'action', 'ceremony', 'match', 'portrait',
  'press', 'stadium', 'team', 'training',
].map((v) => ({ value: v, type: 'generic' as const }));

export default function TagInput({
  tags,
  onChange,
  suggestions = [],
  placeholder = 'Add tag…',
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
  suggestions?: TagSuggestion[];
  placeholder?: string;
}) {
  const [input, setInput] = useState('');
  const [open, setOpen]   = useState(false);
  const inputRef          = useRef<HTMLInputElement>(null);

  const allSuggestions = [...GENERIC_SUGGESTIONS, ...suggestions];

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

  const query = input.toLowerCase();
  const filtered = allSuggestions.filter(
    (s) => !tags.includes(s.value.toLowerCase()) &&
           (s.value.toLowerCase().includes(query) ||
            (s.label ?? '').toLowerCase().includes(query)),
  );

  const TYPE_LABEL: Record<string, string> = { player: 'Player', sponsor: 'Sponsor' };
  const TYPE_COLOR: Record<string, string> = {
    player:  '#e8f0fd',
    sponsor: '#fef3e2',
    generic: 'transparent',
  };
  const TYPE_TEXT: Record<string, string> = {
    player:  '#1a56c4',
    sponsor: '#b45309',
    generic: 'transparent',
  };

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
          placeholder={tags.length === 0 ? placeholder : ''}
        />
      </div>

      {open && filtered.length > 0 && (
        <div className="tag-suggestions">
          {filtered.map((s) => (
            <button
              key={s.value}
              type="button"
              className="tag-suggestion-item"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}
              onMouseDown={() => addTag(s.value)}
            >
              <span>{s.label ?? s.value}</span>
              {s.type && s.type !== 'generic' && (
                <span style={{
                  fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 10,
                  background: TYPE_COLOR[s.type], color: TYPE_TEXT[s.type],
                  textTransform: 'uppercase', letterSpacing: '0.04em',
                }}>
                  {TYPE_LABEL[s.type]}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
