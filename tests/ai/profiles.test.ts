import { describe, it, expect } from 'vitest';
import {
  activeProfile,
  migrateProfiles,
  newProfileId,
  profileProblem,
} from '../../src/ai/profiles';
import type { AiProfile } from '../../src/ai/profiles';

const profile = (over: Partial<AiProfile> = {}): AiProfile => ({
  id: 'a',
  name: 'DeepSeek',
  apiBase: 'https://api.deepseek.com/v1',
  apiKey: 'sk-x',
  model: 'deepseek-chat',
  ...over,
});

describe('migrateProfiles', () => {
  /* 升级插件的人不该因为多了个「档案」的概念就得重填一次 key */
  it('folds the old three fields into the first profile', () => {
    const [first] = migrateProfiles(undefined, {
      aiApiBase: 'https://api.deepseek.com/v1',
      aiApiKey: 'sk-old',
      aiModel: 'deepseek-v4-flash',
    });
    expect(first.apiKey).toBe('sk-old');
    expect(first.model).toBe('deepseek-v4-flash');
    expect(first.name).toBe('deepseek');
  });

  it('leaves existing profiles alone', () => {
    const existing = [profile()];
    expect(migrateProfiles(existing, { aiApiBase: '', aiApiKey: '', aiModel: '' })).toBe(existing);
  });

  it('still names a profile when the address tells it nothing', () => {
    const [first] = migrateProfiles([], { aiApiBase: '', aiApiKey: '', aiModel: '' });
    expect(first.name).toBe('默认');
  });
});

describe('newProfileId', () => {
  it('does not collide with itself', () => {
    expect(newProfileId()).not.toBe(newProfileId());
  });
});

describe('activeProfile', () => {
  const list = [profile({ id: 'a' }), profile({ id: 'b', name: '中转站' })];

  it('picks the one you chose', () => {
    expect(activeProfile(list, 'b')?.name).toBe('中转站');
  });

  /* 选中的那套被删了：宁可用错一个也别把对话框整个卡住 */
  it('falls back to the first when the chosen one is gone', () => {
    expect(activeProfile(list, 'gone')?.id).toBe('a');
  });

  it('has nothing to offer when nothing is configured', () => {
    expect(activeProfile([], 'a')).toBeNull();
  });
});

describe('profileProblem', () => {
  it('is happy with a complete profile', () => {
    expect(profileProblem(profile())).toBeNull();
  });

  /* 缺一样都发不出去，界面上早点说比等接口报错强 */
  it('names the missing piece', () => {
    expect(profileProblem(profile({ apiKey: '' }))).toContain('API key');
    expect(profileProblem(profile({ apiBase: '' }))).toContain('接口地址');
    expect(profileProblem(profile({ model: '' }))).toContain('模型名');
    expect(profileProblem(null)).toContain('还没有配置任何接口');
  });
});

describe('profileProblem 认出画图模型', () => {
  /* 位图模型走 /images/generations，填在这儿只会拿到一句看不懂的 400 */
  it('says an image model belongs to another endpoint', () => {
    const message = profileProblem(profile({ model: 'gpt-image-2' }));
    expect(message).toContain('画位图的模型');
    expect(message).toContain('/images/generations');
  });

  it('catches the usual suspects', () => {
    for (const model of ['dall-e-3', 'flux-pro', 'stable-diffusion-xl', 'seedream-4.0']) {
      expect(profileProblem(profile({ model })), model).toContain('画位图的模型');
    }
  });

  /* 别把正经对话模型误伤了 */
  it('leaves chat models alone', () => {
    for (const model of ['gpt-4o', 'claude-sonnet-4', 'deepseek-chat', 'gpt-5-mini']) {
      expect(profileProblem(profile({ model })), model).toBeNull();
    }
  });
});
