import { useState, useCallback, useEffect } from 'react';
import { useWebSocket } from './hooks/useWebSocket';
import { TopBar } from './components/TopBar';
import { ChatPanel } from './components/ChatPanel';
import { ResultsPanel } from './components/ResultsPanel';
import type { ChatMessage, AgentStatus, ResultData, OutboundMessage, InboundMessage } from './types';
import './App.css';

type Theme = 'dark' | 'light';

const THEME_STORAGE_KEY = 'fetch-theme';

function getInitialTheme(): Theme {
  if (typeof window === 'undefined') {
    return 'dark';
  }

  const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (storedTheme === 'dark' || storedTheme === 'light') {
    return storedTheme;
  }

  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [results, setResults] = useState<ResultData[]>([]);
  const [agentStatus, setAgentStatus] = useState<AgentStatus>('idle');
  const [viewportFrame, setViewportFrame] = useState<string | null>(null);
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  const handleWebSocketMessage = useCallback((msg: InboundMessage) => {
    if (msg.type === 'frame') {
      setViewportFrame(msg.data);
      return;
    }

    if (msg.type === 'status' || msg.type === 'echo' || msg.type === 'error') {
      const isStep = msg.type === 'status' && msg.status !== 'idle';
      const agentMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: isStep ? 'step' : 'agent',
        content: msg.data,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, agentMsg]);
      setAgentStatus(msg.status ?? 'idle');
      return;
    }

    if (msg.type === 'result') {
      const agentMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'agent',
        content: msg.data,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, agentMsg]);

      setResults((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          content: msg.data,
          timestamp: Date.now(),
        },
      ]);
      setAgentStatus(msg.status ?? 'done');
    }
  }, []);

  const { connectionStatus, sendMessage } = useWebSocket({
    onMessage: handleWebSocketMessage,
  });

  const handleToggleTheme = useCallback(() => {
    setTheme((currentTheme) => (currentTheme === 'dark' ? 'light' : 'dark'));
  }, []);

  const handleSendMessage = useCallback(
    (instruction: string) => {
      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: instruction,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setAgentStatus('thinking');

      const outbound: OutboundMessage = {
        type: 'command',
        instruction,
      };
      sendMessage(JSON.stringify(outbound));
    },
    [sendMessage],
  );

  return (
    <div className="app">
      <div className="app__top-bar">
        <TopBar
          connectionStatus={connectionStatus}
          theme={theme}
          onToggleTheme={handleToggleTheme}
        />
      </div>
      <div className="app__chat-panel">
        <ChatPanel
          messages={messages}
          agentStatus={agentStatus}
          onSendMessage={handleSendMessage}
        />
      </div>
      <div className="app__results-panel">
        <ResultsPanel
          results={results}
          agentStatus={agentStatus}
          viewportFrame={viewportFrame}
        />
      </div>
    </div>
  );
}

export default App;
