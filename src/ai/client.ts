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
  /** 等多久就不等了（秒）；缺省用下面这个 */
  timeoutSeconds?: number;
}

/**
 * 默认等五分钟。画一张图要吐两三千个 token，慢一点的模型三分钟根本写不完 ——
 * 这时候超时不是「接口不通」，是我们没耐心。
 */
const DEFAULT_TIMEOUT_SECONDS = 300;

/**
 * 一次最多让它写多少 token。
 *
 * 不写的话各家默认值不一样（常见 4096），改整页的活正好卡在这个量级上，
 * 写到一半被截断 —— 出来的是半张图，而且看不出是被截的。
 *
 * 但也不能一律往大了要：**上限是从上下文窗口里扣的**。
 * 8k 窗口的模型（moonshot-v1-8k 这类），提示词本身就占去大半，
 * 再要 8192 的输出直接被判非法 —— 报的是 400，看着像 key 或模型名不对。
 * 所以按这一趟真正要写多少来给：想一段描述几百 token 就够，改整页才需要放开。
 */
const DEFAULT_MAX_TOKENS = 8192;

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
 * 等过头就当它不会回了 —— requestUrl 没有中断口子，超时只是不再等，
 * 但至少让界面从「想一想…」里出来，而不是永远转下去。
 */
export async function chat(
  config: ChatConfig,
  messages: ChatMessage[],
  maxTokens = DEFAULT_MAX_TOKENS,
): Promise<string> {
  if (!config.apiKey) throw new MissingApiKeyError();

  const seconds = config.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS;
  const response = await withTimeout(requestUrl({
    url: `${config.apiBase.replace(/\/+$/, '')}/chat/completions`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      temperature: 0.2,
      max_tokens: maxTokens,
    }),
    // 4xx/5xx 不要直接抛：接口的错误信息（key 失效、余额不足、模型名写错）都在响应体里
    throw: false,
  }), seconds);

  if (response.status >= 400) {
    throw new Error(`接口返回 ${response.status}：${readError(response.text)}`);
  }

  const choice = (response.json as ChatReply | undefined)?.choices?.[0];
  const reply = choice?.message?.content;
  if (!reply) throw new Error('接口没有返回内容');
  // 截断了就别拿去用：半张 SVG 看着像画坏了，其实是没写完
  if (choice?.finish_reason === 'length') {
    throw new Error(`模型写到 ${maxTokens} token 就被截断了，让它画简单点，或分两次改`);
  }
  return reply;
}

async function withTimeout<T>(promise: Promise<T>, seconds: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(
        `等了 ${seconds} 秒还没回应。接口不通、模型名不对都有可能；` +
        '要是它只是画得慢，把「等待上限」调大一些',
      )),
      seconds * 1000,
    );
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

interface ChatReply {
  choices?: { message?: { content?: string }; finish_reason?: string }[];
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
