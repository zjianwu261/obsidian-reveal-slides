/**
 * 配图工作台：题目 + 讲稿 → 一段中文描述 → 一张图。
 *
 * 拆成两步是因为中间那段描述该由你说了算：模型读讲稿想出的构思，
 * 十有八九差一点意思（挑错了重点、比喻不贴），而一张图要跑一分钟 ——
 * 跑完才发现构思不对，等于白等。先把构思摆出来给你改，改完再画。
 */
import { Notice } from 'obsidian';
import { IMAGE_STYLES } from '../ai/imagePrompt';

export interface FigurePanelHandlers {
  /** 当前这一页的题目和讲稿（左边那栏就摆这两样） */
  parts(): Promise<{ title: string; notes: string } | null>;
  /** 读题目和讲稿，想出一段中文描述 */
  describe(request: string): Promise<string>;
  /** 按这段描述、用这套画风画，返回塞好图之后的新页面源码 */
  draw(description: string, styleId: string): Promise<string>;
  /** 写回这一页 */
  apply(markdown: string): Promise<void>;
  /** 换了画风，交给调用方存起来 */
  onStyleChange?(id: string): void;
}

export class FigurePanel {
  private root: HTMLElement;
  private source: HTMLElement;
  private description: HTMLTextAreaElement;
  private convertButton: HTMLButtonElement;
  private drawButton: HTMLButtonElement;
  private status: HTMLElement;
  private style: string;

  constructor(
    parent: HTMLElement,
    private handlers: FigurePanelHandlers,
    savedStyle = IMAGE_STYLES[0].id,
  ) {
    this.style = IMAGE_STYLES.some((item) => item.id === savedStyle)
      ? savedStyle
      : IMAGE_STYLES[0].id;
    this.root = parent.createDiv({ cls: 'rfo-figure' });

    const board = this.root.createDiv({ cls: 'rfo-figure-board' });

    // 左：这一页给了什么。只读 —— 要改就回笔记里改，那儿才是原稿
    const left = board.createDiv({ cls: 'rfo-figure-pane' });
    left.createDiv({ cls: 'rfo-figure-label', text: '这一页' });
    this.source = left.createDiv({ cls: 'rfo-figure-source' });

    const middle = board.createDiv({ cls: 'rfo-figure-middle' });
    this.convertButton = middle.createEl('button', {
      cls: 'rfo-figure-convert',
      text: '想一张 →',
      attr: { title: '读题目和讲稿，想出一段画面描述' },
    });

    // 右：想出来的构思。可改 —— 这一步的价值全在这儿
    const right = board.createDiv({ cls: 'rfo-figure-pane' });
    right.createDiv({ cls: 'rfo-figure-label', text: '配图描述（可以改）' });
    this.description = right.createEl('textarea', {
      cls: 'rfo-figure-description',
      attr: { placeholder: '点左边的「想一张」让 AI 写，或者自己直接写画面：\n有什么东西、谁在做什么、什么在前什么在后。' },
    });

    // 画风跟着描述走：同一段描述换套画风就是另一张图，挑起来该在手边
    const styles = right.createDiv({ cls: 'rfo-figure-styles' });
    styles.createSpan({ cls: 'rfo-figure-label', text: '画风' });
    for (const style of IMAGE_STYLES) {
      const chip = styles.createEl('button', {
        cls: 'rfo-figure-style',
        text: style.name,
        attr: { title: style.hint },
      });
      chip.toggleClass('is-active', style.id === this.style);
      chip.addEventListener('click', () => {
        this.style = style.id;
        styles.findAll('.rfo-figure-style').forEach((other, i) => {
          other.toggleClass('is-active', IMAGE_STYLES[i].id === this.style);
        });
        this.handlers.onStyleChange?.(style.id);
      });
    }

    const bar = this.root.createDiv({ cls: 'rfo-figure-bar' });
    this.status = bar.createSpan({ cls: 'rfo-figure-status' });
    this.drawButton = bar.createEl('button', { cls: 'mod-cta', text: '按这段描述生图' });

    this.convertButton.addEventListener('click', () => void this.convert());
    this.drawButton.addEventListener('click', () => void this.draw());

    void this.refresh();
  }

  /** 换页/换笔记之后把左栏重读一遍 */
  async refresh(): Promise<void> {
    const parts = await this.handlers.parts();
    this.source.empty();

    if (!parts) {
      this.source.createDiv({ cls: 'rfo-figure-empty', text: '还没有可改的页面' });
      return;
    }

    this.source.createDiv({ cls: 'rfo-figure-title', text: parts.title || '（这一页没有标题）' });
    this.source.createDiv({
      cls: 'rfo-figure-notes',
      text: parts.notes || '（这一页没有讲稿。讲稿才是配图的依据，先把它写上）',
    });
  }

  private async convert(): Promise<void> {
    // 描述框里已经写着东西时，把它当成「按这个方向再想一遍」的交代，别白扔
    const hint = this.description.value.trim();
    await this.run(this.convertButton, '想…', async () => {
      this.description.value = await this.handlers.describe(hint);
      this.say('想好了，看看要不要改，然后生图');
    });
  }

  private async draw(): Promise<void> {
    await this.run(this.drawButton, '画…', async () => {
      const markdown = await this.handlers.draw(this.description.value, this.style);
      await this.handlers.apply(markdown);
      this.say('已经放进这一页了。不满意就改描述再来一次，或 ⌘/Ctrl + Z 撤销');
    });
  }

  /**
   * 跑一件要等的事：按钮禁用、秒数走起来。
   * 一个不动的「想…」分不清是在算还是已经卡死；秒数在跳就说明还活着。
   */
  private async run(button: HTMLButtonElement, label: string, work: () => Promise<void>): Promise<void> {
    if (button.disabled) return;
    const original = button.textContent ?? '';
    const startedAt = Date.now();

    button.disabled = true;
    this.convertButton.disabled = true;
    this.drawButton.disabled = true;
    const timer = window.setInterval(() => {
      button.setText(`${label} ${Math.round((Date.now() - startedAt) / 1000)}s`);
    }, 1000);
    button.setText(`${label} 0s`);
    this.say('');

    try {
      await work();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.say(`没成：${message}`);
      new Notice(`reveal-slide-for-obsidian: ${message}`);
    } finally {
      window.clearInterval(timer);
      button.setText(original);
      this.convertButton.disabled = false;
      this.drawButton.disabled = false;
    }
  }

  private say(text: string): void {
    this.status.setText(text);
  }

  setVisible(visible: boolean): void {
    this.root.toggleClass('is-hidden', !visible);
  }

  destroy(): void {
    this.root.remove();
  }
}
