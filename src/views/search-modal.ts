import { App, Modal, Setting } from 'obsidian';
import type ThreeLibraryPlugin from '../main';
import { MemoryResult } from '../api/types';

export class SearchMemoryModal extends Modal {
  plugin: ThreeLibraryPlugin;
  private query: string = '';
  private resultsEl: HTMLElement;

  constructor(app: App, plugin: ThreeLibraryPlugin) {
    super(app);
    this.plugin = plugin;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('tl-search-modal');

    contentEl.createEl('h2', { text: '搜索记忆' });

    new Setting(contentEl)
      .setName('搜索')
      .addText(text => text
        .setPlaceholder('你想找什么？')
        .onChange(value => { this.query = value; })
      )
      .addButton(btn => btn
        .setButtonText('搜索')
        .setCta()
        .onClick(() => this.doSearch())
      );

    this.resultsEl = contentEl.createDiv({ cls: 'tl-modal-results' });
  }

  private async doSearch(): Promise<void> {
    if (!this.query.trim()) return;

    this.resultsEl.empty();
    this.resultsEl.createDiv({ text: '搜索中...', cls: 'tl-modal-status' });

    try {
      const results = await this.plugin.apiClient.searchMemories(
        this.query,
        this.plugin.settings.maxSearchResults
      );

      this.resultsEl.empty();

      if (results.length === 0) {
        this.resultsEl.createDiv({ text: '没有找到相关记忆。', cls: 'tl-modal-status' });
        return;
      }

      for (const mem of results) {
        const item = this.resultsEl.createDiv({ cls: 'tl-modal-item' });
        item.createDiv({ text: mem.title, cls: 'tl-modal-item-title' });
        item.createDiv({
          text: mem.content.length > 150 ? mem.content.slice(0, 150) + '...' : mem.content,
          cls: 'tl-modal-item-content',
        });

        // Click to insert into active editor
        item.addEventListener('click', () => {
          this.insertMemory(mem);
          this.close();
        });
      }
    } catch (e) {
      this.resultsEl.empty();
      this.resultsEl.createDiv({
        text: `错误：${e instanceof Error ? e.message : String(e)}`,
        cls: 'tl-modal-status tl-error',
      });
    }
  }

  private insertMemory(mem: MemoryResult): void {
    const editor = this.app.workspace.activeEditor?.editor;
    if (!editor) return;

    const content = `> **记忆：** ${mem.title}\n> ${mem.content}\n> *相关度：${(mem.score * 100).toFixed(0)}%*\n\n`;
    const cursor = editor.getCursor();
    editor.replaceRange(content, cursor);
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
