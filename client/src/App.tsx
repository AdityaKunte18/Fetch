import { useState, useCallback, useRef, useEffect } from 'react';
import { useWebSocket } from './hooks/useWebSocket';
import { TopBar } from './components/TopBar';
import { ChatPanel } from './components/ChatPanel';
import { ResultsPanel } from './components/ResultsPanel';
import type { ChatMessage, AgentStatus, ResultData, OutboundMessage, InboundMessage } from './types';
import './App.css';

function App() {
  const [url, setUrl] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [results, setResults] = useState<ResultData[]>([]);
  const [agentStatus, setAgentStatus] = useState<AgentStatus>('idle');
  const [viewportFrame, setViewportFrame] = useState<string | null>(null);
  const urlRef = useRef(url);
  useEffect(() => {
    urlRef.current = url;
  }, [url]);

  const handleWebSocketMessage = useCallback((msg: InboundMessage) => {
    // Frame messages update the viewport preview, don't add to chat
    if (msg.type === 'frame') {
      setViewportFrame(msg.data);
      return;
    }

    // Status messages go to chat as agent messages
    if (msg.type === 'status' || msg.type === 'echo' || msg.type === 'error') {
      const agentMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'agent',
        content: msg.data,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, agentMsg]);
      setAgentStatus(msg.status ?? 'idle');
      return;
    }

    // Result messages go to both chat and results panel
    if (msg.type === 'result') {
      const agentMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'agent',
        content: 'Extraction complete. Results available in the panel.',
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, agentMsg]);

      setResults((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          content: msg.data,
          timestamp: Date.now(),
          url: urlRef.current,
        },
      ]);
      setAgentStatus(msg.status ?? 'done');
    }
  }, []);

  const { connectionStatus, sendMessage } = useWebSocket({
    onMessage: handleWebSocketMessage,
  });

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
        url: urlRef.current,
        instruction,
      };
      sendMessage(JSON.stringify(outbound));
    },
    [sendMessage],
  );

  const handleUrlSubmit = useCallback(() => {
    if (!urlRef.current.trim()) return;
    const sysMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'system',
      content: `Target URL set to ${urlRef.current}`,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, sysMsg]);
  }, []);

  return (
    <div className="app">
      <div className="app__top-bar">
        <TopBar
          url={url}
          onUrlChange={setUrl}
          onUrlSubmit={handleUrlSubmit}
          connectionStatus={connectionStatus}
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
