import React, { useState, useEffect, useRef } from 'react';
import Sidebar from './components/Sidebar.jsx';
import ToneSelector from './components/ToneSelector.jsx';
import MessageItem from './components/MessageItem.jsx';
import ChatInput from './components/ChatInput.jsx';

export default function App() {
  const [conversations, setConversations] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [tone, setTone] = useState('Professional');
  const [isStreaming, setIsStreaming] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [error, setError] = useState(null);
  const [backendStatus, setBackendStatus] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const messagesEndRef = useRef(null);

  // Auto-scroll to bottom of conversation
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isStreaming]);

  // Load conversations list and backend status on mount
  useEffect(() => {
    fetchBackendStatus();
    loadConversations();
  }, []);

  // Keyboard shortcut Ctrl+K / Cmd+K for new chat
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        handleNewChat();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const fetchBackendStatus = async () => {
    try {
      const res = await fetch('/api/status');
      if (res.ok) {
        const data = await res.json();
        setBackendStatus(data);
      }
    } catch (err) {
      console.warn('Backend status check failed:', err);
    }
  };

  const loadConversations = async () => {
    try {
      const res = await fetch('/api/conversations');
      if (res.ok) {
        const data = await res.json();
        setConversations(data);
      }
    } catch (err) {
      console.error('Failed to load conversations:', err);
    }
  };

  const handleSelectConversation = async (id) => {
    if (isStreaming) return;
    setError(null);
    setIsLoadingHistory(true);
    try {
      const res = await fetch(`/api/conversations/${id}`);
      if (!res.ok) throw new Error('Could not fetch conversation');
      const data = await res.json();
      setActiveId(data._id);
      setMessages(data.messages || []);
      if (data.tone) {
        setTone(data.tone);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const handleNewChat = () => {
    if (isStreaming) return;
    setActiveId(null);
    setMessages([]);
    setError(null);
  };

  const handleDeleteConversation = async (id) => {
    try {
      const res = await fetch(`/api/conversations/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setConversations((prev) => prev.filter((c) => c._id !== id));
        if (activeId === id) {
          handleNewChat();
        }
      }
    } catch (err) {
      console.error('Failed to delete conversation:', err);
    }
  };

  const handleToneChange = async (newTone) => {
    setTone(newTone);
    if (activeId) {
      try {
        await fetch(`/api/conversations/${activeId}/tone`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tone: newTone })
        });
        setConversations((prev) =>
          prev.map((c) => (c._id === activeId ? { ...c, tone: newTone } : c))
        );
      } catch (err) {
        console.error('Failed to update tone on conversation:', err);
      }
    }
  };

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;

    setError(null);
    const userTimestamp = new Date().toISOString();
    const newUserMsg = { role: 'user', content: trimmed, timestamp: userTimestamp };
    const initialAssistantMsg = { role: 'assistant', content: '', timestamp: new Date().toISOString() };

    setMessages((prev) => [...prev, newUserMsg, initialAssistantMsg]);
    setInput('');
    setIsStreaming(true);

    try {
      const response = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          conversationId: activeId,
          message: trimmed,
          tone
        })
      });

      if (!response.ok) {
        throw new Error(`Server returned status ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmedLine = line.trim();
          if (trimmedLine.startsWith('data: ')) {
            const rawJson = trimmedLine.slice(6);
            try {
              const data = JSON.parse(rawJson);

              if (data.type === 'init') {
                if (data.conversationId) {
                  setActiveId(data.conversationId);
                }
              } else if (data.type === 'token') {
                setMessages((prev) => {
                  const updated = [...prev];
                  const lastIdx = updated.length - 1;
                  if (lastIdx >= 0 && updated[lastIdx].role === 'assistant') {
                    updated[lastIdx] = {
                      ...updated[lastIdx],
                      content: updated[lastIdx].content + data.token
                    };
                  }
                  return updated;
                });
              } else if (data.type === 'done') {
                loadConversations();
              } else if (data.type === 'error') {
                setError(data.error);
              }
            } catch (jsonErr) {
              console.warn('Could not parse SSE JSON line:', rawJson);
            }
          }
        }
      }
    } catch (err) {
      console.error('Stream processing error:', err);
      setError(err.message || 'Error occurred while streaming AI response');
    } finally {
      setIsStreaming(false);
      loadConversations();
    }
  };

  return (
    <div className="app-layout">
      <Sidebar
        conversations={conversations}
        activeId={activeId}
        onSelectConversation={handleSelectConversation}
        onNewChat={handleNewChat}
        onDeleteConversation={handleDeleteConversation}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        backendStatus={backendStatus}
      />

      <main className="main-content">
        {/* Top Navbar */}
        <header className="chat-header">
          <div className="header-left">
            <button
              className="sidebar-toggle-btn"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              title="Toggle sidebar"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
            <h1 className="chat-title">
              {activeId
                ? conversations.find((c) => c._id === activeId)?.title || 'Current Chat'
                : 'New Chat'}
            </h1>
          </div>

          <div className="header-right">
            <ToneSelector
              selectedTone={tone}
              onSelectTone={handleToneChange}
              disabled={isStreaming}
            />
          </div>
        </header>

        {/* Chat Conversation Scroll Area */}
        <div className="chat-scroll-area">
          {isLoadingHistory ? (
            <div className="loading-state">
              <div className="spinner" />
              <span>Loading conversation history...</span>
            </div>
          ) : messages.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M12 2a10 10 0 0 0-10 10c0 5.52 4.48 10 10 10s10-4.48 10-10A10 10 0 0 0 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
                </svg>
              </div>
              <h2 className="empty-state-title">How can I assist you today?</h2>
              <p className="empty-state-subtitle">
                Select a tone above and start chatting. Responses stream in real-time and persist in MongoDB.
              </p>

              <div className="suggestion-cards">
                <button
                  className="suggestion-card"
                  onClick={() => setInput('Explain the difference between SQL and NoSQL in simple terms.')}
                >
                  <div className="suggestion-heading">Explain a concept</div>
                  <div className="suggestion-desc">SQL vs NoSQL databases in simple terms</div>
                </button>

                <button
                  className="suggestion-card"
                  onClick={() => setInput('Draft a polite follow-up email after a job interview.')}
                >
                  <div className="suggestion-heading">Draft an email</div>
                  <div className="suggestion-desc">Polite post-interview follow-up email</div>
                </button>

                <button
                  className="suggestion-card"
                  onClick={() => setInput('Give me 3 practical tips for productive remote work.')}
                >
                  <div className="suggestion-heading">Quick tips</div>
                  <div className="suggestion-desc">3 practical habits for productive remote work</div>
                </button>
              </div>
            </div>
          ) : (
            <div className="messages-list">
              {messages.map((msg, index) => {
                const isLastAssistant =
                  isStreaming &&
                  index === messages.length - 1 &&
                  msg.role === 'assistant';
                return (
                  <MessageItem
                    key={index}
                    message={msg}
                    isStreaming={isLastAssistant}
                  />
                );
              })}
              <div ref={messagesEndRef} />
            </div>
          )}

          {error && (
            <div className="error-banner">
              <div className="error-icon">⚠️</div>
              <div className="error-text">{error}</div>
              <button className="error-dismiss" onClick={() => setError(null)}>✕</button>
            </div>
          )}
        </div>

        {/* Bottom Input Area */}
        <footer className="chat-footer">
          <ChatInput
            input={input}
            setInput={setInput}
            onSend={handleSend}
            isLoading={isStreaming}
            selectedTone={tone}
          />
        </footer>
      </main>
    </div>
  );
}

