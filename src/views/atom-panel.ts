import { ItemView, WorkspaceLeaf, MarkdownView, Notice, setIcon } from 'obsidian';
import type ThreeLibraryPlugin from '../main';
import { AtomName, AtomStepResult, AtomChainResult, WorkflowMode } from '../atoms/types';
import { StoredMemoryInfo } from '../api/types';
import {
  WorkflowInputBinding,
  WorkflowPreset,
  cloneWorkflowPreset,
  getBuiltInWorkflowPreset,
} from '../workflows';
import { WorkspaceProfile, getDefaultWorkspaceProfiles } from '../settings';

export const ATOM_PANEL_VIEW = 'three-library-atom-panel';

const ATOM_ICONS: Record<AtomName, string> = {
  decompose: 'split',
  associate: 'link',
  transform: 'rotate-cw',
  abstract: 'layers',
  evaluate: 'bar-chart-2',
  iterate: 'refresh-cw',
};

const ATOM_LABELS: Record<AtomName, string> = {
  decompose: '拆解',
  associate: '关联',
  transform: '变换',
  abstract: '抽象',
  evaluate: '评估',
  iterate: '迭代',
};

const STRATEGY_MODE_LABELS: Record<WorkflowMode, string> = {
  general: '自由编排',
  'reading-understand': '接口拆材',
  'reading-connect': '差分诊断',
  'reading-apply': '压缩与校正',
  'reading-advanced': '一步延伸',
};

const WORKFLOW_INPUT_BINDING_LABELS: Record<WorkflowInputBinding, string> = {
  original: '原文',
  previous: '上一步输出',
  'original+previous': '原文 + 上一步输出',
};

interface ResultCardSelection {
  cardId: string;
  scope: 'step' | 'final';
  title: string;
  summary: string;
  output: string;
  stepIndex?: number;
  atom?: AtomName;
}

interface PointCard {
  title: string;
  body: string;
}

export class AtomPanelView extends ItemView {
  plugin: ThreeLibraryPlugin;
  private titleEl: HTMLElement;
  private workspaceSelectEl: HTMLSelectElement;
  private workspaceHintEl: HTMLElement;
  private workflowGridEl: HTMLElement;
  private workflowControlsEl: HTMLElement;
  private inputEl: HTMLTextAreaElement;
  private atomChipsEl: HTMLElement;
  private executeBtn: HTMLButtonElement;
  private autoBtn: HTMLButtonElement;
  private saveChainBtn: HTMLButtonElement;
  private editWorkspaceBtn: HTMLButtonElement;
  private duplicateWorkspaceBtn: HTMLButtonElement;
  private deleteWorkspaceBtn: HTMLButtonElement;
  private addWorkflowBtn: HTMLButtonElement;
  private editWorkflowBtn: HTMLButtonElement;
  private deleteWorkflowBtn: HTMLButtonElement;
  private setDefaultWorkflowBtn: HTMLButtonElement;
  private moveWorkflowUpBtn: HTMLButtonElement;
  private moveWorkflowDownBtn: HTMLButtonElement;
  private stepsEl: HTMLElement;
  private resultEl: HTMLElement;
  private statsEl: HTMLElement;
  private orderEl: HTMLElement;
  private workflowHintEl: HTMLElement;
  private workflowButtons = new Map<string, HTMLButtonElement>();
  private activeWorkspace: WorkspaceProfile = getDefaultWorkspaceProfiles()[0];
  private activeWorkflowId = 'general';
  private selectedAtoms: AtomName[] = [];
  private selectedResultCardEl: HTMLElement | null = null;
  private selectionStoredInMemory = new Set<string>();
  private runCounter = 0;
  private isRunning = false;
  private lastResult: AtomChainResult | null = null;
  private lastExecutionWorkflow: WorkflowPreset = getBuiltInWorkflowPreset('general');

  constructor(leaf: WorkspaceLeaf, plugin: ThreeLibraryPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return ATOM_PANEL_VIEW;
  }

  getDisplayText(): string {
    return '逻辑原子面板';
  }

  getIcon(): string {
    return 'brain';
  }

  async onOpen(): Promise<void> {
    const container = this.contentEl;
    container.empty();
    container.addClass('three-library-panel');

    const header = container.createDiv({ cls: 'tl-header' });
    this.titleEl = header.createEl('h3', { text: this.activeWorkspace.panelTitle || this.activeWorkspace.name, cls: 'tl-title' });

    const workspaceSection = container.createDiv({ cls: 'tl-workspace-section' });
    workspaceSection.createEl('label', { text: '工作区：', cls: 'tl-label' });
    const workspaceControls = workspaceSection.createDiv({ cls: 'tl-workspace-controls' });

    this.workspaceSelectEl = workspaceControls.createEl('select', { cls: 'tl-workspace-select' });
    this.workspaceSelectEl.addEventListener('change', () => {
      void this.switchWorkspace(this.workspaceSelectEl.value);
    });

    this.saveChainBtn = workspaceControls.createEl('button', {
      text: '保存原子链',
      cls: 'tl-btn tl-btn-small',
    });
    this.saveChainBtn.addEventListener('click', () => void this.saveCurrentModeChain());

    this.editWorkspaceBtn = workspaceControls.createEl('button', {
      text: '编辑工作区',
      cls: 'tl-btn tl-btn-small',
    });
    this.editWorkspaceBtn.addEventListener('click', () => void this.editCurrentWorkspace());

    this.duplicateWorkspaceBtn = workspaceControls.createEl('button', {
      text: '复制工作区',
      cls: 'tl-btn tl-btn-small',
    });
    this.duplicateWorkspaceBtn.addEventListener('click', () => void this.duplicateCurrentWorkspace());

    this.deleteWorkspaceBtn = workspaceControls.createEl('button', {
      text: '删除工作区',
      cls: 'tl-btn tl-btn-small',
    });
    this.deleteWorkspaceBtn.addEventListener('click', () => void this.deleteCurrentWorkspace());

    this.workspaceHintEl = workspaceSection.createDiv({ cls: 'tl-workspace-hint' });

    const workflowSection = container.createDiv({ cls: 'tl-workflow-section' });
    workflowSection.createEl('label', { text: '工作流：', cls: 'tl-label' });
    this.workflowGridEl = workflowSection.createDiv({ cls: 'tl-workflow-grid' });
    this.workflowControlsEl = workflowSection.createDiv({ cls: 'tl-workflow-controls' });

    this.addWorkflowBtn = this.workflowControlsEl.createEl('button', {
      text: '新增流程',
      cls: 'tl-btn tl-btn-small',
    });
    this.addWorkflowBtn.addEventListener('click', () => void this.createWorkflowFromCurrent());

    this.editWorkflowBtn = this.workflowControlsEl.createEl('button', {
      text: '编辑流程',
      cls: 'tl-btn tl-btn-small',
    });
    this.editWorkflowBtn.addEventListener('click', () => void this.editCurrentWorkflow());

    this.deleteWorkflowBtn = this.workflowControlsEl.createEl('button', {
      text: '删除流程',
      cls: 'tl-btn tl-btn-small',
    });
    this.deleteWorkflowBtn.addEventListener('click', () => void this.deleteCurrentWorkflow());

    this.setDefaultWorkflowBtn = this.workflowControlsEl.createEl('button', {
      text: '设为默认',
      cls: 'tl-btn tl-btn-small',
    });
    this.setDefaultWorkflowBtn.addEventListener('click', () => void this.setCurrentWorkflowAsDefault());

    this.moveWorkflowUpBtn = this.workflowControlsEl.createEl('button', {
      text: '流程上移',
      cls: 'tl-btn tl-btn-small',
    });
    this.moveWorkflowUpBtn.addEventListener('click', () => void this.moveCurrentWorkflow(-1));

    this.moveWorkflowDownBtn = this.workflowControlsEl.createEl('button', {
      text: '流程下移',
      cls: 'tl-btn tl-btn-small',
    });
    this.moveWorkflowDownBtn.addEventListener('click', () => void this.moveCurrentWorkflow(1));
    this.workflowHintEl = workflowSection.createDiv({ cls: 'tl-workflow-hint' });

    const inputSection = container.createDiv({ cls: 'tl-input-section' });
    this.inputEl = inputSection.createEl('textarea', { cls: 'tl-input' });

    const selectorSection = container.createDiv({ cls: 'tl-selector-section' });
    selectorSection.createEl('label', { text: '原子链（可手动微调）：', cls: 'tl-label' });
    this.atomChipsEl = selectorSection.createDiv({ cls: 'tl-atom-chips' });

    const allAtoms: AtomName[] = ['decompose', 'associate', 'transform', 'abstract', 'evaluate', 'iterate'];
    for (const atom of allAtoms) {
      const chip = this.atomChipsEl.createDiv({ cls: 'tl-chip', attr: { 'data-atom': atom } });
      const iconSpan = chip.createSpan({ cls: 'tl-chip-icon' });
      setIcon(iconSpan, ATOM_ICONS[atom]);
      chip.createSpan({ text: ATOM_LABELS[atom], cls: 'tl-chip-label' });
      chip.addEventListener('click', () => this.toggleAtom(atom, chip));
    }

    this.orderEl = selectorSection.createDiv({ cls: 'tl-order-display' });
    this.orderEl.style.display = 'none';
    selectorSection.createDiv({
      cls: 'tl-workflow-hint',
      text: '调序方式：取消某个原子后重新选择，它会追加到末尾并改变执行顺序。',
    });

    const actions = container.createDiv({ cls: 'tl-actions' });
    this.autoBtn = actions.createEl('button', { cls: 'tl-btn tl-btn-primary' });
    this.autoBtn.addEventListener('click', () => this.runWorkspacePipeline());

    this.executeBtn = actions.createEl('button', { text: '执行已选原子', cls: 'tl-btn tl-btn-secondary' });
    this.executeBtn.addEventListener('click', () => this.runSelected());

    container.createDiv({
      cls: 'tl-workflow-hint',
      text: '提示：点击任意步骤卡片或最终结果卡片，会自动写入画像记忆；同一张卡片每轮只写一次。',
    });

    this.stepsEl = container.createDiv({ cls: 'tl-steps' });
    this.statsEl = container.createDiv({ cls: 'tl-stats' });
    this.resultEl = container.createDiv({ cls: 'tl-result' });

    this.initializeWorkspace();
  }

  private getWorkspaces(): WorkspaceProfile[] {
    if (Array.isArray(this.plugin.settings.workspaceProfiles) && this.plugin.settings.workspaceProfiles.length > 0) {
      return this.plugin.settings.workspaceProfiles;
    }
    this.plugin.settings.workspaceProfiles = getDefaultWorkspaceProfiles();
    this.plugin.settings.activeWorkspaceId = this.plugin.settings.workspaceProfiles[0].id;
    return this.plugin.settings.workspaceProfiles;
  }

  private getWorkspaceWorkflows(workspace: WorkspaceProfile): WorkflowPreset[] {
    if (!Array.isArray(workspace.workflows) || workspace.workflows.length === 0) {
      workspace.workflows = [getBuiltInWorkflowPreset('general')];
      workspace.defaultWorkflowId = workspace.workflows[0].id;
    }
    return workspace.workflows;
  }

  private getActiveWorkflowPreset(): WorkflowPreset {
    const workflows = this.getWorkspaceWorkflows(this.activeWorkspace);
    const preset = workflows.find(w => w.id === this.activeWorkflowId) ?? workflows[0] ?? getBuiltInWorkflowPreset('general');
    return preset;
  }

  private isStrategyMode(value: string): value is WorkflowMode {
    return ['general', 'reading-understand', 'reading-connect', 'reading-apply', 'reading-advanced'].includes(value);
  }

  private isWorkflowInputBinding(value: string): value is WorkflowInputBinding {
    return ['original', 'previous', 'original+previous'].includes(value);
  }

  private updateWorkflowControlStates(): void {
    const workflows = this.getWorkspaceWorkflows(this.activeWorkspace);
    const hasActive = workflows.some(w => w.id === this.activeWorkflowId);
    const activeIndex = workflows.findIndex(w => w.id === this.activeWorkflowId);
    this.editWorkflowBtn.disabled = !hasActive;
    this.deleteWorkflowBtn.disabled = workflows.length <= 1 || !hasActive;
    this.setDefaultWorkflowBtn.disabled = !hasActive || this.activeWorkspace.defaultWorkflowId === this.activeWorkflowId;
    this.moveWorkflowUpBtn.disabled = !hasActive || activeIndex <= 0;
    this.moveWorkflowDownBtn.disabled = !hasActive || activeIndex < 0 || activeIndex >= workflows.length - 1;
  }

  private initializeWorkspace(): void {
    const workspaces = this.getWorkspaces();
    this.workspaceSelectEl.empty();

    for (const workspace of workspaces) {
      this.workspaceSelectEl.createEl('option', {
        text: workspace.name,
        value: workspace.id,
      });
    }

    const activeId = this.plugin.settings.activeWorkspaceId;
    const nextWorkspace = workspaces.find(w => w.id === activeId) ?? workspaces[0];
    this.workspaceSelectEl.value = nextWorkspace.id;
    this.applyWorkspace(nextWorkspace);
  }

  private renderWorkflowButtons(workspace: WorkspaceProfile): void {
    this.workflowGridEl.empty();
    this.workflowButtons.clear();

    const workflows = this.getWorkspaceWorkflows(workspace);
    for (const preset of workflows) {
      const isDefault = workspace.defaultWorkflowId === preset.id;
      const btn = this.workflowGridEl.createEl('button', {
        text: isDefault ? `★ ${preset.shortLabel}` : preset.shortLabel,
        cls: 'tl-workflow-btn',
        attr: { title: `${preset.label}：${preset.description}` },
      });
      btn.toggleClass('tl-workflow-btn-default', isDefault);
      btn.addEventListener('click', () => this.applyWorkflow(preset.id));
      this.workflowButtons.set(preset.id, btn);
    }
  }

  private applyWorkspace(workspace: WorkspaceProfile): void {
    this.activeWorkspace = workspace;
    this.titleEl.textContent = workspace.panelTitle || workspace.name || '逻辑原子面板';

    const hints: string[] = [`${workspace.name}：${workspace.description}`];
    if (workspace.methodObjective?.trim()) {
      hints.push(`方法目标：${workspace.methodObjective.trim()}`);
    }
    if (workspace.outputStyleGuide?.trim()) {
      hints.push(`输出风格：${workspace.outputStyleGuide.trim()}`);
    }
    this.workspaceHintEl.textContent = hints.join(' | ');

    this.renderWorkflowButtons(workspace);
    const workflows = this.getWorkspaceWorkflows(workspace);
    const fallbackWorkflowId = workflows[0]?.id || 'general';
    const targetWorkflowId = workflows.some(w => w.id === this.activeWorkflowId)
      ? this.activeWorkflowId
      : workflows.some(w => w.id === workspace.defaultWorkflowId)
        ? workspace.defaultWorkflowId
        : fallbackWorkflowId;

    this.deleteWorkspaceBtn.disabled = this.getWorkspaces().length <= 1;
    this.applyWorkflow(targetWorkflowId);
    this.updateWorkflowControlStates();
  }

  private async switchWorkspace(workspaceId: string): Promise<void> {
    const workspace = this.getWorkspaces().find(w => w.id === workspaceId);
    if (!workspace) return;
    this.plugin.settings.activeWorkspaceId = workspace.id;
    await this.plugin.saveSettings();
    this.applyWorkspace(workspace);
    new Notice(`已切换到工作区：${workspace.name}`);
  }

  private async saveCurrentModeChain(): Promise<void> {
    if (!this.activeWorkspace) return;
    const workflow = this.getActiveWorkflowPreset();
    workflow.atoms = [...this.selectedAtoms];
    await this.plugin.saveSettings();
    new Notice(`已保存「${this.activeWorkspace.name} / ${workflow.label}」原子链`);
  }

  private async editCurrentWorkspace(): Promise<void> {
    if (!this.activeWorkspace) return;
    const name = window.prompt('工作区名称：', this.activeWorkspace.name);
    if (name === null) return;
    const panelTitle = window.prompt('面板标题：', this.activeWorkspace.panelTitle || this.activeWorkspace.name);
    if (panelTitle === null) return;
    const description = window.prompt('工作区描述：', this.activeWorkspace.description);
    if (description === null) return;
    const methodObjective = window.prompt(
      '方法目标（可留空）：',
      this.activeWorkspace.methodObjective || '',
    );
    if (methodObjective === null) return;
    const outputStyleGuide = window.prompt(
      '输出风格（可留空）：',
      this.activeWorkspace.outputStyleGuide || '',
    );
    if (outputStyleGuide === null) return;
    const setCurrentAsDefault = window.confirm('是否将“当前选中流程”设为此工作区默认流程？');

    this.activeWorkspace.name = name.trim() || this.activeWorkspace.name;
    this.activeWorkspace.panelTitle = panelTitle.trim() || this.activeWorkspace.panelTitle;
    this.activeWorkspace.description = description.trim() || this.activeWorkspace.description;
    this.activeWorkspace.methodObjective = methodObjective.trim();
    this.activeWorkspace.outputStyleGuide = outputStyleGuide.trim();
    if (setCurrentAsDefault) {
      this.activeWorkspace.defaultWorkflowId = this.activeWorkflowId;
    }
    await this.plugin.saveSettings();
    this.initializeWorkspace();
    new Notice(`已更新工作区：${this.activeWorkspace.name}`);
  }

  private buildWorkflowId(base: string): string {
    const normalized = base
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 32);
    const prefix = normalized || 'workflow';
    return `${prefix}-${Date.now()}`;
  }

  private async createWorkflowFromCurrent(): Promise<void> {
    const current = this.getActiveWorkflowPreset();
    const label = window.prompt('新流程名称：', `${current.label} 副本`);
    if (!label) return;
    const shortLabel = window.prompt('新流程短名称（按钮显示）：', current.shortLabel);
    if (!shortLabel) return;
    const description = window.prompt('流程描述：', current.description);
    if (description === null) return;
    const strategyInput = window.prompt(
      `策略类型（${Object.keys(STRATEGY_MODE_LABELS).join(' / ')}）：`,
      current.strategyMode,
    );
    if (!strategyInput) return;
    const strategyMode = strategyInput.trim() as WorkflowMode;
    if (!this.isStrategyMode(strategyMode)) {
      new Notice('策略类型无效，创建取消');
      return;
    }
    const objective = window.prompt('流程目标（可留空）：', current.objective || '');
    if (objective === null) return;
    const synthesisGuidance = window.prompt('输出指导（可留空）：', current.synthesisGuidance || '');
    if (synthesisGuidance === null) return;
    const inputBindingInput = window.prompt(
      '阶段输入来源（original / previous / original+previous）：',
      current.inputBinding || 'previous',
    );
    if (inputBindingInput === null) return;
    const inputBinding = inputBindingInput.trim() as WorkflowInputBinding;
    if (!this.isWorkflowInputBinding(inputBinding)) {
      new Notice('输入来源无效，创建取消');
      return;
    }
    const stageContract = window.prompt('阶段契约（可留空）：', current.stageContract || '');
    if (stageContract === null) return;
    const inputPlaceholder = window.prompt('输入框占位文案：', current.inputPlaceholder || '');
    if (inputPlaceholder === null) return;

    const newWorkflow: WorkflowPreset = {
      ...cloneWorkflowPreset(current),
      id: this.buildWorkflowId(label),
      label: label.trim(),
      shortLabel: shortLabel.trim(),
      description: description.trim() || current.description,
      strategyMode,
      atoms: [...this.selectedAtoms],
      actionLabel: `执行：${label.trim()}`,
      objective: objective.trim() || '',
      synthesisGuidance: synthesisGuidance.trim() || '',
      inputBinding,
      stageContract: stageContract.trim() || '',
      inputPlaceholder: inputPlaceholder.trim() || current.inputPlaceholder,
    };

    this.activeWorkspace.workflows.push(newWorkflow);
    this.activeWorkflowId = newWorkflow.id;
    await this.plugin.saveSettings();
    this.applyWorkspace(this.activeWorkspace);
    new Notice(`已新增流程：${newWorkflow.label}`);
  }

  private async editCurrentWorkflow(): Promise<void> {
    const workflow = this.getActiveWorkflowPreset();
    const label = window.prompt('流程名称：', workflow.label);
    if (label === null) return;
    const shortLabel = window.prompt('短名称（按钮显示）：', workflow.shortLabel);
    if (shortLabel === null) return;
    const description = window.prompt('流程描述：', workflow.description);
    if (description === null) return;
    const strategyInput = window.prompt(
      `策略类型（${Object.keys(STRATEGY_MODE_LABELS).join(' / ')}）：`,
      workflow.strategyMode,
    );
    if (strategyInput === null) return;
    const strategyMode = strategyInput.trim() as WorkflowMode;
    if (!this.isStrategyMode(strategyMode)) {
      new Notice('策略类型无效，未保存');
      return;
    }
    const actionLabel = window.prompt('执行按钮文案：', workflow.actionLabel);
    if (actionLabel === null) return;
    const objective = window.prompt('流程目标（可留空）：', workflow.objective || '');
    if (objective === null) return;
    const synthesisGuidance = window.prompt('输出指导（可留空）：', workflow.synthesisGuidance || '');
    if (synthesisGuidance === null) return;
    const inputBindingInput = window.prompt(
      '阶段输入来源（original / previous / original+previous）：',
      workflow.inputBinding || 'previous',
    );
    if (inputBindingInput === null) return;
    const inputBinding = inputBindingInput.trim() as WorkflowInputBinding;
    if (!this.isWorkflowInputBinding(inputBinding)) {
      new Notice('输入来源无效，未保存');
      return;
    }
    const stageContract = window.prompt('阶段契约（可留空）：', workflow.stageContract || '');
    if (stageContract === null) return;
    const inputPlaceholder = window.prompt('输入框占位文案：', workflow.inputPlaceholder || '');
    if (inputPlaceholder === null) return;

    workflow.label = label.trim() || workflow.label;
    workflow.shortLabel = shortLabel.trim() || workflow.shortLabel;
    workflow.description = description.trim() || workflow.description;
    workflow.strategyMode = strategyMode;
    workflow.actionLabel = actionLabel.trim() || workflow.actionLabel;
    workflow.atoms = [...this.selectedAtoms];
    workflow.objective = objective.trim() || '';
    workflow.synthesisGuidance = synthesisGuidance.trim() || '';
    workflow.inputBinding = inputBinding;
    workflow.stageContract = stageContract.trim() || '';
    workflow.inputPlaceholder = inputPlaceholder.trim() || workflow.inputPlaceholder;
    await this.plugin.saveSettings();
    this.applyWorkspace(this.activeWorkspace);
    new Notice(`已更新流程：${workflow.label}`);
  }

  private async deleteCurrentWorkflow(): Promise<void> {
    const workflows = this.getWorkspaceWorkflows(this.activeWorkspace);
    if (workflows.length <= 1) {
      new Notice('至少保留一个流程');
      return;
    }

    const workflow = this.getActiveWorkflowPreset();
    const confirmed = window.confirm(`确认删除流程「${workflow.label}」吗？`);
    if (!confirmed) return;

    this.activeWorkspace.workflows = workflows.filter(w => w.id !== workflow.id);
    if (this.activeWorkspace.defaultWorkflowId === workflow.id) {
      this.activeWorkspace.defaultWorkflowId = this.activeWorkspace.workflows[0].id;
    }
    this.activeWorkflowId = this.activeWorkspace.defaultWorkflowId || this.activeWorkspace.workflows[0].id;
    await this.plugin.saveSettings();
    this.applyWorkspace(this.activeWorkspace);
    new Notice(`已删除流程：${workflow.label}`);
  }

  private async setCurrentWorkflowAsDefault(): Promise<void> {
    const workflow = this.getActiveWorkflowPreset();
    this.activeWorkspace.defaultWorkflowId = workflow.id;
    await this.plugin.saveSettings();
    this.renderWorkflowButtons(this.activeWorkspace);
    this.applyWorkflow(workflow.id);
    new Notice(`已设默认流程：${workflow.label}`);
  }

  private async moveCurrentWorkflow(offset: -1 | 1): Promise<void> {
    const workflows = this.getWorkspaceWorkflows(this.activeWorkspace);
    const currentIndex = workflows.findIndex(w => w.id === this.activeWorkflowId);
    if (currentIndex < 0) return;

    const targetIndex = currentIndex + offset;
    if (targetIndex < 0 || targetIndex >= workflows.length) return;

    const [current] = workflows.splice(currentIndex, 1);
    workflows.splice(targetIndex, 0, current);
    this.activeWorkspace.workflows = workflows;

    await this.plugin.saveSettings();
    this.renderWorkflowButtons(this.activeWorkspace);
    this.applyWorkflow(current.id);
    new Notice(`已调整流程顺序：${current.label}`);
  }

  private cloneWorkflows(workflows: WorkflowPreset[]): WorkflowPreset[] {
    if (!Array.isArray(workflows)) return [];
    return workflows.map(workflow => cloneWorkflowPreset(workflow));
  }

  private async duplicateCurrentWorkspace(): Promise<void> {
    const name = window.prompt('请输入新工作区名称：', `${this.activeWorkspace.name} 副本`);
    if (!name) return;

    const clonedWorkspace: WorkspaceProfile = {
      id: `workspace_${Date.now()}`,
      name,
      description: this.activeWorkspace.description,
      panelTitle: this.activeWorkspace.panelTitle,
      methodObjective: this.activeWorkspace.methodObjective,
      outputStyleGuide: this.activeWorkspace.outputStyleGuide,
      workflows: this.cloneWorkflows(this.activeWorkspace.workflows),
      defaultWorkflowId: this.activeWorkspace.defaultWorkflowId,
    };

    this.plugin.settings.workspaceProfiles.push(clonedWorkspace);
    this.plugin.settings.activeWorkspaceId = clonedWorkspace.id;
    await this.plugin.saveSettings();
    this.initializeWorkspace();
    new Notice(`已创建工作区：${clonedWorkspace.name}`);
  }

  private async deleteCurrentWorkspace(): Promise<void> {
    const workspaces = this.getWorkspaces();
    if (workspaces.length <= 1) {
      new Notice('至少保留一个工作区');
      return;
    }

    const confirmed = window.confirm(`确认删除工作区「${this.activeWorkspace.name}」吗？`);
    if (!confirmed) return;

    this.plugin.settings.workspaceProfiles = workspaces.filter(w => w.id !== this.activeWorkspace.id);
    this.plugin.settings.activeWorkspaceId = this.plugin.settings.workspaceProfiles[0].id;
    await this.plugin.saveSettings();
    this.initializeWorkspace();
    new Notice('工作区已删除');
  }

  private getDefaultAtoms(): AtomName[] {
    return this.plugin.settings.defaultAtoms
      .split(',')
      .map(s => s.trim())
      .filter(Boolean) as AtomName[];
  }

  private applyWorkflow(workflowId: string): void {
    const workflows = this.getWorkspaceWorkflows(this.activeWorkspace);
    const preset = workflows.find(w => w.id === workflowId) ?? workflows[0] ?? getBuiltInWorkflowPreset('general');
    this.activeWorkflowId = preset.id;
    const isDefault = this.activeWorkspace.defaultWorkflowId === preset.id;

    for (const [id, button] of this.workflowButtons.entries()) {
      button.toggleClass('tl-workflow-btn-active', id === preset.id);
    }

    const strategyLabel = STRATEGY_MODE_LABELS[preset.strategyMode] || preset.strategyMode;
    const bindingLabel = WORKFLOW_INPUT_BINDING_LABELS[preset.inputBinding || 'previous'];
    const contractHint = preset.stageContract?.trim() ? ` 阶段契约：${preset.stageContract.trim()}` : '';
    this.workflowHintEl.textContent = `${isDefault ? '默认流程 | ' : ''}${preset.label}（策略：${strategyLabel} | 输入：${bindingLabel}）${preset.description}${contractHint}`;
    this.inputEl.placeholder = preset.inputPlaceholder;
    this.autoBtn.textContent = '一键执行工作区流程';

    if (preset.atoms && preset.atoms.length > 0) {
      this.setSelectedAtoms(preset.atoms);
    } else {
      this.setSelectedAtoms(this.getDefaultAtoms());
    }
    this.updateWorkflowControlStates();
  }

  private setSelectedAtoms(atoms: AtomName[]): void {
    this.selectedAtoms = [...atoms];
    this.syncAtomChipState();
    this.updateChipNumbers();
  }

  private toggleAtom(atom: AtomName, chip: HTMLElement): void {
    const idx = this.selectedAtoms.indexOf(atom);
    if (idx >= 0) {
      this.selectedAtoms.splice(idx, 1);
      chip.removeClass('tl-chip-active');
    } else {
      this.selectedAtoms.push(atom);
      chip.addClass('tl-chip-active');
    }
    this.syncAtomChipState();
    this.updateChipNumbers();
  }

  private syncAtomChipState(): void {
    this.atomChipsEl.querySelectorAll('.tl-chip').forEach(chip => chip.removeClass('tl-chip-active'));
    for (const atom of this.selectedAtoms) {
      const chip = this.atomChipsEl.querySelector(`[data-atom="${atom}"]`) as HTMLElement | null;
      chip?.addClass('tl-chip-active');
    }
  }

  private updateChipNumbers(): void {
    this.atomChipsEl.querySelectorAll('.tl-chip-order').forEach(el => el.remove());

    for (let i = 0; i < this.selectedAtoms.length; i++) {
      const chip = this.atomChipsEl.querySelector(`[data-atom="${this.selectedAtoms[i]}"]`) as HTMLElement | null;
      if (chip) {
        const badge = chip.createSpan({ text: String(i + 1), cls: 'tl-chip-order' });
        chip.prepend(badge);
      }
    }

    if (this.selectedAtoms.length > 0) {
      this.orderEl.textContent = '执行顺序：' + this.selectedAtoms.map(a => ATOM_LABELS[a]).join(' -> ');
      this.orderEl.style.display = '';
    } else {
      this.orderEl.style.display = 'none';
    }
  }

  setInput(text: string): void {
    if (this.inputEl) {
      this.inputEl.value = text;
    }
  }

  private buildExecutionHints(workflow: WorkflowPreset): {
    mergedObjective?: string;
    mergedSynthesisGuidance?: string;
  } {
    const mergedObjective = [
      workflow.stageContract ? `Stage contract:\n${workflow.stageContract}` : '',
      workflow.objective ? `Workflow objective:\n${workflow.objective}` : '',
      this.activeWorkspace.methodObjective?.trim()
        ? `Workspace objective:\n${this.activeWorkspace.methodObjective.trim()}`
        : '',
    ].filter(Boolean).join('\n\n');

    const mergedSynthesisGuidance = [
      workflow.synthesisGuidance ? `Workflow guidance:\n${workflow.synthesisGuidance}` : '',
      this.activeWorkspace.outputStyleGuide?.trim()
        ? `Workspace output style:\n${this.activeWorkspace.outputStyleGuide.trim()}`
        : '',
    ].filter(Boolean).join('\n\n');

    return {
      mergedObjective: mergedObjective || undefined,
      mergedSynthesisGuidance: mergedSynthesisGuidance || undefined,
    };
  }

  private buildRuntimeBlockedNotice(message: string): string {
    if (/\b401\b|\b403\b|鉴权失败/.test(message)) {
      return '连接未通过，已阻止执行。请先检查 API Key、用户/分组信息和模型权限。';
    }
    return `连接未通过，已阻止执行。${message}`;
  }

  private buildStageInput(workflow: WorkflowPreset, originalInput: string, previousOutput: string): string {
    const binding = workflow.inputBinding || 'previous';
    const hasPrevious = !!previousOutput.trim();

    if (binding === 'original') {
      return originalInput;
    }
    if (binding === 'previous') {
      return hasPrevious ? previousOutput : originalInput;
    }

    if (!hasPrevious) {
      return originalInput;
    }

    return [
      '[Original Material]',
      originalInput,
      '',
      '[Current Notes]',
      previousOutput,
    ].join('\n');
  }

  private async resolveWorkflowAtomsForInput(workflow: WorkflowPreset, stageInput: string): Promise<AtomName[]> {
    if (workflow.atoms && workflow.atoms.length > 0) {
      return [...workflow.atoms];
    }
    try {
      const selected = await this.plugin.atomSelector.selectAtoms(stageInput);
      if (selected.length > 0) {
        return selected;
      }
    } catch (e) {
      console.error('[LogicAtom] 动态选择原子失败，改用默认原子链：', e);
    }
    return this.getDefaultAtoms();
  }

  private async runWorkspacePipeline(): Promise<void> {
    const input = this.inputEl.value.trim();
    if (!input || this.isRunning) return;

    const workflows = this.getWorkspaceWorkflows(this.activeWorkspace);
    if (workflows.length === 0) {
      new Notice('当前工作区没有可执行流程');
      return;
    }

    this.setRunning(true);
    this.runCounter++;
    this.clearResults();

    try {
      const health = await this.plugin.ensureRuntimeReady(false);
      if (!health.ok) {
        this.addStep('error', health.message);
        new Notice(this.buildRuntimeBlockedNotice(health.message));
        return;
      }

      const originalInput = input;
      let previousOutput = '';
      const stageResults: Array<{ workflow: WorkflowPreset; result: AtomChainResult; atoms: AtomName[] }> = [];

      for (let i = 0; i < workflows.length; i++) {
        const workflow = workflows[i];
        const stageInput = this.buildStageInput(workflow, originalInput, previousOutput);
        const atoms = await this.resolveWorkflowAtomsForInput(workflow, stageInput);
        this.lastExecutionWorkflow = workflow;

        this.addStep('system', `串联阶段 ${i + 1}/${workflows.length}：${workflow.label}`);
        this.addStep('system', `阶段输入来源：${WORKFLOW_INPUT_BINDING_LABELS[workflow.inputBinding || 'previous']}`);
        this.addStep('system', `阶段原子链：${atoms.map(a => ATOM_LABELS[a]).join(' -> ')}`);
        if (workflow.stageContract?.trim()) {
          this.addStep('system', `阶段契约：${workflow.stageContract.trim().slice(0, 140)}`);
        }
        if (this.activeWorkspace.methodObjective?.trim()) {
          this.addStep('system', `工作区目标已注入：${this.activeWorkspace.methodObjective.trim().slice(0, 120)}`);
        }
        if (this.activeWorkspace.outputStyleGuide?.trim()) {
          this.addStep('system', `输出风格已注入：${this.activeWorkspace.outputStyleGuide.trim().slice(0, 120)}`);
        }

        const { mergedObjective, mergedSynthesisGuidance } = this.buildExecutionHints(workflow);
        const result = await this.plugin.atomEngine.executeChain(
          stageInput,
          atoms,
          (step, index, total) => {
            this.renderStep(step, index + 1, total);
          },
          {
            mode: workflow.strategyMode,
            objective: mergedObjective,
            synthesisGuidance: mergedSynthesisGuidance,
            workspaceName: this.activeWorkspace.name,
            workflowLabel: workflow.label,
            persistExecutionPlan: true,
          },
        );

        stageResults.push({ workflow, result, atoms });
        this.renderPipelineStageResult(result, workflow, i + 1, workflows.length);
        previousOutput = result.finalOutput;
      }

      this.renderPipelineSummary(stageResults);
    } catch (e) {
      this.addStep('error', `错误：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      this.setRunning(false);
    }
  }

  private async runAuto(): Promise<void> {
    await this.runWorkspacePipeline();
  }

  private async runSelected(): Promise<void> {
    const input = this.inputEl.value.trim();
    if (!input || this.isRunning || this.selectedAtoms.length === 0) return;

    const workflow = this.getActiveWorkflowPreset();
    this.lastExecutionWorkflow = workflow;
    this.setRunning(true);
    this.runCounter++;
    this.clearResults();
    const health = await this.plugin.ensureRuntimeReady(false);
    if (!health.ok) {
      this.addStep('error', health.message);
      new Notice(this.buildRuntimeBlockedNotice(health.message));
      this.setRunning(false);
      return;
    }
    await this.executeChain(input, [...this.selectedAtoms], workflow);
    this.setRunning(false);
  }

  private async executeChain(input: string, atoms: AtomName[], workflow: WorkflowPreset): Promise<void> {
    this.addStep('system', `开始执行链：${atoms.map(a => ATOM_LABELS[a]).join(' -> ')}`);
    if (this.activeWorkspace.methodObjective?.trim()) {
      this.addStep('system', `工作区目标已注入：${this.activeWorkspace.methodObjective.trim().slice(0, 120)}`);
    }
    if (this.activeWorkspace.outputStyleGuide?.trim()) {
      this.addStep('system', `输出风格已注入：${this.activeWorkspace.outputStyleGuide.trim().slice(0, 120)}`);
    }
    const { mergedObjective, mergedSynthesisGuidance } = this.buildExecutionHints(workflow);

    try {
      const result = await this.plugin.atomEngine.executeChain(
        input,
        atoms,
        (step, index, total) => {
          this.renderStep(step, index + 1, total);
        },
        {
          mode: workflow.strategyMode,
          objective: mergedObjective,
          synthesisGuidance: mergedSynthesisGuidance,
          workspaceName: this.activeWorkspace.name,
          workflowLabel: workflow.label,
          persistExecutionPlan: true,
        },
      );

      this.renderFinalResult(result, workflow);
    } catch (e) {
      this.addStep('error', `执行失败：${e instanceof Error ? e.message : String(e)}`);
    }
  }

  private renderPipelineStageResult(
    result: AtomChainResult,
    workflow: WorkflowPreset,
    stageIndex: number,
    stageTotal: number,
  ): void {
    if (stageIndex === 1) {
      this.resultEl.empty();
    }

    const stageId = `run-${this.runCounter}-pipeline-stage-${stageIndex}`;
    const stageCard = this.resultEl.createDiv({ cls: 'tl-result-card' });
    const header = stageCard.createDiv({ cls: 'tl-result-header' });
    const title = `阶段 ${stageIndex}/${stageTotal}：${workflow.label}`;
    header.createEl('h4', { text: title });

    const copyBtn = header.createEl('button', { text: '复制', cls: 'tl-btn tl-btn-small' });
    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(result.finalOutput);
      copyBtn.textContent = '已复制';
      setTimeout(() => { copyBtn.textContent = '复制'; }, 1800);
    });

    const insertBtn = header.createEl('button', { text: '插入笔记', cls: 'tl-btn tl-btn-small' });
    insertBtn.addEventListener('click', () => this.insertToActiveNote(result, workflow));

    const stageMeta = stageCard.createDiv({ cls: 'tl-step-summary' });
    stageMeta.textContent = `原子链：${result.atomNames.map(a => ATOM_LABELS[a]).join(' -> ')} | 搜索 ${result.totalSearches} 次 | 存储 ${result.totalStores} 次`;

    const cards = this.extractPointCards(result.finalOutput);
    this.renderPointCards(stageCard, cards, {
      scope: 'final',
      baseCardId: stageId,
      titlePrefix: title,
    });

    const rawDetails = stageCard.createEl('details', { cls: 'tl-step-details' });
    rawDetails.createEl('summary', { text: '查看该阶段完整输出' });
    const rawEl = rawDetails.createDiv({ cls: 'tl-result-content' });
    rawEl.innerHTML = this.simpleMarkdown(result.finalOutput);

    stageCard.addEventListener('click', (evt: MouseEvent) => {
      const target = evt.target as HTMLElement | null;
      if (this.shouldIgnoreCardSelectionTarget(target)) return;
      this.selectResultCard(stageCard, {
        cardId: stageId,
        scope: 'final',
        title,
        summary: `阶段 ${stageIndex} 输出`,
        output: result.finalOutput,
      });
    });
  }

  private renderPipelineSummary(
    stageResults: Array<{ workflow: WorkflowPreset; result: AtomChainResult; atoms: AtomName[] }>,
  ): void {
    const totalSearches = stageResults.reduce((sum, s) => sum + s.result.totalSearches, 0);
    const totalStores = stageResults.reduce((sum, s) => sum + s.result.totalStores, 0);
    const totalDuration = stageResults.reduce((sum, s) => sum + s.result.totalDuration, 0);
    const finalOutput = stageResults.length > 0 ? stageResults[stageResults.length - 1].result.finalOutput : '';

    this.statsEl.empty();
    this.statsEl.createSpan({
      text: `串联完成：${stageResults.length} 个流程 | 搜索 ${totalSearches} 次 | 存储 ${totalStores} 次 | 耗时 ${(totalDuration / 1000).toFixed(1)} 秒`,
    });

    const summaryId = `run-${this.runCounter}-pipeline-summary`;
    const summaryCard = this.resultEl.createDiv({ cls: 'tl-result-card' });
    const header = summaryCard.createDiv({ cls: 'tl-result-header' });
    header.createEl('h4', { text: '串联流程总览（最终产物）' });

    const copyBtn = header.createEl('button', { text: '复制最终结果', cls: 'tl-btn tl-btn-small' });
    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(finalOutput);
      copyBtn.textContent = '已复制';
      setTimeout(() => { copyBtn.textContent = '复制最终结果'; }, 1800);
    });

    const summaryBody = summaryCard.createDiv({ cls: 'tl-step-summary' });
    summaryBody.innerHTML = this.simpleMarkdown(stageResults.map((stage, index) =>
      `${index + 1}. ${stage.workflow.label}：${stage.atoms.map(a => ATOM_LABELS[a]).join(' -> ')}`,
    ).join('\n'));

    const finalCards = this.extractPointCards(finalOutput);
    this.renderPointCards(summaryCard, finalCards, {
      scope: 'final',
      baseCardId: summaryId,
      titlePrefix: '串联最终结果',
    });

    const rawDetails = summaryCard.createEl('details', { cls: 'tl-step-details' });
    rawDetails.createEl('summary', { text: '查看最终完整输出' });
    const rawEl = rawDetails.createDiv({ cls: 'tl-result-content' });
    rawEl.innerHTML = this.simpleMarkdown(finalOutput);
  }

  private shouldIgnoreCardSelectionTarget(target: HTMLElement | null): boolean {
    if (!target) return false;
    return !!target.closest('button, summary, details, a, input, textarea, select');
  }

  private selectResultCard(cardEl: HTMLElement, selection: ResultCardSelection): void {
    if (this.selectedResultCardEl && this.selectedResultCardEl !== cardEl) {
      this.selectedResultCardEl.removeClass('tl-result-card-selected');
    }
    this.selectedResultCardEl = cardEl;
    cardEl.addClass('tl-result-card-selected');
    void this.storeSelectionToProfile(selection);
  }

  private async storeSelectionToProfile(selection: ResultCardSelection): Promise<void> {
    if (this.selectionStoredInMemory.has(selection.cardId)) return;

    const workflow = this.lastExecutionWorkflow ?? this.getActiveWorkflowPreset();
    const content = [
      '[UserProfileSelection]',
      `workspace: ${this.activeWorkspace.name}`,
      `workflow: ${workflow.label}`,
      `scope: ${selection.scope}`,
      `card_title: ${selection.title}`,
      selection.atom ? `atom: ${selection.atom}` : '',
      typeof selection.stepIndex === 'number' ? `step_index: ${selection.stepIndex}` : '',
      `summary: ${selection.summary}`,
      'selected_output:',
      selection.output.slice(0, 4000),
    ].filter(Boolean).join('\n');

    try {
      await this.plugin.apiClient.storeMemory(content, `profile_selection_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
      this.selectionStoredInMemory.add(selection.cardId);
      new Notice(`已将选中${selection.scope === 'final' ? '整体结果' : '步骤结果'}写入画像记忆`);
    } catch (e) {
      console.error('[LogicAtom] Failed to store profile selection:', e);
      new Notice('写入画像记忆失败，请检查 EverMind 连接');
    }
  }

  private extractPointCards(text: string): PointCard[] {
    const raw = (text || '').replace(/\r\n/g, '\n').trim();
    if (!raw) return [];

    const lines = raw.split('\n');
    const headingIndexes = lines
      .map((line, index) => ({ line: line.trim(), index }))
      .filter(item => /^#{2,4}\s+/.test(item.line))
      .map(item => item.index);

    if (headingIndexes.length >= 2) {
      const cards: PointCard[] = [];
      for (let i = 0; i < headingIndexes.length; i++) {
        const start = headingIndexes[i];
        const end = i + 1 < headingIndexes.length ? headingIndexes[i + 1] : lines.length;
        const header = lines[start].replace(/^#{2,4}\s+/, '').trim() || `要点 ${i + 1}`;
        const body = lines.slice(start + 1, end).join('\n').trim() || '(空)';
        cards.push({ title: header, body });
      }
      return cards;
    }

    const bulletRegex = /^(\s*[-*]\s+|\s*\d+\.\s+)/;
    const bulletCards: PointCard[] = [];
    let currentLines: string[] = [];
    for (const line of lines) {
      if (bulletRegex.test(line)) {
        if (currentLines.length > 0) {
          const body = currentLines.join('\n').trim();
          bulletCards.push({
            title: body.replace(bulletRegex, '').slice(0, 24) || `要点 ${bulletCards.length + 1}`,
            body,
          });
        }
        currentLines = [line];
      } else if (currentLines.length > 0) {
        currentLines.push(line);
      }
    }
    if (currentLines.length > 0) {
      const body = currentLines.join('\n').trim();
      bulletCards.push({
        title: body.replace(bulletRegex, '').slice(0, 24) || `要点 ${bulletCards.length + 1}`,
        body,
      });
    }
    if (bulletCards.length >= 2) return bulletCards;

    const paragraphs = raw
      .split(/\n{2,}/)
      .map(p => p.trim())
      .filter(Boolean);

    if (paragraphs.length >= 2) {
        return paragraphs.map((body, index) => ({
        title: `要点 ${index + 1}`,
        body,
      }));
    }

    return [{ title: '核心结果', body: raw }];
  }

  private renderPointCards(
    container: HTMLElement,
    cards: PointCard[],
    options: {
      scope: 'step' | 'final';
      baseCardId: string;
      titlePrefix: string;
      atom?: AtomName;
      stepIndex?: number;
    },
  ): void {
    const listEl = container.createDiv({ cls: 'tl-point-card-list' });

    cards.forEach((card, index) => {
      const cardEl = listEl.createDiv({ cls: 'tl-point-card' });
      const headerEl = cardEl.createDiv({ cls: 'tl-point-card-header' });
      headerEl.createSpan({
        text: `${index + 1}. ${card.title}`,
        cls: 'tl-point-card-title',
      });

      const actionsEl = headerEl.createDiv({ cls: 'tl-point-card-actions' });
      const copyBtn = actionsEl.createEl('button', { text: '复制', cls: 'tl-btn tl-btn-small' });
      copyBtn.addEventListener('click', async () => {
        await navigator.clipboard.writeText(card.body);
        copyBtn.textContent = '已复制';
        setTimeout(() => { copyBtn.textContent = '复制'; }, 1500);
      });

      const insertBtn = actionsEl.createEl('button', { text: '插入', cls: 'tl-btn tl-btn-small' });
      insertBtn.addEventListener('click', () => {
        this.insertBlockToActiveNote(`${options.titlePrefix} - ${card.title}`, card.body);
      });

      const removeBtn = actionsEl.createEl('button', { text: '删除', cls: 'tl-btn tl-btn-small' });
      removeBtn.addEventListener('click', () => {
        if (this.selectedResultCardEl === cardEl) {
          this.selectedResultCardEl = null;
        }
        cardEl.remove();
      });

      const bodyEl = cardEl.createDiv({ cls: 'tl-point-card-body' });
      bodyEl.innerHTML = this.simpleMarkdown(card.body);

      cardEl.addEventListener('click', (evt: MouseEvent) => {
        const target = evt.target as HTMLElement | null;
        if (this.shouldIgnoreCardSelectionTarget(target)) return;
        evt.stopPropagation();
        this.selectResultCard(cardEl, {
          cardId: `${options.baseCardId}-point-${index + 1}`,
          scope: options.scope,
          title: `${options.titlePrefix} - ${card.title}`,
          summary: card.title,
          output: card.body,
          stepIndex: options.stepIndex,
          atom: options.atom,
        });
      });
    });
  }

  private renderStep(step: AtomStepResult, index: number, total: number): void {
    const stepId = `run-${this.runCounter}-step-${index}`;
    const stepEl = this.stepsEl.createDiv({ cls: 'tl-step tl-step-card' });
    const headerEl = stepEl.createDiv({ cls: 'tl-step-header' });

    const iconSpan = headerEl.createSpan({ cls: 'tl-step-icon' });
    setIcon(iconSpan, ATOM_ICONS[step.atom]);

    headerEl.createSpan({
      text: `步骤 ${index}/${total}：${ATOM_LABELS[step.atom]}`,
      cls: 'tl-step-title',
    });

    headerEl.createSpan({
      text: `${(step.duration / 1000).toFixed(1)}秒`,
      cls: 'tl-step-time',
    });

    const stepActionsEl = headerEl.createDiv({ cls: 'tl-step-header-actions' });
    const copyStepBtn = stepActionsEl.createEl('button', {
      text: '复制本步骤',
      cls: 'tl-btn tl-btn-small',
    });
    copyStepBtn.addEventListener('click', async () => {
      await navigator.clipboard.writeText(step.output);
      copyStepBtn.textContent = '已复制';
      setTimeout(() => { copyStepBtn.textContent = '复制本步骤'; }, 1800);
    });

    const insertStepBtn = stepActionsEl.createEl('button', {
      text: '插入笔记',
      cls: 'tl-btn tl-btn-small',
    });
    insertStepBtn.addEventListener('click', () => {
      this.insertBlockToActiveNote(
        `步骤 ${index}/${total}：${ATOM_LABELS[step.atom]}`,
        step.output,
      );
    });

    const removeStepCardBtn = stepActionsEl.createEl('button', {
      text: '删除卡片',
      cls: 'tl-btn tl-btn-small',
    });
    removeStepCardBtn.addEventListener('click', () => {
      if (this.selectedResultCardEl === stepEl) {
        this.selectedResultCardEl = null;
      }
      stepEl.remove();
    });

    if (step.memoriesStored.length > 0) {
      const deleteBtn = stepActionsEl.createEl('button', {
        cls: 'tl-btn-delete tl-btn-delete-step',
        attr: { title: `删除此步骤的 ${step.memoriesStored.length} 条记忆` },
      });
      setIcon(deleteBtn, 'x');
      deleteBtn.addEventListener('click', () => this.deleteStepMemories(step.memoriesStored, deleteBtn));
    }

    stepEl.createDiv({
      text: step.summary,
      cls: 'tl-step-summary',
    });

    const statsEl = stepEl.createDiv({ cls: 'tl-step-stats' });
    statsEl.createSpan({ text: `搜索：${step.searchCount} 次` });
    statsEl.createSpan({ text: `存储：${step.storeCount} 次` });
    statsEl.createSpan({ text: `记忆：${step.memoriesRetrieved.length} 条` });

    const pointCards = this.extractPointCards(step.output);
    this.renderPointCards(stepEl, pointCards, {
      scope: 'step',
      baseCardId: stepId,
      titlePrefix: `步骤 ${index}/${total}：${ATOM_LABELS[step.atom]}`,
      atom: step.atom,
      stepIndex: index,
    });

    const rawOutputDetails = stepEl.createEl('details', { cls: 'tl-step-details' });
    rawOutputDetails.createEl('summary', { text: '查看完整步骤输出' });
    const outputEl = rawOutputDetails.createDiv({ cls: 'tl-step-output' });
    outputEl.innerHTML = this.simpleMarkdown(step.output);

    stepEl.addEventListener('click', (evt: MouseEvent) => {
      const target = evt.target as HTMLElement | null;
      if (this.shouldIgnoreCardSelectionTarget(target)) return;
      this.selectResultCard(stepEl, {
        cardId: stepId,
        scope: 'step',
        title: `步骤 ${index}/${total}：${ATOM_LABELS[step.atom]}`,
        summary: step.summary,
        output: step.output,
        stepIndex: index,
        atom: step.atom,
      });
    });
  }

  private renderFinalResult(result: AtomChainResult, workflow: WorkflowPreset): void {
    this.lastResult = result;

    this.statsEl.empty();
    this.statsEl.createSpan({
      text: `工作流：${workflow.label} | 搜索 ${result.totalSearches} 次 | 存储 ${result.totalStores} 次 | 耗时 ${(result.totalDuration / 1000).toFixed(1)} 秒`,
    });

    this.resultEl.empty();
    const finalId = `run-${this.runCounter}-final`;
    const resultCard = this.resultEl.createDiv({ cls: 'tl-result-card' });
    const resultHeader = resultCard.createDiv({ cls: 'tl-result-header' });
    const finalTitle = workflow.strategyMode === 'general' ? '最终综合结果' : `${workflow.label}结果`;
    resultHeader.createEl('h4', { text: finalTitle });

    const copyBtn = resultHeader.createEl('button', { text: '复制', cls: 'tl-btn tl-btn-small' });
    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(result.finalOutput);
      copyBtn.textContent = '已复制';
      setTimeout(() => { copyBtn.textContent = '复制'; }, 2000);
    });

    const insertBtn = resultHeader.createEl('button', { text: '插入笔记', cls: 'tl-btn tl-btn-small' });
    insertBtn.addEventListener('click', () => this.insertToActiveNote(result, workflow));

    const removeFinalCardBtn = resultHeader.createEl('button', { text: '删除卡片', cls: 'tl-btn tl-btn-small' });
    removeFinalCardBtn.addEventListener('click', () => {
      if (this.selectedResultCardEl === resultCard) {
        this.selectedResultCardEl = null;
      }
      resultCard.remove();
    });

    const finalPointCards = this.extractPointCards(result.finalOutput);
    this.renderPointCards(resultCard, finalPointCards, {
      scope: 'final',
      baseCardId: finalId,
      titlePrefix: finalTitle,
    });

    const rawResultDetails = resultCard.createEl('details', { cls: 'tl-step-details' });
    rawResultDetails.createEl('summary', { text: '查看完整结果输出' });
    const outputEl = rawResultDetails.createDiv({ cls: 'tl-result-content' });
    outputEl.innerHTML = this.simpleMarkdown(result.finalOutput);

    const allStored = result.steps.flatMap(s => s.memoriesStored);
    if (allStored.length > 0) {
      const cleanupSection = resultCard.createDiv({ cls: 'tl-cleanup-section' });
      const cleanupBtn = cleanupSection.createEl('button', {
        text: `清理所有中间记忆（${allStored.length} 条）`,
        cls: 'tl-btn tl-btn-delete-batch',
      });
      cleanupBtn.addEventListener('click', () => this.deleteAllMemories(allStored, cleanupBtn));
    }

    resultCard.addEventListener('click', (evt: MouseEvent) => {
      const target = evt.target as HTMLElement | null;
      if (this.shouldIgnoreCardSelectionTarget(target)) return;
      this.selectResultCard(resultCard, {
        cardId: finalId,
        scope: 'final',
        title: finalTitle,
        summary: `搜索 ${result.totalSearches} 次 | 存储 ${result.totalStores} 次`,
        output: result.finalOutput,
      });
    });
  }

  private getActiveEditor() {
    let editor = this.app.workspace.activeEditor?.editor;
    if (!editor) {
      const mdLeaf = this.app.workspace.getMostRecentLeaf();
      if (mdLeaf?.view instanceof MarkdownView) {
        editor = mdLeaf.view.editor;
      }
    }
    return editor;
  }

  private insertBlockToActiveNote(title: string, body: string): void {
    const editor = this.getActiveEditor();
    if (!editor) {
      new Notice('没有打开的笔记，无法插入');
      return;
    }

    const content = `\n\n### ${title}\n${body}\n`;
    const cursor = editor.getCursor();
    editor.replaceRange(content, cursor);
    new Notice('已插入笔记');
  }

  private insertToActiveNote(result: AtomChainResult, workflow: WorkflowPreset): void {
    const editor = this.getActiveEditor();
    if (!editor) {
      new Notice('没有打开的笔记，无法插入');
      return;
    }

    const atomLabels = result.atomNames.map(a => ATOM_LABELS[a]).join(' -> ');
    const content = `\n\n---\n## 逻辑原子执行结果\n**工作区：** ${this.activeWorkspace.name}\n**工作流：** ${workflow.label}\n**问题/材料：** ${result.input}\n**原子链：** ${atomLabels}\n**统计：** 搜索 ${result.totalSearches} 次，存储 ${result.totalStores} 次\n\n${result.finalOutput}\n---\n`;
    const cursor = editor.getCursor();
    editor.replaceRange(content, cursor);
    new Notice('已插入笔记');
  }

  private async deleteStepMemories(memories: StoredMemoryInfo[], btn: HTMLButtonElement): Promise<void> {
    if (!confirm(`确认删除此步骤的 ${memories.length} 条记忆吗？`)) return;
    btn.disabled = true;
    btn.addClass('tl-btn-delete-disabled');
    let deleted = 0;
    for (const mem of memories) {
      try {
        await this.plugin.apiClient.deleteMemory(mem.eventId);
        deleted++;
      } catch (e) {
        console.error('[LogicAtom] Failed to delete memory:', mem.eventId, e);
      }
    }
    btn.textContent = '已删除';
    btn.addClass('tl-btn-deleted');
    new Notice(`已删除 ${deleted}/${memories.length} 条记忆`);
  }

  private async deleteAllMemories(memories: StoredMemoryInfo[], btn: HTMLButtonElement): Promise<void> {
    if (!confirm(`确认删除本次执行产生的全部 ${memories.length} 条中间记忆吗？`)) return;
    btn.disabled = true;
    btn.textContent = '删除中...';
    let deleted = 0;
    for (const mem of memories) {
      try {
        await this.plugin.apiClient.deleteMemory(mem.eventId);
        deleted++;
      } catch (e) {
        console.error('[LogicAtom] Failed to delete memory:', mem.eventId, e);
      }
    }
    btn.textContent = `已清理 ${deleted} 条`;
    btn.addClass('tl-btn-deleted');
    this.stepsEl.querySelectorAll('.tl-btn-delete-step').forEach((el: HTMLElement) => {
      (el as HTMLButtonElement).disabled = true;
      el.addClass('tl-btn-deleted');
    });
    new Notice(`已清理 ${deleted}/${memories.length} 条中间记忆`);
  }

  private addStep(type: 'system' | 'error', text: string): void {
    const cls = type === 'error' ? 'tl-step tl-step-error' : 'tl-step tl-step-system';
    this.stepsEl.createDiv({ text, cls });
  }

  private clearResults(): void {
    this.stepsEl.empty();
    this.resultEl.empty();
    this.statsEl.empty();
    this.selectedResultCardEl = null;
    this.selectionStoredInMemory.clear();
  }

  private setRunning(running: boolean): void {
    this.isRunning = running;
    this.autoBtn.disabled = running;
    this.executeBtn.disabled = running;
    this.autoBtn.textContent = running ? '执行中...' : '一键执行工作区流程';
  }

  private simpleMarkdown(text: string): string {
    return text
      .replace(/### (.+)/g, '<h4>$1</h4>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br>');
  }

  async onClose(): Promise<void> {
    // Cleanup
  }
}

