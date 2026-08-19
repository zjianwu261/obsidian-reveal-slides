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
import {
  chatKeyAction,
  clampPanelRatio,
  heightToRemember,
  inputHeight,
  ratioFromHeight,
} from './panelLayout';
import { formatContext } from './chatContext';
import type { ChatContext } from './chatContext';
import { matchCommands } from './chatCommands';
import { SLIDE_LAYOUTS, composeRequest, findBox, requestedBlock } from './slideLayouts';
import type { SlideLayout } from './slideLayouts';

/** 一轮等待：调用方据此判断回复该不该用（用户可能已经点了「不等了」） */
interface WaitingRound {
  abandoned: boolean;
  seconds(): number;
}

export interface ChatPanelHandlers {
  /** 拖动分割线后的新比例（0~1），交给调用方存起来 */
  onResize?(ratio: number): void;
  /** 拖动输入框后的新高度（像素，0 = 退回自动），交给调用方存起来 */
  onInputResize?(height: number): void;
  /** 发问：返回模型给出的新页面源码 */
  ask(request: string): Promise<string>;
  /** 应用改动 */
  apply(markdown: string): Promise<void>;
  /** 有没有可改的页面 */
  canEdit(): boolean;
  /** 现在这句话会落到哪一页（状态栏用） */
  context(): ChatContext | null;
  /** 存下来的几套接口（名字给人看，id 用来切换） */
  profiles?(): { id: string; name: string }[];
  /** 现在用的是哪一套 */
  activeProfile?(): string;
  /** 换一套接口 */
  onProfileChange?(id: string): void;
}

export class ChatPanel {
  private root: HTMLElement;
  private contextBar: HTMLElement;
  private profilePicker: HTMLSelectElement | null = null;
  /** 选中的版式；null = 不指定，位置交给模型 */
  private layout: SlideLayout | null = null;
  private log: HTMLElement;
  /** 斜杠菜单：DOM、每条对应的文本、当前选中第几条 */
  private menu: { el: HTMLElement; items: HTMLElement[]; texts: string[]; index: number } | null =
    null;
  private input: HTMLTextAreaElement;
  private sendButton: HTMLButtonElement;
  private pending: string | null = null;
  /** 上一次「我们自己」设的输入框高度：拿它区分是自动长的还是你拖的 */
  private autoHeight = 0;
  /** 你拖出来的高度；null = 还没拖过，跟着内容长 */
  private manualHeight: number | null = null;
  private inputObserver: ResizeObserver | null = null;
  /** 正在等的这一轮：秒数计时器与它那行界面 */
  private waiting: { timer: number; line: HTMLElement } | null = null;

  constructor(
    private parent: HTMLElement,
    private handlers: ChatPanelHandlers,
    ratio = 0.4,
    savedInputHeight = 0,
  ) {
    this.root = parent.createDiv({ cls: 'rfo-chat' });
    // 用百分比而不是像素：onOpen 时面板还没排版，clientHeight 是 0，量不出东西来
    this.root.style.height = `${(clampPanelRatio(ratio) * 100).toFixed(1)}%`;
    this.buildResizer();

    this.buildLayoutBar();

    // 状态栏：这句话会改哪一页。笔记切来切去之后，这一条比什么都重要
    this.contextBar = this.root.createDiv({ cls: 'rfo-chat-context' });
    this.log = this.root.createDiv({ cls: 'rfo-chat-log' });
    this.say('assistant', '说一句话改当前这一页，比如「把右边的要点改成对比图」。改动会先给你看。');

    this.refreshContext();

    const bar = this.root.createDiv({ cls: 'rfo-chat-bar' });
    this.input = bar.createEl('textarea', {
      cls: 'rfo-chat-input',
      attr: { rows: '2', placeholder: '改这一页…（Enter 发送，Alt + Enter 换行）' },
    });
    this.sendButton = bar.createEl('button', { cls: 'rfo-chat-send', text: '发送' });

    this.sendButton.addEventListener('click', () => void this.send());
    this.input.addEventListener('input', () => {
      this.refreshMenu();
      this.growInput();
    });

    if (savedInputHeight > 0) this.manualHeight = savedInputHeight;
    this.applyInputHeight();
    this.watchInputResize();
    this.input.addEventListener('keydown', (event) => {
      const action = chatKeyAction(event, this.menu !== null);
      if (action === 'pass') return;
      event.preventDefault();
      switch (action) {
        case 'send': void this.send(); break;
        case 'newline': this.insertNewline(); break;
        case 'menu-next': this.moveMenu(1); break;
        case 'menu-prev': this.moveMenu(-1); break;
        case 'menu-accept': this.acceptMenu(); break;
        case 'menu-close': this.closeMenu(); break;
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
        const next = ratioFromHeight(
          startHeight + (startY - moveEvent.clientY),
          this.parent.clientHeight,
        );
        this.root.style.height = `${(next * 100).toFixed(1)}%`;
      };

      const done = (): void => {
        handle.releasePointerCapture(event.pointerId);
        handle.removeEventListener('pointermove', move);
        handle.removeEventListener('pointerup', done);
        this.handlers.onResize?.(
          ratioFromHeight(this.root.getBoundingClientRect().height, this.parent.clientHeight),
        );
      };

      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', done);
    });
  }

  /**
   * 版式条：幻灯片和对话之间的一排缩略图。
   *
   * 「排得好看点」这种话模型每次给的 dim/pos 都不一样。先点一个结构，
   * 位置就由插件给死，模型只管往格子里填内容 —— 改起来才有准头。
   * 缩略图按 grid 的真实百分比画，看到的分布就是模型收到的数字。
   */
  private buildLayoutBar(): void {
    const bar = this.root.createDiv({ cls: 'rfo-chat-layouts' });
    bar.createSpan({ cls: 'rfo-chat-layouts-label', text: '版式' });

    for (const layout of SLIDE_LAYOUTS) {
      const cell = bar.createDiv({ cls: 'rfo-chat-layout', attr: { title: layout.hint } });
      const thumb = cell.createDiv({ cls: 'rfo-chat-layout-thumb' });
      for (const box of layout.boxes) {
        const el = thumb.createDiv({ cls: `rfo-chat-layout-box is-${box.kind}` });
        el.style.left = `${box.x}%`;
        el.style.top = `${box.y}%`;
        el.style.width = `${box.w}%`;
        el.style.height = `${box.h}%`;
      }
      cell.createSpan({ cls: 'rfo-chat-layout-name', text: layout.name });

      // 再点一次取消：选错了不用去找「不指定」那一格
      cell.addEventListener('click', () => {
        this.layout = this.layout?.id === layout.id ? null : layout;
        bar.findAll('.rfo-chat-layout').forEach((other, i) => {
          other.toggleClass('is-active', SLIDE_LAYOUTS[i].id === this.layout?.id);
        });
        this.input.focus();
      });
    }

    this.buildProfilePicker(bar);
  }

  /**
   * 接口选择：配了不止一套才露出来。
   *
   * 便宜快的那套改文字挺好，画图明显不行；换成中转站上的 GPT 画一张，
   * 画完再换回来 —— 这种来回切换要是得跑一趟设置页，就没人会切了。
   */
  private buildProfilePicker(bar: HTMLElement): void {
    if (!this.handlers.profiles) return;

    const picker = bar.createEl('select', { cls: 'rfo-chat-profile dropdown' });
    picker.addEventListener('change', () => this.handlers.onProfileChange?.(picker.value));
    this.profilePicker = picker;
    this.refreshProfiles();
  }

  /** 设置页那边加/删/改了接口，这里跟着换一批选项 */
  private refreshProfiles(): void {
    const picker = this.profilePicker;
    const profiles = this.handlers.profiles?.() ?? [];
    if (!picker) return;

    // 只有一套时不占地方：没得选的下拉框只是噪音
    picker.toggleClass('is-hidden', profiles.length < 2);
    picker.empty();
    for (const profile of profiles) {
      picker.createEl('option', { value: profile.id, text: profile.name || '未命名' });
    }
    picker.value = this.handlers.activeProfile?.() ?? '';
  }

  /**
   * 输入框跟着内容长。
   *
   * 两行是给「把图换成对比图」这种一句话准备的；真要交代清楚一段要求时，
   * 打到第五行就看不见开头写了什么了 —— 一边写一边长，比每次去拖角省事。
   * 自己拖过一次就听你的，不再自动长。
   */
  private growInput(): void {
    if (this.manualHeight !== null) return;
    this.input.style.height = 'auto'; // 先塌回去，scrollHeight 才是内容的真实高度
    this.setInputHeight(inputHeight(this.input.scrollHeight, this.root.clientHeight));
  }

  private applyInputHeight(): void {
    if (this.manualHeight !== null) {
      this.setInputHeight(this.manualHeight);
      return;
    }
    this.growInput();
  }

  private setInputHeight(height: number): void {
    this.autoHeight = height;
    this.input.style.height = `${height}px`;
  }

  /**
   * 拖角改高度：textarea 的 resize 不发事件，只能盯着尺寸变。
   * 与我们自己刚设的高度对得上就是自动长的，对不上才是你拖的。
   */
  private watchInputResize(): void {
    if (typeof ResizeObserver === 'undefined') return;

    this.inputObserver = new ResizeObserver(() => {
      const height = this.input.getBoundingClientRect().height;
      if (!height || Math.abs(height - this.autoHeight) < 2) return;

      const remembered = heightToRemember(height);
      this.manualHeight = remembered || null;
      this.autoHeight = height;
      this.handlers.onInputResize?.(remembered);
      // 拖回最矮＝要自动挡，立刻按当前内容重算一次
      if (!remembered) this.growInput();
    });
    this.inputObserver.observe(this.input);
  }

  /** Alt/Shift + Enter：在光标处插一个换行（textarea 默认不会为这两个组合换行） */
  private insertNewline(): void {
    const { selectionStart, selectionEnd, value } = this.input;
    this.input.value = `${value.slice(0, selectionStart)}\n${value.slice(selectionEnd)}`;
    this.input.selectionStart = this.input.selectionEnd = selectionStart + 1;
    this.growInput();
  }

  /** 预览翻页 / 换笔记之后刷新状态栏 */
  refreshContext(): void {
    this.contextBar.setText(formatContext(this.handlers.context()));
    this.refreshProfiles();
  }

  /**
   * 斜杠命令菜单。同样几句话每页都要说一遍，打个 / 挑一条就行；
   * 提法固定下来之后，模型的表现也更稳。
   */
  private refreshMenu(): void {
    const matches = matchCommands(this.input.value);
    this.closeMenu();
    if (matches.length === 0) return;

    const el = this.root.createDiv({ cls: 'rfo-chat-menu' });
    const items: HTMLElement[] = [];
    matches.forEach((command, i) => {
      const item = el.createDiv({ cls: 'rfo-chat-menu-item' });
      item.createSpan({ cls: 'rfo-chat-menu-name', text: command.name });
      item.createSpan({ cls: 'rfo-chat-menu-hint', text: command.hint });
      // mousedown 而不是 click：click 之前输入框会先失焦，鼠标党和键盘党就对不上了
      item.addEventListener('mousedown', (event) => {
        event.preventDefault();
        this.menu!.index = i;
        this.acceptMenu();
      });
      // 鼠标扫过就同步高亮，免得出现「鼠标指一条、键盘选另一条」两个选中态
      item.addEventListener('mouseenter', () => this.highlight(i));
      items.push(item);
    });

    this.menu = { el, items, texts: matches.map((c) => c.text), index: 0 };
    this.highlight(0);
  }

  /** 上下键挪一格，到头绕回去 —— 五条命令的短列表，绕回来比卡住顺手 */
  private moveMenu(step: number): void {
    if (!this.menu) return;
    const { items, index } = this.menu;
    this.highlight((index + step + items.length) % items.length);
  }

  private highlight(index: number): void {
    if (!this.menu) return;
    this.menu.index = index;
    this.menu.items.forEach((item, i) => item.toggleClass('is-active', i === index));
    // 列表比菜单高时（max-height 180px），选中项要自己滚进视野
    this.menu.items[index]?.scrollIntoView({ block: 'nearest' });
  }

  /** 选中当前这条：命令文本填进输入框，菜单关掉，焦点留在输入框上等你再改两句 */
  private acceptMenu(): void {
    if (!this.menu) return;
    const text = this.menu.texts[this.menu.index];
    this.closeMenu();
    if (text === undefined) return;
    this.input.value = text;
    this.input.selectionStart = this.input.selectionEnd = text.length;
    this.input.focus();
    this.growInput();
  }

  private closeMenu(): void {
    this.menu?.el.remove();
    this.menu = null;
  }

  setVisible(visible: boolean): void {
    this.root.toggleClass('is-hidden', !visible);
  }

  destroy(): void {
    this.inputObserver?.disconnect();
    this.stopWaiting();
    this.root.remove();
  }

  private say(who: 'user' | 'assistant', text: string): HTMLElement {
    const line = this.log.createDiv({ cls: `rfo-chat-msg is-${who}` });
    line.setText(text);
    this.log.scrollTop = this.log.scrollHeight;
    return line;
  }

  /**
   * 拿「通栏正文」去配图这种搭配：版式里根本没有图的位置。
   * composeRequest 这时会把版式丢掉（宽度宁可不给，也不能瞎给一个），
   * 但丢得静悄悄的话，你会以为宽度已经定死了 —— 吭一声。
   */
  private warnIfLayoutHasNoRoom(): void {
    const block = requestedBlock(this.input.value);
    if (!this.layout || !block || findBox(this.layout, block)) return;
    new Notice(`reveal-slide-for-obsidian: 「${this.layout.name}」没有这一块的位置，这次没按版式发`);
  }

  /** 对话里回显这一句：版式那段话是给模型看的，界面上写个名字就够了 */
  private echo(): string {
    const typed = this.input.value.trim();
    if (!this.layout) return typed;
    return typed ? `${typed}（版式：${this.layout.name}）` : `按「${this.layout.name}」重排这一页`;
  }

  private async send(): Promise<void> {
    const request = composeRequest(this.input.value, this.layout);
    if (!request || this.sendButton.disabled) return;
    this.warnIfLayoutHasNoRoom();

    if (!this.handlers.canEdit()) {
      new Notice('reveal-slide-for-obsidian: 还没有可改的页面');
      return;
    }

    this.closeMenu();
    this.say('user', this.echo());
    this.input.value = '';
    this.growInput();
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
    // 可编辑：模型给的十有八九差一点意思，就地改掉比先应用再回笔记里找快
    const draft = box.createEl('textarea', { cls: 'rfo-chat-draft' });
    draft.value = markdown;
    draft.rows = Math.min(16, markdown.split('\n').length + 1);

    const actions = box.createDiv({ cls: 'rfo-chat-actions' });
    const apply = actions.createEl('button', { cls: 'mod-cta', text: '应用到这一页' });
    const copy = actions.createEl('button', { text: '复制' });
    const cancel = actions.createEl('button', { text: '算了' });

    // 不想整页替换时，手动挑一段抄走
    copy.addEventListener('click', () => {
      void navigator.clipboard.writeText(draft.value).then(
        () => copy.setText('已复制'),
        () => new Notice('reveal-slide-for-obsidian: 复制失败，手动选中吧'),
      );
    });

    apply.addEventListener('click', () => {
      const pending = draft.value.trim();
      if (!pending) return;
      this.pending = pending;
      void this.handlers
        .apply(pending)
        .then(() => {
          actions.remove();
          this.say('assistant', '写回笔记了。不满意就在笔记里改，或 ⌘/Ctrl + Z 撤销。');
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
