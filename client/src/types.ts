export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

export type AgentStatus = 'idle' | 'thinking' | 'scraping' | 'done' | 'error';

export interface ChatMessage {
  id: string;
  role: 'user' | 'agent' | 'system';
  content: string;
  timestamp: number;
}

export interface OutboundMessage {
  type: 'command';
  url: string;
  instruction: string;
}

export interface InboundMessage {
  type: 'echo' | 'status' | 'result' | 'error' | 'frame' | 'navigate';
  data: string;
  status?: AgentStatus;
  title?: string;
}

export interface ResultData {
  id: string;
  content: string;
  timestamp: number;
  url?: string;
}
