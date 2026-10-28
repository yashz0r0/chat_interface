import OpenAI from 'openai';

const TONE_SYSTEM_PROMPTS = {
  Professional: 'You are a professional, articulate, and well-structured AI assistant. Deliver polished, respectful, and well-organized responses with clear reasoning and formal language where appropriate.',
  Casual: 'You are a friendly, casual, and approachable AI companion. Speak warmly and naturally, like chatting with a knowledgeable peer, using conversational phrasing and an engaging tone.',
  Concise: 'You are an extremely concise AI assistant. Provide direct, high-value answers without preamble, pleasantries, repetition, or unnecessary exposition. Keep responses brief and straight to the point.'
};

export function getSystemPrompt(tone) {
  return TONE_SYSTEM_PROMPTS[tone] || TONE_SYSTEM_PROMPTS.Professional;
}

async function* streamFallbackResponse(messages, tone, notice = '') {
  const lastUserMsg = messages[messages.length - 1]?.content || 'Hello';
  const mockResponses = {
    Professional: `${notice}Thank you for your message regarding: "${lastUserMsg}".\n\nHere is a structured assessment in a **Professional** tone:\n\n1. **Query Processed**: "${lastUserMsg}"\n2. **Tone & Style**: Formal, structured, and objective analysis.\n3. **Persistence**: This conversation and response are being stored in your MongoDB database.\n\nIf you have further questions or require specific analysis, please let me know.`,
    Casual: `${notice}Hey there! Received your message: "${lastUserMsg}".\n\nResponding here in **Casual** mode! Everything is streaming smoothly and saved right to your MongoDB database. Let me know what else you'd like to chat about! 🎉`,
    Concise: `${notice}Received: "${lastUserMsg}". Responding in concise tone. Response streamed and persisted to MongoDB.`
  };

  const responseText = mockResponses[tone] || mockResponses.Professional;
  const words = responseText.split(' ');

  for (let i = 0; i < words.length; i++) {
    const chunk = (i === 0 ? '' : ' ') + words[i];
    yield chunk;
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
}

export async function* streamAIChat({ messages, tone = 'Professional' }) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  const model = process.env.OPENAI_MODEL?.trim() || 'gpt-4o-mini';

  // If no OpenAI API key is supplied
  if (!apiKey || apiKey === 'your_openai_api_key_here') {
    yield* streamFallbackResponse(
      messages,
      tone,
      `> ℹ️ **Notice**: No \`OPENAI_API_KEY\` set. Showing preview response:\n\n`
    );
    return;
  }

  const openai = new OpenAI({ apiKey });

  const systemMessage = {
    role: 'system',
    content: getSystemPrompt(tone)
  };

  const formattedMessages = [
    systemMessage,
    ...messages.map((m) => ({
      role: m.role,
      content: m.content
    }))
  ];

  try {
    const stream = await openai.chat.completions.create({
      model,
      messages: formattedMessages,
      stream: true
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        yield content;
      }
    }
  } catch (err) {
    console.error('OpenAI API Error:', err.message);

    // If quota is exhausted (429) or invalid key, yield a clear explanation and continue stream
    if (err.status === 429 || err.message?.includes('429') || err.message?.includes('quota') || err.message?.includes('credits')) {
      const quotaNotice = `> ⚠️ **OpenAI Quota Exceeded (429)**: Your OpenAI account has $0 prepaid credits remaining. Add billing credits at [platform.openai.com/billing](https://platform.openai.com/settings/organization/billing) or add a funded API key in \`server/.env\`. Continuing in preview mode for this request:\n\n`;
      yield* streamFallbackResponse(messages, tone, quotaNotice);
      return;
    }

    // Re-throw other unexpected errors
    throw err;
  }
}
