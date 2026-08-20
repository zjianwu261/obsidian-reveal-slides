/**
 * OpenAI 兼容的画图接口（/images/generations）。
 *
 * 跟对话是两个接口、两套模型：对话出的是文字（正文、SVG 代码），
 * 这里出的是一张位图。结构图该用 SVG —— 位图投影会糊、改一个字要整张重出；
 * 但真实场景、有质感的比喻图 SVG 画不了，那才轮到这条路。
 */
import { requestUrl } from 'obsidian';
import { MissingApiKeyError } from './client';
import { describeNetworkError } from './netError';
import { IMAGE_SIZES } from './imagePrompt';
import type { ChatConfig } from './client';
import type { ImageShape } from './imagePrompt';

/** 画图慢，十分钟起步的都有；比对话给得宽 */
const DEFAULT_TIMEOUT_SECONDS = 600;

interface ImageReply {
  data?: { b64_json?: string; url?: string }[];
  error?: { message?: string };
}

/**
 * 画一张，返回 PNG 的字节。
 *
 * 两种回法都得认：有的接口直接给 base64，有的只给一个链接。
 * 链接那种还得再下一次 —— 而且链接常常几分钟就失效，不能留在笔记里当图片地址用。
 */
export async function generateImage(
  config: ChatConfig,
  prompt: string,
  shape: ImageShape,
): Promise<ArrayBuffer> {
  if (!config.apiKey) throw new MissingApiKeyError();

  const seconds = config.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS;
  const url = `${config.apiBase.replace(/\/+$/, '')}/images/generations`;
  const response = await withTimeout(
    requestUrl({
      url,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        prompt,
        n: 1,
        size: IMAGE_SIZES[shape],
      }),
      throw: false,
    }),
    seconds,
  ).catch((error: unknown) => {
    throw describeNetworkError(error, url);
  });

  if (response.status >= 400) {
    throw new Error(`画图接口返回 ${response.status}：${readError(response.text)}`);
  }

  const first = (response.json as ImageReply | undefined)?.data?.[0];
  if (first?.b64_json) return decodeBase64(first.b64_json);
  if (first?.url) return downloadImage(first.url, seconds);
  throw new Error('画图接口没有返回图片');
}

async function downloadImage(url: string, seconds: number): Promise<ArrayBuffer> {
  const response = await withTimeout(requestUrl({ url, method: 'GET', throw: false }), seconds);
  if (response.status >= 400) throw new Error(`取图片失败：${response.status}`);
  return response.arrayBuffer;
}

/** base64 → 字节。插件侧有 Node Buffer，浏览器侧走 atob 兜底 */
function decodeBase64(base64: string): ArrayBuffer {
  if (typeof Buffer !== 'undefined') {
    const buffer = Buffer.from(base64, 'base64');
    return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function withTimeout<T>(promise: Promise<T>, seconds: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`画了 ${seconds} 秒还没出图，接口可能不通或模型名不对`)),
      seconds * 1000,
    );
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function readError(text: string): string {
  try {
    const parsed = JSON.parse(text) as ImageReply;
    if (parsed.error?.message) return parsed.error.message;
  } catch {
    // 不是 JSON，原样截断
  }
  return text.slice(0, 200);
}
