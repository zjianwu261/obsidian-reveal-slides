import { describe, it, expect } from 'vitest';
import { processImages } from '../../src/processors/imageProcessor';

const BASE = 'http://127.0.0.1:3000';

describe('processImages', () => {
  it('rewrites app:// img src to the /vault route', () => {
    const out = processImages('<img src="app://abc123/Users/me/vault/pic.png?1700000" alt="pic">', {
      serverBase: BASE,
    });
    expect(out).toContain(`src="${BASE}/vault/Users/me/vault/pic.png"`);
    expect(out).not.toContain('app://');
    expect(out).toContain('alt="pic"');
  });

  it('decodes and re-encodes path segments', () => {
    const out = processImages('<img src="app://id/Users/me/vault/my%20pic.png?1">', {
      serverBase: BASE,
    });
    expect(out).toContain(`${BASE}/vault/Users/me/vault/my%20pic.png`);
  });

  it('rewrites app:// a href as well', () => {
    const out = processImages('<a href="app://id/Users/me/vault/doc.pdf?1">doc</a>', {
      serverBase: BASE,
    });
    expect(out).toContain(`href="${BASE}/vault/Users/me/vault/doc.pdf"`);
  });

  it('leaves app:// urls untouched without serverBase', () => {
    const html = '<img src="app://id/Users/me/vault/pic.png?1">';
    expect(processImages(html)).toContain('app://id/Users/me/vault/pic.png');
  });

  it('leaves remote http images untouched', () => {
    const html = '<img src="https://example.com/pic.png" alt="remote">';
    const out = processImages(html, { serverBase: BASE });
    expect(out).toContain('src="https://example.com/pic.png"');
  });

  it('wraps video extension img into <video controls>', () => {
    const out = processImages('<img src="app://id/v/clip.mp4?1" alt="clip">', {
      serverBase: BASE,
    });
    expect(out).toContain('<video controls=""');
    expect(out).toContain(`src="${BASE}/vault/v/clip.mp4"`);
    expect(out).not.toContain('<img');
  });

  it('wraps video extension links into <video controls>', () => {
    const out = processImages('<a href="app://id/v/movie.webm">movie</a>', { serverBase: BASE });
    expect(out).toContain('<video controls=""');
    expect(out).toContain(`src="${BASE}/vault/v/movie.webm"`);
  });

  it('replaces excalidraw links with the sibling png when it exists', () => {
    const out = processImages('<a href="app://id/v/drawing.excalidraw">drawing</a>', {
      serverBase: BASE,
      fileExists: (p) => p === '/v/drawing.png',
    });
    expect(out).toContain('<img');
    expect(out).toContain(`src="${BASE}/vault/v/drawing.png"`);
    expect(out).not.toContain('.excalidraw');
  });

  it('keeps excalidraw links when no sibling png exists', () => {
    const html = '<a href="app://id/v/drawing.excalidraw">drawing</a>';
    const out = processImages(html, { serverBase: BASE, fileExists: () => false });
    expect(out).toContain('drawing.excalidraw');
    expect(out).not.toContain('<video');
  });

  it('applies |800 size from the alt text to the img', () => {
    const out = processImages('<img src="app://id/v/pic.png?1" alt="pic.png|800">', {
      serverBase: BASE,
    });
    expect(out).toContain('width="800"');
    expect(out).toContain('alt="pic.png"');
    expect(out).not.toContain('|800');
  });

  it('applies |800x600 width and height', () => {
    const out = processImages('<img src="app://id/v/pic.png?1" alt="pic|800x600">', {
      serverBase: BASE,
    });
    expect(out).toContain('width="800"');
    expect(out).toContain('height="600"');
  });

  it('takes the size off the Obsidian image-embed wrapper', () => {
    const out = processImages(
      '<span class="internal-embed image-embed" width="420"><img src="app://id/v/pic.png?1" alt="pic.png"></span>',
      { serverBase: BASE },
    );
    expect(out).toContain('width="420"');
  });

  it('applies the size to a wrapped video too', () => {
    const out = processImages('<img src="app://id/v/clip.mp4?1" alt="clip|640">', {
      serverBase: BASE,
    });
    expect(out).toContain('<video');
    expect(out).toContain('width="640"');
  });

  it('leaves images without a size suffix alone', () => {
    const out = processImages('<img src="app://id/v/pic.png?1" alt="pic.png">', { serverBase: BASE });
    expect(out).not.toContain('width=');
  });
});
