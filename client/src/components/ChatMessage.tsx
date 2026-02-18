import type { ChatMessage as ChatMessageType } from '../types';
import './ChatMessage.css';

interface ChatMessageProps {
  message: ChatMessageType;
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function ChatMessage({ message }: ChatMessageProps) {
  if (message.role === 'system') {
    return (
      <div className="chat-message chat-message--system">
        <span className="chat-message__system-text">{message.content}</span>
      </div>
    );
  }

  return (
    <div className={`chat-message chat-message--${message.role}`}>
      <div className="chat-message__avatar">
        {message.role === 'user' ? 'You' : 'F'}
      </div>
      <div className="chat-message__body">
        <div className="chat-message__content">{message.content}</div>
        <span className="chat-message__time">{formatTime(message.timestamp)}</span>
      </div>
    </div>
  );
}
