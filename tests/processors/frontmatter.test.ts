import { describe, it, expect } from 'vitest';
import { extractFrontmatter } from '../../src/processors/frontmatter';

describe('extractFrontmatter', () => {
  it('separates frontmatter and body', () => {
    const md = '---\ntitle: Demo\n---\n# Hello\n';
    const { frontmatter, body } = extractFrontmatter(md);
    expect(frontmatter.title).toBe('Demo');
    expect(body).toBe('# Hello\n');
  });

  it('restores YAML 1.1 sexagesimal size "16:9"', () => {
    const md = '---\nsize: 16:9\n---\ncontent';
    const { frontmatter } = extractFrontmatter(md);
    expect(frontmatter.size).toBe('16:9');
  });

  it('restores other ratio sizes like "4:3"', () => {
    const md = '---\nsize: 4:3\n---\ncontent';
    const { frontmatter } = extractFrontmatter(md);
    expect(frontmatter.size).toBe('4:3');
  });

  it('keeps explicit pixel sizes as strings', () => {
    const md = '---\nsize: 1920x1080\n---\ncontent';
    const { frontmatter } = extractFrontmatter(md);
    expect(frontmatter.size).toBe('1920x1080');
  });

  it('returns empty frontmatter when absent', () => {
    const { frontmatter, body } = extractFrontmatter('# Just content\n');
    expect(frontmatter).toEqual({});
    expect(body).toBe('# Just content\n');
  });

  it('handles CRLF line endings', () => {
    const md = '---\r\ntitle: CRLF\r\n---\r\nbody';
    const { frontmatter, body } = extractFrontmatter(md);
    expect(frontmatter.title).toBe('CRLF');
    expect(body).toBe('body');
  });

  it('falls back gracefully on invalid YAML', () => {
    const md = '---\n: : : broken\n  - x\n---\nbody';
    const { frontmatter } = extractFrontmatter(md);
    expect(frontmatter).toEqual({});
  });
});
