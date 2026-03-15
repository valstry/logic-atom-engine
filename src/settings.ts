import { App, PluginSettingTab, Setting } from 'obsidian';
import type ThreeLibraryPlugin from './main';
import {
  WorkflowPreset,
  WorkflowInputBinding,
  buildWorkspaceWorkflowFromMode,
  cloneWorkflowPreset,
  listBuiltInWorkflowPresets,
} from './workflows';
import { ResolverContext, StepIntent, resolveStepToAtoms } from './methods/step-resolver';

export interface WorkspaceProfile {
  id: string;
  name: string;
  description: string;
  panelTitle: string;
  methodObjective?: string;
  outputStyleGuide?: string;
  workflows: WorkflowPreset[];
  defaultWorkflowId: string;
}

function cloneWorkflows(workflows: WorkflowPreset[] | undefined): WorkflowPreset[] {
  if (!Array.isArray(workflows)) return [];
  return workflows.map(workflow => cloneWorkflowPreset(workflow));
}

function cloneWorkspaceProfile(profile: WorkspaceProfile): WorkspaceProfile {
  const workflows = cloneWorkflows(profile.workflows);
  const defaultWorkflowId = profile.defaultWorkflowId || workflows[0]?.id || 'general';
  return {
    id: profile.id,
    name: profile.name,
    description: profile.description,
    panelTitle: profile.panelTitle,
    methodObjective: profile.methodObjective || '',
    outputStyleGuide: profile.outputStyleGuide || '',
    workflows,
    defaultWorkflowId,
  };
}

function resolveIntentAtoms(intent: StepIntent, ctx: ResolverContext): WorkflowPreset['atoms'] {
  const calls = resolveStepToAtoms(intent, ctx);
  const deduped: string[] = [];
  for (const call of calls) {
    if (!deduped.includes(call.atom)) {
      deduped.push(call.atom);
    }
  }
  return deduped.length > 0 ? (deduped as WorkflowPreset['atoms']) : ['decompose'];
}

function buildKnowledgeBarrierWorkflowChain(): WorkflowPreset[] {
  const baseCtx: ResolverContext = {
    difficulty: 0.75,
    gapScore: 0.72,
    wantsAction: true,
    iteration: 0,
  };
  const withMode = (
    mode: 'reading-understand' | 'reading-connect' | 'reading-apply' | 'reading-advanced',
    override: Partial<WorkflowPreset> & { id: string; label: string; shortLabel: string; inputBinding: WorkflowInputBinding },
  ): WorkflowPreset => buildWorkspaceWorkflowFromMode(mode, override);

  return [
    withMode('reading-understand', {
      id: 'kb-assumption-extract',
      label: '接口拆材',
      shortLabel: '拆材',
      description: '从原文 A 抽取对象、定义、程度词、关系词、动作词与隐含前提，形成接口候选。',
      actionLabel: '执行接口拆材',
      atoms: resolveIntentAtoms('extract_hidden_assumptions', baseCtx),
      inputBinding: 'original',
      objective: '把原文 A 先拆成后续可调用的接口候选，为生成 A\' 做准备。',
      synthesisGuidance: '输出建议：1) 原文骨架 2) 接口候选 3) 每个接口代表什么 4) 隐含前提与最小例子。',
      stageContract: '必须显式列出接口候选与隐含前提，不允许只做摘要。',
      inputPlaceholder: '粘贴专业文本或代码片段，先做“接口拆材”。',
    }),
    withMode('reading-connect', {
      id: 'kb-gap-diagnosis',
      label: '差分诊断',
      shortLabel: '差分',
      description: '对照原文 A 和上一步形成的 A\' 雏形，输出已有、缺失与冲突。',
      actionLabel: '执行差分诊断',
      atoms: resolveIntentAtoms('diagnose_knowledge_gap', baseCtx),
      inputBinding: 'original+previous',
      objective: '把“看不懂”的原因定位为具体缺口，判断当前 A\' 哪些地方不准、不全、或缺少前置知识。',
      synthesisGuidance: '输出建议：1) 当前卡点 2) 已有接口 3) 缺失接口 4) 冲突/误判 5) 三步补齐顺序。',
      stageContract: '必须做 A 与 A\' 的差分，不允许只给统称结论。',
      inputPlaceholder: '系统会自动使用原文 A 与上一步结果做差分。',
    }),
    withMode('reading-connect', {
      id: 'kb-prereq-patch',
      label: '前置补丁',
      shortLabel: '补丁',
      description: '生成前置知识补丁，把必需基础重新补回理解路径。',
      actionLabel: '执行前置补丁',
      atoms: resolveIntentAtoms('build_prereq_patch', { ...baseCtx, difficulty: 0.85 }),
      inputBinding: 'original+previous',
      objective: '把缺失常识拆成可补的小块，重新接回当前 A 到 A\' 的构造路径。',
      synthesisGuidance: '输出建议：缺失前置列表 + 每个前置的白话解释 + 回看原文时要重点对照的位置。',
      stageContract: '每个前置补丁都必须说明“为什么需要它”以及“补完后回原文看哪里”。',
      inputPlaceholder: '系统会自动结合原文和差分结果生成补丁。',
    }),
    withMode('reading-understand', {
      id: 'kb-rewrite',
      label: '生成 A\'',
      shortLabel: 'A\'',
      description: '把补丁注入原文语境，生成第一版结构化笔记 A\'。',
      actionLabel: '执行 A\' 生成',
      atoms: resolveIntentAtoms('inject_and_rewrite', baseCtx),
      inputBinding: 'original+previous',
      objective: '在保持准确的前提下，把原文重组为第一版结构化笔记 A\'，而不是简单白话复述。',
      synthesisGuidance: '先给接口化理解，再保留必要术语定义；每一段最好给一个最小例子。',
      stageContract: '必须保留专业准确性，并让每个关键术语都有对应的可调用说明。',
      inputPlaceholder: '系统会自动基于原文 A 和前置补丁生成第一版 A\'。',
    }),
    withMode('reading-apply', {
      id: 'kb-compress-notes',
      label: '压缩 A\'',
      shortLabel: '压缩',
      description: '把当前 A\' 压成更短的接口集，逼近关键词串或口诀。',
      actionLabel: '执行 A\' 压缩',
      atoms: resolveIntentAtoms('compress_notes', baseCtx),
      inputBinding: 'previous',
      objective: '形成可复用的 A\' 接口集：对象、定义、描述、关系、动作，并尽量压到能直接调用的短句或口诀。',
      synthesisGuidance: '输出建议：A\' 接口集 + 每个接口的压缩表达 + 一步推断 + 最小动作。',
      stageContract: '禁止长摘要，必须收敛为短笔记结构或接口串。',
      inputPlaceholder: '系统会自动压缩上一步生成的 A\'。',
    }),
    withMode('reading-apply', {
      id: 'kb-compare-optimize',
      label: '校正接口',
      shortLabel: '校正',
      description: '回到原文 A 校正当前 A\'，让压缩后的接口集始终与原文保持一致。',
      actionLabel: '执行接口校正',
      atoms: ['iterate', 'abstract', 'evaluate'],
      inputBinding: 'original+previous',
      objective: '用原文 A 校正当前 A\'：优先保证语义一致，再继续优化简洁、精准和相对全面，输出更稳的新版本 A\'。',
      synthesisGuidance: '输出建议：修正依据 + 修正后的 A\' + 如有必要的下一轮关注点。不要把重点放在差异展示上。',
      stageContract: '必须输出与原文 A 保持一致的新版本 A\'，并至少给出一条修正依据；差异只能作为校正依据，不能作为主输出。',
      inputPlaceholder: '系统会自动使用原文 A + 当前 A\' 做对照优化。',
    }),
    withMode('reading-advanced', {
      id: 'kb-one-step-advance',
      label: '一步延伸',
      shortLabel: '延伸',
      description: '基于最终 A\' 接口集做受约束的提问与一步推断。',
      actionLabel: '执行一步延伸',
      atoms: resolveIntentAtoms('one_step_advance', baseCtx),
      inputBinding: 'previous',
      objective: '基于短笔记或口诀做高阶应用：作者立场、背景假设、遗漏定义、写作意图，但只前进一步。',
      synthesisGuidance: '输出建议：2-3 个延伸问题、一步推断、推断依据、下一步练习。',
      stageContract: '问题必须与最终 A\' 接口集直接相关，禁止泛化发散。',
      inputPlaceholder: '系统会自动基于“接口校正”后的 A\' 做延伸。',
    }),
  ];
}

const DEFAULT_WORKSPACE_PROFILES: WorkspaceProfile[] = [
  {
    id: 'logic-atom-system',
    name: '逻辑原子体系',
    description: '通用方法框架：同一套原子可以编排成不同学习和分析方法。',
    panelTitle: '逻辑原子通用框架',
    methodObjective: '先结构化输入，再提炼关键点，最后只推进一个最小可执行结论。',
    outputStyleGuide: '输出要结构化、短段落、可复制到笔记，优先给出明确下一步。',
    workflows: listBuiltInWorkflowPresets(),
    defaultWorkflowId: 'general',
  },
  {
    id: 'knowledge-barrier',
    name: '知识壁垒场景',
    description: '场景示例：把原文 A 逐步压成可调用的 A\' 接口集，再基于接口集做延伸判断。',
    panelTitle: '知识壁垒拆解',
    methodObjective: '优先显化专家默认知识，再构造 A\'、校正 A\'、压缩 A\'，最终形成可调用的口诀或接口串。',
    outputStyleGuide: '先给接口集，再解释每个接口代表什么；保持准确、简洁、可回看原文。',
    workflows: buildKnowledgeBarrierWorkflowChain(),
    defaultWorkflowId: 'kb-assumption-extract',
  },
];

export function getDefaultWorkspaceProfiles(): WorkspaceProfile[] {
  return DEFAULT_WORKSPACE_PROFILES.map(cloneWorkspaceProfile);
}

export interface ThreeLibrarySettings {
  apiUrl: string;
  apiKey: string;
  userId: string;
  userName: string;
  groupId: string;
  groupName: string;
  defaultRetrieveMethod: string;
  openRouterApiKey: string;
  llmModel: string;
  llmBaseUrl: string;
  defaultAtoms: string;
  maxSearchResults: number;
  workspaceProfiles: WorkspaceProfile[];
  activeWorkspaceId: string;
}

export const DEFAULT_SETTINGS: ThreeLibrarySettings = {
  apiUrl: 'https://api.evermind.ai/api/v0',
  apiKey: '',
  userId: 'vault_user',
  userName: 'User',
  groupId: 'obsidian_vault',
  groupName: 'Obsidian Vault',
  defaultRetrieveMethod: 'hybrid',
  openRouterApiKey: '',
  llmModel: 'gpt-4o-mini',
  llmBaseUrl: 'https://api.openai.com/v1',
  defaultAtoms: 'decompose,evaluate',
  maxSearchResults: 10,
  workspaceProfiles: getDefaultWorkspaceProfiles(),
  activeWorkspaceId: 'logic-atom-system',
};

export class ThreeLibrarySettingTab extends PluginSettingTab {
  plugin: ThreeLibraryPlugin;

  constructor(app: App, plugin: ThreeLibraryPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl('h2', { text: '逻辑原子引擎设置' });

    containerEl.createEl('h3', { text: 'EverMemOS 云端 API' });

    new Setting(containerEl)
      .setName('API 地址')
      .setDesc('EverMemOS API 端点')
      .addText(text => text
        .setPlaceholder('https://api.evermind.ai/api/v0')
        .setValue(this.plugin.settings.apiUrl)
        .onChange(async (value) => {
          this.plugin.settings.apiUrl = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName('API 密钥')
      .setDesc('你的 EverMemOS API Key')
      .addText(text => text
        .setPlaceholder('输入 API Key')
        .setValue(this.plugin.settings.apiKey)
        .onChange(async (value) => {
          this.plugin.settings.apiKey = value.trim();
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName('用户 ID')
      .setDesc('记忆操作使用的用户标识')
      .addText(text => text
        .setPlaceholder('vault_user')
        .setValue(this.plugin.settings.userId)
        .onChange(async (value) => {
          this.plugin.settings.userId = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName('用户名')
      .setDesc('存储记忆时显示的名称')
      .addText(text => text
        .setPlaceholder('User')
        .setValue(this.plugin.settings.userName)
        .onChange(async (value) => {
          this.plugin.settings.userName = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName('分组 ID')
      .setDesc('记忆命名空间的分组标识')
      .addText(text => text
        .setPlaceholder('obsidian_vault')
        .setValue(this.plugin.settings.groupId)
        .onChange(async (value) => {
          this.plugin.settings.groupId = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName('分组名称')
      .setDesc('分组的显示名称')
      .addText(text => text
        .setPlaceholder('Obsidian Vault')
        .setValue(this.plugin.settings.groupName)
        .onChange(async (value) => {
          this.plugin.settings.groupName = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName('检索方式')
      .setDesc('默认的记忆搜索方式')
      .addDropdown(d => d
        .addOptions({ hybrid: '混合检索', keyword: '关键词', vector: '向量', rrf: 'RRF 融合' })
        .setValue(this.plugin.settings.defaultRetrieveMethod)
        .onChange(async (value) => {
          this.plugin.settings.defaultRetrieveMethod = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName('测试连接')
      .setDesc('验证 API 是否可用')
      .addButton(btn => btn
        .setButtonText('测试')
        .onClick(async () => {
          btn.setButtonText('测试中...');
          const result = await this.plugin.testApiConnection();
          btn.setButtonText(result.ok ? '连接成功' : '连接失败');
          setTimeout(() => btn.setButtonText('测试'), 3000);
        })
      );

    containerEl.createEl('h3', { text: 'LLM 配置' });

    new Setting(containerEl)
      .setName('LLM API Key')
      .setDesc('原子选择和 LLM 判断所需，支持任意 OpenAI 兼容 API')
      .addText(text => text
        .setPlaceholder('输入 API Key')
        .setValue(this.plugin.settings.openRouterApiKey)
        .onChange(async (value) => {
          this.plugin.settings.openRouterApiKey = value.trim();
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName('模型')
      .setDesc('模型 ID，例如 gpt-4o-mini 或 claude-3-haiku')
      .addText(text => text
        .setPlaceholder('gpt-4o-mini')
        .setValue(this.plugin.settings.llmModel)
        .onChange(async (value) => {
          this.plugin.settings.llmModel = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName('API 基础地址')
      .setDesc('OpenAI 兼容的 API 地址')
      .addText(text => text
        .setPlaceholder('https://api.openai.com/v1')
        .setValue(this.plugin.settings.llmBaseUrl)
        .onChange(async (value) => {
          this.plugin.settings.llmBaseUrl = value.trim();
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName('测试 LLM 连接')
      .setDesc('验证 LLM Key / Base URL / 模型是否可用')
      .addButton(btn => btn
        .setButtonText('测试')
        .onClick(async () => {
          btn.setButtonText('测试中...');
          const result = await this.plugin.testLlmConnection();
          btn.setButtonText(result.ok ? '连接成功' : '连接失败');
          setTimeout(() => btn.setButtonText('测试'), 3000);
        })
      );

    containerEl.createEl('h3', { text: '引擎配置' });

    new Setting(containerEl)
      .setName('默认原子')
      .setDesc('手动模式下的默认原子组合，逗号分隔，例如 decompose,associate,transform,abstract,evaluate,iterate')
      .addText(text => text
        .setPlaceholder('decompose,evaluate')
        .setValue(this.plugin.settings.defaultAtoms)
        .onChange(async (value) => {
          this.plugin.settings.defaultAtoms = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName('最大搜索结果数')
      .setDesc('每次搜索返回的最大记忆数量（1-20）')
      .addSlider(slider => slider
        .setLimits(1, 20, 1)
        .setValue(this.plugin.settings.maxSearchResults)
        .setDynamicTooltip()
        .onChange(async (value) => {
          this.plugin.settings.maxSearchResults = value;
          await this.plugin.saveSettings();
        })
      );

    containerEl.createEl('h3', { text: '工作区' });

    new Setting(containerEl)
      .setName('当前工作区')
      .setDesc('选择默认工作区，面板中可随时切换')
      .addDropdown(dropdown => {
        for (const profile of this.plugin.settings.workspaceProfiles) {
          dropdown.addOption(profile.id, profile.name);
        }
        dropdown
          .setValue(this.plugin.settings.activeWorkspaceId)
          .onChange(async (value) => {
            this.plugin.settings.activeWorkspaceId = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName('工作区数量')
      .setDesc(`当前已配置 ${this.plugin.settings.workspaceProfiles.length} 个工作区`)
      .addButton(btn => btn
        .setButtonText('恢复默认工作区')
        .onClick(async () => {
          this.plugin.settings.workspaceProfiles = getDefaultWorkspaceProfiles();
          this.plugin.settings.activeWorkspaceId = 'logic-atom-system';
          await this.plugin.saveSettings();
          this.display();
        })
      );

    const workspaceDesc = containerEl.createDiv();
    workspaceDesc.addClass('setting-item-description');
    workspaceDesc.setText(
      '插件是通用框架：同一套逻辑原子可以在不同工作区编排成不同工作流。' +
      '你可以在面板中复制工作区、调整原子链、编辑方法目标与输出风格。'
    );
  }
}
