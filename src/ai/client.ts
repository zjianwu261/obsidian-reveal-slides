/**
 * OpenAI 兼容接口的最小客户端。
 *
 * 走 Obsidian 的 requestUrl 而不是 fetch：插件跑在渲染进程里，fetch 受同源策略约束，
 * 打第三方接口会被 CORS 挡下；requestUrl 由主进程代发，没有这层限制。
 *
 * 供应商不写死 —— DeepSeek 只是默认值，任何兼容 /chat/completions 的接口填地址即可。
 */
import { requestUrl } from 'obsidian';

export interface ChatConfig {
  apiBase: string;
  apiKey: string;
  model: string;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export class MissingApiKeyError extends Error {
  constructor() {
    super('还没填 API key：设置 → Slide Preview → AI 助手');
  }
}

/** 返回模型的回复文本；失败时抛出带可读信息的 Error */
export async function chat(config: ChatConfig, messages: ChatMessage[]): Promise<string> {
  if (!config.apiKey) throw new MissingApiKeyError();

  const response = await requestUrl({
    url: `${config.apiBase.replace(/\/+$/, '')}/chat/completions`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({ model: config.model, messages, temperature: 0.2 }),
    // 4xx/5xx 不要直接抛：接口的错误信息（key 失效、余额不足、模型名写错）都在响应体里
    throw: false,
  });

  if (response.status >= 400) {
    throw new Error(`接口返回 ${response.status}：${readError(response.text)}`);
  }

  const reply = (response.json as ChatReply | undefined)?.choices?.[0]?.message?.content;
  if (!reply) throw new Error('接口没有返回内容');
  return reply;
}

interface ChatReply {
  choices?: { message?: { content?: string } }[];
}

/** 把接口的错误体压成一行人话 */
function readError(text: string): string {
  try {
    const parsed = JSON.parse(text) as { error?: { message?: string } };
    if (parsed.error?.message) return parsed.error.message;
  } catch {
    // 不是 JSON，原样截断
  }
  return text.slice(0, 200);
}
