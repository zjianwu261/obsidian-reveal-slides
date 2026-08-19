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
import { chatKeyAction, clampPanelHeight } from './panelLayout';

/** 一轮等待：调用方据此判断回复该不该用（用户可能已经点了「不等了」） */
interface WaitingRound {
  abandoned: boolean;
  seconds(): number;
}

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
  /** 正在等的这一轮：秒数计时器与它那行界面 */
  private waiting: { timer: number; line: HTMLElement } | null = null;

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
      attr: { rows: '2', placeholder: '改这一页…（Enter 发送，Alt + Enter 换行）' },
    });
    this.sendButton = bar.createEl('button', { cls: 'rfo-chat-send', text: '发送' });

    this.sendButton.addEventListener('click', () => void this.send());
    this.input.addEventListener('keydown', (event) => {
      const action = chatKeyAction(event);
      if (action === 'pass') return;
      event.preventDefault();
      if (action === 'send') void this.send();
      else this.insertNewline();
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

  /** Alt/Shift + Enter：在光标处插一个换行（textarea 默认不会为这两个组合换行） */
  private insertNewline(): void {
    const { selectionStart, selectionEnd, value } = this.input;
    this.input.value = `${value.slice(0, selectionStart)}\n${value.slice(selectionEnd)}`;
    this.input.selectionStart = this.input.selectionEnd = selectionStart + 1;
  }

  setVisible(visible: boolean): void {
    this.root.toggleClass('is-hidden', !visible);
  }

  destroy(): void {
    this.stopWaiting();
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

    const round = this.startWaiting();
    try {
      const reply = await this.handlers.ask(request);
      if (round.abandoned) return;                    // 用户已经点了「不等了」
      this.stopWaiting();
      this.say('assistant', `想好了，用了 ${round.seconds()} 秒`);
      this.showProposal(reply);
    } catch (err) {
      if (round.abandoned) return;
      this.stopWaiting();
      this.say('assistant', `没成：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      if (!round.abandoned) this.sendButton.disabled = false;
    }
  }

  /**
   * 等待时把秒数走起来。
   * 接口一次要十几二十秒，一个不动的「想一想…」分不清是在算还是已经卡死；
   * 秒数在跳就说明还活着，跳得太久你自己会想去查接口。
   */
  private startWaiting(): WaitingRound {
    const startedAt = Date.now();
    const round: WaitingRound = {
      abandoned: false,
      seconds: () => Math.round((Date.now() - startedAt) / 1000),
    };

    const line = this.say('assistant', '想一想… 0s');
    const label = line.firstChild as Text;
    const cancel = line.createEl('button', { cls: 'rfo-chat-cancel', text: '不等了' });

    const timer = window.setInterval(() => {
      label.data = `想一想… ${round.seconds()}s`;
    }, 1000);
    this.waiting = { timer, line };

    cancel.addEventListener('click', () => {
      round.abandoned = true;
      this.stopWaiting();
      this.say('assistant', '不等了。接口那边可能还在跑，回复会被丢掉。');
      this.sendButton.disabled = false;
    });

    return round;
  }

  /** 收掉计时行（回复到了、出错了、或者用户不等了） */
  private stopWaiting(): void {
    if (!this.waiting) return;
    window.clearInterval(this.waiting.timer);
    this.waiting.line.remove();
    this.waiting = null;
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
