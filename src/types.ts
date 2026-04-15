// Types
export type TopicId = 'explore' | 'learn' | 'create' | 'refine' | 'review' | 'archive';
export type View = 'landing' | 'chat' | 'settings' | 'interview';
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
  hostBaseUrl: string;  // LM Studio URL for interview Host
  expertBaseUrl: string; // LM Studio URL for interview Expert
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

// Interview Mode Types
export type InterviewSpeaker = 'host' | 'expert' | 'user';

export interface InterviewMessage {
  id: string;
  speaker: InterviewSpeaker;
  text: string;
  timestamp: string;
}

export interface AudienceQuestion {
  id: string;
  text: string;
  status: 'queued' | 'answered';
  timestamp: string;
}

export interface InterviewState {
  isActive: boolean;
  topic: string;
  hostModel: string;
  expertModel: string;
  messages: InterviewMessage[];
  audienceQuestions: AudienceQuestion[];
  handRaised: boolean;
  userQuestion: string;
  userGuidance: string;
  isRunning: boolean;
  turnCount: number;
  lastSpeaker: InterviewSpeaker;
}
