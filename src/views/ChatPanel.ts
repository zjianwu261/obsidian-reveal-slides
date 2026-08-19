/**
 * 预览面板下方的对话框：说一句话改**当前这一页**。
 *
 * 为什么只给这一页：一篇课件几千行，整篇塞给模型既贵又容易改错地方；
 * 而作者说「把这页的图换成对比图」时，心里指的就是眼前这一页。
 * 16:9 画布在竖长面板里本来就剩下半屏，这块空白正好拿来放它。
 *
 * 改动**一律先看后写**：模型回什么先显示出来，按「应用」才落到笔记里。
 * 课件是要拿去上课的，不能让它背着人改。
 */
import { Notice } from 'obsidian';
import { clampPanelHeight } from './panelLayout';

export interface ChatPanelHandlers {
  /** 拖动分割线后的新高度，交给调用方存起来 */
  onResize?(height: number): void;
  /** 发问：返回模型给出的新页面源码 */
  ask(request: string): Promise<string>;
  /** 应用改动 */
  apply(markdown: string): Promise<void>;
  /** 有没有可改的页面 */
  canEdit(): boolean;
}

export class ChatPanel {
  private root: HTMLElement;
  private log: HTMLElement;
  private input: HTMLTextAreaElement;
  private sendButton: HTMLButtonElement;
  private pending: string | null = null;

  constructor(
    private parent: HTMLElement,
    private handlers: ChatPanelHandlers,
    height = 220,
  ) {
    this.root = parent.createDiv({ cls: 'rfo-chat' });
    this.root.style.height = `${clampPanelHeight(height, parent.clientHeight)}px`;
    this.buildResizer();

    this.log = this.root.createDiv({ cls: 'rfo-chat-log' });
    this.say('assistant', '说一句话改当前这一页，比如「把右边的要点改成对比图」。改动会先给你看。');

    const bar = this.root.createDiv({ cls: 'rfo-chat-bar' });
    this.input = bar.createEl('textarea', {
      cls: 'rfo-chat-input',
      attr: { rows: '2', placeholder: '改这一页…（⌘/Ctrl + Enter 发送）' },
    });
    this.sendButton = bar.createEl('button', { cls: 'rfo-chat-send', text: '发送' });

    this.sendButton.addEventListener('click', () => void this.send());
    this.input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        void this.send();
      }
    });
  }

  /**
   * 顶边的分割线可以拖。幻灯片和对话谁该多占一点，取决于此刻在干什么 ——
   * 调版面时想看大图，连着问几轮时想看长回复。
   */
  private buildResizer(): void {
    const handle = this.root.createDiv({ cls: 'rfo-chat-resizer' });

    handle.addEventListener('pointerdown', (event: PointerEvent) => {
      event.preventDefault();
      handle.setPointerCapture(event.pointerId);

      const startY = event.clientY;
      const startHeight = this.root.getBoundingClientRect().height;

      const move = (moveEvent: PointerEvent): void => {
        // 往上拖 = 对话框变高，所以是起点减当前
        const next = clampPanelHeight(
          startHeight + (startY - moveEvent.clientY),
          this.parent.clientHeight,
        );
        this.root.style.height = `${next}px`;
      };

      const done = (): void => {
        handle.releasePointerCapture(event.pointerId);
        handle.removeEventListener('pointermove', move);
        handle.removeEventListener('pointerup', done);
        this.handlers.onResize?.(this.root.getBoundingClientRect().height);
      };

      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', done);
    });
  }

  setVisible(visible: boolean): void {
    this.root.toggleClass('is-hidden', !visible);
  }

  destroy(): void {
    this.root.remove();
  }

  private say(who: 'user' | 'assistant', text: string): HTMLElement {
    const line = this.log.createDiv({ cls: `rfo-chat-msg is-${who}` });
    line.setText(text);
    this.log.scrollTop = this.log.scrollHeight;
    return line;
  }

  private async send(): Promise<void> {
    const request = this.input.value.trim();
    if (!request || this.sendButton.disabled) return;

    if (!this.handlers.canEdit()) {
      new Notice('reveal-slide-for-obsidian: 还没有可改的页面');
      return;
    }

    this.say('user', request);
    this.input.value = '';
    this.sendButton.disabled = true;
    const thinking = this.say('assistant', '想一想…');

    try {
      const reply = await this.handlers.ask(request);
      thinking.remove();
      this.showProposal(reply);
    } catch (err) {
      thinking.remove();
      this.say('assistant', `没成：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      this.sendButton.disabled = false;
    }
  }

  /** 模型的回复先摆出来，按了「应用」才写回笔记 */
  private showProposal(markdown: string): void {
    this.pending = markdown;

    const box = this.log.createDiv({ cls: 'rfo-chat-msg is-assistant rfo-chat-proposal' });
    box.createEl('pre', { cls: 'rfo-chat-diff', text: markdown });

    const actions = box.createDiv({ cls: 'rfo-chat-actions' });
    const apply = actions.createEl('button', { cls: 'mod-cta', text: '应用到这一页' });
    const cancel = actions.createEl('button', { text: '算了' });

    apply.addEventListener('click', () => {
      const pending = this.pending;
      if (!pending) return;
      void this.handlers
        .apply(pending)
        .then(() => {
          actions.remove();
          this.say('assistant', '写回笔记了。不满意就 ⌘/Ctrl + Z 撤销。');
        })
        .catch((err: unknown) => {
          this.say('assistant', `写回失败：${err instanceof Error ? err.message : String(err)}`);
        });
    });

    cancel.addEventListener('click', () => {
      this.pending = null;
      box.remove();
    });

    this.log.scrollTop = this.log.scrollHeight;
  }
}
