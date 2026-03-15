import { Plugin, WorkspaceLeaf, Notice } from 'obsidian';
import {
  ThreeLibrarySettings,
  DEFAULT_SETTINGS,
  ThreeLibrarySettingTab,
  getDefaultWorkspaceProfiles,
} from './settings';
import { EverMemOSClient } from './api/client';
import { LLMClient } from './utils/llm-client';
import { AtomEngine } from './atoms/engine';
import { AtomSelector } from './atoms/selector';
import { AtomName, WorkflowMode } from './atoms/types';
import { DecomposeAtom } from './atoms/decompose';
import { AssociateAtom } from './atoms/associate';
import { TransformAtom } from './atoms/transform';
import { AbstractAtom } from './atoms/abstract';
import { EvaluateAtom } from './atoms/evaluate';
import { IterateAtom } from './atoms/iterate';
import { AtomPanelView, ATOM_PANEL_VIEW } from './views/atom-panel';
import { MemorySidebarView, MEMORY_SIDEBAR_VIEW } from './views/memory-sidebar';
import { SearchMemoryModal } from './views/search-modal';
import {
  WorkflowInputBinding,
  WorkflowPreset,
  buildWorkspaceWorkflowFromMode,
  cloneWorkflowPreset,
  getBuiltInWorkflowPreset,
} from './workflows';

export default class ThreeLibraryPlugin extends Plugin {
  settings: ThreeLibrarySettings;
  apiClient: EverMemOSClient;
  llmClient: LLMClient;
  atomEngine: AtomEngine;
  atomSelector: AtomSelector;
  private lastHealthCheck: { at: number; ok: boolean; message: string } | null = null;

  async onload(): Promise<void> {
    console.log('[LogicAtom] Plugin loading...');
    await this.loadSettings();
    console.log('[LogicAtom] Settings loaded:', { apiUrl: this.settings.apiUrl, hasKey: !!this.settings.apiKey });

    // Initialize clients
    this.apiClient = new EverMemOSClient(
      this.settings.apiUrl,
      this.settings.apiKey,
      this.settings.userId,
      this.settings.userName,
      this.settings.groupId,
      this.settings.groupName,
      this.settings.defaultRetrieveMethod,
    );

    this.llmClient = new LLMClient(
      this.settings.openRouterApiKey,
      this.settings.llmModel,
      this.settings.llmBaseUrl
    );

    // Initialize engine
    this.atomEngine = new AtomEngine(this.apiClient, this.llmClient);
    this.atomSelector = new AtomSelector(this.llmClient);

    // Register all atoms
    this.atomEngine.registerAtom(new DecomposeAtom(this.apiClient, this.llmClient));
    this.atomEngine.registerAtom(new AssociateAtom(this.apiClient, this.llmClient));
    this.atomEngine.registerAtom(new TransformAtom(this.apiClient, this.llmClient));
    this.atomEngine.registerAtom(new AbstractAtom(this.apiClient, this.llmClient));
    this.atomEngine.registerAtom(new EvaluateAtom(this.apiClient, this.llmClient));
    this.atomEngine.registerAtom(new IterateAtom(this.apiClient, this.llmClient));

    // Register views
    this.registerView(ATOM_PANEL_VIEW, (leaf) => new AtomPanelView(leaf, this));
    this.registerView(MEMORY_SIDEBAR_VIEW, (leaf) => new MemorySidebarView(leaf, this));

    // Add ribbon icon
    this.addRibbonIcon('brain', '打开逻辑原子面板', () => {
      this.activateAtomPanel();
    });

    // Register commands
    this.addCommand({
      id: 'open-atom-panel',
      name: '打开逻辑原子面板',
      callback: () => this.activateAtomPanel(),
    });

    this.addCommand({
      id: 'open-memory-sidebar',
      name: '打开记忆侧边栏',
      callback: () => this.activateMemorySidebar(),
    });

    this.addCommand({
      id: 'search-memories',
      name: '搜索记忆',
      callback: () => new SearchMemoryModal(this.app, this).open(),
    });

    this.addCommand({
      id: 'run-on-selection',
      name: '对选中文本执行逻辑原子流程',
      editorCallback: async (editor) => {
        const selection = editor.getSelection();
        if (!selection) {
          new Notice('没有选中文本');
          return;
        }
        await this.activateAtomPanel();
        const leaves = this.app.workspace.getLeavesOfType(ATOM_PANEL_VIEW);
        if (leaves.length > 0) {
          const view = leaves[0].view as AtomPanelView;
          view.setInput(selection);
        }
      },
    });

    this.addCommand({
      id: 'run-on-note',
      name: '对当前笔记执行逻辑原子流程',
      editorCallback: async (editor) => {
        const content = editor.getValue();
        if (!content) {
          new Notice('笔记内容为空');
          return;
        }
        await this.activateAtomPanel();
        const leaves = this.app.workspace.getLeavesOfType(ATOM_PANEL_VIEW);
        if (leaves.length > 0) {
          const view = leaves[0].view as AtomPanelView;
          view.setInput(content);
        }
      },
    });

    this.addCommand({
      id: 'store-selection-to-memory',
      name: '将选中文本存入记忆',
      editorCallback: async (editor) => {
        const selection = editor.getSelection();
        if (!selection) {
          new Notice('没有选中文本');
          return;
        }
        try {
          await this.apiClient.storeMemory(selection);
          new Notice('已存入记忆');
        } catch (e) {
          new Notice(`存储失败：${e instanceof Error ? e.message : String(e)}`);
        }
      },
    });

    // Settings tab
    this.addSettingTab(new ThreeLibrarySettingTab(this.app, this));
  }

  async onunload(): Promise<void> {
    // Views are automatically cleaned up
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());

    const fallbackProfiles = getDefaultWorkspaceProfiles();
    const fallbackKnowledgeBarrier = fallbackProfiles.find(p => p.id === 'knowledge-barrier');
    const knownModes: WorkflowMode[] = [
      'general',
      'reading-understand',
      'reading-connect',
      'reading-apply',
      'reading-advanced',
    ];
    const knownModeSet = new Set<WorkflowMode>(knownModes);
    const knownInputBindings = new Set<WorkflowInputBinding>([
      'original',
      'previous',
      'original+previous',
    ]);
    const atomNameSet = new Set<AtomName>(['decompose', 'associate', 'transform', 'abstract', 'evaluate', 'iterate']);
    const isWorkflowMode = (value: unknown): value is WorkflowMode =>
      typeof value === 'string' && knownModeSet.has(value as WorkflowMode);
    const isWorkflowInputBinding = (value: unknown): value is WorkflowInputBinding =>
      typeof value === 'string' && knownInputBindings.has(value as WorkflowInputBinding);
    const sanitizeAtoms = (atoms: unknown): AtomName[] | null | undefined => {
      if (atoms === null) return null;
      if (!Array.isArray(atoms)) return undefined;
      const filtered = atoms.filter((atom): atom is AtomName => typeof atom === 'string' && atomNameSet.has(atom as AtomName));
      return filtered.length > 0 ? filtered : [];
    };
    const normalizeWorkflow = (rawWorkflow: any): WorkflowPreset => {
      const fallbackMode = isWorkflowMode(rawWorkflow?.strategyMode)
        ? rawWorkflow.strategyMode
        : 'general';
      const fallback = getBuiltInWorkflowPreset(fallbackMode);
      const atoms = sanitizeAtoms(rawWorkflow?.atoms);
      const inputBinding = isWorkflowInputBinding(rawWorkflow?.inputBinding)
        ? rawWorkflow.inputBinding
        : (fallback.inputBinding || 'previous');
      return {
        ...fallback,
        id: typeof rawWorkflow?.id === 'string' && rawWorkflow.id.trim().length > 0
          ? rawWorkflow.id.trim()
          : fallback.id,
        strategyMode: fallbackMode,
        label: typeof rawWorkflow?.label === 'string' && rawWorkflow.label.trim().length > 0
          ? rawWorkflow.label.trim()
          : fallback.label,
        shortLabel: typeof rawWorkflow?.shortLabel === 'string' && rawWorkflow.shortLabel.trim().length > 0
          ? rawWorkflow.shortLabel.trim()
          : fallback.shortLabel,
        description: typeof rawWorkflow?.description === 'string'
          ? rawWorkflow.description
          : fallback.description,
        actionLabel: typeof rawWorkflow?.actionLabel === 'string' && rawWorkflow.actionLabel.trim().length > 0
          ? rawWorkflow.actionLabel.trim()
          : fallback.actionLabel,
        inputPlaceholder: typeof rawWorkflow?.inputPlaceholder === 'string' && rawWorkflow.inputPlaceholder.trim().length > 0
          ? rawWorkflow.inputPlaceholder
          : fallback.inputPlaceholder,
        atoms: atoms !== undefined
          ? atoms
          : (fallback.atoms ? [...fallback.atoms] : null),
        objective: typeof rawWorkflow?.objective === 'string' ? rawWorkflow.objective : fallback.objective,
        synthesisGuidance: typeof rawWorkflow?.synthesisGuidance === 'string'
          ? rawWorkflow.synthesisGuidance
          : fallback.synthesisGuidance,
        inputBinding,
        stageContract: typeof rawWorkflow?.stageContract === 'string'
          ? rawWorkflow.stageContract
          : fallback.stageContract,
      };
    };
    const migrateLegacyWorkflows = (rawProfile: any): WorkflowPreset[] => {
      const legacyModes = Array.isArray(rawProfile?.enabledModes) && rawProfile.enabledModes.length > 0
        ? rawProfile.enabledModes.filter((mode: unknown): mode is WorkflowMode => isWorkflowMode(mode))
        : ['general'];
      const legacyAtomsByMode = rawProfile?.atomsByMode && typeof rawProfile.atomsByMode === 'object'
        ? rawProfile.atomsByMode
        : {};
      return legacyModes.map(mode => {
        const legacyAtoms = sanitizeAtoms(legacyAtomsByMode[mode]);
        const built = buildWorkspaceWorkflowFromMode(mode, {
          atoms: legacyAtoms !== undefined ? legacyAtoms : undefined,
        });
        return cloneWorkflowPreset(built);
      });
    };

    if (!Array.isArray(this.settings.workspaceProfiles) || this.settings.workspaceProfiles.length === 0) {
      this.settings.workspaceProfiles = fallbackProfiles;
    } else {
      this.settings.workspaceProfiles = this.settings.workspaceProfiles.map((rawProfile: any, index: number) => {
        const workflows = Array.isArray(rawProfile?.workflows) && rawProfile.workflows.length > 0
          ? rawProfile.workflows.map((wf: any) => normalizeWorkflow(wf))
          : migrateLegacyWorkflows(rawProfile);

        let dedupedWorkflows: WorkflowPreset[] = [];
        const workflowIdSet = new Set<string>();
        for (const workflow of workflows) {
          let workflowId = workflow.id;
          if (workflowIdSet.has(workflowId)) {
            workflowId = `${workflowId}-${workflow.strategyMode}-${dedupedWorkflows.length + 1}`;
          }
          workflowIdSet.add(workflowId);
          dedupedWorkflows.push({
            ...workflow,
            id: workflowId,
          });
        }

        // Migrate old "knowledge-barrier" workspace chain to the new explicit method pipeline.
        const profileId = typeof rawProfile?.id === 'string' ? rawProfile.id : '';
        const hasKnowledgeBarrierMethodIds = dedupedWorkflows.some(wf => wf.id.startsWith('kb-'));
        const isLegacyKnowledgeBarrierChain = dedupedWorkflows.length > 0
          && dedupedWorkflows.every(wf =>
            ['general', 'reading-understand', 'reading-connect', 'reading-apply', 'reading-advanced'].includes(wf.id)
          );
        if (
          profileId === 'knowledge-barrier'
          && !hasKnowledgeBarrierMethodIds
          && isLegacyKnowledgeBarrierChain
          && fallbackKnowledgeBarrier
        ) {
          dedupedWorkflows = fallbackKnowledgeBarrier.workflows.map(wf => cloneWorkflowPreset(wf));
        }

        if (dedupedWorkflows.length === 0) {
          dedupedWorkflows.push(getBuiltInWorkflowPreset('general'));
        }

        const candidateDefaultWorkflowId = typeof rawProfile?.defaultWorkflowId === 'string' && rawProfile.defaultWorkflowId.trim().length > 0
          ? rawProfile.defaultWorkflowId.trim()
          : (typeof rawProfile?.defaultMode === 'string' ? rawProfile.defaultMode : '');
        const defaultWorkflowId = dedupedWorkflows.some(wf => wf.id === candidateDefaultWorkflowId)
          ? candidateDefaultWorkflowId
          : dedupedWorkflows[0].id;

        return {
          id: rawProfile?.id || `workspace_${Date.now()}_${index}`,
          name: rawProfile?.name || '未命名工作区',
          description: rawProfile?.description || '',
          panelTitle: rawProfile?.panelTitle || rawProfile?.name || '逻辑原子面板',
          methodObjective: rawProfile?.methodObjective || '',
          outputStyleGuide: rawProfile?.outputStyleGuide || '',
          workflows: dedupedWorkflows,
          defaultWorkflowId,
        };
      });
    }

    const workspaceIds = new Set(this.settings.workspaceProfiles.map(w => w.id));
    if (!this.settings.activeWorkspaceId || !workspaceIds.has(this.settings.activeWorkspaceId)) {
      this.settings.activeWorkspaceId = this.settings.workspaceProfiles[0].id;
    }
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    this.lastHealthCheck = null;
    // Update client configs
    this.apiClient?.updateConfig(
      this.settings.apiUrl,
      this.settings.apiKey,
      this.settings.userId,
      this.settings.userName,
      this.settings.groupId,
      this.settings.groupName,
      this.settings.defaultRetrieveMethod,
    );
    this.llmClient?.updateConfig(
      this.settings.openRouterApiKey,
      this.settings.llmModel,
      this.settings.llmBaseUrl
    );
  }

  async testApiConnection(): Promise<{ ok: boolean; message: string }> {
    return this.apiClient.testConnection();
  }

  async testLlmConnection(): Promise<{ ok: boolean; message: string }> {
    return this.llmClient.testConnection();
  }

  async ensureRuntimeReady(force: boolean = false): Promise<{ ok: boolean; message: string }> {
    const now = Date.now();
    if (!force && this.lastHealthCheck && now - this.lastHealthCheck.at < 90 * 1000) {
      return { ok: this.lastHealthCheck.ok, message: this.lastHealthCheck.message };
    }

    const [api, llm] = await Promise.all([
      this.testApiConnection(),
      this.testLlmConnection(),
    ]);

    const ok = api.ok && llm.ok;
    const message = ok
      ? `连接检查通过：${api.message}；${llm.message}`
      : `连接检查失败：${api.message}；${llm.message}`;

    this.lastHealthCheck = { at: now, ok, message };
    return { ok, message };
  }

  async activateAtomPanel(): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(ATOM_PANEL_VIEW);
    if (existing.length > 0) {
      this.app.workspace.revealLeaf(existing[0]);
      return;
    }

    const leaf = this.app.workspace.getRightLeaf(false);
    if (leaf) {
      await leaf.setViewState({ type: ATOM_PANEL_VIEW, active: true });
      this.app.workspace.revealLeaf(leaf);
    }
  }

  async activateMemorySidebar(): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(MEMORY_SIDEBAR_VIEW);
    if (existing.length > 0) {
      this.app.workspace.revealLeaf(existing[0]);
      return;
    }

    const leaf = this.app.workspace.getLeftLeaf(false);
    if (leaf) {
      await leaf.setViewState({ type: MEMORY_SIDEBAR_VIEW, active: true });
      this.app.workspace.revealLeaf(leaf);
    }
  }
}


