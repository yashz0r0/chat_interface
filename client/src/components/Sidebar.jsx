import React from 'react';

function formatTimestamp(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  const now = new Date();
  const diffInMinutes = Math.floor((now - date) / (1000 * 60));

  if (diffInMinutes < 1) return 'Just now';
  if (diffInMinutes < 60) return `${diffInMinutes}m ago`;

  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) return `${diffInHours}h ago`;

  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays < 7) return `${diffInDays}d ago`;

  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function Sidebar({
  conversations,
  activeId,
  onSelectConversation,
  onNewChat,
  onDeleteConversation,
  isOpen,
  onClose,
  backendStatus
}) {
  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && <div className="sidebar-backdrop" onClick={onClose} />}

      <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <div className="sidebar-brand">
            <div className="brand-logo">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <span className="brand-title">AI Assistant</span>
          </div>

          <button
            className="new-chat-btn"
            onClick={() => {
              onNewChat();
              onClose?.();
            }}
            title="Start a new chat (Ctrl+K)"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <span>New Chat</span>
          </button>
        </div>

        <div className="sidebar-conversations">
          <div className="sidebar-section-title">Recent Conversations</div>
          {conversations.length === 0 ? (
            <div className="no-conversations">
              <p>No chat history yet</p>
              <span>Your conversations will be saved here automatically.</span>
            </div>
          ) : (
            <ul className="conversations-list">
              {conversations.map((conv) => {
                const isActive = activeId === conv._id;
                return (
                  <li
                    key={conv._id}
                    className={`conversation-item ${isActive ? 'active' : ''}`}
                    onClick={() => {
                      onSelectConversation(conv._id);
                      onClose?.();
                    }}
                  >
                    <div className="conv-icon">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                      </svg>
                    </div>

                    <div className="conv-details">
                      <div className="conv-title" title={conv.title}>
                        {conv.title || 'Untitled Chat'}
                      </div>
                      <div className="conv-meta">
                        <span className="conv-tone-badge">{conv.tone || 'Professional'}</span>
                        <span className="conv-time">{formatTimestamp(conv.updatedAt || conv.createdAt)}</span>
                      </div>
                    </div>

                    <button
                      className="delete-conv-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (window.confirm('Delete this conversation?')) {
                          onDeleteConversation(conv._id);
                        }
                      }}
                      title="Delete chat"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="sidebar-footer">
          <div className="status-indicator">
            <span
              className={`status-dot ${backendStatus?.storage === 'mongodb' ? 'online' : 'fallback'}`}
              title={backendStatus?.storage === 'mongodb' ? 'MongoDB Connected' : 'Local Storage Mode'}
            />
            <div className="status-text">
              <span className="status-main">
                {backendStatus?.storage === 'mongodb' ? 'MongoDB Active' : 'Persistence: Local JSON'}
              </span>
              <span className="status-sub">
                {backendStatus?.hasOpenAiKey ? 'AI: OpenAI Live' : 'AI: Ready (Key Optional)'}
              </span>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}

