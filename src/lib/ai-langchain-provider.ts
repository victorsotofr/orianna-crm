import 'server-only';

import { ChatAnthropic } from '@langchain/anthropic';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChatMistralAI } from '@langchain/mistralai';
import { ChatOpenAI } from '@langchain/openai';

import type { AiTask } from '@/lib/ai-provider';

export type LangChainProvider = 'openai' | 'anthropic' | 'mistral' | 'google';
export type AgentModelTask = AiTask | 'profile' | 'outreach' | 'status' | 'safety';

const PROVIDER_PREFIX = /^(openai|anthropic|mistral|google|gemini):(.+)$/i;

const OPENAI_DEFAULTS: Record<AgentModelTask, string> = {
  assistant: process.env.OPENAI_ASSISTANT_MODEL || 'gpt-4.1',
  extract: process.env.OPENAI_EXTRACT_MODEL || 'gpt-4.1-mini',
  meeting: process.env.OPENAI_MEETING_MODEL || 'gpt-4.1',
  personalize: process.env.OPENAI_PERSONALIZE_MODEL || 'gpt-4.1',
  prompt: process.env.OPENAI_PROMPT_MODEL || 'gpt-4.1-mini',
  reply: process.env.OPENAI_REPLY_MODEL || 'gpt-4.1',
  research: process.env.OPENAI_RESEARCH_MODEL || 'gpt-4.1-mini',
  score: process.env.OPENAI_SCORE_MODEL || 'gpt-4.1-mini',
  profile: process.env.OPENAI_PROFILE_MODEL || process.env.OPENAI_PROMPT_MODEL || 'gpt-4.1-mini',
  outreach: process.env.OPENAI_OUTREACH_MODEL || process.env.OPENAI_ASSISTANT_MODEL || 'gpt-4.1',
  status: process.env.OPENAI_STATUS_MODEL || process.env.OPENAI_EXTRACT_MODEL || 'gpt-4.1-mini',
  safety: process.env.OPENAI_SAFETY_MODEL || process.env.OPENAI_EXTRACT_MODEL || 'gpt-4.1-mini',
};

const ANTHROPIC_DEFAULT = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5-20250929';
const MISTRAL_DEFAULT = process.env.MISTRAL_MODEL || 'mistral-small-latest';
const GOOGLE_DEFAULT = process.env.GOOGLE_GENERATIVE_AI_MODEL || process.env.GEMINI_MODEL || 'gemini-2.0-flash';

function taskEnvName(task: AgentModelTask) {
  return `AGENT_${task.toUpperCase()}_MODEL`;
}

function normalizeProvider(value: string | undefined | null): LangChainProvider | null {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'gemini') return 'google';
  if (normalized === 'openai' || normalized === 'anthropic' || normalized === 'mistral' || normalized === 'google') {
    return normalized;
  }
  return null;
}

function defaultProvider(): LangChainProvider {
  const explicit = normalizeProvider(process.env.AGENT_MODEL_PROVIDER);
  if (explicit) return explicit;
  if (process.env.OPENAI_API_KEY) return 'openai';
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  if (process.env.MISTRAL_API_KEY) return 'mistral';
  if (process.env.GOOGLE_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY) return 'google';
  return 'openai';
}

function defaultModel(provider: LangChainProvider, task: AgentModelTask) {
  if (provider === 'openai') return OPENAI_DEFAULTS[task];
  if (provider === 'anthropic') return ANTHROPIC_DEFAULT;
  if (provider === 'mistral') return MISTRAL_DEFAULT;
  return GOOGLE_DEFAULT;
}

function resolveModelSpec(task: AgentModelTask): { provider: LangChainProvider; model: string } {
  const provider = defaultProvider();
  const raw =
    process.env[taskEnvName(task)] ||
    (task === 'profile' ? process.env.AGENT_PROMPT_MODEL : undefined) ||
    (task === 'outreach' ? process.env.AGENT_ASSISTANT_MODEL : undefined) ||
    defaultModel(provider, task);
  const match = String(raw).trim().match(PROVIDER_PREFIX);

  if (match) {
    return {
      provider: normalizeProvider(match[1]) || provider,
      model: match[2].trim(),
    };
  }

  return { provider, model: String(raw).trim() || defaultModel(provider, task) };
}

export function langChainProviderLabel(task: AgentModelTask = 'assistant') {
  const { provider, model } = resolveModelSpec(task);
  return `${provider}:${model}`;
}

export function chatModel(task: AgentModelTask = 'assistant'): BaseChatModel {
  const { provider, model } = resolveModelSpec(task);

  if (provider === 'openai') {
    return new ChatOpenAI({
      model,
      temperature: 0.2,
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  if (provider === 'anthropic') {
    return new ChatAnthropic({
      model,
      temperature: 0.2,
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }

  if (provider === 'mistral') {
    return new ChatMistralAI({
      model,
      temperature: 0.2,
      apiKey: process.env.MISTRAL_API_KEY,
    });
  }

  return new ChatGoogleGenerativeAI({
    model,
    temperature: 0.2,
    apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY,
  });
}
