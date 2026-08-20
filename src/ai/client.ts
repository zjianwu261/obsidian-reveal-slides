/**
 * OpenAI 兼容接口的最小客户端。
 *
 * 走 Obsidian 的 requestUrl 而不是 fetch：插件跑在渲染进程里，fetch 受同源策略约束，
 * 打第三方接口会被 CORS 挡下；requestUrl 由主进程代发，没有这层限制。
 *
 * 供应商不写死 —— DeepSeek 只是默认值，任何兼容 /chat/completions 的接口填地址即可。
 */
import { requestUrl } from 'obsidian';
import { describeNetworkError } from './netError';

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
 * 也别为了省而收紧：**会思考的模型先写推理再写正文，推理也算在这个额度里**。
 * 给 1024，它能把额度全烧在推理上，正文一个字不剩 —— 回来的是一条空回复。
 * 窗口特别小的模型（8k 那种）真放不下时，接口会自己报错，那时再单独调。
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
  const url = `${config.apiBase.replace(/\/+$/, '')}/chat/completions`;
  const response = await withTimeout(requestUrl({
    url,
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
  }), seconds).catch((error: unknown) => {
    throw describeNetworkError(error, url);
  });

  if (response.status >= 400) {
    throw new Error(`接口返回 ${response.status}：${readError(response.text)}`);
  }

  const body = response.json as ChatReply | undefined;
  const choice = body?.choices?.[0];
  const reply = choice?.message?.content;

  // 截断了就别拿去用：半张 SVG 看着像画坏了，其实是没写完
  if (choice?.finish_reason === 'length') {
    throw new Error(
      `模型写到上限（${maxTokens} token）就被截断了。` +
        (reply ? '让它写简单点，或者分两次改' : '会思考的模型把额度全花在推理上了，把上限调大'),
    );
  }
  if (!reply) throw new Error(emptyReplyReason(body, choice));
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
  choices?: {
    message?: {
      content?: string;
      /** 会思考的模型（deepseek-reasoner 这类）把推理过程放这儿，不放 content */
      reasoning_content?: string;
    };
    finish_reason?: string;
  }[];
  error?: { message?: string };
}

/**
 * 拿到一个空回复时，尽量说清是哪一种空。
 *
 * 「接口没有返回内容」这句话等于什么都没说 —— 同一句话背后至少三件事：
 * 接口在响应体里报了错、这一趟被内容审查拦了、或者会思考的模型
 * 只写了推理没写正文。分开说，才知道下一步该动哪儿。
 */
type ChatChoice = NonNullable<ChatReply['choices']>[number];

function emptyReplyReason(body: ChatReply | undefined, choice: ChatChoice | undefined): string {
  if (body?.error?.message) return `接口报错：${body.error.message}`;
  if (choice?.message?.reasoning_content) {
    return '模型只写了推理过程，正文是空的 —— 多半是被上限卡住了，把「等待上限」旁边的额度调大再试';
  }
  if (choice?.finish_reason === 'content_filter') {
    return '这一趟被接口的内容审查拦下了，换个说法再试';
  }
  if (!body?.choices?.length) return '接口没有返回任何回复（响应体里连 choices 都没有）';
  return '接口返回了一条空回复，重试一次；一直这样就换个模型试试';
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
