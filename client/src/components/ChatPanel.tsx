import { useState, useRef, useEffect } from 'react';
import type { ChatMessage as ChatMessageType, AgentStatus } from '../types';
import { ChatMessage } from './ChatMessage';
import { StatusIndicator } from './StatusIndicator';
import './ChatPanel.css';

interface ChatPanelProps {
  messages: ChatMessageType[];
  agentStatus: AgentStatus;
  onSendMessage: (message: string) => void;
}

export function ChatPanel({ messages, agentStatus, onSendMessage }: ChatPanelProps) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || agentStatus === 'scraping') return;
    onSendMessage(trimmed);
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <section className="chat-panel">
      <div className="chat-panel__header">
        <h2 className="chat-panel__title">Agent</h2>
        <StatusIndicator status={agentStatus} />
      </div>

      <div className="chat-panel__messages">
        {messages.length === 0 && (
          <div className="chat-panel__empty">
            <p>No messages yet.</p>
            <p className="chat-panel__hint">Enter a URL above and describe what you want to extract.</p>
          </div>
        )}
        {messages.map((msg) => (
          <ChatMessage key={msg.id} message={msg} />
        ))}
        <div ref={messagesEndRef} />
      </div>

      <form className="chat-panel__input-area" onSubmit={handleSubmit}>
        <textarea
          className="chat-panel__textarea"
          placeholder="Describe what to scrape..."
          rows={1}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button
          type="submit"
          className="chat-panel__send-btn"
          disabled={!input.trim() || agentStatus === 'scraping'}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M2 8L14 2L8 14L7 9L2 8Z"
              fill="currentColor"
            />
          </svg>
        </button>
      </form>
    </section>
  );
}
