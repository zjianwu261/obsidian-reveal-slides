/**
 * 预览面板下方那一块：配图工作台的外壳。
 *
 * 题目 + 讲稿 → 一段描述 → 一张图，这条流水线本身在 FigurePanel 里；
 * 这里管的是它周围那几样：能拖的分割线、这会儿在改哪一页、在用哪两个模型、
 * 以及对话接口的切换。
 *
 * 16:9 画布在竖长面板里本来就剩下半屏，这块空白正好拿来放它。
 */
import { clampPanelRatio, ratioFromHeight } from './panelLayout';
import { formatContext } from './chatContext';
import type { ChatContext } from './chatContext';
import { FigurePanel } from './FigurePanel';
import type { FigurePanelHandlers } from './FigurePanel';

export interface ChatPanelHandlers {
  /** 拖动分割线后的新比例（0~1），交给调用方存起来 */
  onResize?(ratio: number): void;
  /** 配图工作台那几件事 */
  figure: FigurePanelHandlers;
  /** 现在改的是哪一页（状态栏用） */
  context(): ChatContext | null;
  /** 存下来的几套对话接口（名字给人看，id 用来切换） */
  profiles?(): { id: string; name: string }[];
  /** 现在用的是哪一套 */
  activeProfile?(): string;
  /** 换一套接口 */
  onProfileChange?(id: string): void;
  /** 这会儿在用的对话模型名 */
  chatModel?(): string;
  /** 这会儿在用的画图模型名 */
  imageModel?(): string;
}

export class ChatPanel {
  private root: HTMLElement;
  private contextBar: HTMLElement;
  private models: HTMLElement;
  private profilePicker: HTMLSelectElement | null = null;
  private figure: FigurePanel;

  constructor(
    private parent: HTMLElement,
    private handlers: ChatPanelHandlers,
    ratio = 0.4,
    savedStyle?: string,
  ) {
    this.root = parent.createDiv({ cls: 'rfo-chat' });
    // 用百分比而不是像素：onOpen 时面板还没排版，clientHeight 是 0，量不出东西来
    this.root.style.height = `${(clampPanelRatio(ratio) * 100).toFixed(1)}%`;
    this.buildResizer();

    // 这一条：左边写着在用哪两个模型，右边可以换对话那套
    const bar = this.root.createDiv({ cls: 'rfo-chat-layouts' });
    this.models = bar.createSpan({ cls: 'rfo-chat-models' });
    this.buildProfilePicker(bar);

    // 状态栏：改的是哪一页。笔记切来切去之后，这一条比什么都重要
    this.contextBar = this.root.createDiv({ cls: 'rfo-chat-context' });
    this.figure = new FigurePanel(this.root, this.handlers.figure, savedStyle);

    this.refreshContext();
  }

  /**
   * 顶边的分割线可以拖。幻灯片和工作台谁该多占一点，取决于此刻在干什么 ——
   * 调版面时想看大图，改描述时想看长文字。
   */
  private buildResizer(): void {
    const handle = this.root.createDiv({ cls: 'rfo-chat-resizer' });

    handle.addEventListener('pointerdown', (event: PointerEvent) => {
      if (event.button !== 0) return; // 右键、中键不算拖
      event.preventDefault();

      const startY = event.clientY;
      const startHeight = this.root.getBoundingClientRect().height;

      const move = (moveEvent: PointerEvent): void => {
        // 往上拖 = 工作台变高，所以是起点减当前
        const next = ratioFromHeight(
          startHeight + (startY - moveEvent.clientY),
          this.parent.clientHeight,
        );
        this.root.style.height = `${(next * 100).toFixed(1)}%`;
      };

      const done = (): void => {
        // 先摘监听再放捕获：releasePointerCapture 在捕获已经自动失效时会抛，
        // 顺序反过来的话监听就摘不掉了 —— 那之后鼠标只要扫过这条线就在改高度，
        // 手都没按下去。这正是「靠近就自己动」的来路
        handle.removeEventListener('pointermove', move);
        handle.removeEventListener('pointerup', done);
        handle.removeEventListener('pointercancel', done);
        try {
          handle.releasePointerCapture(event.pointerId);
        } catch {
          // 已经放掉了，不用管
        }
        this.handlers.onResize?.(
          ratioFromHeight(this.root.getBoundingClientRect().height, this.parent.clientHeight),
        );
      };

      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', done);
      // 拖到一半被系统打断（切窗口、触控板手势）也得收尾，否则同样摘不掉监听
      handle.addEventListener('pointercancel', done);

      try {
        handle.setPointerCapture(event.pointerId);
      } catch {
        // 捕获不上就只在这条线上跟着走，不影响拖动本身
      }
    });
  }

  /**
   * 接口选择：配了不止一套对话接口才露出来。
   * 没得选的下拉框只是噪音。
   */
  private buildProfilePicker(bar: HTMLElement): void {
    if (!this.handlers.profiles) return;

    const picker = bar.createEl('select', { cls: 'rfo-chat-profile dropdown' });
    picker.addEventListener('change', () => {
      this.handlers.onProfileChange?.(picker.value);
      this.refreshModels();
    });
    this.profilePicker = picker;
    this.refreshProfiles();
  }

  /** 设置页那边加/删/改了接口，这里跟着换一批选项 */
  private refreshProfiles(): void {
    const picker = this.profilePicker;
    const profiles = this.handlers.profiles?.() ?? [];
    if (!picker) return;

    picker.toggleClass('is-hidden', profiles.length < 2);
    picker.empty();
    for (const profile of profiles) {
      picker.createEl('option', { value: profile.id, text: profile.name || '未命名' });
    }
    picker.value = this.handlers.activeProfile?.() ?? '';
  }

  /**
   * 在用哪两个模型。
   *
   * 这条流水线要两个模型接力：对话的那个读讲稿想构思、把描述译成英文，
   * 画图的那个才动笔。图不对先看这一行 —— 多半是其中一个没配对。
   */
  private refreshModels(): void {
    const chat = this.handlers.chatModel?.() ?? '';
    const image = this.handlers.imageModel?.() ?? '';
    this.models.setText(
      [chat ? `对话 ${chat}` : '对话 未配置', image ? `生图 ${image}` : '生图 未配置'].join('  ·  '),
    );
  }

  /** 预览翻页 / 换笔记之后刷新 */
  refreshContext(): void {
    this.contextBar.setText(formatContext(this.handlers.context()));
    this.refreshProfiles();
    this.refreshModels();
    void this.figure.refresh();
  }

  setVisible(visible: boolean): void {
    this.root.toggleClass('is-hidden', !visible);
  }

  destroy(): void {
    this.figure.destroy();
    this.root.remove();
  }
}
