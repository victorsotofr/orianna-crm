import 'server-only';

import { anthropic } from '@ai-sdk/anthropic';
import { openai } from '@ai-sdk/openai';

export type AiTask =
  | 'assistant'
  | 'extract'
  | 'meeting'
  | 'personalize'
  | 'prompt'
  | 'reply'
  | 'research'
  | 'score';

const DEFAULT_OPENAI_MODELS: Record<AiTask, string> = {
  assistant: process.env.OPENAI_ASSISTANT_MODEL || 'gpt-4.1',
  extract: process.env.OPENAI_EXTRACT_MODEL || 'gpt-4.1-mini',
  meeting: process.env.OPENAI_MEETING_MODEL || 'gpt-4.1',
  personalize: process.env.OPENAI_PERSONALIZE_MODEL || 'gpt-4.1',
  prompt: process.env.OPENAI_PROMPT_MODEL || 'gpt-4.1-mini',
  reply: process.env.OPENAI_REPLY_MODEL || 'gpt-4.1',
  research: process.env.OPENAI_RESEARCH_MODEL || 'gpt-4.1-mini',
  score: process.env.OPENAI_SCORE_MODEL || 'gpt-4.1-mini',
};

const DEFAULT_ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5-20250929';

export function hasOpenAIKey() {
  return Boolean(process.env.OPENAI_API_KEY);
}

export function aiProviderLabel() {
  return hasOpenAIKey() ? 'OpenAI' : 'Anthropic';
}

export function aiModel(task: AiTask) {
  if (hasOpenAIKey()) {
    return openai(DEFAULT_OPENAI_MODELS[task]);
  }

  return anthropic(DEFAULT_ANTHROPIC_MODEL);
}
