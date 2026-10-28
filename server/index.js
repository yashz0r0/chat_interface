
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { initDatabase, Storage } from './storage.js';
import { streamAIChat } from './ai.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from server directory reliably
dotenv.config({ path: path.join(__dirname, '.env') });
dotenv.config();

process.on('uncaughtException', (err) => {
  console.error('[Process] Uncaught exception:', err.message);
});

process.on('unhandledRejection', (reason) => {
  console.error('[Process] Unhandled rejection:', reason);
});

const app = express();
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/chat_assistant';

app.use(cors());
app.use(express.json());

// Initialize Database (MongoDB with resilient fallback)
initDatabase(MONGODB_URI);

// API Health / Status
app.get('/api/status', (req, res) => {
  res.json({
    status: 'ok',
    storage: Storage.isMongoDB() ? 'mongodb' : 'fallback-json',
    hasOpenAiKey: Boolean(process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'your_openai_api_key_here')
  });
});

// List all conversations
app.get('/api/conversations', async (req, res) => {
  try {
    const list = await Storage.getAllConversations();
    res.json(list);
  } catch (err) {
    console.error('Error fetching conversations:', err);
    res.status(500).json({ error: 'Failed to retrieve conversations' });
  }
});

// Create new conversation
app.post('/api/conversations', async (req, res) => {
  try {
    const { title, tone } = req.body;
    const conversation = await Storage.createConversation({ title, tone });
    res.status(201).json(conversation);
  } catch (err) {
    console.error('Error creating conversation:', err);
    res.status(500).json({ error: 'Failed to create conversation' });
  }
});

// Get single conversation with full message history
app.get('/api/conversations/:id', async (req, res) => {
  try {
    const conversation = await Storage.getConversationById(req.params.id);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }
    res.json(conversation);
  } catch (err) {
    console.error('Error fetching conversation:', err);
    res.status(500).json({ error: 'Failed to fetch conversation' });
  }
});

// Update conversation tone
app.patch('/api/conversations/:id/tone', async (req, res) => {
  try {
    const { tone } = req.body;
    if (!['Professional', 'Casual', 'Concise'].includes(tone)) {
      return res.status(400).json({ error: 'Invalid tone' });
    }
    const updated = await Storage.updateConversationTone(req.params.id, tone);
    if (!updated) {
      return res.status(404).json({ error: 'Conversation not found' });
    }
    res.json(updated);
  } catch (err) {
    console.error('Error updating tone:', err);
    res.status(500).json({ error: 'Failed to update tone' });
  }
});

// Delete conversation
app.delete('/api/conversations/:id', async (req, res) => {
  try {
    const deleted = await Storage.deleteConversation(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Conversation not found' });
    }
    res.json({ success: true, message: 'Conversation deleted' });
  } catch (err) {
    console.error('Error deleting conversation:', err);
    res.status(500).json({ error: 'Failed to delete conversation' });
  }
});

// --- Notes Endpoints ---
// Get all saved notes
app.get('/api/notes', async (req, res) => {
  try {
    const notes = await Storage.getAllNotes();
    res.json(notes);
  } catch (err) {
    console.error('Error fetching notes:', err);
    res.status(500).json({ error: 'Failed to retrieve notes' });
  }
});

// Save AI response to notes
app.post('/api/notes', async (req, res) => {
  try {
    const { content, sourceConversationId } = req.body;
    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'Note content cannot be empty' });
    }
    const note = await Storage.createNote({
      content: content.trim(),
      sourceConversationId
    });
    res.status(201).json(note);
  } catch (err) {
    console.error('Error creating note:', err);
    res.status(500).json({ error: 'Failed to save note' });
  }
});

// Delete a saved note
app.delete('/api/notes/:id', async (req, res) => {
  try {
    const deleted = await Storage.deleteNote(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Note not found' });
    }
    res.json({ success: true, message: 'Note deleted' });
  } catch (err) {
    console.error('Error deleting note:', err);
    res.status(500).json({ error: 'Failed to delete note' });
  }
});

// Chat Streaming Endpoint using Server-Sent Events (SSE)
app.post('/api/chat/stream', async (req, res) => {
  let { conversationId, message, tone } = req.body;

  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'Message content is required' });
  }

  const selectedTone = ['Professional', 'Casual', 'Concise'].includes(tone) ? tone : 'Professional';

  // Set SSE Headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  try {
    let conversation;
    if (conversationId) {
      conversation = await Storage.getConversationById(conversationId);
    }

    if (!conversation) {
      conversation = await Storage.createConversation({
        title: message.trim().slice(0, 36) + (message.trim().length > 36 ? '...' : ''),
        tone: selectedTone
      });
      conversationId = conversation._id;
    } else if (tone && tone !== conversation.tone) {
      await Storage.updateConversationTone(conversationId, selectedTone);
    }

    // Persist user message to conversation
    const userMsg = {
      role: 'user',
      content: message.trim(),
      timestamp: new Date()
    };
    await Storage.addMessage(conversationId, userMsg);

    // Send init metadata to client
    res.write(`data: ${JSON.stringify({ type: 'init', conversationId, title: conversation.title, tone: selectedTone })}\n\n`);

    // Prepare message list for AI context
    const conversationHistory = conversation.messages ? [...conversation.messages, userMsg] : [userMsg];

    let fullAssistantResponse = '';

    // Stream chunks from AI provider
    for await (const chunk of streamAIChat({
      messages: conversationHistory,
      tone: selectedTone
    })) {
      fullAssistantResponse += chunk;
      res.write(`data: ${JSON.stringify({ type: 'token', token: chunk })}\n\n`);
    }

    // Persist full assistant response to conversation
    const assistantMsg = {
      role: 'assistant',
      content: fullAssistantResponse,
      timestamp: new Date()
    };
    await Storage.addMessage(conversationId, assistantMsg);

    // Send complete event
    res.write(`data: ${JSON.stringify({ type: 'done', fullText: fullAssistantResponse, conversationId })}\n\n`);
    res.end();
  } catch (err) {
    console.error('Streaming error:', err);
    res.write(`data: ${JSON.stringify({ type: 'error', error: err.message || 'Error generating AI response' })}\n\n`);
    res.end();
  }
});

// Serve frontend build if present
const clientDistPath = path.join(__dirname, '../client/dist');
if (fs.existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(clientDistPath, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`[Server] Backend listening on http://localhost:${PORT}`);
});
