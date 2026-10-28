import React from 'react';

const TONES = [
  { id: 'Professional', label: 'Professional', icon: '💼', desc: 'Polished & structured' },
  { id: 'Casual', label: 'Casual', icon: '☕', desc: 'Friendly & conversational' },
  { id: 'Concise', label: 'Concise', icon: '⚡', desc: 'Direct & brief' }
];

export default function ToneSelector({ selectedTone, onSelectTone, disabled }) {
  return (
    <div className="tone-selector" title="Select response tone">
      <span className="tone-label">Tone:</span>
      <div className="tone-pill-group">
        {TONES.map((t) => {
          const isActive = selectedTone === t.id;
          return (
            <button
              key={t.id}
              type="button"
              className={`tone-pill ${isActive ? 'active' : ''}`}
              onClick={() => onSelectTone(t.id)}
              disabled={disabled}
              title={`${t.label}: ${t.desc}`}
            >
              <span className="tone-pill-icon">{t.icon}</span>
              <span className="tone-pill-text">{t.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

