import PocketBase from 'pocketbase';
import type { Chat, Message } from './types';

// PocketBase client
export const pb = new PocketBase('http://localhost:8090');

// Auth helpers
export const auth = {
  signUp: async (email: string, password: string, username: string) => {
    const data = {
      email,
      password,
      passwordConfirm: password,
      username,
    };
    return await pb.collection('users').create(data);
  },

  login: async (email: string, password: string) => {
    return await pb.collection('users').authWithPassword(email, password);
  },

  logout: () => {
    pb.authStore.clear();
  },

  isValid: () => pb.authStore.isValid,

  getUser: () => pb.authStore.model,

  getToken: () => pb.authStore.token,
};

// Chat API
export const chatApi = {
  // Get all chats for current user
  getChats: async (): Promise<Chat[]> => {
    const records = await pb.collection('chats').getFullList({
      filter: `user = "${pb.authStore.model?.id}"`,
      sort: '-updated',
      expand: 'user',
    });

    return records.map((record: any) => ({
      id: record.id,
      topicId: record.topicId,
      title: record.title,
      messages: [], // Loaded separately
      createdAt: record.created,
      updatedAt: record.updated,
      parentId: record.parentId || undefined,
      branchPoint: record.branchPoint || undefined,
      tags: record.tags || [],
      isArchived: record.isArchived || false,
    }));
  },

  // Create new chat
  createChat: async (chat: Omit<Chat, 'id' | 'createdAt' | 'updatedAt'>): Promise<Chat> => {
    const record = await pb.collection('chats').create({
      topicId: chat.topicId,
      title: chat.title,
      parentId: chat.parentId || null,
      branchPoint: chat.branchPoint || null,
      tags: chat.tags,
      isArchived: chat.isArchived || false,
      user: pb.authStore.model?.id,
    });

    return {
      ...chat,
      id: record.id,
      createdAt: record.created,
      updatedAt: record.updated,
    };
  },

  // Update chat
  updateChat: async (chatId: string, updates: Partial<Chat>) => {
    return await pb.collection('chats').update(chatId, {
      title: updates.title,
      tags: updates.tags,
      isArchived: updates.isArchived,
    });
  },

  // Delete chat
  deleteChat: async (chatId: string) => {
    // First delete all messages
    const messages = await pb.collection('messages').getFullList({
      filter: `chat = "${chatId}"`,
    });
    await Promise.all(messages.map((m: any) => pb.collection('messages').delete(m.id)));

    // Then delete chat
    return await pb.collection('chats').delete(chatId);
  },

  // Get messages for a chat
  getMessages: async (chatId: string): Promise<Message[]> => {
    const records = await pb.collection('messages').getFullList({
      filter: `chat = "${chatId}"`,
      sort: 'created',
    });

    return records.map((record: any) => ({
      id: record.id,
      role: record.role,
      text: record.text,
      createdAt: record.created,
      error: record.error || undefined,
      model: record.model || undefined,
    }));
  },

  // Create message
  createMessage: async (chatId: string, message: Omit<Message, 'id' | 'createdAt'>): Promise<Message> => {
    const record = await pb.collection('messages').create({
      chat: chatId,
      role: message.role,
      text: message.text,
      error: message.error || null,
      model: message.model || null,
    });

    return {
      ...message,
      id: record.id,
      createdAt: record.created,
    };
  },

  // Real-time subscriptions
  subscribeChats: (callback: (e: any) => void) => {
    return pb.collection('chats').subscribe('*', callback);
  },

  subscribeMessages: (chatId: string, callback: (e: any) => void) => {
    return pb.collection('messages').subscribe('*', (e: any) => {
      if (e.record.chat === chatId) {
        callback(e);
      }
    });
  },
};

// Settings API (stored per-user)
export const settingsApi = {
  getSettings: async () => {
    try {
      const record = await pb.collection('user_settings').getFirstListItem(
        `user = "${pb.authStore.model?.id}"`
      );
      return record;
    } catch {
      return null;
    }
  },

  saveSettings: async (settings: any) => {
    const existing = await settingsApi.getSettings();

    if (existing) {
      return await pb.collection('user_settings').update(existing.id, {
        ...settings,
        user: pb.authStore.model?.id,
      });
    } else {
      return await pb.collection('user_settings').create({
        ...settings,
        user: pb.authStore.model?.id,
      });
    }
  },
};
