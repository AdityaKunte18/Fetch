import type { ConnectionStatus } from '../types';
import './TopBar.css';

interface TopBarProps {
  connectionStatus: ConnectionStatus;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
}

const statusLabels: Record<ConnectionStatus, string> = {
  connecting: 'Connecting',
  connected: 'Connected',
  disconnected: 'Disconnected',
};

export function TopBar({ connectionStatus, theme, onToggleTheme }: TopBarProps) {
  return (
    <header className="top-bar">
      <div className="top-bar__brand">
        <span className="top-bar__logo">F</span>
        <span className="top-bar__name">Fetch</span>
      </div>

      <div className="top-bar__actions">
        <button
          type="button"
          className="top-bar__theme-toggle"
          onClick={onToggleTheme}
          aria-pressed={theme === 'light'}
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
        >
          {theme === 'dark' ? 'Light mode' : 'Dark mode'}
        </button>
        <div className="top-bar__status">
          <span className={`top-bar__dot top-bar__dot--${connectionStatus}`} />
          <span className="top-bar__status-label">{statusLabels[connectionStatus]}</span>
        </div>
      </div>
    </header>
  );
}
