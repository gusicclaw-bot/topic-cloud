import { useEffect, useMemo, useRef, useState } from 'react';
import { marked } from 'marked';
import './styles.css';
import type { TopicId, View, ModelStatus, ModalState, Topic, Message, Chat, Settings, InterviewMessage, InterviewSpeaker, AudienceQuestion } from './types';
import { auth, chatApi } from './pocketbase';

// Constants
const DEFAULT_TOPICS: Topic[] = [
  { id: 'explore', name: 'Explore', description: 'Explore new ideas and research', icon: 'explore' },
  { id: 'learn', name: 'Learn', description: 'Learn new stuff and gain knowledge', icon: 'school' },
  { id: 'create', name: 'Create', description: 'Ideation and brainstorming', icon: 'lightbulb' },
  { id: 'refine', name: 'Refine', description: 'Improve and polish your work', icon: 'tune' },
  { id: 'review', name: 'Review', description: 'Revisit and reflect on topics', icon: 'replay' },
  { id: 'archive', name: 'Archive', description: 'Completed and parked items', icon: 'inventory_2' },
];

const DEFAULT_SETTINGS: Settings = {
  providerLabel: 'Local Model',
  baseUrl: 'http://localhost:1234/v1',
  model: 'default',
  apiKey: '',
  braveApiKey: '',
  enableWebSearch: false,
  hostBaseUrl: '',
  expertBaseUrl: '',
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
const PROXY_URL = 'http://localhost:3001';

async function sendToModel(settings: Settings, messages: { role: string; content: string }[]) {
  // Route through proxy to avoid CORS
  const response = await fetch(`${PROXY_URL}/llm/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-LLM-Base-URL': settings.baseUrl,
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
  try {
    const response = await fetch(`${PROXY_URL}/proxy?url=${encodeURIComponent(`${settings.baseUrl}/models`)}`, {
      headers: settings.apiKey ? { Authorization: `Bearer ${settings.apiKey}` } : {},
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function searchWeb(apiKey: string, query: string): Promise<string> {
  if (!apiKey) return '';

  try {
    // Use proxy to hide API key and avoid CORS
    const response = await fetch(`${PROXY_URL}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, apiKey }),
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
}

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
    
    return { chat, children, depth };
  }
  
  chats.forEach(chat => {
    if (!chat.parentId || !chatMap.has(chat.parentId)) {
      const node = buildNode(chat.id, 0);
      if (node) roots.push(node);
    }
  });
  
  roots.sort((a, b) => new Date(b.chat.updatedAt).getTime() - new Date(a.chat.updatedAt).getTime());
  
  return roots;
}

// Terminal Log Component
function TerminalLog({ modelStatus, lastAction }: { modelStatus: ModelStatus; lastAction: string }) {
  const [logs, setLogs] = useState<string[]>([
    'TOPIC_CLOUD_V2_INIT...',
    '> Synthetic Architect system loaded',
    '> Context engine: online',
    '> Neural mesh: synchronized',
  ]);
  
  useEffect(() => {
    if (lastAction) {
      setLogs(prev => [...prev.slice(-4), `> ${lastAction}`]);
    }
  }, [lastAction]);
  
  return (
    <div className="fixed right-6 bottom-6 w-80 bg-black/60 backdrop-blur-sm p-4 font-mono text-2xs text-synth-text-secondary border border-synth-border-subtle z-50 pointer-events-none">
      <div className="text-synth-cyan mb-2">ARCHITECT_SYSTEM_V2_INIT...</div>
      {logs.map((log, i) => (
        <div key={i} className={log.includes('>') ? '' : 'text-synth-text-muted'}>{log}</div>
      ))}
      <div className="text-synth-cyan animate-terminal-blink mt-1">_</div>
    </div>
  );
}

// Modal Component
function Modal({ modal, onClose }: { modal: ModalState; onClose: () => void }) {
  const [inputValue, setInputValue] = useState(modal.defaultValue || '');
  
  useEffect(() => {
    setInputValue(modal.defaultValue || '');
  }, [modal.defaultValue]);
  
  if (!modal.isOpen) return null;
  
  const handleConfirm = () => {
    if (modal.type === 'prompt') {
      modal.onConfirm?.(inputValue);
    } else {
      modal.onConfirm?.();
    }
    onClose();
  };
  
  const handleCancel = () => {
    modal.onCancel?.();
    onClose();
  };
  
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={handleCancel}
      />
      
      {/* Modal */}
      <div className="relative bg-synth-surface border border-synth-border w-full max-w-md m-4 shadow-2xl">
        {/* Traveling border glow effect */}
        <div className="modal-border-light top" />
        <div className="modal-border-light right" />
        <div className="modal-border-light bottom" />
        <div className="modal-border-light left" />
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-synth-border-subtle bg-synth-surface-high">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-synth-cyan">
              {modal.type === 'confirm' ? 'help' : modal.type === 'prompt' ? 'edit' : 'info'}
            </span>
            <h3 className="font-headline text-sm font-bold tracking-wider uppercase">
              {modal.title}
            </h3>
          </div>
          <button 
            onClick={handleCancel}
            className="text-synth-text-secondary hover:text-synth-text transition-colors"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        
        {/* Content */}
        <div className="p-6">
          <p className="text-synth-text-secondary text-sm leading-relaxed mb-4">
            {modal.message}
          </p>
          
          {modal.type === 'prompt' && (
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleConfirm()}
              className="w-full bg-synth-bg border border-synth-border text-synth-text px-4 py-3 text-sm focus:outline-none focus:border-synth-cyan placeholder-synth-text-muted"
              placeholder="Enter value..."
              autoFocus
            />
          )}
        </div>
        
        {/* Actions */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-synth-border-subtle bg-synth-surface-high/50">
          {modal.type !== 'alert' && (
            <button 
              onClick={handleCancel}
              className="btn-synth-secondary"
            >
              {modal.cancelLabel || 'CANCEL'}
            </button>
          )}
          <button 
            onClick={handleConfirm}
            className={`btn-synth-primary ${modal.type === 'confirm' ? 'border-synth-error hover:bg-synth-error/20' : ''}`}
          >
            {modal.confirmLabel || (modal.type === 'prompt' ? 'CONFIRM' : 'OK')}
          </button>
        </div>
      </div>
    </div>
  );
}

// Main App
function App() {
  // Auth state
  const [isAuthenticated, setIsAuthenticated] = useState(auth.isValid());
  const [isLoadingChats, setIsLoadingChats] = useState(false);

  // App state
  const [view, setView] = useState<View>('landing');
  const [activeTopic, setActiveTopic] = useState<TopicId | null>(null);
  const [activeChat, setActiveChat] = useState<string | null>(null);
  const [chats, setChats] = useState<Chat[]>([]);
  const [topics, setTopics] = useState<Topic[]>(DEFAULT_TOPICS);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [modelStatus, setModelStatus] = useState<ModelStatus>('ready');
  const [testResult, setTestResult] = useState<string | null>(null);
  const [expandedChats, setExpandedChats] = useState<Set<string>>(new Set());
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [lastAction, setLastAction] = useState('');
  const [modal, setModal] = useState<ModalState>({ isOpen: false, type: 'alert', title: '', message: '' });
  
  // Chat selection & merge state
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedChats, setSelectedChats] = useState<Set<string>>(new Set());
  const [mergePreview, setMergePreview] = useState<{
    isOpen: boolean;
    summary: string;
    sourceChats: Chat[];
    isGenerating: boolean;
  }>({ isOpen: false, summary: '', sourceChats: [], isGenerating: false });

  // Search state
  const [searchMode, setSearchMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Chat[] | null>(null);
  const [searchFilters, setSearchFilters] = useState({
    dateFrom: '',
    dateTo: '',
    tags: [] as string[],
  });

  // Topic management state
  const [topicModal, setTopicModal] = useState<{
    isOpen: boolean;
    mode: 'add' | 'move' | 'remove';
    targetTopic?: Topic;
    chatToMove?: Chat;
  }>({ isOpen: false, mode: 'add' });

  // Archive state
  const [showArchived, setShowArchived] = useState(false);

  // Sort state
  type SortOption = 'newest' | 'oldest' | 'az' | 'za';
  const [sortOption, setSortOption] = useState<SortOption>('newest');

  // Rename state
  const [editingTitle, setEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState('');

  // Quote selection state
  const [quoteSelection, setQuoteSelection] = useState<{ text: string; x: number; y: number } | null>(null);

  // Interview state
  const [interview, setInterview] = useState({
    isActive: false,
    topic: '',
    hostModel: 'qwen3.5-9b',
    expertModel: 'qwen3.5-35b-a3b',
    messages: [] as InterviewMessage[],
    audienceQuestions: [] as AudienceQuestion[],
    handRaised: false,
    userQuestion: '',
    userGuidance: '',
    isRunning: false,
    turnCount: 0,
    lastSpeaker: 'host' as InterviewSpeaker,
    isConversational: false,
    conversationalPartner: 'host' as 'host' | 'expert',
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Modal helpers
  const showConfirm = (title: string, message: string, onConfirm: () => void, onCancel?: () => void) => {
    setModal({
      isOpen: true,
      type: 'confirm',
      title,
      message,
      confirmLabel: 'CONFIRM',
      cancelLabel: 'CANCEL',
      onConfirm,
      onCancel: onCancel || (() => setModal(m => ({ ...m, isOpen: false }))),
    });
  };
  
  const showPrompt = (title: string, message: string, defaultValue: string, onConfirm: (value: string) => void, onCancel?: () => void) => {
    setModal({
      isOpen: true,
      type: 'prompt',
      title,
      message,
      defaultValue,
      confirmLabel: 'CONFIRM',
      cancelLabel: 'CANCEL',
      onConfirm: (value) => onConfirm(value || ''),
      onCancel: onCancel || (() => setModal(m => ({ ...m, isOpen: false }))),
    });
  };
  
  const showAlert = (title: string, message: string) => {
    setModal({
      isOpen: true,
      type: 'alert',
      title,
      message,
      confirmLabel: 'OK',
      onConfirm: () => setModal(m => ({ ...m, isOpen: false })),
    });
  };
  
  const closeModal = () => {
    setModal(m => ({ ...m, isOpen: false }));
  };

  // Auth View Component
  function AuthView({ onLogin }: { onLogin: () => void }) {
    const [isLogin, setIsLogin] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [username, setUsername] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      setError('');
      setIsLoading(true);

      try {
        if (isLogin) {
          await auth.login(email, password);
        } else {
          await auth.signUp(email, password, username);
          await auth.login(email, password);
        }
        onLogin();
      } catch (err: any) {
        setError(err.message || 'Authentication failed');
      } finally {
        setIsLoading(false);
      }
    };

    return (
      <div className="flex-1 flex flex-col relative overflow-hidden">
        {/* Grid Background */}
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none bg-grid" />

        <div className="flex-1 flex items-center justify-center p-6 relative z-10">
          <div className="relative bg-synth-surface border border-synth-border w-full max-w-md m-4 shadow-2xl">
            {/* Traveling border glow effect */}
            <div className="modal-border-light top" />
            <div className="modal-border-light right" />
            <div className="modal-border-light bottom" />
            <div className="modal-border-light left" />

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-synth-border-subtle bg-synth-surface-high">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-synth-cyan">
                  {isLogin ? 'login' : 'person_add'}
                </span>
                <h3 className="font-headline text-sm font-bold tracking-wider uppercase">
                  {isLogin ? 'SYSTEM_LOGIN' : 'CREATE_ACCOUNT'}
                </h3>
              </div>
            </div>

            {/* Content */}
            <div className="p-6">
              <form onSubmit={handleSubmit} className="space-y-4">
                {!isLogin && (
                  <div>
                    <label className="block text-2xs text-synth-text-secondary uppercase tracking-wider mb-2">
                      Username
                    </label>
                    <input
                      type="text"
                      placeholder="Enter username"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="input-synth"
                      required={!isLogin}
                    />
                  </div>
                )}

                <div>
                  <label className="block text-2xs text-synth-text-secondary uppercase tracking-wider mb-2">
                    Email
                  </label>
                  <input
                    type="email"
                    placeholder="Enter email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="input-synth"
                    required
                  />
                </div>

                <div>
                  <label className="block text-2xs text-synth-text-secondary uppercase tracking-wider mb-2">
                    Password
                  </label>
                  <input
                    type="password"
                    placeholder="Enter password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="input-synth"
                    required
                  />
                </div>

                {error && (
                  <div className="p-3 bg-synth-error/20 border border-synth-error text-synth-error-text text-xs">
                    ERROR: {error}
                  </div>
                )}

                <button
                  type="submit"
                  className="btn-synth-primary w-full justify-center"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <span className="animate-pulse">AUTHENTICATING...</span>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-sm">
                        {isLogin ? 'login' : 'person_add'}
                      </span>
                      {isLogin ? 'LOGIN' : 'CREATE_ACCOUNT'}
                    </>
                  )}
                </button>
              </form>

              <button
                onClick={() => {
                  setIsLogin(!isLogin);
                  setError('');
                }}
                className="btn-synth-ghost w-full mt-4"
              >
                {isLogin ? 'Need account? Register' : 'Have account? Login'}
              </button>
            </div>

            {/* Footer info */}
            <div className="px-6 py-3 border-t border-synth-border-subtle bg-synth-surface-high/50">
              <p className="text-2xs text-synth-text-muted text-center font-mono">
                SECURE_CONNECTION // POCKETBASE_AUTH
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Detect mobile
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth <= 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Handle text selection for quote
  useEffect(() => {
    const handleMouseUp = () => {
      // Small delay to ensure selection is complete
      setTimeout(handleTextSelection, 10);
    };
    
    document.addEventListener('mouseup', handleMouseUp);
    return () => document.removeEventListener('mouseup', handleMouseUp);
  }, [handleTextSelection]);

  // Toggle expand for tree
  function toggleExpanded(chatId: string) {
    setExpandedChats(prev => {
      const next = new Set(prev);
      if (next.has(chatId)) next.delete(chatId);
      else next.add(chatId);
      return next;
    });
  }

  // Tree View Component
  function TreeView({ nodes, level = 0 }: { nodes: TreeNode[]; level?: number }) {
    const toggleChatSelection = (chatId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      setSelectedChats(prev => {
        const newSet = new Set(prev);
        if (newSet.has(chatId)) {
          newSet.delete(chatId);
        } else {
          newSet.add(chatId);
        }
        return newSet;
      });
    };

    return (
      <>
        {nodes.map(node => {
          const isExpanded = expandedChats.has(node.chat.id);
          const hasChildren = node.children.length > 0;
          const isActive = node.chat.id === activeChat;
          const isSelected = selectedChats.has(node.chat.id);

          return (
            <div key={node.chat.id}>
              <div
                className={`tree-item ${isActive ? 'tree-item-active' : ''} ${node.chat.parentId ? 'tree-item-branch' : ''} ${isSelected ? 'tree-item-selected' : ''}`}
                style={{ paddingLeft: `${level * 16 + 16}px` }}
                onClick={() => !selectionMode && selectChat(node.chat.id)}
              >
                {selectionMode && (
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={(e) => toggleChatSelection(node.chat.id, e as any)}
                    className="mr-2 accent-synth-cyan"
                  />
                )}

                {hasChildren && !selectionMode && (
                  <button
                    className="w-4 h-4 flex items-center justify-center text-synth-text-muted hover:text-synth-text"
                    onClick={(e) => { e.stopPropagation(); toggleExpanded(node.chat.id); }}
                  >
                    <span className="material-symbols-outlined text-xs">
                      {isExpanded ? 'expand_more' : 'chevron_right'}
                    </span>
                  </button>
                )}
                {(!hasChildren || selectionMode) && <span className="w-4" />}

                {node.chat.parentId && (
                  <span className="material-symbols-outlined text-xs text-synth-cyan">alt_route</span>
                )}

                <span className="flex-1 text-xs truncate">{node.chat.title}</span>

                <span className="text-2xs px-1.5 py-0.5 bg-synth-surface-highest text-synth-text-muted rounded">
                  {node.chat.messages.length}
                </span>
              </div>

              {hasChildren && isExpanded && (
                <div className="border-l border-synth-border ml-5">
                  <TreeView nodes={node.children} level={level + 1} />
                </div>
              )}
            </div>
          );
        })}
      </>
    );
  }

  // Merge functions
  async function generateMergeSummary(sourceChats: Chat[]): Promise<string> {
    if (sourceChats.length < 2) return '';

    // Build conversation summaries for AI
    const chatSummaries = sourceChats.map((chat, idx) => {
      const messageTexts = chat.messages.map(m => `${m.role}: ${m.text}`).join('\n');
      return `CHAT ${idx + 1} - ${chat.title}:\n${messageTexts}`;
    }).join('\n\n---\n\n');

    const systemPrompt = `You are a helpful assistant that summarizes and synthesizes multiple conversation threads into a coherent overview. 
Identify the key themes, important information, and main takeaways from each conversation.
Then provide a brief synthesis that captures the essence of all conversations combined.
Keep it concise but informative (3-5 paragraphs max).`;

    try {
      const response = await sendToModel(settings, [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Please analyze and synthesize these ${sourceChats.length} conversation threads:\n\n${chatSummaries}\n\nProvide a synthesis that captures the key points from all conversations, organized by theme or topic. End with an invitation to continue the discussion.` }
      ]);

      return response;
    } catch (error) {
      console.error('Failed to generate merge summary:', error);
      return `**Merged Conversations**\n\n${sourceChats.map(c => `- ${c.title} (${c.messages.length} messages)`).join('\n')}\n\n*Unable to generate AI summary. You can continue the conversation here.*`;
    }
  }

  async function openMergePreview() {
    if (selectedChats.size < 2) return;

    const sourceChats = chats.filter(c => selectedChats.has(c.id));
    setMergePreview({
      isOpen: true,
      summary: '',
      sourceChats,
      isGenerating: true,
    });

    // Generate summary
    const summary = await generateMergeSummary(sourceChats);
    setMergePreview(prev => ({ ...prev, summary, isGenerating: false }));
  }

  async function executeMerge() {
    if (selectedChats.size < 2 || !activeTopic) return;

    const sourceChats = chats.filter(c => selectedChats.has(c.id));
    const summary = mergePreview.summary || await generateMergeSummary(sourceChats);

    try {
      // Create merged chat
      const mergedChat = await chatApi.createChat({
        topicId: activeTopic,
        title: `Merged: ${sourceChats.map(c => c.title.slice(0, 20)).join(' + ')}`,
        messages: [],
        tags: [...new Set(sourceChats.flatMap(c => c.tags))],
      });

      // Add summary as first message
      const welcomeMessage = await chatApi.createMessage(mergedChat.id, {
        role: 'assistant',
        text: summary,
      });

      // Add continuation prompt
      const promptMessage = await chatApi.createMessage(mergedChat.id, {
        role: 'assistant',
        text: '---\n\n✨ **Merged conversations complete.** You can now continue chatting here. The context from all selected conversations has been synthesized above.\n\nWhat would you like to discuss next?',
      });

      // Update local state
      setChats(prev => [{
        ...mergedChat,
        messages: [welcomeMessage, promptMessage],
      }, ...prev]);

      setActiveChat(mergedChat.id);
      setSelectionMode(false);
      setSelectedChats(new Set());
      setMergePreview({ isOpen: false, summary: '', sourceChats: [], isGenerating: false });
      setLastAction(`Merged ${sourceChats.length} chats into new conversation`);
    } catch (err: any) {
      setLastAction('Failed to merge chats: ' + err.message);
    }
  }

  function cancelMerge() {
    setMergePreview({ isOpen: false, summary: '', sourceChats: [], isGenerating: false });
  }

  // Topic management functions
  function addTopic(name: string, description: string, icon: string) {
    const id = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') as TopicId;
    
    // Check if topic already exists
    if (topics.some(t => t.id === id)) {
      setLastAction('Topic already exists');
      return false;
    }

    const newTopic: Topic = { id, name, description, icon };
    setTopics(prev => [...prev, newTopic]);
    setLastAction(`Added topic: ${name}`);
    return true;
  }

  function removeTopic(topicId: TopicId, deleteChats: boolean = false, moveToTopicId?: TopicId) {
    const topic = topics.find(t => t.id === topicId);
    if (!topic) return;

    const chatsInTopic = chats.filter(c => c.topicId === topicId);

    if (deleteChats) {
      // Delete all chats in this topic
      setChats(prev => prev.filter(c => c.topicId !== topicId));
      setTopics(prev => prev.filter(t => t.id !== topicId));
      if (activeTopic === topicId) {
        setActiveTopic(null);
        setActiveChat(null);
      }
      setLastAction(`Deleted topic "${topic.name}" and ${chatsInTopic.length} chats`);
    } else if (moveToTopicId) {
      // Move chats to another topic
      setChats(prev => prev.map(c => 
        c.topicId === topicId ? { ...c, topicId: moveToTopicId as TopicId } : c
      ));
      setTopics(prev => prev.filter(t => t.id !== topicId));
      setLastAction(`Moved ${chatsInTopic.length} chats to another topic and deleted "${topic.name}"`);
    }
  }

  function moveChatToTopic(chatId: string, targetTopicId: TopicId) {
    setChats(prev => prev.map(c => 
      c.id === chatId ? { ...c, topicId: targetTopicId } : c
    ));
    const chat = chats.find(c => c.id === chatId);
    const targetTopic = topics.find(t => t.id === targetTopicId);
    setLastAction(`Moved "${chat?.title}" to ${targetTopic?.name}`);
    setTopicModal({ isOpen: false, mode: 'add' });
  }

  // Archive functions
  function archiveChat(chatId: string) {
    const chat = chats.find(c => c.id === chatId);
    setChats(prev => prev.map(c => 
      c.id === chatId ? { ...c, isArchived: true } : c
    ));
    setLastAction(`Archived "${chat?.title}"`);
    // If archived chat is active, go back to landing
    if (activeChat === chatId) {
      setActiveChat(null);
    }
  }

  function unarchiveChat(chatId: string) {
    const chat = chats.find(c => c.id === chatId);
    setChats(prev => prev.map(c => 
      c.id === chatId ? { ...c, isArchived: false } : c
    ));
    setLastAction(`Unarchived "${chat?.title}"`);
  }

  // Rename functions
  function startEditTitle() {
    if (currentChat) {
      setEditTitle(currentChat.title);
      setEditingTitle(true);
    }
  }

  function saveEditTitle() {
    if (currentChat && editTitle.trim()) {
      setChats(prev => prev.map(c =>
        c.id === currentChat.id ? { ...c, title: editTitle.trim() } : c
      ));
      setLastAction(`Renamed to "${editTitle.trim()}"`);
      setEditingTitle(false);
    }
  }

  function cancelEditTitle() {
    setEditingTitle(false);
    setEditTitle('');
  }

  // Quote selection functions
  function handleTextSelection() {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.toString().trim()) {
      setQuoteSelection(null);
      return;
    }

    const text = selection.toString().trim();
    if (text.length < 3) {
      setQuoteSelection(null);
      return;
    }

    // Get position of selection
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    
    setQuoteSelection({
      text,
      x: rect.left + rect.width / 2,
      y: rect.top - 10,
    });
  }

  function applyQuote() {
    if (!quoteSelection) return;

    const quotedText = `> "${quoteSelection.text}"

`;
    setInput(prev => prev ? prev + '\n\n' + quotedText : quotedText);
    setQuoteSelection(null);
    window.getSelection()?.removeAllRanges();
  }

  // Interview Mode Functions
  const HOST_SYSTEM = `You are a thoughtful, well-structured interview host. You guide conversations with intelligence and curiosity. You ask insightful follow-up questions. You periodically check if the audience has questions with phrases like "Let's see if anyone in the audience has questions" or "Any questions from our listeners?". You keep the conversation flowing naturally between you and the expert. Be concise but engaging.`;

  const EXPERT_SYSTEM = `You are a deeply knowledgeable expert who explains complex topics with clarity and depth. You provide thorough, well-reasoned explanations. When the host asks questions, you dive deep with substantive answers. You use analogies and examples to make concepts clear. Be generous with details while remaining accessible.`;

  function createInterviewMessage(speaker: InterviewSpeaker, text: string): InterviewMessage {
    return {
      id: createId('imsg'),
      speaker,
      text,
      timestamp: new Date().toISOString(),
    };
  }

  async function startInterview(topic: string) {
    setInterview(prev => ({
      ...prev,
      isActive: true,
      topic,
      messages: [],
      audienceQuestions: [],
      handRaised: false,
      userQuestion: '',
      userGuidance: '',
      isRunning: true,
      turnCount: 0,
      lastSpeaker: 'host' as InterviewSpeaker,
    }));
    setView('interview');
    // Run first turn
    await runInterviewTurn();
  }

  function stopInterview() {
    setInterview(prev => ({
      ...prev,
      isActive: false,
      isRunning: false,
    }));
    setView('landing');
  }

  async function runInterviewTurn() {
    const currentInterview = interview;
    if (!currentInterview.isActive || !currentInterview.isRunning) return;

    const isHostTurn = currentInterview.turnCount % 2 === 0;
    const speaker = isHostTurn ? 'host' : 'expert';
    const systemPrompt = isHostTurn ? HOST_SYSTEM : EXPERT_SYSTEM;

    // Build messages for API
    const apiMessages: { role: string; content: string }[] = [
      { role: 'system' as const, content: systemPrompt },
    ];

    // Add conversation history
    currentInterview.messages.forEach(msg => {
      const role = msg.speaker === 'user' ? 'user' : (msg.speaker === 'host' ? 'assistant' : 'user');
      apiMessages.push({ role, content: msg.text });
    });

    // Add user guidance if present
    let guidanceNote = '';
    if (currentInterview.userGuidance.trim()) {
      guidanceNote = `\n\n[Moderator note: ${currentInterview.userGuidance}]`;
    }

    // Add queued audience question if any
    const queuedQuestion = currentInterview.audienceQuestions.find(q => q.status === 'queued');
    if (queuedQuestion && !isHostTurn) {
      apiMessages.push({ 
        role: 'user' as const, 
        content: `Audience question: ${queuedQuestion.text}${guidanceNote}` 
      });
    } else if (isHostTurn && currentInterview.messages.length === 0) {
      apiMessages.push({ 
        role: 'user' as const, 
        content: `Today we're exploring: ${currentInterview.topic}. Please introduce the topic and bring in our expert.${guidanceNote}` 
      });
    } else if (isHostTurn) {
      const lastExpertMsg = currentInterview.messages.filter(m => m.speaker === 'expert').pop();
      if (lastExpertMsg) {
        const shouldAskAudience = currentInterview.turnCount > 0 && currentInterview.turnCount % 3 === 0;
        let hostPrompt = shouldAskAudience 
          ? `The expert just said: "${lastExpertMsg.text.slice(0, 200)}..."\n\nLet's see if anyone in the audience has questions? Feel free to raise your hand!`
          : `The expert just said: "${lastExpertMsg.text.slice(0, 200)}..."\n\nAsk a thoughtful follow-up question.${guidanceNote}`;
        apiMessages.push({ role: 'user' as const, content: hostPrompt });
      }
    } else if (guidanceNote) {
      apiMessages.push({ role: 'user' as const, content: guidanceNote });
    }

    try {
      // Use correct settings for Host vs Expert
      const interviewSettings = {
        ...settings,
        baseUrl: isHostTurn 
          ? (settings.hostBaseUrl || settings.baseUrl) 
          : (settings.expertBaseUrl || settings.baseUrl),
        model: isHostTurn ? currentInterview.hostModel : currentInterview.expertModel,
      };
      const response = await sendToModel(interviewSettings, apiMessages);
      const newMessage = createInterviewMessage(speaker, response);

      let updatedQuestions = currentInterview.audienceQuestions;
      if (queuedQuestion && !isHostTurn) {
        updatedQuestions = currentInterview.audienceQuestions.map(q => 
          q.id === queuedQuestion.id ? { ...q, status: 'answered' as const } : q
        );
      }

      setInterview(prev => ({
        ...prev,
        messages: [...prev.messages, newMessage],
        audienceQuestions: updatedQuestions,
        turnCount: prev.turnCount + 1,
        lastSpeaker: speaker,
        handRaised: queuedQuestion ? false : prev.handRaised,
      }));

      // If still running, schedule next turn after a delay
      if (currentInterview.isRunning && !queuedQuestion) {
        setTimeout(() => {
          if (interview.isRunning) runInterviewTurn();
        }, 1500);
      }
    } catch (error) {
      console.error('Interview turn error:', error);
    }
  }

  function raiseHand() {
    if (!interview.handRaised && interview.userQuestion.trim()) {
      setInterview(prev => ({
        ...prev,
        handRaised: true,
        audienceQuestions: [
          ...prev.audienceQuestions,
          {
            id: createId('q'),
            text: prev.userQuestion,
            status: 'queued' as const,
            timestamp: new Date().toISOString(),
          }
        ],
        userQuestion: '',
      }));
    }
  }

  function takeoverInterview(partner: 'host' | 'expert') {
    setInterview(prev => ({
      ...prev,
      isConversational: true,
      conversationalPartner: partner,
      isRunning: false,
      handRaised: false,
      userQuestion: '',
    }));
  }

  async function sendConversationalMessage(text: string) {
    if (!text.trim() || !interview.isConversational) return;

    const currentInterview = interview;
    const partner = currentInterview.conversationalPartner;
    const systemPrompt = partner === 'host' ? HOST_SYSTEM : EXPERT_SYSTEM;

    // Add user message
    const userMessage: InterviewMessage = {
      id: createId('imsg'),
      speaker: 'user',
      text,
      timestamp: new Date().toISOString(),
    };

    setInterview(prev => ({
      ...prev,
      messages: [...prev.messages, userMessage],
    }));

    // Build API messages
    const apiMessages: { role: string; content: string }[] = [
      { role: 'system', content: systemPrompt },
    ];

    // Add conversation history
    currentInterview.messages.forEach(msg => {
      const role = msg.speaker === 'user' ? 'user' : (msg.speaker === 'host' ? 'assistant' : 'user');
      apiMessages.push({ role, content: msg.text });
    });

    // Add user message
    apiMessages.push({ role: 'user', content: text });

    try {
      // Use correct settings for Host vs Expert
      const interviewSettings = {
        ...settings,
        baseUrl: partner === 'host' 
          ? (settings.hostBaseUrl || settings.baseUrl) 
          : (settings.expertBaseUrl || settings.baseUrl),
        model: partner === 'host' ? currentInterview.hostModel : currentInterview.expertModel,
      };
      const response = await sendToModel(interviewSettings, apiMessages);
      const aiMessage: InterviewMessage = {
        id: createId('imsg'),
        speaker: partner,
        text: response,
        timestamp: new Date().toISOString(),
      };

      setInterview(prev => ({
        ...prev,
        messages: [...prev.messages, aiMessage],
        lastSpeaker: partner,
      }));
    } catch (error) {
      console.error('Conversational message error:', error);
    }
  }

  function resumeInterview() {
    setInterview(prev => ({
      ...prev,
      isConversational: false,
      conversationalPartner: 'host',
      isRunning: true,
    }));
    // Resume auto interview
    runInterviewTurn();
  }

  // Derived state
  const currentTopic = useMemo(() => topics.find(t => t.id === activeTopic), [activeTopic, topics]);
  const currentChat = useMemo(() => chats.find(c => c.id === activeChat), [chats, activeChat]);
  const topicChats = useMemo(() => {
    const filtered = chats.filter(c => c.topicId === activeTopic && !c.isArchived);
    return filtered.sort((a, b) => {
      switch (sortOption) {
        case 'newest':
          return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
        case 'oldest':
          return new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
        case 'az':
          return a.title.localeCompare(b.title);
        case 'za':
          return b.title.localeCompare(a.title);
        default:
          return 0;
      }
    });
  }, [chats, activeTopic, sortOption]);

  // Archived chats for current topic
  const archivedTopicChats = useMemo(() =>
    chats.filter(c => c.topicId === activeTopic && c.isArchived).sort((a, b) => 
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    ),
    [chats, activeTopic]
  );

  // Search logic
  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    chats.forEach(chat => chat.tags?.forEach(tag => tagSet.add(tag)));
    return Array.from(tagSet).sort();
  }, [chats]);

  const filteredChats = useMemo(() => {
    if (!searchQuery.trim() && !searchFilters.dateFrom && !searchFilters.dateTo && searchFilters.tags.length === 0) {
      return null; // No search active
    }

    const query = searchQuery.toLowerCase().trim();
    return chats.filter(chat => {
      // Text search
      if (query) {
        const titleMatch = chat.title.toLowerCase().includes(query);
        const messageMatch = chat.messages.some(m => 
          m.text.toLowerCase().includes(query)
        );
        const tagMatch = chat.tags?.some(tag => tag.toLowerCase().includes(query));
        if (!titleMatch && !messageMatch && !tagMatch) return false;
      }

      // Date filters
      if (searchFilters.dateFrom) {
        const fromDate = new Date(searchFilters.dateFrom);
        if (new Date(chat.createdAt) < fromDate) return false;
      }
      if (searchFilters.dateTo) {
        const toDate = new Date(searchFilters.dateTo);
        toDate.setHours(23, 59, 59, 999); // End of day
        if (new Date(chat.createdAt) > toDate) return false;
      }

      // Tag filters
      if (searchFilters.tags.length > 0) {
        const hasAllTags = searchFilters.tags.every(tag => chat.tags?.includes(tag));
        if (!hasAllTags) return false;
      }

      return true;
    }).sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }, [chats, searchQuery, searchFilters]);

  // Effects
  // Load chats from server when authenticated
  useEffect(() => {
    if (!isAuthenticated) return;

    const loadChats = async () => {
      setIsLoadingChats(true);
      try {
        const serverChats = await chatApi.getChats();

        // Load messages for each chat
        const chatsWithMessages = await Promise.all(
          serverChats.map(async (chat) => ({
            ...chat,
            messages: await chatApi.getMessages(chat.id),
          }))
        );

        setChats(chatsWithMessages);
        setLastAction('Data synchronized from server');
      } catch (err: any) {
        setLastAction('Failed to load chats: ' + err.message);
      } finally {
        setIsLoadingChats(false);
      }
    };

    loadChats();
  }, [isAuthenticated]);

  // Load settings from localStorage (fallback, can be moved to server too)
  useEffect(() => {
    if (!isAuthenticated) return;

    const saved = localStorage.getItem('topic-cloud-settings');
    if (saved) {
      try {
        const data = JSON.parse(saved);
        setSettings({ ...DEFAULT_SETTINGS, ...data });
      } catch {}
    }
  }, [isAuthenticated]);

  // Save settings to localStorage
  useEffect(() => {
    if (!isAuthenticated) return;
    localStorage.setItem('topic-cloud-settings', JSON.stringify(settings));
  }, [settings, isAuthenticated]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [currentChat?.messages]);

  // Actions
  function startChat(topicId: TopicId) {
    setActiveTopic(topicId);
    setActiveChat(null);
    setView('chat');
    setLastAction(`Entering topic: ${topicId.toUpperCase()}`);
  }

  function selectChat(chatId: string) {
    setActiveChat(chatId);
    const chat = chats.find(c => c.id === chatId);
    if (chat) setActiveTopic(chat.topicId);
    if (isMobile) setMobileSidebarOpen(false);
  }

  async function createNewChat() {
    if (!activeTopic) return;

    try {
      const newChat = await chatApi.createChat({
        topicId: activeTopic,
        title: 'New conversation',
        messages: [],
        tags: [],
      });

      setChats(prev => [newChat, ...prev]);
      setActiveChat(newChat.id);
      setLastAction('Created new chat thread');
    } catch (err: any) {
      setLastAction('Failed to create chat: ' + err.message);
    }
  }

  async function forkChat(chatId: string, messageIndex: number, newTitle?: string) {
    const sourceChat = chats.find(c => c.id === chatId);
    if (!sourceChat) return;

    try {
      const forkedChat = await chatApi.createChat({
        topicId: sourceChat.topicId,
        title: newTitle || `${sourceChat.title} (fork)`,
        messages: [],
        parentId: sourceChat.id,
        branchPoint: messageIndex,
        tags: [...sourceChat.tags],
      });

      // Copy messages up to branch point
      const messagesToCopy = sourceChat.messages.slice(0, messageIndex + 1);
      for (const msg of messagesToCopy) {
        await chatApi.createMessage(forkedChat.id, {
          role: msg.role,
          text: msg.text,
          error: msg.error,
          model: msg.model,
        });
      }

      // Reload messages for the forked chat
      const messages = await chatApi.getMessages(forkedChat.id);
      forkedChat.messages = messages;

      setChats(prev => [{ ...forkedChat, messages }, ...prev]);
      setActiveChat(forkedChat.id);
      setLastAction(`Forked chat: ${forkedChat.id.slice(0, 8)}`);
    } catch (err: any) {
      setLastAction('Failed to fork chat: ' + err.message);
    }
  }

  async function sendMessage() {
    if (!input.trim() || !activeChat || isSending) return;

    const text = input.trim();
    setInput('');
    setIsSending(true);
    setModelStatus('testing');
    setLastAction('Sending message to model...');

    try {
      // Save user message to server
      const userMessage = await chatApi.createMessage(activeChat, {
        role: 'user',
        text,
      });

      setChats(prev => prev.map(chat => {
        if (chat.id !== activeChat) return chat;
        return {
          ...chat,
          messages: [...chat.messages, userMessage],
          updatedAt: new Date().toISOString(),
        };
      }));

      let searchContext = '';
      if (settings.enableWebSearch && settings.braveApiKey) {
        setLastAction('Performing web search...');
        const searchResults = await searchWeb(settings.braveApiKey, text);
        if (searchResults) searchContext = `\n\nWeb search context:\n${searchResults}`;
      }

      const messages = [
        { role: 'system', content: `You are a helpful assistant. Topic: ${currentTopic?.name}.${searchContext}` },
        ...currentChat!.messages.map(m => ({ role: m.role, content: m.text })),
        { role: 'user', content: text },
      ];

      const response = await sendToModel(settings, messages);

      // Save assistant response to server
      const assistantMessage = await chatApi.createMessage(activeChat, {
        role: 'assistant',
        text: response,
        model: settings.model,
      });

      setChats(prev => prev.map(chat => {
        if (chat.id !== activeChat) return chat;
        return {
          ...chat,
          messages: [...chat.messages, assistantMessage],
          updatedAt: new Date().toISOString(),
        };
      }));

      setModelStatus('ready');
      setLastAction('Response received');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to send';

      // Save error message to server
      const errorMsg = await chatApi.createMessage(activeChat, {
        role: 'assistant',
        text: 'Request failed. Check connection settings.',
        error: errorMessage,
      });

      setChats(prev => prev.map(chat => {
        if (chat.id !== activeChat) return chat;
        return {
          ...chat,
          messages: [...chat.messages, errorMsg],
          updatedAt: new Date().toISOString(),
        };
      }));

      setModelStatus('error');
      setLastAction(`Error: ${errorMessage.slice(0, 30)}...`);
    } finally {
      setIsSending(false);
    }
  }

  async function runTest() {
    setTestResult(null);
    setModelStatus('testing');
    setLastAction('Testing model connection...');
    
    try {
      const ok = await testConnection(settings);
      if (ok) {
        setTestResult('Connection established');
        setModelStatus('ready');
        setLastAction('Connection test: SUCCESS');
      } else {
        setTestResult('Connection failed');
        setModelStatus('error');
        setLastAction('Connection test: FAILED');
      }
    } catch {
      setTestResult('Connection failed - check settings');
      setModelStatus('error');
      setLastAction('Connection test: ERROR');
    }
  }

  function updateSettings(key: keyof Settings, value: string | boolean) {
    setSettings(prev => ({ ...prev, [key]: value }));
    setTestResult(null);
    setModelStatus('ready');
  }

  const getStatusDot = () => {
    switch (modelStatus) {
      case 'ready': return <span className="w-2 h-2 rounded-full status-ready" />;
      case 'testing': return <span className="w-2 h-2 rounded-full status-testing" />;
      case 'error': return <span className="w-2 h-2 rounded-full status-error" />;
      default: return <span className="w-2 h-2 rounded-full status-offline" />;
    }
  };

  const getStatusText = () => {
    switch (modelStatus) {
      case 'ready': return 'SYSTEM_READY';
      case 'testing': return 'PROCESSING...';
      case 'error': return 'CONNECTION_ERROR';
      default: return 'OFFLINE';
    }
  };

  // Render
  if (!isAuthenticated) {
    return <AuthView onLogin={() => setIsAuthenticated(true)} />;
  }

  return (
    <div className="h-screen flex flex-col bg-synth-bg overflow-hidden">
      {/* Header */}
      <header className="h-16 bg-synth-bg border-b border-synth-border-subtle flex items-center justify-between px-6 fixed top-0 left-0 right-0 z-50">
        <div className="flex items-center gap-4">
          <span className="font-headline text-lg font-bold tracking-widest text-synth-text">TOPIC_CLOUD</span>
          <span className="text-synth-cyan text-xs">//</span>
          <span className="text-synth-text-secondary text-xs tracking-wider">SYNTHETIC_ARCHITECT_V2</span>
          {auth.getUser() && (
            <span className="text-2xs text-synth-text-muted font-mono ml-2">
              USER: {auth.getUser()?.username?.toUpperCase()}
            </span>
          )}
        </div>
        
        <div className="flex-1 max-w-xl mx-8">
          <div className="flex items-center bg-synth-surface px-4 py-2 border border-synth-border-subtle">
            <span className="material-symbols-outlined text-synth-text-muted text-sm mr-2">terminal</span>
            <span className="text-2xs text-synth-text-muted font-mono tracking-wider uppercase">
              SYSTEM_PATH: /{view.toUpperCase()}{activeTopic ? `/${activeTopic.toUpperCase()}` : ''}
            </span>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <button 
            className={`p-2 transition-colors ${view === 'landing' ? 'text-synth-cyan' : 'text-synth-text-secondary hover:text-synth-text'}`}
            onClick={() => setView('landing')}
          >
            <span className="material-symbols-outlined">home</span>
          </button>
          <button 
            className={`p-2 transition-colors ${view === 'chat' ? 'text-synth-cyan' : 'text-synth-text-secondary hover:text-synth-text'}`}
            onClick={() => activeTopic ? setView('chat') : setView('landing')}
          >
            <span className="material-symbols-outlined">chat</span>
          </button>
          <button 
            className={`p-2 transition-colors ${view === 'settings' ? 'text-synth-cyan' : 'text-synth-text-secondary hover:text-synth-text'}`}
            onClick={() => setView('settings')}
          >
            <span className="material-symbols-outlined">settings</span>
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 mt-16 flex overflow-hidden">
        {/* Landing View */}
        {view === 'landing' && (
          <div className="flex-1 flex flex-col relative overflow-auto">
            {/* Grid Background */}
            <div className="absolute inset-0 opacity-[0.03] pointer-events-none bg-grid" />
            
            <div className="flex-1 flex flex-col items-center justify-center p-12 relative z-10">
              <div className="text-center mb-12">
                <h1 className="font-headline text-4xl font-bold tracking-tight mb-4">
                  <span className="text-synth-text">TOPIC</span>
                  <span className="text-synth-cyan glow-cyan">_CLOUD</span>
                </h1>
                <p className="text-synth-text-secondary text-sm tracking-wider">
                  ORGANIZE YOUR THOUGHTS // ACCESS THE NEURAL_MESH
                </p>
              </div>
              
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 w-full max-w-4xl">
                {topics.map(topic => {
                  const count = chats.filter(c => c.topicId === topic.id).length;
                  const isDefaultTopic = ['explore', 'learn', 'create', 'refine', 'review', 'archive'].includes(topic.id);
                  return (
                    <div key={topic.id} className="topic-card text-left group relative">
                      <button 
                        className="w-full"
                        onClick={() => startChat(topic.id)}
                      >
                        <div className="flex items-center gap-3 mb-3">
                          <span className="material-symbols-outlined text-synth-cyan group-hover:glow-cyan transition-all">
                            {topic.icon}
                          </span>
                          <h3 className="font-headline text-sm font-semibold tracking-wider">{topic.name.toUpperCase()}</h3>
                        </div>
                        <p className="text-synth-text-secondary text-xs mb-3">{topic.description}</p>
                        <div className="text-2xs text-synth-text-muted font-mono">
                          {count} THREAD{count !== 1 ? 'S' : ''}
                        </div>
                      </button>
                      {!isDefaultTopic && (
                        <button
                          className="absolute top-2 right-2 p-1.5 rounded bg-synth-surface-high/80 text-synth-text-muted hover:text-synth-error hover:bg-synth-error/20 opacity-0 group-hover:opacity-100 transition-all"
                          onClick={(e) => {
                            e.stopPropagation();
                            const chatsInTopic = chats.filter(c => c.topicId === topic.id);
                            if (chatsInTopic.length > 0) {
                              // Show confirmation modal for non-empty topic
                              showConfirm(
                                'DELETE_TOPIC?',
                                `"${topic.name}" has ${chatsInTopic.length} thread${chatsInTopic.length !== 1 ? 's' : ''}. Delete all threads or move them to another topic?`,
                                () => {
                                  // Default to delete all
                                  removeTopic(topic.id, true);
                                },
                                () => {
                                  // Show move dialog
                                  setTopicModal({ isOpen: true, mode: 'move', targetTopic: topic });
                                }
                              );
                            } else {
                              removeTopic(topic.id, true);
                            }
                          }}
                          title="Delete topic"
                        >
                          <span className="material-symbols-outlined text-sm">delete</span>
                        </button>
                      )}
                    </div>
                  );
                })}
                {/* Interview Mode Card */}
                <button 
                  className="topic-card text-left group border-2 border-synth-violet/50 hover:border-synth-violet"
                  onClick={() => {
                    setModal({
                      isOpen: true,
                      type: 'prompt',
                      title: 'START INTERVIEW',
                      message: 'Enter a topic for the interview...',
                      defaultValue: '',
                      onConfirm: (value?: string) => { if (value) startInterview(value); },
                      onCancel: () => setModal(m => ({ ...m, isOpen: false })),
                    });
                  }}
                >
                  <div className="flex items-center gap-3 mb-3">
                    <span className="material-symbols-outlined text-synth-violet group-hover:glow-cyan transition-all">
                      mic_external_on
                    </span>
                    <h3 className="font-headline text-sm font-semibold tracking-wider text-synth-violet">INTERVIEW MODE</h3>
                  </div>
                  <p className="text-synth-text-secondary text-xs mb-3">Watch two AIs debate and discuss your topic</p>
                  <div className="text-2xs text-synth-text-muted font-mono">
                    TWO AI HOSTS
                  </div>
                </button>

                {/* Add Topic Card */}
                <button 
                  className="topic-card text-left group border-dashed border-2 border-synth-border-subtle hover:border-synth-cyan"
                  onClick={() => setTopicModal({ isOpen: true, mode: 'add' })}
                >
                  <div className="flex items-center justify-center h-full min-h-[100px]">
                    <div className="text-center">
                      <span className="material-symbols-outlined text-synth-cyan text-2xl mb-2 block">add</span>
                      <p className="text-synth-text-secondary text-xs">ADD_TOPIC</p>
                    </div>
                  </div>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Chat View */}
        {view === 'chat' && (
          <div className="flex-1 flex overflow-hidden">
            {/* Mobile Sidebar Overlay */}
            {isMobile && mobileSidebarOpen && (
              <div 
                className="fixed inset-0 bg-black/50 z-40"
                onClick={() => setMobileSidebarOpen(false)}
              />
            )}
            
            {/* Sidebar */}
            <aside className={`
              ${isMobile 
                ? `fixed left-0 top-16 bottom-0 z-50 w-72 transform transition-transform ${mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'}` 
                : `w-64 border-r border-synth-border-subtle transition-all ${sidebarOpen ? 'translate-x-0' : '-translate-x-full absolute'}`
              }
              bg-synth-surface flex flex-col
            `}>
              <div className="p-4 border-b border-synth-border-subtle bg-synth-surface-high">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-synth-cyan">folder_open</span>
                    <span className="font-headline text-sm font-bold tracking-wider">
                      {currentTopic?.name?.toUpperCase() || 'THREADS'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-2xs px-2 py-0.5 bg-synth-surface-highest text-synth-text-muted rounded">
                      {topicChats.length}
                    </span>
                    <select
                      value={sortOption}
                      onChange={(e) => setSortOption(e.target.value as SortOption)}
                      className="bg-synth-surface border border-synth-border-subtle rounded px-1 py-0.5 text-2xs text-synth-text-muted focus:outline-none focus:border-synth-cyan cursor-pointer"
                    >
                      <option value="newest">Newest</option>
                      <option value="oldest">Oldest</option>
                      <option value="az">A-Z</option>
                      <option value="za">Z-A</option>
                    </select>
                  </div>
                </div>

                {/* Selection Mode Controls */}
                {selectionMode ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-synth-text-secondary">
                      <span>{selectedChats.size} selected</span>
                      <button
                        className="text-synth-cyan hover:underline"
                        onClick={() => {
                          setSelectionMode(false);
                          setSelectedChats(new Set());
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                    <div className="flex gap-2">
                      <button
                        className="flex-1 btn-synth-primary justify-center text-xs"
                        disabled={selectedChats.size < 2}
                        onClick={openMergePreview}
                      >
                        <span className="material-symbols-outlined text-sm">merge_type</span>
                        MERGE
                      </button>
                      <button
                        className="btn-synth-secondary text-xs"
                        onClick={() => setSelectedChats(new Set())}
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <button
                      className="flex-1 btn-synth-primary justify-center"
                      onClick={createNewChat}
                    >
                      <span className="material-symbols-outlined text-sm">add</span>
                      NEW
                    </button>
                    <button
                      className={`btn-synth-secondary ${searchMode ? 'bg-synth-cyan/20 border-synth-cyan' : ''}`}
                      onClick={() => {
                        setSearchMode(!searchMode);
                        if (searchMode) {
                          setSearchQuery('');
                          setSearchResults(null);
                          setSearchFilters({ dateFrom: '', dateTo: '', tags: [] });
                        }
                      }}
                      title="Search chats"
                    >
                      <span className="material-symbols-outlined text-sm">search</span>
                    </button>
                    <button
                      className="btn-synth-secondary"
                      onClick={() => setSelectionMode(true)}
                      disabled={topicChats.length < 2}
                      title={topicChats.length < 2 ? 'Need 2+ chats to merge' : 'Select chats to merge'}
                    >
                      <span className="material-symbols-outlined text-sm">merge_type</span>
                    </button>
                  </div>
                )}

                {/* Search Mode UI */}
                {searchMode && (
                  <div className="mt-3 space-y-2">
                    <div className="relative">
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search chats..."
                        className="w-full bg-synth-surface border border-synth-border-subtle rounded px-3 py-2 text-sm text-synth-text placeholder-synth-text-muted focus:outline-none focus:border-synth-cyan"
                        autoFocus
                      />
                      {searchQuery && (
                        <button
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-synth-text-muted hover:text-synth-text"
                          onClick={() => setSearchQuery('')}
                        >
                          <span className="material-symbols-outlined text-sm">close</span>
                        </button>
                      )}
                    </div>

                    {/* Quick Filters */}
                    <div className="flex gap-2">
                      <select
                        value={searchFilters.dateFrom}
                        onChange={(e) => setSearchFilters(f => ({ ...f, dateFrom: e.target.value }))}
                        className="flex-1 bg-synth-surface border border-synth-border-subtle rounded px-2 py-1 text-xs text-synth-text focus:outline-none focus:border-synth-cyan"
                      >
                        <option value="">From date</option>
                        <option value={new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}>Last 7 days</option>
                        <option value={new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}>Last 30 days</option>
                        <option value={new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}>Last 90 days</option>
                      </select>
                      <select
                        value={searchFilters.dateTo}
                        onChange={(e) => setSearchFilters(f => ({ ...f, dateTo: e.target.value }))}
                        className="flex-1 bg-synth-surface border border-synth-border-subtle rounded px-2 py-1 text-xs text-synth-text focus:outline-none focus:border-synth-cyan"
                      >
                        <option value="">To date</option>
                        <option value={new Date().toISOString().split('T')[0]}>Today</option>
                      </select>
                    </div>

                    {/* Tag filters */}
                    {allTags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {allTags.slice(0, 8).map(tag => (
                          <button
                            key={tag}
                            onClick={() => {
                              setSearchFilters(f => ({
                                ...f,
                                tags: f.tags.includes(tag)
                                  ? f.tags.filter(t => t !== tag)
                                  : [...f.tags, tag]
                              }));
                            }}
                            className={`text-2xs px-2 py-0.5 rounded transition-colors ${
                              searchFilters.tags.includes(tag)
                                ? 'bg-synth-cyan text-synth-bg'
                                : 'bg-synth-surface-high text-synth-text-muted hover:text-synth-text'
                            }`}
                          >
                            {tag}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Results count */}
                    {searchQuery && filteredChats !== null && (
                      <div className="text-2xs text-synth-text-muted">
                        {filteredChats.length} {filteredChats.length === 1 ? 'result' : 'results'}
                      </div>
                    )}
                  </div>
                )}
              </div>
              
              <div className="flex-1 overflow-y-auto py-2">
                {searchMode ? (
                  // Search mode results
                  filteredChats === null || (!searchQuery && searchFilters.tags.length === 0 && !searchFilters.dateFrom && !searchFilters.dateTo) ? (
                    <div className="p-6 text-center">
                      <span className="material-symbols-outlined text-2xl text-synth-text-muted mb-2">search</span>
                      <p className="text-synth-text-secondary text-sm">Type to search across all chats</p>
                      <p className="text-synth-text-muted text-xs mt-1">Search titles, messages, and tags</p>
                    </div>
                  ) : filteredChats.length === 0 ? (
                    <div className="p-6 text-center">
                      <span className="material-symbols-outlined text-2xl text-synth-text-muted mb-2">search_off</span>
                      <p className="text-synth-text-secondary text-sm mb-1">No results found</p>
                      <p className="text-synth-text-muted text-xs">Try different keywords or filters</p>
                    </div>
                  ) : (
                    <div className="space-y-1 px-2">
                      {filteredChats.map(chat => (
                        <div
                          key={chat.id}
                          className={`p-3 rounded cursor-pointer transition-colors ${
                            chat.id === activeChat
                              ? 'bg-synth-surface-high border-l-2 border-synth-cyan'
                              : 'hover:bg-synth-surface-high border-l-2 border-transparent'
                          }`}
                          onClick={() => {
                            setActiveChat(chat.id);
                            setActiveTopic(chat.topicId as TopicId);
                            setSearchMode(false);
                            setSearchQuery('');
                          }}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-2xs px-1.5 py-0.5 bg-synth-surface-highest text-synth-text-muted rounded">
                              {topics.find(t => t.id === chat.topicId)?.name}
                            </span>
                            <span className="text-2xs text-synth-text-muted">
                              {formatRelative(chat.updatedAt)}
                            </span>
                          </div>
                          <p className="text-sm font-medium truncate mb-1">{chat.title}</p>
                          <p className="text-xs text-synth-text-muted truncate">
                            {chat.messages.length} messages
                          </p>
                          {chat.tags && chat.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {chat.tags.slice(0, 3).map(tag => (
                                <span key={tag} className="text-2xs px-1 py-0.5 bg-synth-cyan/10 text-synth-cyan rounded">
                                  {tag}
                                </span>
                              ))}
                              {chat.tags.length > 3 && (
                                <span className="text-2xs text-synth-text-muted">+{chat.tags.length - 3}</span>
                              )}
                            </div>
                          )}
                          {/* Show matching snippet */}
                          {searchQuery && (() => {
                            const match = chat.messages.find(m => 
                              m.text.toLowerCase().includes(searchQuery.toLowerCase())
                            );
                            if (match) {
                              const idx = match.text.toLowerCase().indexOf(searchQuery.toLowerCase());
                              const start = Math.max(0, idx - 30);
                              const end = Math.min(match.text.length, idx + searchQuery.length + 30);
                              const snippet = (start > 0 ? '...' : '') + 
                                match.text.slice(start, end) + 
                                (end < match.text.length ? '...' : '');
                              return (
                                <p className="text-2xs text-synth-text-secondary mt-1 italic">
                                  "...{snippet}..."
                                </p>
                              );
                            }
                            return null;
                          })()}
                        </div>
                      ))}
                    </div>
                  )
                ) : topicChats.length === 0 ? (
                  <div className="p-6 text-center">
                    <p className="text-synth-text-secondary text-sm mb-4">No threads initialized</p>
                    <button className="btn-synth-secondary" onClick={createNewChat}>
                      Initialize
                    </button>
                  </div>
                ) : (
                  <>
                    <TreeView nodes={buildChatTree(topicChats)} />
                    
                    {/* Archived Section */}
                    {archivedTopicChats.length > 0 && (
                      <div className="border-t border-synth-border-subtle mt-2">
                        <button
                          className="w-full flex items-center justify-between px-4 py-2 text-2xs text-synth-text-muted hover:text-synth-text hover:bg-synth-surface-high transition-colors"
                          onClick={() => setShowArchived(!showArchived)}
                        >
                          <span className="flex items-center gap-2">
                            <span className="material-symbols-outlined text-sm">archive</span>
                            ARCHIVED ({archivedTopicChats.length})
                          </span>
                          <span className="material-symbols-outlined text-sm">
                            {showArchived ? 'expand_less' : 'expand_more'}
                          </span>
                        </button>
                        {showArchived && (
                          <div className="pb-2">
                            {archivedTopicChats.map(chat => (
                              <div
                                key={chat.id}
                                className={`p-3 rounded cursor-pointer transition-colors border-l-2 ${
                                  chat.id === activeChat
                                    ? 'bg-synth-surface-high border-synth-cyan'
                                    : 'hover:bg-synth-surface-high border-transparent'
                                }`}
                                onClick={() => {
                                  setActiveChat(chat.id);
                                  setActiveTopic(chat.topicId as TopicId);
                                }}
                              >
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="material-symbols-outlined text-synth-text-muted text-sm">lock</span>
                                  <span className="text-2xs text-synth-text-muted">
                                    {formatRelative(chat.updatedAt)}
                                  </span>
                                </div>
                                <p className="text-sm font-medium truncate mb-1">{chat.title}</p>
                                <p className="text-xs text-synth-text-muted truncate">
                                  {chat.messages.length} messages
                                </p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            </aside>
            
            {/* Main Chat Area */}
            <div className="flex-1 flex flex-col bg-synth-bg relative">
              {/* Toggle Sidebar Button */}
              {!isMobile && !sidebarOpen && (
                <button 
                  className="absolute left-4 top-4 z-10 p-2 bg-synth-surface border border-synth-border-subtle text-synth-text-secondary hover:text-synth-text"
                  onClick={() => setSidebarOpen(true)}
                >
                  <span className="material-symbols-outlined">menu_open</span>
                </button>
              )}
              
              {/* Chat Header */}
              <div className="h-14 border-b border-synth-border-subtle flex items-center px-6 bg-synth-surface/50">
                {isMobile && (
                  <button 
                    className="p-2 mr-3 text-synth-text-secondary"
                    onClick={() => setMobileSidebarOpen(true)}
                  >
                    <span className="material-symbols-outlined">menu</span>
                  </button>
                )}
                {!isMobile && sidebarOpen && (
                  <button 
                    className="p-2 mr-3 text-synth-text-secondary hover:text-synth-text"
                    onClick={() => setSidebarOpen(false)}
                  >
                    <span className="material-symbols-outlined">menu_open</span>
                  </button>
                )}
                <div className="flex-1">
                  {editingTitle ? (
                    // Edit mode
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveEditTitle();
                          if (e.key === 'Escape') cancelEditTitle();
                        }}
                        className="flex-1 bg-synth-surface border border-synth-cyan rounded px-2 py-1 text-sm text-synth-text focus:outline-none"
                        autoFocus
                      />
                      <button
                        className="p-1 text-synth-cyan hover:bg-synth-cyan/20 rounded"
                        onClick={saveEditTitle}
                        title="Save"
                      >
                        <span className="material-symbols-outlined text-sm">check</span>
                      </button>
                      <button
                        className="p-1 text-synth-text-muted hover:text-synth-text hover:bg-synth-surface-high rounded"
                        onClick={cancelEditTitle}
                        title="Cancel"
                      >
                        <span className="material-symbols-outlined text-sm">close</span>
                      </button>
                    </div>
                  ) : (
                    // View mode
                    <div className="flex items-center gap-2">
                      <h2 className="font-headline text-sm font-semibold tracking-wider">
                        {currentChat?.title?.toUpperCase() || 'SELECT THREAD'}
                      </h2>
                      {currentChat && (
                        <button
                          className="p-1 text-synth-text-muted hover:text-synth-cyan transition-colors"
                          onClick={startEditTitle}
                          title="Rename"
                        >
                          <span className="material-symbols-outlined text-sm">edit</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {getStatusDot()}
                  <span className="text-2xs text-synth-text-secondary font-mono">{getStatusText()}</span>
                  {currentChat && (
                    <button
                      className="flex items-center gap-1 px-2 py-1 text-2xs text-synth-text-secondary hover:text-synth-cyan border border-synth-border-subtle hover:border-synth-cyan rounded transition-colors"
                      onClick={() => {
                        setTopicModal({ isOpen: true, mode: 'move', chatToMove: currentChat });
                      }}
                      title="Move to another topic"
                    >
                      <span className="material-symbols-outlined text-sm">drive_file_move</span>
                      MOVE
                    </button>
                  )}
                  {currentChat && !currentChat.isArchived && (
                    <button
                      className="flex items-center gap-1 px-2 py-1 text-2xs text-synth-text-secondary hover:text-synth-amber border border-synth-border-subtle hover:border-synth-amber rounded transition-colors"
                      onClick={() => archiveChat(currentChat.id)}
                      title="Archive this thread"
                    >
                      <span className="material-symbols-outlined text-sm">archive</span>
                      ARCHIVE
                    </button>
                  )}
                  {currentChat && currentChat.isArchived && (
                    <button
                      className="flex items-center gap-1 px-2 py-1 text-2xs text-synth-text-secondary hover:text-synth-cyan border border-synth-border-subtle hover:border-synth-cyan rounded transition-colors"
                      onClick={() => unarchiveChat(currentChat.id)}
                      title="Unarchive this thread"
                    >
                      <span className="material-symbols-outlined text-sm">unarchive</span>
                      UNARCHIVE
                    </button>
                  )}
                  {currentChat && (
                    <button
                      className="flex items-center gap-1 px-2 py-1 text-2xs text-synth-violet border border-synth-violet/50 hover:border-synth-violet rounded transition-colors"
                      onClick={() => startInterview(currentChat.title)}
                      title="Branch to Interview Mode"
                    >
                      <span className="material-symbols-outlined text-sm">mic_external_on</span>
                      INTERVIEW
                    </button>
                  )}
                </div>
              </div>
              
              {/* Messages */}
              {currentChat ? (
                <>
                  {/* Floating Quote Button */}
                  {quoteSelection && (
                    <button
                      className="fixed z-50 px-3 py-2 bg-synth-cyan text-synth-bg rounded shadow-lg hover:bg-synth-cyan/90 transition-all text-xs font-medium animate-fade-in"
                      style={{
                        left: `${quoteSelection.x}px`,
                        top: `${quoteSelection.y}px`,
                        transform: 'translate(-50%, -100%)',
                      }}
                      onClick={applyQuote}
                    >
                      <span className="flex items-center gap-1">
                        <span className="material-symbols-outlined text-sm">format_quote</span>
                        Quote
                      </span>
                    </button>
                  )}
                  <div className="flex-1 overflow-y-auto p-6 space-y-4">
                    {currentChat.messages.length === 0 && (
                      <div className="flex flex-col items-center justify-center h-full text-synth-text-muted">
                        <span className="material-symbols-outlined text-4xl mb-4 opacity-30">chat_bubble_outline</span>
                        <p className="text-sm">Initialize conversation</p>
                        <p className="text-2xs mt-1">Type message to begin neural sync</p>
                      </div>
                    )}
                    
                    {currentChat.messages.map((msg, index) => (
                      <div 
                        key={msg.id} 
                        className={`message-node ${msg.role === 'user' ? 'message-node-user' : 'message-node-assistant'}`}
                      >
                        <div className="flex justify-between items-start mb-2">
                          <span className="text-2xs text-synth-text-muted font-mono tracking-wider uppercase">
                            {msg.role === 'user' ? 'USER_INPUT' : 'ASSISTANT_RESPONSE'}
                          </span>
                          <span className="text-2xs text-synth-text-muted font-mono">
                            {formatTime(msg.createdAt)}
                          </span>
                        </div>
                        
                        <div 
                          className="markdown-content text-sm"
                          dangerouslySetInnerHTML={{ 
                            __html: marked.parse(msg.text, { breaks: true, gfm: true }) as string 
                          }}
                        />
                        
                        {msg.error && (
                          <div className="mt-3 p-3 bg-synth-error/20 border border-synth-error text-synth-error-text text-xs">
                            ERROR: {msg.error}
                          </div>
                        )}
                        
                        <div className="mt-3 flex gap-2 opacity-0 hover:opacity-100 transition-opacity">
                          <button
                            className="text-2xs px-2 py-1 border border-synth-border text-synth-text-secondary hover:text-synth-cyan hover:border-synth-cyan transition-colors"
                            onClick={() => {
                              showPrompt(
                                'INITIATE_FORK',
                                'Enter identifier for new branch:',
                                `${currentChat.title.slice(0, 20)}_BRANCH_${index + 1}`,
                                (title) => {
                                  if (title) forkChat(currentChat.id, index, title);
                                }
                              );
                            }}
                          >
                            FORK
                          </button>
                        </div>
                      </div>
                    ))}
                    
                    {isSending && (
                      <div className="message-node message-node-system">
                        <div className="flex items-center gap-3">
                          <span className="w-2 h-2 rounded-full bg-synth-cyan animate-pulse-slow" />
                          <span className="text-sm text-synth-text-secondary">Processing neural request...</span>
                        </div>
                      </div>
                    )}
                    
                    <div ref={messagesEndRef} />
                  </div>

                  {/* Composer */}
                  <div className="border-t border-synth-border-subtle bg-synth-surface/50 p-4">
                    <div className="max-w-4xl mx-auto">
                      <div className="flex gap-3">
                        <textarea
                          value={input}
                          onChange={e => setInput(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              sendMessage();
                            }
                          }}
                          placeholder="Enter message for neural processing..."
                          rows={1}
                          className="flex-1 bg-synth-surface border border-synth-border text-synth-text px-4 py-3 text-sm focus:outline-none focus:border-synth-cyan resize-none placeholder-synth-text-muted"
                        />
                        <button 
                          className="btn-synth-primary px-4"
                          onClick={sendMessage}
                          disabled={!input.trim() || isSending}
                        >
                          <span className="material-symbols-outlined">arrow_upward</span>
                        </button>
                      </div>
                      <div className="mt-2 flex justify-between text-2xs text-synth-text-muted font-mono">
                        <span>Press ENTER to transmit // SHIFT+ENTER for multiline</span>
                        <span>{input.length} CHARS</span>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-synth-text-muted">
                  <span className="material-symbols-outlined text-4xl mb-4 opacity-30">chat</span>
                  <p className="text-sm">No thread selected</p>
                  <p className="text-2xs mt-1">Select from sidebar or create new</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Settings View */}
        {view === 'settings' && (
          <div className="flex-1 overflow-auto relative">
            <div className="absolute inset-0 opacity-[0.03] pointer-events-none bg-grid" />
            
            <div className="max-w-4xl mx-auto p-12 relative z-10">
              <div className="mb-8 border-b border-synth-border-subtle pb-6">
                <h1 className="font-headline text-2xl font-bold tracking-tight mb-2">
                  SYSTEM<span className="text-synth-cyan">_CONFIG</span>
                </h1>
                <p className="text-synth-text-secondary text-sm">
                  Configure neural interface parameters and connection endpoints
                </p>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Model Settings */}
                <div className="bg-synth-surface border border-synth-border-subtle p-6">
                  <div className="flex items-center gap-2 mb-6 pb-4 border-b border-synth-border-subtle">
                    <span className="material-symbols-outlined text-synth-cyan">memory</span>
                    <h2 className="font-headline text-sm font-bold tracking-wider">NEURAL_INTERFACE</h2>
                  </div>
                  
                  <div className="space-y-4">
                    <div>
                      <label className="block text-2xs text-synth-text-secondary uppercase tracking-wider mb-2">
                        Endpoint URL
                      </label>
                      <input
                        type="text"
                        value={settings.baseUrl}
                        onChange={e => updateSettings('baseUrl', e.target.value)}
                        placeholder="http://localhost:1234/v1"
                        className="input-synth"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-2xs text-synth-text-secondary uppercase tracking-wider mb-2">
                        Model ID
                      </label>
                      <input
                        type="text"
                        value={settings.model}
                        onChange={e => updateSettings('model', e.target.value)}
                        placeholder="default"
                        className="input-synth"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-2xs text-synth-text-secondary uppercase tracking-wider mb-2">
                        API Key
                      </label>
                      <input
                        type="password"
                        value={settings.apiKey}
                        onChange={e => updateSettings('apiKey', e.target.value)}
                        placeholder="sk-..."
                        className="input-synth"
                      />
                    </div>
                    
                    <button 
                      className="btn-synth-primary w-full justify-center mt-4"
                      onClick={runTest}
                      disabled={modelStatus === 'testing'}
                    >
                      {modelStatus === 'testing' ? (
                        <><span className="animate-pulse">TESTING...</span></>
                      ) : (
                        <><span className="material-symbols-outlined text-sm">network_check</span> TEST CONNECTION</>
                      )}
                    </button>
                    
                    {testResult && (
                      <div className={`mt-4 p-3 text-xs border ${testResult.includes('established') ? 'border-synth-cyan/50 bg-synth-cyan/10 text-synth-cyan' : 'border-synth-error/50 bg-synth-error/10 text-synth-error-text'}`}>
                        {testResult.toUpperCase()}
                      </div>
                    )}
                  </div>
                </div>
                
                {/* Interview Mode */}
                <div className="bg-synth-surface border border-synth-border-subtle p-6 md:col-span-2">
                  <div className="flex items-center gap-2 mb-6 pb-4 border-b border-synth-border-subtle">
                    <span className="material-symbols-outlined text-synth-violet">psychology</span>
                    <h2 className="font-headline text-sm font-bold tracking-wider">INTERVIEW_MODE</h2>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <span className="w-2 h-2 rounded-full bg-synth-cyan" />
                        <span className="text-xs text-synth-cyan font-medium">HOST</span>
                      </div>
                      <label className="block text-2xs text-synth-text-secondary uppercase tracking-wider mb-2">
                        Host LM Studio URL
                      </label>
                      <input
                        type="text"
                        value={settings.hostBaseUrl}
                        onChange={e => updateSettings('hostBaseUrl', e.target.value)}
                        placeholder="http://192.168.1.100:1234/v1"
                        className="input-synth"
                      />
                      <p className="text-2xs text-synth-text-muted mt-2">
                        Leave empty to use default endpoint
                      </p>
                    </div>
                    
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <span className="w-2 h-2 rounded-full bg-synth-violet" />
                        <span className="text-xs text-synth-violet font-medium">EXPERT</span>
                      </div>
                      <label className="block text-2xs text-synth-text-secondary uppercase tracking-wider mb-2">
                        Expert LM Studio URL
                      </label>
                      <input
                        type="text"
                        value={settings.expertBaseUrl}
                        onChange={e => updateSettings('expertBaseUrl', e.target.value)}
                        placeholder="http://192.168.1.101:1234/v1"
                        className="input-synth"
                      />
                      <p className="text-2xs text-synth-text-muted mt-2">
                        Leave empty to use default endpoint
                      </p>
                    </div>
                  </div>
                </div>
                
                {/* Web Search */}
                <div className="bg-synth-surface border border-synth-border-subtle p-6">
                  <div className="flex items-center gap-2 mb-6 pb-4 border-b border-synth-border-subtle">
                    <span className="material-symbols-outlined text-synth-cyan">travel_explore</span>
                    <h2 className="font-headline text-sm font-bold tracking-wider">WEB_PROBE</h2>
                  </div>
                  
                  <div className="space-y-4">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settings.enableWebSearch}
                        onChange={e => updateSettings('enableWebSearch', e.target.checked)}
                        className="w-4 h-4 accent-synth-cyan bg-synth-surface border-synth-border"
                      />
                      <span className="text-sm">Enable automatic web context retrieval</span>
                    </label>
                    
                    {settings.enableWebSearch && (
                      <div>
                        <label className="block text-2xs text-synth-text-secondary uppercase tracking-wider mb-2">
                          Brave Search API Key
                        </label>
                        <input
                          type="password"
                          value={settings.braveApiKey}
                          onChange={e => updateSettings('braveApiKey', e.target.value)}
                          placeholder="Get free key at brave.com/search/api"
                          className="input-synth"
                        />
                        <p className="text-2xs text-synth-text-muted mt-2">
                          Free tier: 2000 queries/month
                        </p>
                      </div>
                    )}
                  </div>
                </div>
                
                {/* Data Management */}
                <div className="bg-synth-surface border border-synth-border-subtle p-6 md:col-span-2">
                  <div className="flex items-center gap-2 mb-6 pb-4 border-b border-synth-border-subtle">
                    <span className="material-symbols-outlined text-synth-cyan">storage</span>
                    <h2 className="font-headline text-sm font-bold tracking-wider">DATA_CORE</h2>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-synth-text-secondary">
                        Data stored on PocketBase server
                      </p>
                      <p className="text-2xs text-synth-text-muted mt-1">
                        {chats.length} threads • {chats.reduce((acc, c) => acc + c.messages.length, 0)} messages
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        className="btn-synth-secondary"
                        onClick={() => {
                          auth.logout();
                          setIsAuthenticated(false);
                          setChats([]);
                          setLastAction('Logged out');
                        }}
                      >
                        <span className="material-symbols-outlined text-sm">logout</span>
                        LOGOUT
                      </button>
                      <button
                        className="btn-synth-secondary border-synth-error text-synth-error hover:bg-synth-error/20"
                        onClick={() => {
                          showConfirm(
                            'PURGE_DATA_CORE',
                            'This will permanently delete all threads and messages from the server. This action cannot be undone.',
                            async () => {
                              try {
                                for (const chat of chats) {
                                  await chatApi.deleteChat(chat.id);
                                }
                                setChats([]);
                                setLastAction('All data purged from server');
                              } catch (err: any) {
                                setLastAction('Failed to purge: ' + err.message);
                              }
                            }
                          );
                        }}
                      >
                        <span className="material-symbols-outlined text-sm">delete_forever</span>
                        PURGE
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {view === 'interview' && interview.isActive && (
          <div className="flex-1 flex flex-col relative overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-synth-border-subtle bg-synth-surface">
              <div className="flex items-center gap-3">
                <button
                  onClick={stopInterview}
                  className="p-2 rounded hover:bg-synth-surface-high transition-colors"
                >
                  <span className="material-symbols-outlined text-synth-text">arrow_back</span>
                </button>
                <div>
                  <h2 className="font-headline text-sm font-bold tracking-wider text-synth-violet">
                    INTERVIEW MODE
                  </h2>
                  <p className="text-2xs text-synth-text-muted">Topic: {interview.topic}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {!interview.isConversational && interview.isRunning && (
                  <button
                    onClick={() => setInterview(prev => ({ ...prev, isRunning: false }))}
                    className="btn-synth btn-synth-secondary"
                  >
                    <span className="material-symbols-outlined text-sm">pause</span>
                    PAUSE
                  </button>
                )}
                {!interview.isConversational && !interview.isRunning && interview.messages.length > 0 && (
                  <button
                    onClick={() => {
                      setInterview(prev => ({ ...prev, isRunning: true }));
                      runInterviewTurn();
                    }}
                    className="btn-synth btn-synth-primary"
                  >
                    <span className="material-symbols-outlined text-sm">play_arrow</span>
                    RESUME
                  </button>
                )}
                {!interview.isConversational && interview.isRunning && (
                  <button
                    onClick={() => takeoverInterview('host')}
                    className="btn-synth btn-synth-primary"
                  >
                    <span className="material-symbols-outlined text-sm">front_hand</span>
                    TAKE OVER
                  </button>
                )}
                {interview.isConversational && (
                  <button
                    onClick={resumeInterview}
                    className="btn-synth btn-synth-secondary"
                  >
                    <span className="material-symbols-outlined text-sm">psychology</span>
                    RESUME AUTO
                  </button>
                )}
              </div>
            </div>

            {/* AI Avatars */}
            <div className="flex justify-center gap-8 p-4 bg-synth-surface-high">
              <div className="flex flex-col items-center gap-2">
                <div className={`w-16 h-16 rounded-full flex items-center justify-center ${interview.lastSpeaker === 'host' ? 'bg-synth-cyan/20 border-2 border-synth-cyan' : 'bg-synth-surface border border-synth-border'}`}>
                  <span className="material-symbols-outlined text-2xl text-synth-cyan">person</span>
                </div>
                <span className="text-2xs font-mono text-synth-cyan">HOST</span>
                <span className="text-2xs text-synth-text-muted">{interview.hostModel}</span>
              </div>
              <div className="flex flex-col items-center gap-2">
                <div className={`w-16 h-16 rounded-full flex items-center justify-center ${interview.lastSpeaker === 'expert' ? 'bg-synth-violet/20 border-2 border-synth-violet' : 'bg-synth-surface border border-synth-border'}`}>
                  <span className="material-symbols-outlined text-2xl text-synth-violet">psychology</span>
                </div>
                <span className="text-2xs font-mono text-synth-violet">EXPERT</span>
                <span className="text-2xs text-synth-text-muted">{interview.expertModel}</span>
              </div>
            </div>

            {/* Conversation Stream */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {interview.messages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-synth-text-muted">
                  <span className="material-symbols-outlined text-4xl mb-4 opacity-30 animate-pulse">mic_external_on</span>
                  <p className="text-sm">Starting interview...</p>
                </div>
              )}
              {interview.messages.map(msg => (
                <div
                  key={msg.id}
                  className={`flex ${msg.speaker === 'host' ? 'justify-start' : msg.speaker === 'expert' ? 'justify-end' : 'justify-center'}`}
                >
                  <div
                    className={`max-w-[70%] rounded-lg p-4 ${
                      msg.speaker === 'host'
                        ? 'bg-synth-cyan/10 border border-synth-cyan/30'
                        : msg.speaker === 'expert'
                        ? 'bg-synth-violet/10 border border-synth-violet/30'
                        : 'bg-synth-surface border border-synth-border'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`text-2xs font-mono uppercase ${
                        msg.speaker === 'host' ? 'text-synth-cyan' : msg.speaker === 'expert' ? 'text-synth-violet' : 'text-synth-text-muted'
                      }`}>
                        {msg.speaker === 'host' ? 'HOST' : msg.speaker === 'expert' ? 'EXPERT' : 'USER'}
                      </span>
                      <span className="text-2xs text-synth-text-muted">
                        {formatTime(msg.timestamp)}
                      </span>
                    </div>
                    <p className="text-sm text-synth-text whitespace-pre-wrap">{msg.text}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Audience Question Queue */}
            {interview.audienceQuestions.filter(q => q.status === 'queued').length > 0 && (
              <div className="px-6 py-3 bg-synth-surface border-t border-synth-border-subtle">
                <div className="flex items-center gap-2 text-synth-cyan text-xs">
                  <span className="material-symbols-outlined text-sm animate-pulse">pending</span>
                  {interview.audienceQuestions.filter(q => q.status === 'queued').length} question(s) in queue
                </div>
              </div>
            )}

            {/* Controls */}
            <div className="p-4 border-t border-synth-border-subtle bg-synth-surface">
              {!interview.isConversational ? (
                <div className="flex flex-col gap-3">
                  {/* User Question Input */}
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={interview.userQuestion}
                      onChange={e => setInterview(prev => ({ ...prev, userQuestion: e.target.value }))}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && !e.shiftKey && interview.userQuestion.trim()) {
                          e.preventDefault();
                          if (!interview.handRaised) raiseHand();
                        }
                      }}
                      placeholder={interview.handRaised ? "Your question is queued..." : "Type your question here..."}
                      disabled={interview.handRaised}
                      className="flex-1 input-synth text-sm"
                    />
                    <button
                      onClick={raiseHand}
                      disabled={interview.handRaised || !interview.userQuestion.trim()}
                      className={`btn-synth ${interview.handRaised ? 'btn-synth-secondary opacity-50' : 'btn-synth-primary'}`}
                    >
                      <span className="material-symbols-outlined text-sm">front_hand</span>
                      {interview.handRaised ? 'QUEUED' : 'RAISE HAND'}
                    </button>
                  </div>

                  {/* Guidance Input */}
                  <div className="flex gap-2 items-center">
                    <input
                      type="text"
                      value={interview.userGuidance}
                      onChange={e => setInterview(prev => ({ ...prev, userGuidance: e.target.value }))}
                      placeholder="Guide the conversation... (e.g., 'Be more respectful', 'Dive deeper')"
                      className="flex-1 input-synth text-xs"
                    />
                    {interview.userGuidance && (
                      <button
                        onClick={() => setInterview(prev => ({ ...prev, userGuidance: '' }))}
                        className="p-2 rounded hover:bg-synth-surface-high transition-colors text-synth-text-muted"
                      >
                        <span className="material-symbols-outlined text-sm">close</span>
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                /* Conversational Mode Input */
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-2 text-xs text-synth-violet mb-2">
                    <span className="material-symbols-outlined text-sm">chat</span>
                    Talking to {interview.conversationalPartner === 'host' ? 'HOST' : 'EXPERT'}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      id="conversational-input"
                      onKeyDown={e => {
                        if (e.key === 'Enter' && !e.shiftKey && (e.target as HTMLInputElement).value.trim()) {
                          e.preventDefault();
                          sendConversationalMessage((e.target as HTMLInputElement).value);
                          (e.target as HTMLInputElement).value = '';
                        }
                      }}
                      placeholder={`Ask the ${interview.conversationalPartner} anything... (Enter to send)`}
                      className="flex-1 input-synth text-sm"
                      autoFocus
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

      </main>
      
      {/* Terminal Log */}
      <TerminalLog modelStatus={modelStatus} lastAction={lastAction} />
      
      {/* Modal */}
      <Modal modal={modal} onClose={closeModal} />

      {/* Merge Preview Modal */}
      {mergePreview.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="relative bg-synth-surface border border-synth-border w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl">
            {/* Traveling border glow effect */}
            <div className="modal-border-light top" />
            <div className="modal-border-light right" />
            <div className="modal-border-light bottom" />
            <div className="modal-border-light left" />

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-synth-border-subtle bg-synth-surface-high">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-synth-cyan">merge_type</span>
                <h3 className="font-headline text-sm font-bold tracking-wider uppercase">
                  MERGE_PREVIEW
                </h3>
              </div>
              <button
                className="text-synth-text-muted hover:text-synth-text"
                onClick={cancelMerge}
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {/* Source chats */}
              <div className="mb-6">
                <h4 className="text-2xs text-synth-text-secondary uppercase tracking-wider mb-3">
                  Source Conversations ({mergePreview.sourceChats.length})
                </h4>
                <div className="space-y-2">
                  {mergePreview.sourceChats.map(chat => (
                    <div key={chat.id} className="flex items-center gap-3 p-3 bg-synth-surface-high border border-synth-border-subtle">
                      <span className="material-symbols-outlined text-synth-cyan text-sm">chat</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm truncate">{chat.title}</p>
                        <p className="text-2xs text-synth-text-muted">{chat.messages.length} messages</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* AI Summary */}
              <div>
                <h4 className="text-2xs text-synth-text-secondary uppercase tracking-wider mb-3">
                  AI Synthesis
                </h4>
                {mergePreview.isGenerating ? (
                  <div className="p-6 text-center border border-synth-border-subtle bg-synth-surface-high">
                    <div className="inline-block w-6 h-6 border-2 border-synth-cyan border-t-transparent rounded-full animate-spin mb-3" />
                    <p className="text-synth-text-secondary text-sm">Analyzing conversations...</p>
                    <p className="text-2xs text-synth-text-muted mt-1">Extracting key themes and insights</p>
                  </div>
                ) : (
                  <div className="p-4 border border-synth-border-subtle bg-synth-surface-high">
                    <div
                      className="markdown-content text-sm text-synth-text-secondary"
                      dangerouslySetInnerHTML={{
                        __html: marked.parse(mergePreview.summary, { breaks: true }) as string
                      }}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-synth-border-subtle bg-synth-surface-high">
              <button
                className="btn-synth-secondary"
                onClick={cancelMerge}
                disabled={mergePreview.isGenerating}
              >
                Cancel
              </button>
              <button
                className="btn-synth-primary"
                onClick={executeMerge}
                disabled={mergePreview.isGenerating}
              >
                <span className="material-symbols-outlined text-sm">merge_type</span>
                Create Merged Chat
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Topic Management Modal */}
      {topicModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="relative bg-synth-surface border border-synth-border w-full max-w-md flex flex-col shadow-2xl">
            {/* Traveling border glow effect */}
            <div className="modal-border-light top" />
            <div className="modal-border-light right" />
            <div className="modal-border-light bottom" />
            <div className="modal-border-light left" />

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-synth-border-subtle bg-synth-surface-high">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-synth-cyan">
                  {topicModal.mode === 'add' ? 'add_circle' : 'drive_file_move'}
                </span>
                <h3 className="font-headline text-sm font-bold tracking-wider uppercase">
                  {topicModal.mode === 'add' ? 'ADD_TOPIC' : 'MOVE_THREAD'}
                </h3>
              </div>
              <button
                className="text-synth-text-muted hover:text-synth-text"
                onClick={() => setTopicModal({ isOpen: false, mode: 'add' })}
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {topicModal.mode === 'add' ? (
                // Add Topic Form
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const form = e.target as HTMLFormElement;
                    const name = (form.elements.namedItem('name') as HTMLInputElement).value.trim();
                    const description = (form.elements.namedItem('description') as HTMLInputElement).value.trim();
                    const icon = (form.elements.namedItem('icon') as HTMLInputElement).value.trim() || 'label';
                    if (name) {
                      if (addTopic(name, description, icon)) {
                        setTopicModal({ isOpen: false, mode: 'add' });
                      }
                    }
                  }}
                  className="space-y-4"
                >
                  <div>
                    <label className="block text-2xs text-synth-text-secondary uppercase tracking-wider mb-2">
                      Topic Name *
                    </label>
                    <input
                      type="text"
                      name="name"
                      required
                      placeholder="e.g., Photography"
                      className="w-full bg-synth-surface border border-synth-border-subtle rounded px-3 py-2 text-sm text-synth-text placeholder-synth-text-muted focus:outline-none focus:border-synth-cyan"
                    />
                  </div>
                  <div>
                    <label className="block text-2xs text-synth-text-secondary uppercase tracking-wider mb-2">
                      Description
                    </label>
                    <input
                      type="text"
                      name="description"
                      placeholder="What is this topic about?"
                      className="w-full bg-synth-surface border border-synth-border-subtle rounded px-3 py-2 text-sm text-synth-text placeholder-synth-text-muted focus:outline-none focus:border-synth-cyan"
                    />
                  </div>
                  <div>
                    <label className="block text-2xs text-synth-text-secondary uppercase tracking-wider mb-2">
                      Icon (Material Symbol name)
                    </label>
                    <input
                      type="text"
                      name="icon"
                      placeholder="label"
                      defaultValue="label"
                      className="w-full bg-synth-surface border border-synth-border-subtle rounded px-3 py-2 text-sm text-synth-text placeholder-synth-text-muted focus:outline-none focus:border-synth-cyan"
                    />
                    <p className="text-2xs text-synth-text-muted mt-1">
                      Use Material Symbols names: photo, camera, music, book, etc.
                    </p>
                  </div>
                  <div className="flex gap-3 pt-4">
                    <button
                      type="button"
                      className="flex-1 btn-synth-secondary"
                      onClick={() => setTopicModal({ isOpen: false, mode: 'add' })}
                    >
                      Cancel
                    </button>
                    <button type="submit" className="flex-1 btn-synth-primary">
                      Add Topic
                    </button>
                  </div>
                </form>
              ) : (
                // Move to Topic Selector
                <div className="space-y-4">
                  {topicModal.targetTopic && (
                    <p className="text-sm text-synth-text-secondary">
                      Moving threads from "{topicModal.targetTopic.name}" to:
                    </p>
                  )}
                  <div className="space-y-2">
                    {topics
                      .filter(t => t.id !== topicModal.targetTopic?.id)
                      .map(topic => {
                        const count = chats.filter(c => c.topicId === topic.id).length;
                        return (
                          <button
                            key={topic.id}
                            className="w-full p-4 bg-synth-surface-high border border-synth-border-subtle rounded hover:border-synth-cyan transition-colors text-left"
                            onClick={() => {
                              if (topicModal.targetTopic) {
                                // Moving from delete confirmation
                                const chatsInTopic = chats.filter(c => c.topicId === topicModal.targetTopic!.id);
                                // Move all chats to selected topic
                                chatsInTopic.forEach(chat => moveChatToTopic(chat.id, topic.id));
                                // Then delete the old topic
                                removeTopic(topicModal.targetTopic!.id, false);
                              } else if (activeChat) {
                                // Moving single chat
                                moveChatToTopic(activeChat, topic.id);
                              }
                              setTopicModal({ isOpen: false, mode: 'add' });
                            }}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <span className="material-symbols-outlined text-synth-cyan">
                                  {topic.icon}
                                </span>
                                <span className="text-sm font-medium">{topic.name}</span>
                              </div>
                              <span className="text-2xs text-synth-text-muted">
                                {count} thread{count !== 1 ? 's' : ''}
                              </span>
                            </div>
                          </button>
                        );
                      })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;