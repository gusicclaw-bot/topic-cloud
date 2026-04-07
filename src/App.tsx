import { useEffect, useMemo, useRef, useState } from 'react';
import { marked } from 'marked';

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
  parentId?: string;        // For branching: which chat this forked from
  branchPoint?: number;     // Message index where fork happened
  tags: string[];           // Auto-generated tags
  isArchived?: boolean;     // Soft delete
}

interface Settings {
  providerLabel: string;
  baseUrl: string;
  model: string;
  apiKey: string;
  braveApiKey: string;
  enableWebSearch: boolean;
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
  braveApiKey: '',
  enableWebSearch: false,
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
  const response = await fetch(`${settings.baseUrl}/v1/chat/completions`, {
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
      enableSearch: settings.enableWebSearch,
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
  const response = await fetch(`${settings.baseUrl}/v1/models`, {
    headers: settings.apiKey ? { Authorization: `Bearer ${settings.apiKey}` } : {},
  });
  return response.ok;
}

async function searchWeb(apiKey: string, query: string): Promise<string> {
  if (!apiKey) return '';
  
  try {
    const response = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=3`, {
      headers: {
        'Accept': 'application/json',
        'X-Subscription-Token': apiKey,
      },
    });
    
    if (!response.ok) return '';
    
    const data = await response.json();
    const results = data.web?.results || [];
    
    if (results.length === 0) return '';
    
    return results.map((r: { title: string; description: string; url: string }) => 
      `- ${r.title}: ${r.description} (${r.url})`
    ).join('\n');
  } catch {
    return '';
  }
}

// Tree View Types
interface TreeNode {
  chat: Chat;
  children: TreeNode[];
  depth: number;
  isExpanded: boolean;
}

// Build tree structure from flat chats
function buildChatTree(chats: Chat[]): TreeNode[] {
  const chatMap = new Map<string, Chat>();
  const childrenMap = new Map<string, string[]>();
  
  chats.forEach(chat => {
    chatMap.set(chat.id, chat);
    if (chat.parentId) {
      const siblings = childrenMap.get(chat.parentId) || [];
      siblings.push(chat.id);
      childrenMap.set(chat.parentId, siblings);
    }
  });
  
  const roots: TreeNode[] = [];
  const processed = new Set<string>();
  
  function buildNode(chatId: string, depth: number): TreeNode | null {
    if (processed.has(chatId)) return null;
    processed.add(chatId);
    
    const chat = chatMap.get(chatId);
    if (!chat) return null;
    
    const childIds = childrenMap.get(chatId) || [];
    const children = childIds
      .map(id => buildNode(id, depth + 1))
      .filter((n): n is TreeNode => n !== null);
    
    return {
      chat,
      children,
      depth,
      isExpanded: true,
    };
  }
  
  // Find roots (chats without parents, or parents not in current topic)
  chats.forEach(chat => {
    if (!chat.parentId || !chatMap.has(chat.parentId)) {
      const node = buildNode(chat.id, 0);
      if (node) roots.push(node);
    }
  });
  
  // Sort by date
  roots.sort((a, b) => new Date(b.chat.updatedAt).getTime() - new Date(a.chat.updatedAt).getTime());
  
  return roots;
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
  const [expandedChats, setExpandedChats] = useState<Set<string>>(new Set());
  const [showSidebar, setShowSidebar] = useState(true);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Toggle expand/collapse for tree nodes
  function toggleExpanded(chatId: string) {
    setExpandedChats(prev => {
      const next = new Set(prev);
      if (next.has(chatId)) {
        next.delete(chatId);
      } else {
        next.add(chatId);
      }
      return next;
    });
  }

  // Tree View Component
  function TreeView({ nodes, level = 0 }: { nodes: TreeNode[]; level?: number }) {
    return (
      <>
        {nodes.map(node => {
          const isExpanded = expandedChats.has(node.chat.id);
          const hasChildren = node.children.length > 0;
          const isActive = node.chat.id === activeChat;
          
          return (
            <div key={node.chat.id} className="tree-node">
              <div 
                className={`tree-item ${isActive ? 'active' : ''} ${node.chat.parentId ? 'is-branch' : ''}`}
                style={{ paddingLeft: `${level * 20 + 12}px` }}
                onClick={() => selectChat(node.chat.id)}
              >
                {/* Expand/collapse button */}
                {hasChildren && (
                  <button 
                    className="tree-toggle"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleExpanded(node.chat.id);
                    }}
                  >
                    {isExpanded ? '▼' : '▶'}
                  </button>
                )}
                {!hasChildren && <span className="tree-spacer" />}
                
                {/* Branch indicator */}
                {node.chat.parentId && <span className="tree-branch-icon">⟿</span>}
                
                {/* Title */}
                <span className="tree-title">{node.chat.title}</span>
                
                {/* Message count */}
                <span className="tree-count">{node.chat.messages.length}</span>
              </div>
              
              {/* Children */}
              {hasChildren && isExpanded && (
                <div className="tree-children">
                  <TreeView nodes={node.children} level={level + 1} />
                </div>
              )}
            </div>
          );
        })}
      </>
    );
  }

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
      tags: [],
    };
    
    setChats(prev => [newChat, ...prev]);
    setActiveChat(newChat.id);
  }

  function forkChat(chatId: string, messageIndex: number, newTitle?: string) {
    const sourceChat = chats.find(c => c.id === chatId);
    if (!sourceChat) return;

    // Create forked chat with messages up to branch point
    const forkedChat: Chat = {
      id: createId('chat'),
      topicId: sourceChat.topicId,
      title: newTitle || `${sourceChat.title} (fork)`,
      messages: sourceChat.messages.slice(0, messageIndex + 1),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      parentId: sourceChat.id,
      branchPoint: messageIndex,
      tags: [...sourceChat.tags],
    };

    setChats(prev => [forkedChat, ...prev]);
    setActiveChat(forkedChat.id);
    return forkedChat.id;
  }

  function mergeChats(targetChatId: string, sourceChatId: string) {
    const targetChat = chats.find(c => c.id === targetChatId);
    const sourceChat = chats.find(c => c.id === sourceChatId);
    if (!targetChat || !sourceChat) return;

    // Combine unique tags
    const mergedTags = [...new Set([...targetChat.tags, ...sourceChat.tags])];

    // Add merge marker message
    const mergeMessage: Message = {
      id: createId('msg'),
      role: 'assistant',
      text: `--- Merged from "${sourceChat.title}" ---\n\n${sourceChat.messages.map(m => `${m.role}: ${m.text}`).join('\n\n')}`,
      createdAt: new Date().toISOString(),
    };

    setChats(prev => prev.map(chat => {
      if (chat.id === targetChatId) {
        return {
          ...chat,
          messages: [...chat.messages, mergeMessage],
          tags: mergedTags,
          updatedAt: new Date().toISOString(),
        };
      }
      return chat;
    }));
  }

  async function autoTagChat(chatId: string) {
    const chat = chats.find(c => c.id === chatId);
    if (!chat || chat.messages.length === 0) return;

    // Simple keyword-based tagging for now
    const allText = chat.messages.map(m => m.text).join(' ').toLowerCase();
    const tags: string[] = [];

    // Extract potential tags from content
    if (allText.includes('code') || allText.includes('programming') || allText.includes('function')) {
      tags.push('coding');
    }
    if (allText.includes('idea') || allText.includes('concept') || allText.includes('think')) {
      tags.push('ideas');
    }
    if (allText.includes('plan') || allText.includes('schedule') || allText.includes('todo')) {
      tags.push('planning');
    }
    if (allText.includes('question') || allText.includes('how') || allText.includes('what')) {
      tags.push('questions');
    }
    if (allText.includes('bug') || allText.includes('error') || allText.includes('fix')) {
      tags.push('debugging');
    }

    // Add date-based tag
    const date = new Date(chat.createdAt);
    tags.push(date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));

    setChats(prev => prev.map(c => 
      c.id === chatId ? { ...c, tags: [...new Set([...c.tags, ...tags])] } : c
    ));
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
      // Auto web search if enabled
      let searchContext = '';
      if (settings.enableWebSearch && settings.braveApiKey) {
        const searchResults = await searchWeb(settings.braveApiKey, text);
        if (searchResults) {
          searchContext = `\n\nRecent web search results for context:\n${searchResults}`;
        }
      }

      const messages = [
        { role: 'system', content: `You are a helpful assistant. Current topic: ${currentTopic?.name}. Be concise and thoughtful.${searchContext}` },
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

  function updateSettings(key: keyof Settings, value: string | boolean) {
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
          {/* Chat Layout with Sidebar */}
          <div className="chat-layout">
            {/* Left Sidebar - Tree View */}
            <aside className={`chat-sidebar ${showSidebar ? 'open' : 'closed'}`}>
              <div className="sidebar-header">
                <div className="sidebar-title">
                  <h3>{currentTopic?.name || 'Conversations'}</h3>
                  <span className="chat-count">{topicChats.length}</span>
                </div>
                <div className="sidebar-actions">
                  <button 
                    className="btn-icon" 
                    onClick={createNewChat}
                    title="New conversation"
                  >
                    +
                  </button>
                  <button 
                    className="btn-icon"
                    onClick={() => setShowSidebar(false)}
                    title="Collapse sidebar"
                  >
                    ◀
                  </button>
                </div>
              </div>
              
              {/* Tree View */}
              <div className="tree-container">
                {topicChats.length === 0 ? (
                  <div className="tree-empty">
                    <p>No conversations yet</p>
                    <button className="btn-secondary" onClick={createNewChat}>
                      Start new chat
                    </button>
                  </div>
                ) : (
                  <TreeView nodes={buildChatTree(topicChats)} />
                )}
              </div>
            </aside>
            
            {/* Main Chat Area */}
            <main className="chat-main">
              {/* Collapsed sidebar toggle */}
              {!showSidebar && (
                <button 
                  className="sidebar-toggle"
                  onClick={() => setShowSidebar(true)}
                  title="Show sidebar"
                >
                  ▶
                </button>
              )}
              
              {/* Chat Header */}
              <div className="chat-header-compact">
                <button className="chat-header-back" onClick={goBack}>
                  ←
                </button>
                <div className="chat-header-info">
                  <h2>{currentTopic?.name || 'Chat'}</h2>
                </div>
                <div className="chat-actions">
                  <button className="btn-secondary" onClick={createNewChat}>
                    New chat
                  </button>
                </div>
              </div>
              
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
                
                {currentChat.messages.map((msg, index) => (
                  <div key={msg.id} className={`message ${msg.role}`}>
                    <div 
                      className="message-bubble markdown-content"
                      dangerouslySetInnerHTML={{ 
                        __html: marked.parse(msg.text, { breaks: true, gfm: true }) as string 
                      }}
                    />
                    {msg.error && <div className="message-error">{msg.error}</div>}
                    <div className="message-actions">
                      <button 
                        className="btn-fork" 
                        onClick={() => {
                          const title = prompt('Name this branch:', `${currentChat.title} (branch ${index + 1})`);
                          if (title) {
                            forkChat(currentChat.id, index, title);
                          }
                        }}
                        title="Fork conversation from here"
                      >
                        Fork
                      </button>
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
              <p>Select a conversation from the sidebar or start a new one</p>
            </div>
          )}
            </main>
          </div>
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
            <h2>Web Search</h2>
            <p style={{ marginBottom: 16 }}>Automatically search the web for context when you ask questions.</p>
            
            <div className="form-group">
              <label className="toggle-label">
                <input
                  type="checkbox"
                  checked={settings.enableWebSearch}
                  onChange={e => updateSettings('enableWebSearch', e.target.checked)}
                />
                Enable auto web search
              </label>
            </div>
            
            {settings.enableWebSearch && (
              <div className="form-group">
                <label>Brave Search API Key</label>
                <input
                  type="password"
                  value={settings.braveApiKey}
                  onChange={e => updateSettings('braveApiKey', e.target.value)}
                  placeholder="Get free key at brave.com/search/api"
                />
                <small>Free tier: 2000 queries/month. <a href="https://brave.com/search/api" target="_blank" rel="noopener">Get API key</a></small>
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
