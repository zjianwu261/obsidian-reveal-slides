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

/** 超时上限：requestUrl 不能中途取消，只能不再等它 */
const TIMEOUT_MS = 180_000;

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export class MissingApiKeyError extends Error {
  constructor() {
    super('还没填 API key：设置 → Slide Preview → AI 助手');
  }
}

/**
 * 返回模型的回复文本；失败时抛出带可读信息的 Error。
 *
 * 三分钟还没回就当它不会回了 —— requestUrl 没有中断口子，超时只是不再等，
 * 但至少让界面从「想一想…」里出来，而不是永远转下去。
 */
export async function chat(config: ChatConfig, messages: ChatMessage[]): Promise<string> {
  if (!config.apiKey) throw new MissingApiKeyError();

  const response = await withTimeout(requestUrl({
    url: `${config.apiBase.replace(/\/+$/, '')}/chat/completions`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({ model: config.model, messages, temperature: 0.2 }),
    // 4xx/5xx 不要直接抛：接口的错误信息（key 失效、余额不足、模型名写错）都在响应体里
    throw: false,
  }));

  if (response.status >= 400) {
    throw new Error(`接口返回 ${response.status}：${readError(response.text)}`);
  }

  const reply = (response.json as ChatReply | undefined)?.choices?.[0]?.message?.content;
  if (!reply) throw new Error('接口没有返回内容');
  return reply;
}

async function withTimeout<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`等了 ${TIMEOUT_MS / 1000} 秒还没回应，接口可能不通或模型名不对`)),
      TIMEOUT_MS,
    );
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
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
