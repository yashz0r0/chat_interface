import React, { useRef, useEffect } from 'react';

export default function ChatInput({
  input,
  setInput,
  onSend,
  isLoading,
  selectedTone
}) {
  const textareaRef = useRef(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 180)}px`;
    }
  }, [input]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!isLoading && input.trim()) {
        onSend();
      }
    }
  };

  return (
    <div className="chat-input-wrapper">
      <form
        className="chat-input-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!isLoading && input.trim()) {
            onSend();
          }
        }}
      >
        <textarea
          ref={textareaRef}
          className="chat-textarea"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={`Message in ${selectedTone} tone... (Press Enter to send, Shift+Enter for new line)`}
          rows={1}
          disabled={isLoading}
        />

        <button
          type="submit"
          className="send-button"
          disabled={isLoading || !input.trim()}
          title="Send message"
        >
          {isLoading ? (
            <span className="button-spinner" />
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="19" x2="12" y2="5" />
              <polyline points="5 12 12 5 19 12" />
            </svg>
          )}
        </button>
      </form>

      <div className="input-footer-note">
        <span>Current tone: <strong>{selectedTone}</strong> • MongoDB & OpenAI stream ready</span>
      </div>
    </div>
  );
}

