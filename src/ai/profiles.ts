/**
 * 接口档案：一套地址 + key + 模型，起个名字存下来（纯数据处理，可单测）。
 *
 * 一个接口不够用：便宜快的那个（DeepSeek flash）改改文字挺好，
 * 画图就明显不行；中转站上的 GPT / Claude 画得动，但每次都改三个字段太烦。
 * 存成几套，在对话框上一拉就换。
 */

export interface AiProfile {
  id: string;
  /** 显示名，如「DeepSeek」「中转站 GPT」 */
  name: string;
  /** OpenAI 兼容的根地址，/chat/completions 由客户端补 */
  apiBase: string;
  apiKey: string;
  model: string;
}

/** 老设置里的三个字段：还没分档案时用的 */
export interface LegacyAiFields {
  aiApiBase: string;
  aiApiKey: string;
  aiModel: string;
}

/** 常见的几家，新建时省得查文档 */
export const AI_PRESETS: Omit<AiProfile, 'id'>[] = [
  {
    name: 'DeepSeek',
    apiBase: 'https://api.deepseek.com/v1',
    apiKey: '',
    model: 'deepseek-chat',
  },
  {
    name: 'OpenAI',
    apiBase: 'https://api.openai.com/v1',
    apiKey: '',
    model: 'gpt-4o',
  },
  {
    // 中转站各家域名不同，地址留空让人自己贴；其余按 OpenAI 的规矩来
    name: '中转站',
    apiBase: '',
    apiKey: '',
    model: 'gpt-4o',
  },
];

export function newProfileId(): string {
  return `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * 老设置 → 第一份档案。
 * 升级插件的人不该因为多了个「档案」的概念就得重填一次 key。
 */
export function migrateProfiles(
  profiles: AiProfile[] | undefined,
  legacy: LegacyAiFields,
): AiProfile[] {
  if (profiles && profiles.length > 0) return profiles;
  return [
    {
      id: newProfileId(),
      name: nameFromBase(legacy.aiApiBase),
      apiBase: legacy.aiApiBase,
      apiKey: legacy.aiApiKey,
      model: legacy.aiModel,
    },
  ];
}

/** 从地址猜个名字：api.deepseek.com → deepseek */
function nameFromBase(apiBase: string): string {
  const host = /^https?:\/\/([^/]+)/i.exec(apiBase)?.[1] ?? '';
  const parts = host.split('.').filter((part) => part && part !== 'api' && part !== 'www');
  return parts[0] || '默认';
}

/**
 * 当前该用哪一套。指定的那个不在了（删掉了、配置手改坏了）就退回第一个 ——
 * 宁可用错一个也别把对话框整个卡住。
 */
export function activeProfile(profiles: AiProfile[], activeId: string): AiProfile | null {
  if (profiles.length === 0) return null;
  return profiles.find((profile) => profile.id === activeId) ?? profiles[0];
}

/**
 * 画图模型的名字。这些模型出的是位图，走的是 /images/generations，
 * 跟这里用的 /chat/completions 是两个接口 —— 填了只会拿到一句看不懂的 400。
 */
const IMAGE_MODEL = /(gpt-image|dall-?e|stable-?diffusion|sdxl|flux|midjourney|imagen|seedream|wanx|kolors)/i;

/** 档案配全了没有：缺一样都发不出去，界面上早点说比等接口报错强 */
export function profileProblem(profile: AiProfile | null): string | null {
  if (!profile) return '还没有配置任何接口：设置 → Slide Preview → AI 助手';
  if (!profile.apiBase) return `「${profile.name}」还没填接口地址`;
  if (!profile.apiKey) return `「${profile.name}」还没填 API key`;
  if (!profile.model) return `「${profile.name}」还没填模型名`;
  if (IMAGE_MODEL.test(profile.model)) {
    return (
      `${profile.model} 是画位图的模型，走的是另一个接口（/images/generations），` +
      '这里要的是会写字的对话模型 —— 图是它写成 SVG 代码画出来的。' +
      '换成 gpt-4o、claude-sonnet-4、deepseek-chat 这类'
    );
  }
  return null;
}
