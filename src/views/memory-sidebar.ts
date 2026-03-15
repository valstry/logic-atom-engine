import { ItemView, WorkspaceLeaf, setIcon, Notice } from 'obsidian';
import type ThreeLibraryPlugin from '../main';
import { MemoryResult, MemoryItem } from '../api/types';

export const MEMORY_SIDEBAR_VIEW = 'three-library-memory-sidebar';

export class MemorySidebarView extends ItemView {
  plugin: ThreeLibraryPlugin;
  private searchInputEl: HTMLInputElement;
  private resultsEl: HTMLElement;
  private statusEl: HTMLElement;

  constructor(leaf: WorkspaceLeaf, plugin: ThreeLibraryPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return MEMORY_SIDEBAR_VIEW;
  }

  getDisplayText(): string {
    return '记忆浏览器';
  }

  getIcon(): string {
    return 'database';
  }

  async onOpen(): Promise<void> {
    const container = this.contentEl;
    container.empty();
    container.addClass('three-library-sidebar');

    // Header
    container.createEl('h4', { text: '记忆浏览器', cls: 'tl-sidebar-title' });

    // Search
    const searchBox = container.createDiv({ cls: 'tl-search-box' });
    this.searchInputEl = searchBox.createEl('input', {
      cls: 'tl-search-input',
      attr: { placeholder: '搜索记忆...' },
    });

    const searchBtn = searchBox.createEl('button', { cls: 'tl-btn tl-btn-small' });
    setIcon(searchBtn, 'search');
    searchBtn.addEventListener('click', () => this.doSearch());
    this.searchInputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.doSearch();
    });

    // Status
    this.statusEl = container.createDiv({ cls: 'tl-sidebar-status' });

    // Results list
    this.resultsEl = container.createDiv({ cls: 'tl-sidebar-results' });
  }

  private async doSearch(): Promise<void> {
    const query = this.searchInputEl.value.trim();
    if (!query) return;

    this.statusEl.textContent = '搜索中...';
    this.resultsEl.empty();

    try {
      const results = await this.plugin.apiClient.searchMemories(query, this.plugin.settings.maxSearchResults);
      this.statusEl.textContent = `找到 ${results.length} 条记忆`;
      this.renderResults(results);
    } catch (e) {
      this.statusEl.textContent = `错误：${e instanceof Error ? e.message : String(e)}`;
    }
  }

  private extractEventId(raw: MemoryItem): string | null {
    const data = raw as Record<string, unknown>;
    if (data.event_id && typeof data.event_id === 'string') return data.event_id;
    if (data.id && typeof data.id === 'string') return data.id;
    if (data.memcell_id && typeof data.memcell_id === 'string') return data.memcell_id;
    if (Array.isArray(data.memcell_event_id_list) && data.memcell_event_id_list.length > 0) {
      return String(data.memcell_event_id_list[0]);
    }
    return null;
  }

  private async deleteMemory(eventId: string, card: HTMLElement): Promise<void> {
    if (!confirm('确认删除此条记忆？')) return;
    try {
      await this.plugin.apiClient.deleteMemory(eventId);
      card.addClass('tl-memory-card-deleted');
      card.empty();
      card.createDiv({ text: '已删除', cls: 'tl-deleted-label' });
      new Notice('记忆已删除');
      // Refresh search results
      setTimeout(() => this.doSearch(), 500);
    } catch (e) {
      new Notice(`删除失败：${e instanceof Error ? e.message : String(e)}`);
    }
  }

  private renderResults(results: MemoryResult[]): void {
    if (results.length === 0) {
      this.resultsEl.createDiv({ text: '没有找到相关记忆。', cls: 'tl-sidebar-empty' });
      return;
    }

    for (const mem of results) {
      const card = this.resultsEl.createDiv({ cls: 'tl-memory-card' });

      const headerEl = card.createDiv({ cls: 'tl-memory-header' });
      const typeIcon = headerEl.createSpan({ cls: 'tl-memory-type' });
      setIcon(typeIcon, mem.type === 'memory' ? 'brain' : 'user');
      headerEl.createSpan({ text: mem.title, cls: 'tl-memory-title' });

      // Delete button
      const eventId = this.extractEventId(mem.raw);
      if (eventId) {
        const deleteBtn = headerEl.createEl('button', {
          cls: 'tl-btn-delete tl-btn-delete-card',
          attr: { title: '删除此记忆' },
        });
        setIcon(deleteBtn, 'x');
        deleteBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.deleteMemory(eventId, card);
        });
      }

      if (mem.content) {
        card.createDiv({
          text: mem.content.length > 200 ? mem.content.slice(0, 200) + '...' : mem.content,
          cls: 'tl-memory-content',
        });
      }

      const metaEl = card.createDiv({ cls: 'tl-memory-meta' });
      if (mem.score) {
        metaEl.createSpan({ text: `相关度：${(mem.score * 100).toFixed(0)}%` });
      }
      if (mem.memoryType) {
        metaEl.createSpan({ text: mem.memoryType, cls: 'tl-tag' });
      }
      if (mem.createdAt) {
        metaEl.createSpan({ text: mem.createdAt.substring(0, 10) });
      }
    }
  }

  async onClose(): Promise<void> {
    // Cleanup
  }
}
