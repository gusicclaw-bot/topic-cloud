import { useEffect, useMemo, useRef, useState } from 'react';

// Types
type TopicId = 'golf' | 'football' | 'gaming' | 'work' | 'ideas' | 'learning';
type View = 'landing' | 'chat' | 'settings';
type ModelStatus = 'ready' | 'testing' | 'error';

interface Topic {
  id: TopicId;
  name: string;
  description: string;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  createdAt: string;
  error?: string;
}

interface Chat {
  id: string;
  topicId: TopicId;
  title: string;
  messages: Message[];
  createdAt: string;
  updatedAt: string;
}

interface Settings {
  providerLabel: string;
  baseUrl: string;
  model: string;
  apiKey: string;
}

// Constants
const TOPICS: Topic[] = [
  { id: 'golf', name: 'Golf', description: 'Swing thoughts and practice notes' },
  { id: 'football', name: 'Football', description: 'Matches, tactics, and analysis' },
  { id: 'gaming', name: 'Gaming', description: 'What to play next' },
  { id: 'work', name: 'Work', description: 'Projects and decisions' },
  { id: 'ideas', name: 'Ideas', description: 'Loose thoughts and sparks' },
  { id: 'learning', name: 'Learning', description: 'Notes and insights' },
];

const DEFAULT_SETTINGS: Settings = {
  providerLabel: 'Local Model',
  baseUrl: 'http://localhost:1234/v1',
  model: 'default',
  apiKey: '',
};

// Utilities
function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatTime(dateString: string) {
  return new Date(dateString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatRelative(dateString: string) {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'yesterday';
  return `${diffDays}d ago`;
}

// API Functions
async function sendToModel(settings: Settings, messages: { role: string; content: string }[]) {
  const response = await fetch(`${settings.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(settings.apiKey && { Authorization: `Bearer ${settings.apiKey}` }),
    },
    body: JSON.stringify({
      model: settings.model,
      messages,
      temperature: 0.7,
      max_tokens: 1000,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error || `HTTP ${response.status}`);
  }

  const data = await response.json();
  return data.choices[0]?.message?.content || 'No response';
}

async function testConnection(settings: Settings) {
  const response = await fetch(`${settings.baseUrl}/models`, {
    headers: settings.apiKey ? { Authorization: `Bearer ${settings.apiKey}` } : {},
  });
  return response.ok;
}

// Main App
function App() {
  // State
  const [view, setView] = useState<View>('landing');
  const [activeTopic, setActiveTopic] = useState<TopicId | null>(null);
  const [activeChat, setActiveChat] = useState<string | null>(null);
  const [chats, setChats] = useState<Chat[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [modelStatus, setModelStatus] = useState<ModelStatus>('ready');
  const [testResult, setTestResult] = useState<string | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Derived state
  const currentTopic = useMemo(() => 
    TOPICS.find(t => t.id === activeTopic),
    [activeTopic]
  );

  const currentChat = useMemo(() =>
    chats.find(c => c.id === activeChat),
    [chats, activeChat]
  );

  const topicChats = useMemo(() =>
    chats.filter(c => c.topicId === activeTopic).sort((a, b) => 
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    ),
    [chats, activeTopic]
  );

  // Effects
  useEffect(() => {
    const saved = localStorage.getItem('topic-cloud-v1');
    if (saved) {
      try {
        const data = JSON.parse(saved);
        setChats(data.chats || []);
        setSettings({ ...DEFAULT_SETTINGS, ...data.settings });
      } catch {
        // ignore
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('topic-cloud-v1', JSON.stringify({ chats, settings }));
  }, [chats, settings]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [currentChat?.messages]);

  // Actions
  function startChat(topicId: TopicId) {
    setActiveTopic(topicId);
    setActiveChat(null);
    setView('chat');
  }

  function selectChat(chatId: string) {
    setActiveChat(chatId);
    const chat = chats.find(c => c.id === chatId);
    if (chat) {
      setActiveTopic(chat.topicId);
    }
  }

  function createNewChat() {
    if (!activeTopic) return;
    
    const newChat: Chat = {
      id: createId('chat'),
      topicId: activeTopic,
      title: 'New conversation',
      messages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    
    setChats(prev => [newChat, ...prev]);
    setActiveChat(newChat.id);
  }

  async function sendMessage() {
    if (!input.trim() || !activeChat || isSending) return;

    const text = input.trim();
    setInput('');
    setIsSending(true);
    setModelStatus('testing');

    const userMessage: Message = {
      id: createId('msg'),
      role: 'user',
      text,
      createdAt: new Date().toISOString(),
    };

    // Update chat with user message
    setChats(prev => prev.map(chat => {
      if (chat.id !== activeChat) return chat;
      return {
        ...chat,
        messages: [...chat.messages, userMessage],
        updatedAt: new Date().toISOString(),
      };
    }));

    try {
      const messages = [
        { role: 'system', content: `You are a helpful assistant. Current topic: ${currentTopic?.name}. Be concise and thoughtful.` },
        ...currentChat!.messages.map(m => ({ role: m.role, content: m.text })),
        { role: 'user', content: text },
      ];

      const response = await sendToModel(settings, messages);

      const assistantMessage: Message = {
        id: createId('msg'),
        role: 'assistant',
        text: response,
        createdAt: new Date().toISOString(),
      };

      setChats(prev => prev.map(chat => {
        if (chat.id !== activeChat) return chat;
        return {
          ...chat,
          messages: [...chat.messages, assistantMessage],
          updatedAt: new Date().toISOString(),
        };
      }));

      setModelStatus('ready');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to send';
      
      const errorMsg: Message = {
        id: createId('msg'),
        role: 'assistant',
        text: 'Sorry, I could not process that request.',
        createdAt: new Date().toISOString(),
        error: errorMessage,
      };

      setChats(prev => prev.map(chat => {
        if (chat.id !== activeChat) return chat;
        return {
          ...chat,
          messages: [...chat.messages, errorMsg],
          updatedAt: new Date().toISOString(),
        };
      }));

      setModelStatus('error');
    } finally {
      setIsSending(false);
    }
  }

  async function runTest() {
    setTestResult(null);
    setModelStatus('testing');
    
    try {
      const ok = await testConnection(settings);
      if (ok) {
        setTestResult('Connection successful');
        setModelStatus('ready');
      } else {
        setTestResult('Connection failed');
        setModelStatus('error');
      }
    } catch {
      setTestResult('Connection failed - check your settings');
      setModelStatus('error');
    }
  }

  function updateSettings(key: keyof Settings, value: string) {
    setSettings(prev => ({ ...prev, [key]: value }));
    setTestResult(null);
    setModelStatus('ready');
  }

  function goBack() {
    setView('landing');
    setActiveTopic(null);
    setActiveChat(null);
  }

  // Render
  return (
    <div className="shell">
      {/* Navigation Rail */}
      <nav className="nav-rail">
        <div className="nav-logo">TC</div>
        
        <button 
          className={`nav-item ${view === 'landing' ? 'active' : ''}`}
          onClick={() => setView('landing')}
          title="Home"
        >
          ◆
        </button>
        
        <button 
          className={`nav-item ${view === 'chat' ? 'active' : ''}`}
          onClick={() => activeTopic ? setView('chat') : setView('landing')}
          title="Chat"
        >
          ◇
        </button>
        
        <button 
          className={`nav-item ${view === 'settings' ? 'active' : ''}`}
          onClick={() => setView('settings')}
          title="Settings"
        >
          ○
        </button>
      </nav>

      {/* Main Content */}
      <main className="main-content">
        {/* Landing View */}
        <div className={`view landing-view ${view === 'landing' ? 'active' : ''}`}>
          <div className="landing-header">
            <h1>Topic Cloud</h1>
            <p>Organize your thoughts by topic. Start a conversation in any room.</p>
          </div>
          
          <div className="topics-grid">
            {TOPICS.map(topic => {
              const count = chats.filter(c => c.topicId === topic.id).length;
              return (
                <button 
                  key={topic.id} 
                  className="topic-card"
                  onClick={() => startChat(topic.id)}
                >
                  <h3>{topic.name}</h3>
                  <p>{topic.description}</p>
                  <div className="count">{count} {count === 1 ? 'chat' : 'chats'}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Chat View */}
        <div className={`view chat-view ${view === 'chat' ? 'active' : ''}`}>
          {/* Chat Header */}
          <div className="chat-header">
            <button className="chat-header-back" onClick={goBack}>
              ←
            </button>
            <div className="chat-header-info">
              <h2>{currentTopic?.name || 'Chat'}</h2>
              <p>{currentTopic?.description}</p>
            </div>
            <div className="chat-actions">
              <button className="btn-secondary" onClick={createNewChat}>
                New chat
              </button>
            </div>
          </div>

          {/* Thread Selection */}
          {topicChats.length > 0 && (
            <div className="threads-list">
              {topicChats.map(chat => (
                <button 
                  key={chat.id}
                  className={`thread-item ${chat.id === activeChat ? 'active' : ''}`}
                  onClick={() => selectChat(chat.id)}
                >
                  <h4>{chat.title}</h4>
                  <p>{chat.messages[chat.messages.length - 1]?.text.slice(0, 60) || 'No messages yet'}...</p>
                  <small>{formatRelative(chat.updatedAt)}</small>
                </button>
              ))}
            </div>
          )}

          {/* Messages */}
          {currentChat ? (
            <>
              <div className="chat-messages">
                {currentChat.messages.length === 0 && (
                  <div className="empty-state">
                    <h3>Start a conversation</h3>
                    <p>Type your first message below</p>
                  </div>
                )}
                
                {currentChat.messages.map(msg => (
                  <div key={msg.id} className={`message ${msg.role}`}>
                    <div className="message-bubble">
                      {msg.text}
                      {msg.error && <div className="message-error">{msg.error}</div>}
                    </div>
                    <div className="message-meta">{formatTime(msg.createdAt)}</div>
                  </div>
                ))}
                
                {isSending && (
                  <div className="message assistant message-pending">
                    <div className="message-bubble">Thinking...</div>
                  </div>
                )}
                
                <div ref={messagesEndRef} />
              </div>

              {/* Composer */}
              <div className="composer">
                <div className="composer-status">
                  <span className={`status-indicator ${modelStatus}`} />
                  <span>
                    {modelStatus === 'ready' && 'Ready'}
                    {modelStatus === 'testing' && 'Sending...'}
                    {modelStatus === 'error' && 'Connection error'}
                  </span>
                </div>
                
                <div className="composer-input-area">
                  <textarea
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        sendMessage();
                      }
                    }}
                    placeholder="Type your message..."
                    rows={1}
                  />
                  <button 
                    className="btn-send"
                    onClick={sendMessage}
                    disabled={!input.trim() || isSending}
                  >
                    ↑
                  </button>
                </div>
                
                <div className="composer-footer">
                  <small>Press Enter to send, Shift+Enter for new line</small>
                  <div className="composer-actions">
                    <button onClick={() => {}} disabled>Clear</button>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="empty-state">
              <h3>No chat selected</h3>
              <p>Click "New chat" to start</p>
            </div>
          )}
        </div>

        {/* Settings View */}
        <div className={`view settings-view ${view === 'settings' ? 'active' : ''}`}>
          <div className="settings-section">
            <h2>Model Settings</h2>
            
            <div className="form-group">
              <label>Base URL</label>
              <input
                type="text"
                value={settings.baseUrl}
                onChange={e => updateSettings('baseUrl', e.target.value)}
                placeholder="http://localhost:1234/v1"
              />
              <small>Your local model or API endpoint</small>
            </div>
            
            <div className="form-group">
              <label>Model Name</label>
              <input
                type="text"
                value={settings.model}
                onChange={e => updateSettings('model', e.target.value)}
                placeholder="default"
              />
            </div>
            
            <div className="form-group">
              <label>API Key (optional)</label>
              <input
                type="password"
                value={settings.apiKey}
                onChange={e => updateSettings('apiKey', e.target.value)}
                placeholder="sk-..."
              />
            </div>
            
            <button className="btn-primary" onClick={runTest} disabled={modelStatus === 'testing'}>
              {modelStatus === 'testing' ? 'Testing...' : 'Test Connection'}
            </button>
            
            {testResult && (
              <div className={`connection-test-result ${testResult.includes('success') ? 'success' : 'error'}`}>
                {testResult}
              </div>
            )}
          </div>
          
          <div className="settings-section">
            <h2>Data</h2>
            <p style={{ marginBottom: 16 }}>All data is stored locally in your browser.</p>
            <button 
              className="btn-danger"
              onClick={() => {
                if (confirm('Clear all chats? This cannot be undone.')) {
                  setChats([]);
                  localStorage.removeItem('topic-cloud-v1');
                }
              }}
            >
              Clear All Data
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
