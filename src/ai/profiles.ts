/**
 * 接口档案：一套地址 + key + 模型，起个名字存下来（纯数据处理，可单测）。
 *
 * 一个接口不够用：便宜快的那个（DeepSeek flash）改改文字挺好，
 * 画图就明显不行；中转站上的 GPT / Claude 画得动，但每次都改三个字段太烦。
 * 存成几套，在对话框上一拉就换。
 */

/**
 * 这套接口是干什么的。两类走的根本不是一个接口：
 *   chat  → /chat/completions，出文字（正文、SVG 代码）
 *   image → /images/generations，出一张位图
 */
export type AiProfileKind = 'chat' | 'image';

export interface AiProfile {
  id: string;
  /** 显示名，如「DeepSeek」「中转站 GPT」 */
  name: string;
  /** OpenAI 兼容的根地址，/chat/completions 或 /images/generations 由客户端补 */
  apiBase: string;
  apiKey: string;
  model: string;
  /** 缺省当 chat：分类是后加的，老档案里没有这一项 */
  kind?: AiProfileKind;
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
  {
    name: '画图',
    apiBase: '',
    apiKey: '',
    model: 'gpt-image-1',
    kind: 'image',
  },
];

/** 老档案没有 kind：按模型名认一次，认不出当对话用 */
export function profileKind(profile: AiProfile): AiProfileKind {
  return profile.kind ?? (IMAGE_MODEL.test(profile.model) ? 'image' : 'chat');
}

export function profilesOfKind(profiles: AiProfile[], kind: AiProfileKind): AiProfile[] {
  return profiles.filter((profile) => profileKind(profile) === kind);
}

/**
 * 画图用哪一套：选中的那套要是画图接口就用它，否则拿第一套画图的。
 * 画图和对话本来就是两套接口，对话框上选的是对话那套，画图不该跟着它走。
 */
export function imageProfile(profiles: AiProfile[]): AiProfile | null {
  return profilesOfKind(profiles, 'image')[0] ?? null;
}

/**
 * 画图模型的名字。这些模型出的是位图，走 /images/generations —— 
 * 填进对话那一栏只会拿到一句看不懂的 400。
 */
const IMAGE_MODEL =
  /(gpt-image|dall-?e|stable-?diffusion|sdxl|flux|midjourney|imagen|seedream|wanx|kolors)/i;

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

/** 档案配全了没有：缺一样都发不出去，界面上早点说比等接口报错强 */
export function profileProblem(profile: AiProfile | null): string | null {
  if (!profile) return '还没有配置任何接口：设置 → Slide Preview → AI 助手';
  if (!profile.apiBase) return `「${profile.name}」还没填接口地址`;
  if (!profile.apiKey) return `「${profile.name}」还没填 API key`;
  if (!profile.model) return `「${profile.name}」还没填模型名`;
  if (profileKind(profile) === 'image') {
    return (
      `「${profile.name}」是画图接口（${profile.model}），对话要的是会写字的模型。` +
      '在设置里把它的用途改成「对话」，或者另配一套 gpt-4o、deepseek-chat 这类'
    );
  }
  return null;
}
