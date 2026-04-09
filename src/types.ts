// Types
export type TopicId = 'golf' | 'football' | 'gaming' | 'work' | 'ideas' | 'learning';
export type View = 'landing' | 'chat' | 'settings';
export type ModelStatus = 'ready' | 'testing' | 'error' | 'offline';
export type ModalType = 'confirm' | 'prompt' | 'alert';

export interface Topic {
  id: TopicId;
  name: string;
  description: string;
  icon: string;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  createdAt: string;
  error?: string;
  model?: string;
}

export interface Chat {
  id: string;
  topicId: TopicId;
  title: string;
  messages: Message[];
  createdAt: string;
  updatedAt: string;
  parentId?: string;
  branchPoint?: number;
  tags: string[];
  isArchived?: boolean;
}

export interface Settings {
  providerLabel: string;
  baseUrl: string;
  model: string;
  apiKey: string;
  braveApiKey: string;
  enableWebSearch: boolean;
}

export interface ModalState {
  isOpen: boolean;
  type: ModalType;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  defaultValue?: string;
  onConfirm?: (value?: string) => void;
  onCancel?: () => void;
}

// Tree View Types
export interface TreeNode {
  chat: Chat;
  children: TreeNode[];
  depth: number;
}
