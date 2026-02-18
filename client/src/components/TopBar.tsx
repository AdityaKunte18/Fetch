import type { ConnectionStatus } from '../types';
import './TopBar.css';

interface TopBarProps {
  url: string;
  onUrlChange: (url: string) => void;
  onUrlSubmit: () => void;
  connectionStatus: ConnectionStatus;
}

const statusLabels: Record<ConnectionStatus, string> = {
  connecting: 'Connecting',
  connected: 'Connected',
  disconnected: 'Disconnected',
};

export function TopBar({ url, onUrlChange, onUrlSubmit, connectionStatus }: TopBarProps) {
  return (
    <header className="top-bar">
      <div className="top-bar__brand">
        <span className="top-bar__logo">F</span>
        <span className="top-bar__name">Fetch</span>
      </div>

      <div className="top-bar__url-bar">
        <span className="top-bar__url-icon" aria-hidden="true">&#x1F310;</span>
        <input
          type="url"
          className="top-bar__url-input"
          placeholder="Enter URL to scrape..."
          value={url}
          onChange={(e) => onUrlChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onUrlSubmit();
          }}
        />
      </div>

      <div className="top-bar__status">
        <span className={`top-bar__dot top-bar__dot--${connectionStatus}`} />
        <span className="top-bar__status-label">{statusLabels[connectionStatus]}</span>
      </div>
    </header>
  );
}
