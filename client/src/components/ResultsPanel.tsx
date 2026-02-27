import { useState } from 'react';
import type { ResultData, AgentStatus } from '../types';
import './ResultsPanel.css';

type Tab = 'viewport' | 'results';

interface ResultsPanelProps {
  results: ResultData[];
  agentStatus: AgentStatus;
  viewportFrame: string | null;
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function ResultsPanel({ results, agentStatus, viewportFrame }: ResultsPanelProps) {
  const [activeTab, setActiveTab] = useState<Tab>('viewport');

  return (
    <section className="results-panel">
      <div className="results-panel__header">
        <div className="results-panel__tabs">
          <button
            className={`results-panel__tab ${activeTab === 'viewport' ? 'results-panel__tab--active' : ''}`}
            onClick={() => setActiveTab('viewport')}
          >
            Browser
          </button>
          <button
            className={`results-panel__tab ${activeTab === 'results' ? 'results-panel__tab--active' : ''}`}
            onClick={() => setActiveTab('results')}
          >
            Results
            {results.length > 0 && (
              <span className="results-panel__count">{results.length}</span>
            )}
          </button>
        </div>
      </div>

      <div className={`results-panel__content ${activeTab === 'results' ? 'results-panel__content--padded' : ''}`}>
        {activeTab === 'viewport' && (
          <div className="results-panel__viewport">
            <div className="results-panel__viewport-body">
              {viewportFrame ? (
                <img
                  className="results-panel__viewport-img"
                  src={`data:image/jpeg;base64,${viewportFrame}`}
                  alt="Browser viewport"
                />
              ) : (
                <div className="results-panel__empty">
                  <div className="results-panel__empty-icon">
                    <div className="results-panel__browser-frame">
                      <div className="results-panel__browser-bar" />
                    </div>
                  </div>
                  <p>
                    {agentStatus === 'scraping' || agentStatus === 'thinking'
                      ? 'Loading browser preview...'
                      : 'Browser preview will appear here'}
                  </p>
                  <p className="results-panel__hint">
                    Enter a URL and describe what to extract
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'results' && (
          <>
            {results.length === 0 ? (
              <div className="results-panel__empty">
                <p>No results yet</p>
                <p className="results-panel__hint">
                  Extracted data will appear here after scraping
                </p>
              </div>
            ) : (
              <div className="results-panel__list">
                {results.map((result) => (
                  <div key={result.id} className="results-panel__card">
                    <div className="results-panel__card-header">
                      <span className="results-panel__card-time">
                        {formatTime(result.timestamp)}
                      </span>
                    </div>
                    <pre className="results-panel__card-content">{result.content}</pre>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
