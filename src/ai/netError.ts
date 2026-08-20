/**
 * 连不上时的人话。
 *
 * Electron 抛的是 net::ERR_CONNECTION_CLOSED 这种，看着像接口坏了，
 * 十有八九是本机的代理：插件走的是**系统代理**（系统设置 → 网络 → 代理），
 * 不是终端里的 http_proxy。同一个地址你用 curl 通、在这儿不通，基本就是它。
 */
export function describeNetworkError(error: unknown, url: string): Error {
  const raw = error instanceof Error ? error.message : String(error);
  if (!/net::|ERR_|ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EAI_AGAIN|certificate/i.test(raw)) {
    return error instanceof Error ? error : new Error(raw);
  }

  const host = /^https?:\/\/([^/]+)/i.exec(url)?.[1] ?? url;
  return new Error(
    `连不上 ${host}（${raw}）。插件走的是系统代理，不是终端里的 http_proxy —— ` +
      '先看这个域名有没有被代理规则拦掉，或者把它加进代理的直连/绕过名单',
  );
}
