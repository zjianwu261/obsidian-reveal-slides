import { describe, it, expect } from 'vitest';
import { describeNetworkError } from '../../src/ai/netError';

const URL = 'https://api.moonshot.cn/v1/chat/completions';

describe('describeNetworkError', () => {
  /* net::ERR_CONNECTION_CLOSED 看着像接口坏了，十有八九是本机的代理 */
  it('names the host and points at the proxy', () => {
    const message = describeNetworkError(new Error('net::ERR_CONNECTION_CLOSED'), URL).message;
    expect(message).toContain('api.moonshot.cn');
    expect(message).toContain('系统代理');
  });

  it('recognises the usual node-side failures too', () => {
    for (const raw of ['ENOTFOUND api.x.com', 'ECONNREFUSED', 'ETIMEDOUT']) {
      expect(describeNetworkError(new Error(raw), URL).message, raw).toContain('连不上');
    }
  });

  /* 接口自己回的错（key 失效、余额不足）原样留着，别裹上一层代理的猜测 */
  it('leaves an error from the service alone', () => {
    const original = new Error('Invalid API key');
    expect(describeNetworkError(original, URL)).toBe(original);
  });
});
