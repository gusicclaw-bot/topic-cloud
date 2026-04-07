import { ChangeEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';

type TopicId = 'golf' | 'football' | 'gaming' | 'work' | 'ideas' | 'learning';
type View = 'home' | 'journal' | 'settings';
type JournalKind = 'pinned fact' | 'theme' | 'note';

type Topic = {
  id: TopicId;
  name: string;
  icon: string;
  color: string;
  description: string;
  energy: string;
  prompt: string;
};

type Message = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  createdAt: string;
  meta?: {
    providerLabel?: string;
    model?: string;
    endpoint?: 'responses' | 'chat.completions';
    error?: string;
  };
};

type Chat = {
  id: string;
  topicId: TopicId;
  title: string;
  summary: string;
  mood: string;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
  messages: Message[];
};

type JournalEntry = {
  id: string;
  topicId?: TopicId;
  title: string;
  kind: JournalKind;
  text: string;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
  pinned?: boolean;
};

type Settings = {
  providerLabel: string;
  baseUrl: string;
  model: string;
  apiKey: string;
  fallbackModel: string;
};

type SeedState = {
  topics: Topic[];
  chats: Chat[];
  journal: JournalEntry[];
  settings: Settings;
};

type PersistedState = SeedState & {
  version: number;
};

type AppUiState = {
  activeView: View;
  selectedTopicId: TopicId;
  selectedChatId: string;
  draftMessage: string;
  journalDraft: string;
  journalKind: JournalKind;
  journalPinned: boolean;
  journalTopicFilter: TopicId | 'all';
};

const STORAGE_KEY = 'topic-cloud-state-v2';
const LEGACY_STORAGE_KEY = 'topic-cloud-state-v1';
const STORAGE_VERSION = 2;
const UI_STORAGE_KEY = 'topic-cloud-ui-v1';

const TOPICS: Topic[] = [
  {
    id: 'golf',
    name: 'Golf',
    icon: '⛳',
    color: 'linear-gradient(135deg, #37c67f, #8ce36b)',
    description: 'Practice plans, swing thoughts, rounds, and equipment notes.',
    energy: 'steady progress',
    prompt: 'What changed in my swing this week, and what should I try next?',
  },
  {
    id: 'football',
    name: 'Football',
    icon: '⚽',
    color: 'linear-gradient(135deg, #4ea6ff, #7a6cff)',
    description: 'Fixtures, tactics, transfer thoughts, and match recaps.',
    energy: 'matchday focus',
    prompt: 'Track my current talking points, predictions, and post-match takeaways.',
  },
  {
    id: 'gaming',
    name: 'Gaming',
    icon: '🎮',
    color: 'linear-gradient(135deg, #8b5cf6, #ec4899)',
    description: 'Backlog, live games, recommendations, and strategy notes.',
    energy: 'playful immersion',
    prompt: 'What am I playing now, and what deserves attention next?',
  },
  {
    id: 'work',
    name: 'Work',
    icon: '💼',
    color: 'linear-gradient(135deg, #f59e0b, #ef4444)',
    description: 'Projects, decisions, follow-ups, and meeting memory.',
    energy: 'execution mode',
    prompt: 'Keep the important threads visible and the next moves obvious.',
  },
  {
    id: 'ideas',
    name: 'Ideas',
    icon: '💡',
    color: 'linear-gradient(135deg, #f97316, #facc15)',
    description: 'Loose concepts, sparks, side-projects, and creative fragments.',
    energy: 'messy brilliance',
    prompt: 'Capture half-formed thoughts before they vanish.',
  },
  {
    id: 'learning',
    name: 'Learning',
    icon: '📚',
    color: 'linear-gradient(135deg, #14b8a6, #22c55e)',
    description: 'Insights, lessons, reading notes, and repeated patterns.',
    energy: 'compounding knowledge',
    prompt: 'What have I learned lately that should stay sticky?',
  },
];

function hoursAgo(hours: number) {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

function daysAgo(days: number, hour = 18, minute = 0) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
}

const seededState: SeedState = {
  topics: TOPICS,
  chats: [
    {
      id: 'chat-golf-routine',
      topicId: 'golf',
      title: 'Spring range routine',
      summary: 'Dial in tempo and face control before weekend rounds.',
      createdAt: daysAgo(3, 9, 0),
      updatedAt: hoursAgo(2),
      mood: 'Calm focus',
      messages: [
        {
          id: 'm1',
          role: 'assistant',
          text: 'I pulled together a compact practice block: 10 wedge flights, 15 mid-iron tempo reps, and 10 driver starts with one swing cue only.',
          createdAt: daysAgo(0, 9, 12),
        },
        {
          id: 'm2',
          role: 'user',
          text: 'Keep the routine short enough for weekdays. I want something I can actually repeat.',
          createdAt: daysAgo(0, 9, 13),
        },
        {
          id: 'm3',
          role: 'assistant',
          text: 'Then cap it at 35 minutes and finish with a 9-ball challenge. Repetition beats ambition here.',
          createdAt: daysAgo(0, 9, 15),
        },
      ],
    },
    {
      id: 'chat-football-notes',
      topicId: 'football',
      title: 'Weekend fixture notes',
      summary: 'Patterns, lineups, and talking points to revisit after kickoff.',
      createdAt: daysAgo(2, 10, 40),
      updatedAt: hoursAgo(5),
      mood: 'Analytical',
      messages: [
        {
          id: 'm4',
          role: 'assistant',
          text: 'Main thread: watch how the midfield shape shifts when the fullbacks push. That changes everything in transition.',
          createdAt: daysAgo(0, 11, 6),
        },
        {
          id: 'm5',
          role: 'user',
          text: 'Also keep a running note on who looks sharp in the press during the first 20 minutes.',
          createdAt: daysAgo(0, 11, 9),
        },
      ],
    },
    {
      id: 'chat-gaming-backlog',
      topicId: 'gaming',
      title: 'What to play next',
      summary: 'Balance comfort games with one sharper, shorter experience.',
      createdAt: daysAgo(6, 20, 0),
      updatedAt: daysAgo(1, 20, 14),
      mood: 'Curious',
      messages: [
        {
          id: 'm6',
          role: 'assistant',
          text: 'You seem happiest when the mix is one deep game, one low-pressure game, and one “finish this already” pick.',
          createdAt: daysAgo(1, 20, 14),
        },
      ],
    },
    {
      id: 'chat-work-launch',
      topicId: 'work',
      title: 'Topic Cloud MVP',
      summary: 'Personal AI workspace direction, scope, and polish checklist.',
      createdAt: daysAgo(1, 16, 20),
      updatedAt: hoursAgo(0.3),
      mood: 'Shipping',
      messages: [
        {
          id: 'm7',
          role: 'user',
          text: 'The front-end should feel modern but grounded. Not too dashboard-y, more like a smart workspace.',
          createdAt: daysAgo(0, 16, 32),
        },
        {
          id: 'm8',
          role: 'assistant',
          text: 'Got it. I’ll treat it like a personal cockpit: topic navigation, resumable chats, and memory surfaces that feel alive from first launch.',
          createdAt: daysAgo(0, 16, 33),
        },
      ],
    },
    {
      id: 'chat-ideas-fragments',
      topicId: 'ideas',
      title: 'Loose sparks',
      summary: 'Interesting fragments worth revisiting before they disappear.',
      createdAt: daysAgo(8, 8, 30),
      updatedAt: daysAgo(3, 8, 47),
      mood: 'Open-ended',
      messages: [
        {
          id: 'm9',
          role: 'user',
          text: 'Maybe the cloud isn’t just navigation — maybe it also shows topic momentum over time.',
          createdAt: daysAgo(3, 8, 47),
        },
      ],
    },
    {
      id: 'chat-learning-loop',
      topicId: 'learning',
      title: 'Patterns worth keeping',
      summary: 'Repeated lessons from work, hobbies, and personal systems.',
      createdAt: daysAgo(5, 21, 0),
      updatedAt: daysAgo(1, 22, 3),
      mood: 'Reflective',
      messages: [
        {
          id: 'm10',
          role: 'assistant',
          text: 'Recurring theme: the best systems reduce activation energy. You do more when the first step feels tiny.',
          createdAt: daysAgo(1, 22, 3),
        },
      ],
    },
  ],
  journal: [
    {
      id: 'j1',
      topicId: 'golf',
      title: 'Tempo before mechanics',
      kind: 'pinned fact',
      text: 'When the swing gets noisy, tempo fixes more than another technical thought.',
      createdAt: daysAgo(0, 8, 15),
      updatedAt: daysAgo(0, 8, 15),
      pinned: true,
    },
    {
      id: 'j2',
      topicId: 'work',
      title: 'Ship smaller slices',
      kind: 'theme',
      text: 'Momentum improves when the project has a visible “done enough” state instead of one giant finish line.',
      createdAt: daysAgo(0, 10, 5),
      updatedAt: daysAgo(0, 10, 5),
      pinned: true,
    },
    {
      id: 'j3',
      topicId: 'learning',
      title: 'Repeated insight',
      kind: 'theme',
      text: 'The tools that stick are the ones with almost no friction between thought and capture.',
      createdAt: daysAgo(1, 12, 0),
      updatedAt: daysAgo(1, 12, 0),
    },
    {
      id: 'j4',
      topicId: 'gaming',
      title: 'Play mood matters',
      kind: 'note',
      text: 'It is easier to choose a game by current energy level than by backlog guilt.',
      createdAt: daysAgo(2, 21, 10),
      updatedAt: daysAgo(2, 21, 10),
    },
    {
      id: 'j5',
      topicId: 'ideas',
      title: 'Cloud as living memory',
      kind: 'note',
      text: 'Topic cards should feel like active rooms, not static folders.',
      createdAt: daysAgo(3, 13, 45),
      updatedAt: daysAgo(3, 13, 45),
    },
  ],
  settings: {
    providerLabel: 'LM Studio',
    baseUrl: 'http://localhost:1234/v1',
    model: 'qwen/qwen3.5-9b-instruct',
    apiKey: 'lm-studio',
    fallbackModel: 'openai-compatible fallback',
  },
};

const defaultUiState: AppUiState = {
  activeView: 'home',
  selectedTopicId: 'work',
  selectedChatId: 'chat-work-launch',
  draftMessage: '',
  journalDraft: '',
  journalKind: 'note',
  journalPinned: false,
  journalTopicFilter: 'all',
};

function isTopicId(value: unknown): value is TopicId {
  return TOPICS.some((topic) => topic.id === value);
}

function isJournalKind(value: unknown): value is JournalKind {
  return value === 'pinned fact' || value === 'theme' || value === 'note';
}

function uniqueById<T extends { id: string }>(items: T[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function ensureIsoDate(value: unknown, fallback: string) {
  if (typeof value !== 'string') return fallback;
  const time = Date.parse(value);
  return Number.isNaN(time) ? fallback : new Date(time).toISOString();
}

function ensureString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatClock(dateString: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(dateString));
}

function formatRelative(dateString: string) {
  const date = new Date(dateString);
  const diffMs = date.getTime() - Date.now();
  const absMinutes = Math.round(Math.abs(diffMs) / 60000);

  if (absMinutes < 1) return 'Just now';

  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  const steps: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['year', 525600],
    ['month', 43800],
    ['week', 10080],
    ['day', 1440],
    ['hour', 60],
    ['minute', 1],
  ];

  for (const [unit, size] of steps) {
    if (absMinutes >= size || unit === 'minute') {
      return rtf.format(Math.round(diffMs / 60000 / size), unit);
    }
  }

  return 'Just now';
}

function slug(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

function formatTopicCount(chats: Chat[], topicId: TopicId) {
  const count = chats.filter((chat) => chat.topicId === topicId).length;
  return `${count} ${count === 1 ? 'chat' : 'chats'}`;
}

function deriveSummary(text: string) {
  const cleaned = text.trim().replace(/\s+/g, ' ');
  return cleaned.length > 96 ? `${cleaned.slice(0, 93).trimEnd()}…` : cleaned;
}

function deriveTitle(text: string, fallback: string) {
  const cleaned = deriveSummary(text);
  if (!cleaned) return fallback;
  const stripped = cleaned.replace(/[.?!]$/, '');
  return stripped.length > 42 ? `${stripped.slice(0, 39).trimEnd()}…` : stripped;
}

function normalizeBaseUrl(baseUrl: string) {
  const trimmed = baseUrl.trim();
  if (!trimmed) return '';
  return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
}

function cleanResponseText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function extractResponsesText(payload: any): string {
  if (typeof payload?.output_text === 'string' && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  const parts = Array.isArray(payload?.output)
    ? payload.output.flatMap((item: any) => {
        if (item?.type !== 'message' || !Array.isArray(item.content)) return [];
        return item.content
          .filter((part: any) => part?.type === 'output_text' && typeof part.text === 'string')
          .map((part: any) => part.text.trim())
          .filter(Boolean);
      })
    : [];

  return parts.join('\n').trim();
}

function extractChatCompletionText(payload: any): string {
  const content = payload?.choices?.[0]?.message?.content;

  if (typeof content === 'string') {
    return content.trim();
  }

  if (Array.isArray(content)) {
    return content
      .map((part: any) => {
        if (typeof part?.text === 'string') return part.text.trim();
        if (typeof part?.content === 'string') return part.content.trim();
        return '';
      })
      .filter(Boolean)
      .join('\n')
      .trim();
  }

  return '';
}

async function parseJsonResponse(response: Response) {
  const text = await response.text();

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(text || `Request failed with status ${response.status}`);
  }
}

async function requestAssistantReply(settings: Settings, topic: Topic, history: Message[]) {
  const baseUrl = normalizeBaseUrl(settings.baseUrl);

  if (!baseUrl) {
    throw new Error('Add a valid base URL in Settings before sending a live message.');
  }

  const primaryModel = settings.model.trim();
  const fallbackModel = settings.fallbackModel.trim();
  const modelsToTry = Array.from(new Set([primaryModel, fallbackModel].filter(Boolean)));

  if (!modelsToTry.length) {
    throw new Error('Add a model in Settings before sending a live message.');
  }

  const sharedHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (settings.apiKey.trim()) {
    sharedHeaders.Authorization = `Bearer ${settings.apiKey.trim()}`;
  }

  const systemPrompt = [
    `You are the AI workspace for the topic \"${topic.name}\".`,
    topic.prompt,
    'Be concise, useful, and grounded in the current thread. When possible, produce one practical next step.',
  ].join(' ');

  const recentHistory = history.slice(-12);
  const input = [
    {
      role: 'system',
      content: [{ type: 'input_text', text: systemPrompt }],
    },
    ...recentHistory.map((message) => ({
      role: message.role,
      content: [{ type: 'input_text', text: message.text }],
    })),
  ];

  const chatMessages = [
    { role: 'system', content: systemPrompt },
    ...recentHistory.map((message) => ({ role: message.role, content: message.text })),
  ];

  const attempts: string[] = [];

  for (const model of modelsToTry) {
    try {
      const responsesReply = await fetch(`${baseUrl}/responses`, {
        method: 'POST',
        headers: sharedHeaders,
        body: JSON.stringify({
          model,
          input,
          temperature: 0.2,
          max_output_tokens: 800,
          text: { format: { type: 'text' } },
        }),
      });

      const responsesPayload = await parseJsonResponse(responsesReply);

      if (!responsesReply.ok) {
        throw new Error(responsesPayload?.error?.message || `Responses request failed (${responsesReply.status})`);
      }

      const responsesText = extractResponsesText(responsesPayload);
      if (responsesText) {
        return {
          text: responsesText,
          model,
          endpoint: 'responses' as const,
        };
      }

      attempts.push(`${model} via responses returned empty output`);
    } catch (error) {
      attempts.push(`${model} via responses failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    try {
      const chatReply = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: sharedHeaders,
        body: JSON.stringify({
          model,
          messages: chatMessages,
          temperature: 0.2,
          max_tokens: 800,
        }),
      });

      const chatPayload = await parseJsonResponse(chatReply);

      if (!chatReply.ok) {
        throw new Error(chatPayload?.error?.message || `Chat request failed (${chatReply.status})`);
      }

      const chatText = extractChatCompletionText(chatPayload);
      if (chatText) {
        return {
          text: chatText,
          model,
          endpoint: 'chat.completions' as const,
        };
      }

      attempts.push(`${model} via chat/completions returned empty output`);
    } catch (error) {
      attempts.push(`${model} via chat/completions failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  throw new Error(attempts[attempts.length - 1] || 'No compatible model reply was returned.');
}

function buildAssistantReply(topic: Topic, text: string) {
  const lowered = text.toLowerCase();

  if (lowered.includes('?')) {
    return `Captured. I’d use this ${topic.name.toLowerCase()} thread to answer the question in steps, then turn the best takeaway into a sticky note if it keeps recurring.`;
  }

  if (lowered.includes('plan') || lowered.includes('next') || lowered.includes('todo')) {
    return `Saved. This feels actionable, so I’d keep the next step explicit and let the thread hold the supporting context.`;
  }

  if (lowered.length < 80) {
    return `Saved to ${topic.name}. Short notes work well here — they keep the room alive without forcing everything into polished journal entries.`;
  }

  return `Saved to ${topic.name}. This has enough detail to shape the thread summary, and the core idea can graduate into the journal if it proves durable.`;
}

async function testModelConnection(settings: Settings) {
  const baseUrl = normalizeBaseUrl(settings.baseUrl);
  const model = settings.model.trim();

  if (!baseUrl) {
    throw new Error('Add a valid base URL first.');
  }

  if (!model) {
    throw new Error('Add a model id first.');
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (settings.apiKey.trim()) {
    headers.Authorization = `Bearer ${settings.apiKey.trim()}`;
  }

  const startedAt = performance.now();
  const reply = await fetch(`${baseUrl}/responses`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      input: 'Reply with exactly CONNECTION_OK',
      temperature: 0.1,
      max_output_tokens: 64,
      text: { format: { type: 'text' } },
    }),
  });

  const payload = await parseJsonResponse(reply);
  if (!reply.ok) {
    throw new Error(payload?.error?.message || `Connection test failed (${reply.status})`);
  }

  const text = extractResponsesText(payload);
  if (!text) {
    throw new Error('The model responded, but returned no visible text.');
  }

  return {
    text,
    elapsedMs: Math.round(performance.now() - startedAt),
  };
}

function sanitizeMessage(item: unknown, fallbackTime: string): Message | null {
  if (!item || typeof item !== 'object') return null;
  const candidate = item as Partial<Message> & { timestamp?: string };
  const text = ensureString(candidate.text).trim();
  const role = candidate.role === 'assistant' || candidate.role === 'user' ? candidate.role : null;
  if (!text || !role) return null;

  const meta = candidate.meta && typeof candidate.meta === 'object'
    ? {
        providerLabel: cleanResponseText((candidate.meta as Message['meta'])?.providerLabel),
        model: cleanResponseText((candidate.meta as Message['meta'])?.model),
        endpoint:
          (candidate.meta as Message['meta'])?.endpoint === 'responses' ||
          (candidate.meta as Message['meta'])?.endpoint === 'chat.completions'
            ? (candidate.meta as Message['meta'])?.endpoint
            : undefined,
        error: cleanResponseText((candidate.meta as Message['meta'])?.error),
      }
    : undefined;

  return {
    id: ensureString(candidate.id, createId('msg')),
    role,
    text,
    createdAt: ensureIsoDate(candidate.createdAt ?? candidate.timestamp, fallbackTime),
    meta:
      meta && (meta.providerLabel || meta.model || meta.endpoint || meta.error)
        ? meta
        : undefined,
  };
}

function sanitizeChat(item: unknown, topicIds: Set<TopicId>): Chat | null {
  if (!item || typeof item !== 'object') return null;
  const candidate = item as Partial<Chat> & { updatedAt?: string; createdAt?: string };
  if (!candidate.topicId || !topicIds.has(candidate.topicId)) return null;

  const fallbackTime = ensureIsoDate(candidate.updatedAt, new Date().toISOString());
  const messages = Array.isArray(candidate.messages)
    ? candidate.messages
        .map((message) => sanitizeMessage(message, fallbackTime))
        .filter((message): message is Message => Boolean(message))
    : [];

  return {
    id: ensureString(candidate.id, createId('chat')),
    topicId: candidate.topicId,
    title: ensureString(candidate.title, 'Untitled chat'),
    summary: ensureString(candidate.summary, messages[messages.length - 1]?.text ?? 'Conversation notes'),
    mood: ensureString(candidate.mood, 'Focused'),
    createdAt: ensureIsoDate(candidate.createdAt, messages[0]?.createdAt ?? fallbackTime),
    updatedAt: ensureIsoDate(candidate.updatedAt, messages[messages.length - 1]?.createdAt ?? fallbackTime),
    archivedAt: typeof candidate.archivedAt === 'string' ? ensureIsoDate(candidate.archivedAt, fallbackTime) : undefined,
    messages,
  };
}

function sanitizeJournalEntry(item: unknown, topicIds: Set<TopicId>): JournalEntry | null {
  if (!item || typeof item !== 'object') return null;
  const candidate = item as Partial<JournalEntry>;
  const text = ensureString(candidate.text).trim();
  if (!text) return null;

  const topicId = candidate.topicId && topicIds.has(candidate.topicId) ? candidate.topicId : undefined;
  const updatedAt = ensureIsoDate(candidate.updatedAt, new Date().toISOString());
  const kind = isJournalKind(candidate.kind) ? candidate.kind : 'note';

  return {
    id: ensureString(candidate.id, createId('journal')),
    topicId,
    title: ensureString(candidate.title, deriveTitle(text, 'Quick note')),
    kind,
    text,
    createdAt: ensureIsoDate(candidate.createdAt, updatedAt),
    updatedAt,
    archivedAt: typeof candidate.archivedAt === 'string' ? ensureIsoDate(candidate.archivedAt, updatedAt) : undefined,
    pinned: Boolean(candidate.pinned) || kind === 'pinned fact',
  };
}

function normalizeState(input: Partial<PersistedState> | SeedState): PersistedState {
  const topics = TOPICS;
  const topicIds = new Set<TopicId>(topics.map((topic) => topic.id));

  const chats = uniqueById(
    (Array.isArray(input.chats) ? input.chats : seededState.chats)
      .map((chat) => sanitizeChat(chat, topicIds))
      .filter((chat): chat is Chat => Boolean(chat)),
  ).sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));

  const journal = uniqueById(
    (Array.isArray(input.journal) ? input.journal : seededState.journal)
      .map((entry) => sanitizeJournalEntry(entry, topicIds))
      .filter((entry): entry is JournalEntry => Boolean(entry)),
  ).sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));

  return {
    version: STORAGE_VERSION,
    topics,
    chats,
    journal,
    settings: {
      providerLabel: ensureString(input.settings?.providerLabel, seededState.settings.providerLabel),
      baseUrl: ensureString(input.settings?.baseUrl, seededState.settings.baseUrl),
      model: ensureString(input.settings?.model, seededState.settings.model),
      apiKey: ensureString(input.settings?.apiKey, seededState.settings.apiKey),
      fallbackModel: ensureString(input.settings?.fallbackModel, seededState.settings.fallbackModel),
    },
  };
}

function loadState(): PersistedState {
  if (typeof window === 'undefined') {
    return normalizeState(seededState);
  }

  const raw = window.localStorage.getItem(STORAGE_KEY) ?? window.localStorage.getItem(LEGACY_STORAGE_KEY);
  if (!raw) {
    return normalizeState(seededState);
  }

  try {
    const parsed = JSON.parse(raw) as Partial<PersistedState>;
    return normalizeState(parsed);
  } catch {
    return normalizeState(seededState);
  }
}

function loadUiState(): AppUiState {
  if (typeof window === 'undefined') {
    return defaultUiState;
  }

  const raw = window.localStorage.getItem(UI_STORAGE_KEY);
  if (!raw) return defaultUiState;

  try {
    const parsed = JSON.parse(raw) as Partial<AppUiState>;
    return {
      activeView: parsed.activeView === 'journal' || parsed.activeView === 'settings' ? parsed.activeView : 'home',
      selectedTopicId: isTopicId(parsed.selectedTopicId) ? parsed.selectedTopicId : defaultUiState.selectedTopicId,
      selectedChatId: ensureString(parsed.selectedChatId),
      draftMessage: ensureString(parsed.draftMessage),
      journalDraft: ensureString(parsed.journalDraft),
      journalKind: isJournalKind(parsed.journalKind) ? parsed.journalKind : defaultUiState.journalKind,
      journalPinned: Boolean(parsed.journalPinned),
      journalTopicFilter:
        parsed.journalTopicFilter === 'all' || isTopicId(parsed.journalTopicFilter)
          ? parsed.journalTopicFilter
          : defaultUiState.journalTopicFilter,
    };
  } catch {
    return defaultUiState;
  }
}

function getStorageStatus() {
  if (typeof window === 'undefined') return 'Memory only';
  try {
    const probeKey = `${STORAGE_KEY}-probe`;
    window.localStorage.setItem(probeKey, 'ok');
    window.localStorage.removeItem(probeKey);
    return 'Saved locally';
  } catch {
    return 'Storage blocked';
  }
}

function App() {
  const [state, setState] = useState<PersistedState>(() => loadState());
  const [uiState, setUiState] = useState<AppUiState>(() => loadUiState());
  const [storageStatus, setStorageStatus] = useState(() => getStorageStatus());
  const [showApiKey, setShowApiKey] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [composerError, setComposerError] = useState('');
  const [pendingChatId, setPendingChatId] = useState('');
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<
    { kind: 'ok'; message: string } | { kind: 'error'; message: string } | null
  >(null);
  const hasHydratedRef = useRef(false);
  const messageStreamRef = useRef<HTMLDivElement | null>(null);

  const activeView = uiState.activeView;
  const selectedTopicId = uiState.selectedTopicId;
  const selectedChatId = uiState.selectedChatId;
  const draftMessage = uiState.draftMessage;
  const journalDraft = uiState.journalDraft;
  const journalKind = uiState.journalKind;
  const journalPinned = uiState.journalPinned;
  const journalTopicFilter = uiState.journalTopicFilter;

  const selectedTopic = useMemo(
    () => state.topics.find((topic) => topic.id === selectedTopicId) ?? state.topics[0],
    [state.topics, selectedTopicId],
  );

  const topicChats = useMemo(
    () => state.chats.filter((chat) => chat.topicId === selectedTopicId && !chat.archivedAt),
    [state.chats, selectedTopicId],
  );

  const selectedChat = useMemo(
    () => topicChats.find((chat) => chat.id === selectedChatId) ?? topicChats[0] ?? null,
    [topicChats, selectedChatId],
  );

  const selectedTopicJournal = useMemo(
    () => state.journal.filter((entry) => entry.topicId === selectedTopicId && !entry.archivedAt),
    [state.journal, selectedTopicId],
  );

  const pinnedJournal = useMemo(
    () => state.journal.filter((entry) => entry.pinned && !entry.archivedAt).slice(0, 4),
    [state.journal],
  );

  const filteredJournal = useMemo(() => {
    return state.journal.filter((entry) => {
      if (entry.archivedAt) return false;
      if (journalTopicFilter === 'all') return true;
      return entry.topicId === journalTopicFilter;
    });
  }, [state.journal, journalTopicFilter]);

  const archivedChats = useMemo(() => state.chats.filter((chat) => chat.archivedAt), [state.chats]);
  const archivedJournal = useMemo(() => state.journal.filter((entry) => entry.archivedAt), [state.journal]);

  const topicStats = useMemo(() => {
    const latestChat = topicChats[0] ?? null;
    const lastMessage = latestChat?.messages[latestChat.messages.length - 1] ?? null;
    const noteCount = selectedTopicJournal.length;

    return {
      chatCount: topicChats.length,
      noteCount,
      lastTouch: latestChat ? formatRelative(latestChat.updatedAt) : 'No activity yet',
      latestSnippet: latestChat?.summary ?? 'Start a thread to build momentum here.',
      lastMessageTime: lastMessage ? formatClock(lastMessage.createdAt) : null,
    };
  }, [selectedTopicJournal.length, topicChats]);

  useEffect(() => {
    if (!topicChats.length) {
      setUiState((current) => ({ ...current, selectedChatId: '' }));
      return;
    }

    if (!topicChats.some((chat) => chat.id === selectedChatId)) {
      setUiState((current) => ({ ...current, selectedChatId: topicChats[0].id }));
    }
  }, [selectedChatId, topicChats]);

  useEffect(() => {
    if (!hasHydratedRef.current) {
      hasHydratedRef.current = true;
      return;
    }

    try {
      const persisted = { ...state, version: STORAGE_VERSION };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
      if (window.localStorage.getItem(LEGACY_STORAGE_KEY)) {
        window.localStorage.removeItem(LEGACY_STORAGE_KEY);
      }
      setStorageStatus('Saved locally');
    } catch {
      setStorageStatus('Storage blocked');
    }
  }, [state]);

  useEffect(() => {
    try {
      window.localStorage.setItem(UI_STORAGE_KEY, JSON.stringify(uiState));
    } catch {
      // ignore UI persistence failures; data state is more important
    }
  }, [uiState]);

  useEffect(() => {
    if (!messageStreamRef.current) return;
    messageStreamRef.current.scrollTop = messageStreamRef.current.scrollHeight;
  }, [selectedChat?.id, selectedChat?.messages.length]);

  const setActiveView = (view: View) => setUiState((current) => ({ ...current, activeView: view }));
  const setSelectedTopicId = (topicId: TopicId) => setUiState((current) => ({ ...current, selectedTopicId: topicId }));
  const setSelectedChatId = (chatId: string) => setUiState((current) => ({ ...current, selectedChatId: chatId }));
  const setDraftMessage = (value: string) => setUiState((current) => ({ ...current, draftMessage: value }));
  const setJournalDraft = (value: string) => setUiState((current) => ({ ...current, journalDraft: value }));

  const openTopic = (topicId: TopicId) => {
    setUiState((current) => ({
      ...current,
      activeView: 'home',
      selectedTopicId: topicId,
      selectedChatId: state.chats.find((chat) => chat.topicId === topicId)?.id ?? '',
      journalTopicFilter: topicId,
    }));
  };

  const createChat = (openingMessage?: string) => {
    const topic = selectedTopic;
    const nowIso = new Date().toISOString();
    const trimmedOpening = openingMessage?.trim() ?? '';

    const starterMessages: Message[] = trimmedOpening
      ? [
          {
            id: createId('msg'),
            role: 'user',
            text: trimmedOpening,
            createdAt: nowIso,
          },
        ]
      : [
          {
            id: createId('msg'),
            role: 'assistant',
            text: `New ${topic.name.toLowerCase()} workspace ready. Start anywhere — questions, notes, plans, or messy fragments all belong here.`,
            createdAt: nowIso,
          },
        ];

    const firstRealText = trimmedOpening || starterMessages[0].text;
    const newChat: Chat = {
      id: createId(`chat-${topic.id}`),
      topicId: topic.id,
      title: deriveTitle(firstRealText, `${topic.name} scratchpad`),
      summary: trimmedOpening
        ? deriveSummary(trimmedOpening)
        : `Fresh thread for ${topic.name.toLowerCase()} thoughts and next steps.`,
      mood: topic.energy,
      createdAt: nowIso,
      updatedAt: nowIso,
      messages: starterMessages,
    };

    setState((current) => ({ ...current, chats: [newChat, ...current.chats] }));
    setUiState((current) => ({
      ...current,
      selectedChatId: newChat.id,
      activeView: 'home',
      draftMessage: '',
    }));

    return newChat;
  };

  const sendMessage = async () => {
    const trimmed = draftMessage.trim();
    if (!trimmed || isSending) return;

    setIsSending(true);
    setComposerError('');

    const nowIso = new Date().toISOString();
    const userMessage: Message = {
      id: createId('msg'),
      role: 'user',
      text: trimmed,
      createdAt: nowIso,
    };

    const activeChat = selectedChat;
    const chat = activeChat ?? createChat(trimmed);
    setPendingChatId(chat.id);

    if (activeChat) {
      setState((current) => ({
        ...current,
        chats: current.chats
          .map((entry) =>
            entry.id === activeChat.id
              ? {
                  ...entry,
                  title: entry.messages.length <= 1 ? deriveTitle(trimmed, entry.title) : entry.title,
                  summary: deriveSummary(trimmed),
                  updatedAt: nowIso,
                  messages: [...entry.messages, userMessage],
                }
              : entry,
          )
          .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)),
      }));
    }

    setDraftMessage('');

    try {
      const history = [...chat.messages, userMessage];
      const reply = await requestAssistantReply(state.settings, selectedTopic, history);
      const assistantMessage: Message = {
        id: createId('msg'),
        role: 'assistant',
        text: reply.text,
        createdAt: new Date().toISOString(),
        meta: {
          providerLabel: state.settings.providerLabel.trim(),
          model: reply.model,
          endpoint: reply.endpoint,
        },
      };

      setState((current) => ({
        ...current,
        chats: current.chats
          .map((entry) =>
            entry.id === chat.id
              ? {
                  ...entry,
                  summary: deriveSummary(reply.text),
                  updatedAt: assistantMessage.createdAt,
                  messages: [...entry.messages, assistantMessage],
                }
              : entry,
          )
          .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)),
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get a model reply.';
      const fallbackText = `${buildAssistantReply(selectedTopic, trimmed)}\n\nLive request failed: ${message}`;
      const assistantMessage: Message = {
        id: createId('msg'),
        role: 'assistant',
        text: fallbackText,
        createdAt: new Date().toISOString(),
        meta: {
          providerLabel: state.settings.providerLabel.trim(),
          model: state.settings.model.trim() || undefined,
          error: message,
        },
      };

      setComposerError(message);
      setState((current) => ({
        ...current,
        chats: current.chats
          .map((entry) =>
            entry.id === chat.id
              ? {
                  ...entry,
                  summary: deriveSummary(trimmed),
                  updatedAt: assistantMessage.createdAt,
                  messages: [...entry.messages, assistantMessage],
                }
              : entry,
          )
          .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)),
      }));
    } finally {
      setIsSending(false);
      setPendingChatId('');
    }
  };

  const addJournalNote = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    const nowIso = new Date().toISOString();
    const entry: JournalEntry = {
      id: createId('journal'),
      topicId: selectedTopicId,
      title: deriveTitle(trimmed, 'Quick note'),
      kind: journalKind,
      text: trimmed,
      createdAt: nowIso,
      updatedAt: nowIso,
      pinned: journalPinned || journalKind === 'pinned fact',
    };

    setState((current) => ({
      ...current,
      journal: [entry, ...current.journal].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)),
    }));
    setUiState((current) => ({
      ...current,
      journalDraft: '',
      journalKind: 'note',
      journalPinned: false,
      activeView: 'journal',
      journalTopicFilter: selectedTopicId,
    }));
  };

  const saveComposerToJournal = () => {
    if (!draftMessage.trim()) return;
    addJournalNote(draftMessage);
    setDraftMessage('');
  };

  const clearDraftMessage = () => {
    setDraftMessage('');
  };

  const resetWorkspace = () => {
    if (typeof window !== 'undefined') {
      const confirmed = window.confirm('Reset the entire workspace to seeded demo data? This clears local chats, notes, and UI state.');
      if (!confirmed) return;
    }

    setState(normalizeState(seededState));
    setUiState(defaultUiState);
    setShowApiKey(false);
    setStorageStatus(getStorageStatus());

    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(STORAGE_KEY);
      window.localStorage.removeItem(LEGACY_STORAGE_KEY);
      window.localStorage.removeItem(UI_STORAGE_KEY);
    }
  };

  const exportWorkspace = () => {
    if (typeof window === 'undefined') return;

    const payload = {
      version: STORAGE_VERSION,
      exportedAt: new Date().toISOString(),
      state,
      uiState,
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `topic-cloud-export-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`;
    link.click();
    window.URL.revokeObjectURL(url);
  };

  const importWorkspace = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || typeof window === 'undefined') return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result ?? '{}')) as {
          state?: Partial<PersistedState> | SeedState;
          uiState?: Partial<AppUiState>;
        };

        setState(normalizeState(parsed.state ?? seededState));
        setUiState({
          ...defaultUiState,
          ...(parsed.uiState ?? {}),
          activeView:
            parsed.uiState?.activeView === 'journal' || parsed.uiState?.activeView === 'settings'
              ? parsed.uiState.activeView
              : 'home',
          selectedTopicId: isTopicId(parsed.uiState?.selectedTopicId)
            ? parsed.uiState.selectedTopicId
            : defaultUiState.selectedTopicId,
          journalKind: isJournalKind(parsed.uiState?.journalKind) ? parsed.uiState.journalKind : defaultUiState.journalKind,
          journalTopicFilter:
            parsed.uiState?.journalTopicFilter === 'all' || isTopicId(parsed.uiState?.journalTopicFilter)
              ? parsed.uiState.journalTopicFilter
              : defaultUiState.journalTopicFilter,
          selectedChatId: ensureString(parsed.uiState?.selectedChatId),
          draftMessage: ensureString(parsed.uiState?.draftMessage),
          journalDraft: ensureString(parsed.uiState?.journalDraft),
          journalPinned: Boolean(parsed.uiState?.journalPinned),
        });
        setStorageStatus('Imported locally');
      } catch {
        window.alert('Import failed. Please choose a valid Topic Cloud export file.');
      } finally {
        event.target.value = '';
      }
    };

    reader.readAsText(file);
  };

  const archiveChat = (chatId: string) => {
    const chatToArchive = state.chats.find((chat) => chat.id === chatId);
    if (!chatToArchive) return;

    if (typeof window !== 'undefined') {
      const confirmed = window.confirm(`Archive "${chatToArchive.title}"? You can restore archived threads from Settings.`);
      if (!confirmed) return;
    }

    const remainingTopicChats = state.chats.filter((chat) => chat.topicId === selectedTopicId && chat.id !== chatId && !chat.archivedAt);
    const archivedAt = new Date().toISOString();

    setState((current) => ({
      ...current,
      chats: current.chats.map((chat) => (chat.id === chatId ? { ...chat, archivedAt, updatedAt: archivedAt } : chat)),
    }));
    setUiState((current) => ({
      ...current,
      selectedChatId: current.selectedChatId === chatId ? remainingTopicChats[0]?.id ?? '' : current.selectedChatId,
    }));
  };

  const togglePinnedJournal = (entryId: string) => {
    setState((current) => ({
      ...current,
      journal: current.journal.map((entry) =>
        entry.id === entryId
          ? {
              ...entry,
              pinned: !entry.pinned,
              updatedAt: new Date().toISOString(),
            }
          : entry,
      ),
    }));
  };

  const archiveJournalEntry = (entryId: string) => {
    const entryToArchive = state.journal.find((entry) => entry.id === entryId);
    if (!entryToArchive) return;

    if (typeof window !== 'undefined') {
      const confirmed = window.confirm(`Archive "${entryToArchive.title}"? You can restore archived notes from Settings.`);
      if (!confirmed) return;
    }

    const archivedAt = new Date().toISOString();

    setState((current) => ({
      ...current,
      journal: current.journal.map((entry) =>
        entry.id === entryId ? { ...entry, archivedAt, updatedAt: archivedAt, pinned: false } : entry,
      ),
    }));
  };

  const restoreArchivedChats = () => {
    setState((current) => ({
      ...current,
      chats: current.chats.map((chat) => (chat.archivedAt ? { ...chat, archivedAt: undefined } : chat)),
    }));
  };

  const restoreArchivedJournal = () => {
    setState((current) => ({
      ...current,
      journal: current.journal.map((entry) => (entry.archivedAt ? { ...entry, archivedAt: undefined } : entry)),
    }));
  };

  const updateSettings = (key: keyof Settings, value: string) => {
    setConnectionStatus(null);
    setState((current) => ({
      ...current,
      settings: {
        ...current.settings,
        [key]: value,
      },
    }));
  };

  const runConnectionTest = async () => {
    if (isTestingConnection) return;

    setIsTestingConnection(true);
    setConnectionStatus(null);

    try {
      const result = await testModelConnection(state.settings);
      setConnectionStatus({
        kind: 'ok',
        message: `${result.text} · ${result.elapsedMs}ms · ${state.settings.model.trim()}`,
      });
    } catch (error) {
      setConnectionStatus({
        kind: 'error',
        message: error instanceof Error ? error.message : 'Connection test failed.',
      });
    } finally {
      setIsTestingConnection(false);
    }
  };

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      sendMessage();
    }
  };

  const retryLastReply = async () => {
    if (!selectedChat || isSending) return;

    const lastUserIndex = [...selectedChat.messages]
      .map((message, index) => ({ message, index }))
      .reverse()
      .find((entry) => entry.message.role === 'user');

    if (!lastUserIndex) {
      setComposerError('There is no user message to retry yet.');
      return;
    }

    const lastMessage = selectedChat.messages[selectedChat.messages.length - 1];
    const shouldReplaceAssistant = lastMessage?.role === 'assistant' && lastUserIndex.index < selectedChat.messages.length - 1;
    const history = selectedChat.messages.slice(0, lastUserIndex.index + 1);

    setIsSending(true);
    setComposerError('');
    setPendingChatId(selectedChat.id);

    try {
      const reply = await requestAssistantReply(state.settings, selectedTopic, history);
      const assistantMessage: Message = {
        id: createId('msg'),
        role: 'assistant',
        text: reply.text,
        createdAt: new Date().toISOString(),
        meta: {
          providerLabel: state.settings.providerLabel.trim(),
          model: reply.model,
          endpoint: reply.endpoint,
        },
      };

      setState((current) => ({
        ...current,
        chats: current.chats
          .map((entry) => {
            if (entry.id !== selectedChat.id) return entry;

            const baseMessages = shouldReplaceAssistant ? entry.messages.slice(0, -1) : entry.messages;
            return {
              ...entry,
              summary: deriveSummary(reply.text),
              updatedAt: assistantMessage.createdAt,
              messages: [...baseMessages, assistantMessage],
            };
          })
          .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)),
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to retry the model reply.';
      const fallbackText = `${buildAssistantReply(selectedTopic, history[history.length - 1]?.text ?? '')}\n\nLive request failed: ${message}`;
      const assistantMessage: Message = {
        id: createId('msg'),
        role: 'assistant',
        text: fallbackText,
        createdAt: new Date().toISOString(),
        meta: {
          providerLabel: state.settings.providerLabel.trim(),
          model: state.settings.model.trim() || undefined,
          error: message,
        },
      };

      setComposerError(message);
      setState((current) => ({
        ...current,
        chats: current.chats
          .map((entry) => {
            if (entry.id !== selectedChat.id) return entry;

            const baseMessages = shouldReplaceAssistant ? entry.messages.slice(0, -1) : entry.messages;
            return {
              ...entry,
              summary: deriveSummary(history[history.length - 1]?.text ?? entry.summary),
              updatedAt: assistantMessage.createdAt,
              messages: [...baseMessages, assistantMessage],
            };
          })
          .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)),
      }));
    } finally {
      setIsSending(false);
      setPendingChatId('');
    }
  };

  return (
    <div className="shell">
      <aside className="left-rail">
        <div>
          <div className="brand-badge">TOPIC CLOUD</div>
          <h1>Personal AI workspace</h1>
          <p className="muted">
            Local-first topic rooms, resumable chats, and learnings that stay close.
          </p>
        </div>

        <nav className="main-nav">
          <button className={activeView === 'home' ? 'active' : ''} onClick={() => setActiveView('home')}>
            Workspace
          </button>
          <button className={activeView === 'journal' ? 'active' : ''} onClick={() => setActiveView('journal')}>
            Journal
          </button>
          <button className={activeView === 'settings' ? 'active' : ''} onClick={() => setActiveView('settings')}>
            Settings
          </button>
        </nav>

        <div className="spotlight-card">
          <span className="label">Model target</span>
          <strong>{state.settings.providerLabel}</strong>
          <p>{state.settings.model}</p>
          <small>{state.settings.baseUrl}</small>
          <div className={`storage-pill ${storageStatus === 'Saved locally' ? 'ok' : storageStatus === 'Storage blocked' ? 'warn' : ''}`}>
            {storageStatus}
          </div>
        </div>

        <div className="memory-stack">
          <div className="stack-header">
            <span className="label">Pinned learnings</span>
            <small>{pinnedJournal.length ? `${pinnedJournal.length} visible` : 'None yet'}</small>
          </div>
          {pinnedJournal.length ? (
            pinnedJournal.map((entry) => (
              <div key={entry.id} className="memory-chip">
                <strong>{entry.title}</strong>
                <span>{entry.text}</span>
              </div>
            ))
          ) : (
            <div className="memory-chip muted-card">
              <strong>Nothing pinned yet</strong>
              <span>Pin the useful stuff so the sidebar starts feeling like real memory.</span>
            </div>
          )}
        </div>
      </aside>

      <main className="main-stage">
        <section className="hero-panel">
          <div>
            <span className="eyebrow">Living dashboard</span>
            <h2>Navigate your recurring topics like active rooms, not dead folders.</h2>
            <p className="hero-subcopy">
              Pick a topic, start a thread, pin what matters, and keep the useful context close instead of buried.
            </p>
          </div>
          <div className="hero-metrics">
            <div>
              <strong>{state.chats.length}</strong>
              <span>resumable chats</span>
            </div>
            <div>
              <strong>{state.journal.length}</strong>
              <span>journal entries</span>
            </div>
            <div>
              <strong>{storageStatus === 'Saved locally' ? 'Local' : 'Volatile'}</strong>
              <span>{storageStatus === 'Saved locally' ? 'saved in browser' : 'check browser storage'}</span>
            </div>
          </div>
        </section>

        <section className="quick-start-strip panel">
          <div>
            <span className="label">Quick start</span>
            <h3>Use Topic Cloud like a working desk, not an archive.</h3>
          </div>
          <div className="quick-start-steps">
            <div className="quick-step">
              <strong>1. Pick a room</strong>
              <p>Choose the topic you want to think inside right now.</p>
            </div>
            <div className="quick-step">
              <strong>2. Start messy</strong>
              <p>Threads can begin as rough notes, not polished prompts.</p>
            </div>
            <div className="quick-step">
              <strong>3. Keep the sticky bits</strong>
              <p>Save durable facts and themes to the journal so they stay visible.</p>
            </div>
          </div>
        </section>

        <section className="topic-cloud-grid">
          {state.topics.map((topic, index) => {
            const topicChatsForCard = state.chats.filter((chat) => chat.topicId === topic.id);
            const topicNotesForCard = state.journal.filter((entry) => entry.topicId === topic.id);
            const topicChatCount = topicChatsForCard.length;
            const topicJournalCount = topicNotesForCard.length;
            const latestTopicTouch = topicChatsForCard[0]?.updatedAt ?? topicNotesForCard[0]?.updatedAt ?? null;
            const topicPinnedCount = topicNotesForCard.filter((entry) => entry.pinned).length;

            return (
              <button
                key={topic.id}
                className={`topic-card ${selectedTopicId === topic.id ? 'selected' : ''}`}
                style={{ backgroundImage: topic.color, animationDelay: `${index * 80}ms` }}
                onClick={() => openTopic(topic.id)}
              >
                <div className="topic-icon">{topic.icon}</div>
                <div className="topic-copy">
                  <div className="topic-heading">
                    <h3>{topic.name}</h3>
                    <span>{formatTopicCount(state.chats, topic.id)}</span>
                  </div>
                  <p>{topic.description}</p>
                  <div className="topic-meta-row">
                    <small>{topic.energy}</small>
                    <small>{topicJournalCount} notes</small>
                  </div>
                  <div className="topic-meta-row secondary">
                    <small>{latestTopicTouch ? `Active ${formatRelative(latestTopicTouch)}` : 'No recent activity'}</small>
                    <small>{topicPinnedCount ? `${topicPinnedCount} pinned` : 'Nothing pinned'}</small>
                  </div>
                  <div className="topic-progress" aria-hidden="true">
                    <span style={{ width: `${Math.min(100, 22 + topicChatCount * 14 + topicJournalCount * 8)}%` }} />
                  </div>
                </div>
              </button>
            );
          })}
        </section>

        <section className="topic-context-strip panel">
          <div>
            <span className="label">Current room</span>
            <h3>{selectedTopic.name}</h3>
            <p>{selectedTopic.prompt}</p>
          </div>
          <div className="context-metrics">
            <div>
              <strong>{topicStats.chatCount}</strong>
              <span>threads</span>
            </div>
            <div>
              <strong>{topicStats.noteCount}</strong>
              <span>notes</span>
            </div>
            <div>
              <strong>{topicStats.lastTouch}</strong>
              <span>last activity</span>
            </div>
          </div>
          <div className="context-snippet">
            <span className="label">Latest thread pulse</span>
            <p>{topicStats.latestSnippet}</p>
            {topicStats.lastMessageTime ? <small>Last message at {topicStats.lastMessageTime}</small> : null}
          </div>
        </section>

        {activeView === 'home' && (
          <section className="workspace-grid">
            <aside className="chat-sidebar panel">
              <div className="panel-header">
                <div>
                  <span className="label">{selectedTopic.name}</span>
                  <h3>Conversation threads</h3>
                </div>
                <button className="primary-button" onClick={() => createChat()}>
                  + New chat
                </button>
              </div>
              <div className="chat-list">
                {topicChats.length ? (
                  topicChats.map((chat) => {
                    const lastChatMessage = chat.messages[chat.messages.length - 1] ?? null;

                    return (
                      <button
                        key={chat.id}
                        className={`chat-list-item ${selectedChat?.id === chat.id ? 'selected' : ''}`}
                        onClick={() => setSelectedChatId(chat.id)}
                      >
                        <div>
                          <strong>{chat.title}</strong>
                          <p>{chat.summary}</p>
                        </div>
                        <div className="chat-list-meta">
                          <span>{chat.messages.length} messages</span>
                          <span>{formatRelative(chat.updatedAt)}</span>
                        </div>
                        <div className="chat-list-resume-row">
                          <small>{lastChatMessage ? `Last: ${lastChatMessage.role === 'assistant' ? 'AI workspace' : 'You'} · ${formatClock(lastChatMessage.createdAt)}` : 'No messages yet'}</small>
                          <small>{chat.mood}</small>
                        </div>
                      </button>
                    );
                  })
                ) : (
                  <div className="empty-inline">
                    <strong>No threads yet</strong>
                    <p>Start a new chat or drop a note straight into the composer.</p>
                  </div>
                )}
              </div>
            </aside>

            <section className="chat-stage panel">
              {selectedChat ? (
                <>
                  <div className="panel-header conversation-header">
                    <div>
                      <span className="label">{selectedTopic.name} workspace</span>
                      <h3>{selectedChat.title}</h3>
                      <p>{selectedChat.summary}</p>
                    </div>
                    <div className="conversation-meta">
                      <div className="mood-pill">{selectedChat.mood}</div>
                      <small>Updated {formatRelative(selectedChat.updatedAt)}</small>
                      <button className="danger-button" onClick={() => archiveChat(selectedChat.id)}>
                        Archive thread
                      </button>
                    </div>
                  </div>

                  <div className="thread-summary-bar">
                    <div className="thread-summary-chip">
                      <strong>{selectedChat.messages.length}</strong>
                      <span>messages</span>
                    </div>
                    <div className="thread-summary-chip">
                      <strong>{formatClock(selectedChat.createdAt)}</strong>
                      <span>created</span>
                    </div>
                    <div className="thread-summary-chip thread-summary-wide">
                      <strong>Room intent</strong>
                      <span>{selectedTopic.prompt}</span>
                    </div>
                  </div>

                  <div className="message-stream" ref={messageStreamRef}>
                    {selectedChat.messages.map((message) => (
                      <article key={message.id} className={`message ${message.role}`}>
                        <div className="message-meta">
                          <strong>{message.role === 'assistant' ? 'AI workspace' : 'You'}</strong>
                          <span>{formatClock(message.createdAt)}</span>
                        </div>
                        <p>{message.text}</p>
                        {message.meta ? (
                          <div className="message-footnote">
                            {message.meta.model ? <small>{message.meta.model}</small> : null}
                            {message.meta.endpoint ? <small>{message.meta.endpoint}</small> : null}
                            {message.meta.error ? <small className="message-error">{message.meta.error}</small> : null}
                          </div>
                        ) : null}
                      </article>
                    ))}

                    {isSending && selectedChat.id === pendingChatId ? (
                      <article className="message assistant is-pending">
                        <div className="message-meta">
                          <strong>AI workspace</strong>
                          <span>Working…</span>
                        </div>
                        <p>Thinking through your latest message and waiting on the configured model reply.</p>
                        <div className="message-footnote">
                          {state.settings.model.trim() ? <small>{state.settings.model.trim()}</small> : null}
                          <small>live request</small>
                        </div>
                      </article>
                    ) : null}
                  </div>

                  <div className="composer">
                    <textarea
                      value={draftMessage}
                      onChange={(event) => setDraftMessage(event.target.value)}
                      onKeyDown={handleComposerKeyDown}
                      placeholder={`Add a thought for ${selectedTopic.name.toLowerCase()}...`}
                      rows={4}
                    />
                    <div className="composer-footer">
                      <small>{isSending ? 'Sending to local model…' : 'Ctrl/Cmd + Enter to send'}</small>
                      <small>
                        {composerError
                          ? 'Last request failed'
                          : draftMessage.trim().length
                            ? `${draftMessage.trim().length} chars`
                            : 'Draft autosaved locally'}
                      </small>
                    </div>
                    {composerError ? <div className="composer-error">{composerError}</div> : null}
                    <div className="composer-actions">
                      <button className="ghost-button" onClick={clearDraftMessage} disabled={!draftMessage.trim() || isSending}>
                        Clear draft
                      </button>
                      <button className="ghost-button" onClick={retryLastReply} disabled={isSending || !selectedChat?.messages.some((message) => message.role === 'user')}>
                        Retry last reply
                      </button>
                      <button className="ghost-button" onClick={saveComposerToJournal} disabled={!draftMessage.trim() || isSending}>
                        Save to journal
                      </button>
                      <button className="primary-button" onClick={sendMessage} disabled={!draftMessage.trim() || isSending}>
                        {isSending ? 'Thinking…' : 'Add to chat'}
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="empty-state empty-state-panel">
                  <h3>No chats yet</h3>
                  <p>Create a new thread or type straight into the composer to let the first thought create the room.</p>
                  <div className="empty-state-tip">
                    <strong>Try:</strong> a question, a rough plan, a match note, a swing thought, or a half-formed idea.
                  </div>
                  <div className="empty-state-actions">
                    <button className="ghost-button" onClick={() => createChat()}>
                      Start blank thread
                    </button>
                  </div>
                  <div className="composer compact-composer">
                    <textarea
                      value={draftMessage}
                      onChange={(event) => setDraftMessage(event.target.value)}
                      onKeyDown={handleComposerKeyDown}
                      placeholder={`Start the first ${selectedTopic.name.toLowerCase()} thought...`}
                      rows={4}
                    />
                    <div className="composer-footer">
                      <small>{isSending ? 'Sending to local model…' : 'The first message creates the room automatically'}</small>
                      <small>
                        {composerError
                          ? 'Last request failed'
                          : draftMessage.trim().length
                            ? `${draftMessage.trim().length} chars`
                            : 'Draft autosaved locally'}
                      </small>
                    </div>
                    {composerError ? <div className="composer-error">{composerError}</div> : null}
                    <div className="composer-actions">
                      <button className="ghost-button" onClick={saveComposerToJournal} disabled={!draftMessage.trim() || isSending}>
                        Save to journal
                      </button>
                      <button className="primary-button" onClick={sendMessage} disabled={!draftMessage.trim() || isSending}>
                        {isSending ? 'Thinking…' : 'Create chat from draft'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </section>
          </section>
        )}

        {activeView === 'journal' && (
          <section className="journal-layout">
            <div className="panel journal-editor">
              <div className="panel-header">
                <div>
                  <span className="label">Journal & learnings</span>
                  <h3>Keep the sticky stuff visible</h3>
                  <p className="panel-subcopy">
                    Capturing in <strong>{journalTopicFilter === 'all' ? 'all topics' : selectedTopic.name}</strong> · {filteredJournal.length} visible entries
                  </p>
                </div>
              </div>
              <div className="journal-toolbar">
                <select value={journalKind} onChange={(event) => setUiState((current) => ({ ...current, journalKind: event.target.value as JournalKind }))}>
                  <option value="note">Note</option>
                  <option value="theme">Recurring theme</option>
                  <option value="pinned fact">Pinned fact</option>
                </select>
                <label className="toggle-pill">
                  <input
                    type="checkbox"
                    checked={journalPinned}
                    onChange={(event) => setUiState((current) => ({ ...current, journalPinned: event.target.checked }))}
                  />
                  <span>Pin in sidebar</span>
                </label>
                <select
                  value={journalTopicFilter}
                  onChange={(event) =>
                    setUiState((current) => ({
                      ...current,
                      journalTopicFilter: event.target.value === 'all' ? 'all' : (event.target.value as TopicId),
                    }))
                  }
                >
                  <option value="all">All topics</option>
                  {state.topics.map((topic) => (
                    <option key={topic.id} value={topic.id}>
                      {topic.name}
                    </option>
                  ))}
                </select>
              </div>
              <textarea
                value={journalDraft}
                onChange={(event) => setJournalDraft(event.target.value)}
                placeholder="Capture a fact, recurring theme, or note worth keeping..."
                rows={7}
              />
              <div className="composer-actions">
                <button className="primary-button" onClick={() => addJournalNote(journalDraft)} disabled={!journalDraft.trim()}>
                  Save note
                </button>
              </div>
            </div>

            <div className="journal-columns">
              {(['pinned fact', 'theme', 'note'] as JournalKind[]).map((kind) => (
                <div key={kind} className="panel journal-column">
                  <div className="panel-header compact journal-column-header">
                    <div>
                      <span className="label">{kind}</span>
                      <h3>{kind === 'pinned fact' ? 'Pinned facts' : kind === 'theme' ? 'Recurring themes' : 'Notes'}</h3>
                    </div>
                    <span className="count-pill">{filteredJournal.filter((entry) => entry.kind === kind).length}</span>
                  </div>
                  <div className="journal-list">
                    {filteredJournal.filter((entry) => entry.kind === kind).length ? (
                      filteredJournal
                        .filter((entry) => entry.kind === kind)
                        .map((entry) => (
                          <article key={entry.id} className={`journal-card ${entry.pinned ? 'is-pinned' : ''}`}>
                            <div className="journal-card-header">
                              <strong>{entry.title}</strong>
                              <span>{formatRelative(entry.updatedAt)}</span>
                            </div>
                            <div className="journal-card-meta">
                              <small>{entry.topicId ? slug(entry.topicId) : 'general'}</small>
                              {entry.pinned ? <small className="pin-badge">Pinned</small> : null}
                            </div>
                            <p>{entry.text}</p>
                            <div className="journal-card-footer">
                              <small>{formatClock(entry.updatedAt)}</small>
                              <div className="inline-actions">
                                <button className="mini-button" onClick={() => togglePinnedJournal(entry.id)}>
                                  {entry.pinned ? 'Unpin' : 'Pin'}
                                </button>
                                <button className="mini-button danger-inline-button" onClick={() => archiveJournalEntry(entry.id)}>
                                  Archive
                                </button>
                              </div>
                            </div>
                          </article>
                        ))
                    ) : (
                      <div className="empty-inline journal-empty">
                        <strong>No {kind === 'pinned fact' ? 'pinned facts' : kind === 'theme' ? 'themes' : 'notes'} yet</strong>
                        <p>
                          {journalTopicFilter === 'all'
                            ? 'Save something meaningful and it will show up here.'
                            : `Nothing in ${selectedTopic.name} matches this column yet.`}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {activeView === 'settings' && (
          <section className="settings-layout panel">
            <div className="panel-header">
              <div>
                <span className="label">Runtime settings</span>
                <h3>Local model and API-compatible fallback</h3>
              </div>
            </div>
            <div className="settings-grid">
              <label>
                <span>Provider label</span>
                <input
                  value={state.settings.providerLabel}
                  onChange={(event) => updateSettings('providerLabel', event.target.value)}
                />
              </label>
              <label>
                <span>Base URL</span>
                <input value={state.settings.baseUrl} onChange={(event) => updateSettings('baseUrl', event.target.value)} />
              </label>
              <label>
                <span>Model</span>
                <input value={state.settings.model} onChange={(event) => updateSettings('model', event.target.value)} />
              </label>
              <label>
                <span>API key</span>
                <div className="inline-input-action">
                  <input
                    type={showApiKey ? 'text' : 'password'}
                    value={state.settings.apiKey}
                    onChange={(event) => updateSettings('apiKey', event.target.value)}
                  />
                  <button type="button" className="mini-button" onClick={() => setShowApiKey((current) => !current)}>
                    {showApiKey ? 'Hide' : 'Show'}
                  </button>
                </div>
              </label>
              <label>
                <span>Fallback model</span>
                <input
                  value={state.settings.fallbackModel}
                  onChange={(event) => updateSettings('fallbackModel', event.target.value)}
                />
              </label>
            </div>
            <div className="settings-note">
              <strong>Current target:</strong> {state.settings.providerLabel} · {state.settings.model} · {state.settings.baseUrl}
              {state.settings.fallbackModel.trim() ? ` · fallback ${state.settings.fallbackModel}` : ' · no fallback configured'}
            </div>
            <div className="settings-test-row">
              <button className="primary-button" onClick={runConnectionTest} disabled={isTestingConnection}>
                {isTestingConnection ? 'Testing connection…' : 'Test connection'}
              </button>
              {connectionStatus ? (
                <div className={`connection-status ${connectionStatus.kind}`}>
                  {connectionStatus.message}
                </div>
              ) : (
                <small className="settings-hint">Runs a tiny live probe against the configured model using `/responses`.</small>
              )}
            </div>
            <div className="settings-actions">
              <button className="ghost-button" onClick={exportWorkspace}>
                Export workspace
              </button>
              <label className="mini-upload-button">
                <input type="file" accept="application/json" onChange={importWorkspace} />
                <span>Import workspace</span>
              </label>
              <button className="danger-button" onClick={resetWorkspace}>
                Reset local workspace
              </button>
            </div>
            <div className="archive-panel">
              <div>
                <span className="label">Archive</span>
                <h3>Soft cleanup, not instant loss</h3>
                <p className="panel-subcopy">
                  Archived threads and notes leave the main workspace but can be restored in one click.
                </p>
              </div>
              <div className="archive-actions">
                <div className="archive-stat">
                  <strong>{archivedChats.length}</strong>
                  <span>archived threads</span>
                </div>
                <button className="ghost-button" onClick={restoreArchivedChats} disabled={!archivedChats.length}>
                  Restore threads
                </button>
                <div className="archive-stat">
                  <strong>{archivedJournal.length}</strong>
                  <span>archived notes</span>
                </div>
                <button className="ghost-button" onClick={restoreArchivedJournal} disabled={!archivedJournal.length}>
                  Restore notes
                </button>
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

export default App;
