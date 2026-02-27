import type { ConnectionStatus } from '../types';
import './TopBar.css';

interface TopBarProps {
  connectionStatus: ConnectionStatus;
}

const statusLabels: Record<ConnectionStatus, string> = {
  connecting: 'Connecting',
  connected: 'Connected',
  disconnected: 'Disconnected',
};

export function TopBar({ connectionStatus }: TopBarProps) {
  return (
    <header className="top-bar">
      <div className="top-bar__brand">
        <span className="top-bar__logo">F</span>
        <span className="top-bar__name">Fetch</span>
      </div>

      <div className="top-bar__status">
        <span className={`top-bar__dot top-bar__dot--${connectionStatus}`} />
        <span className="top-bar__status-label">{statusLabels[connectionStatus]}</span>
      </div>
    </header>
  );
}
