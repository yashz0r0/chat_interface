import mongoose from 'mongoose';
import dns from 'dns';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Conversation } from './models/Conversation.js';
import { Note } from './models/Note.js';

// Configure reliable DNS servers to resolve MongoDB Atlas SRV records
try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (e) {
  // Ignore if not permitted
}

let isMongoConnected = false;
const DATA_DIR = path.resolve('./data');
const DATA_FILE = path.join(DATA_DIR, 'conversations.json');
const NOTES_FILE = path.join(DATA_DIR, 'notes.json');

// Ensure local fallback data dir exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readFallbackData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
    }
  } catch (err) {
    console.error('Error reading fallback storage:', err.message);
  }
  return [];
}

function writeFallbackData(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error writing fallback storage:', err.message);
  }
}

function readFallbackNotes() {
  try {
    if (fs.existsSync(NOTES_FILE)) {
      return JSON.parse(fs.readFileSync(NOTES_FILE, 'utf-8'));
    }
  } catch (err) {
    console.error('Error reading fallback notes:', err.message);
  }
  return [];
}

function writeFallbackNotes(data) {
  try {
    fs.writeFileSync(NOTES_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error writing fallback notes:', err.message);
  }
}

export async function initDatabase(uri) {
  try {
    mongoose.set('strictQuery', false);
    // Listen for connection errors to prevent unhandled 'error' event crash
    mongoose.connection.on('error', (err) => {
      isMongoConnected = false;
    });
    mongoose.connection.on('disconnected', () => {
      isMongoConnected = false;
    });
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 2000
    });
    isMongoConnected = true;
    console.log(`[Database] Connected successfully to MongoDB at ${uri}`);
  } catch (err) {
    isMongoConnected = false;
    console.warn(`[Database] Could not connect to MongoDB (${err.message}). Using local JSON persistence fallback at ${DATA_FILE}.`);
  }
}

export const Storage = {
  isMongoDB: () => isMongoConnected,

  async getAllConversations() {
    if (isMongoConnected) {
      return await Conversation.find({}, '_id title tone createdAt updatedAt')
        .sort({ updatedAt: -1 })
        .lean();
    }
    const data = readFallbackData();
    return data
      .map(({ _id, title, tone, createdAt, updatedAt }) => ({
        _id,
        title,
        tone,
        createdAt,
        updatedAt
      }))
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  },

  async getConversationById(id) {
    if (isMongoConnected) {
      return await Conversation.findById(id).lean();
    }
    const data = readFallbackData();
    return data.find((c) => String(c._id) === String(id)) || null;
  },

  async createConversation({ title = 'New Conversation', tone = 'Professional' } = {}) {
    if (isMongoConnected) {
      const conv = new Conversation({ title, tone, messages: [] });
      await conv.save();
      return conv.toObject();
    }
    const data = readFallbackData();
    const newConv = {
      _id: crypto.randomBytes(12).toString('hex'),
      title,
      tone,
      messages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    data.unshift(newConv);
    writeFallbackData(data);
    return newConv;
  },

  async addMessage(id, message) {
    const formattedMessage = {
      role: message.role,
      content: message.content,
      timestamp: message.timestamp || new Date()
    };

    if (isMongoConnected) {
      const conv = await Conversation.findById(id);
      if (!conv) return null;

      conv.messages.push(formattedMessage);
      // Auto-title if still default
      if (conv.messages.length === 1 && conv.title === 'New Conversation' && message.role === 'user') {
        conv.title = message.content.slice(0, 36) + (message.content.length > 36 ? '...' : '');
      }
      conv.updatedAt = new Date();
      await conv.save();
      return conv.toObject();
    }

    const data = readFallbackData();
    const convIndex = data.findIndex((c) => String(c._id) === String(id));
    if (convIndex === -1) return null;

    const conv = data[convIndex];
    conv.messages.push({
      ...formattedMessage,
      _id: crypto.randomBytes(8).toString('hex'),
      timestamp: formattedMessage.timestamp.toISOString ? formattedMessage.timestamp.toISOString() : formattedMessage.timestamp
    });

    if (conv.messages.length === 1 && conv.title === 'New Conversation' && message.role === 'user') {
      conv.title = message.content.slice(0, 36) + (message.content.length > 36 ? '...' : '');
    }
    conv.updatedAt = new Date().toISOString();
    writeFallbackData(data);
    return conv;
  },

  async updateConversationTone(id, tone) {
    if (isMongoConnected) {
      return await Conversation.findByIdAndUpdate(id, { tone }, { new: true }).lean();
    }
    const data = readFallbackData();
    const conv = data.find((c) => String(c._id) === String(id));
    if (conv) {
      conv.tone = tone;
      conv.updatedAt = new Date().toISOString();
      writeFallbackData(data);
    }
    return conv || null;
  },

  async deleteConversation(id) {
    if (isMongoConnected) {
      const result = await Conversation.findByIdAndDelete(id);
      return !!result;
    }
    const data = readFallbackData();
    const filtered = data.filter((c) => String(c._id) !== String(id));
    const removed = filtered.length !== data.length;
    if (removed) {
      writeFallbackData(filtered);
    }
    return removed;
  },

  async getAllNotes() {
    if (isMongoConnected) {
      return await Note.find({}).sort({ createdAt: -1 }).lean();
    }
    const data = readFallbackNotes();
    return data.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  },

  async createNote({ content, sourceConversationId }) {
    if (isMongoConnected) {
      const note = new Note({ content, sourceConversationId });
      await note.save();
      return note.toObject();
    }
    const data = readFallbackNotes();
    const newNote = {
      _id: crypto.randomBytes(12).toString('hex'),
      content,
      sourceConversationId,
      createdAt: new Date().toISOString()
    };
    data.unshift(newNote);
    writeFallbackNotes(data);
    return newNote;
  },

  async deleteNote(id) {
    if (isMongoConnected) {
      const result = await Note.findByIdAndDelete(id);
      return !!result;
    }
    const data = readFallbackNotes();
    const filtered = data.filter((n) => String(n._id) !== String(id));
    const removed = filtered.length !== data.length;
    if (removed) {
      writeFallbackNotes(filtered);
    }
    return removed;
  }
};
