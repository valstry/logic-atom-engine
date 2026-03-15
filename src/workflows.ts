import { AtomName, WorkflowMode } from './atoms/types';

export type WorkflowInputBinding = 'original' | 'previous' | 'original+previous';

export interface WorkflowPreset {
  id: string;
  strategyMode: WorkflowMode;
  label: string;
  shortLabel: string;
  description: string;
  actionLabel: string;
  atoms: AtomName[] | null;
  inputPlaceholder: string;
  objective?: string;
  synthesisGuidance?: string;
  inputBinding?: WorkflowInputBinding;
  stageContract?: string;
}

const BUILTIN_WORKFLOW_PRESETS: Record<WorkflowMode, WorkflowPreset> = {
  general: {
    id: 'general',
    strategyMode: 'general',
    label: '自由编排',
    shortLabel: '自由',
    description: '通用入口。让引擎自动挑选原子，先探索最合适的处理链路。',
    actionLabel: '自动选择并执行',
    atoms: null,
    inputBinding: 'previous',
    inputPlaceholder: '输入你的问题，或粘贴任意文本/代码。\n\n示例：\n- 看懂这段专业内容\n- 把这段信息压成记忆点\n- 给我下一步可执行动作',
    stageContract: '通用方法执行：优先结构化，再给出最小可执行结论。',
  },
  'reading-understand': {
    id: 'reading-understand',
    strategyMode: 'reading-understand',
    label: '结构拆读',
    shortLabel: '拆读',
    description: '先把原文 A 拆成知识接口候选，再识别隐含前提，不做逐句复述。',
    actionLabel: '按结构拆读执行',
    atoms: ['decompose', 'abstract'],
    inputBinding: 'original',
    inputPlaceholder: '粘贴一段文章、代码或材料。\n\n输出重点：\n- 原文骨架\n- 接口候选\n- 隐含前提\n- 最短理解路径',
    objective: '把原文 A 先拆成知识接口候选：对象、定义、程度词、关系词、动作词与隐含前提，为后续生成 A\' 做准备。',
    synthesisGuidance: '输出时优先给出接口候选，而不是泛泛摘要。建议结构：1) 原文骨架 2) 接口候选 3) 每个接口代表什么 4) 必须补的前提。',
    stageContract: '必须显式提取接口候选和隐含前提，不做逐句复述。',
  },
  'reading-connect': {
    id: 'reading-connect',
    strategyMode: 'reading-connect',
    label: '知识差分',
    shortLabel: '差分',
    description: '对照原文 A 和当前笔记雏形 A\'，识别缺口、误判和冲突。',
    actionLabel: '按差分流程执行',
    atoms: ['decompose', 'associate', 'abstract'],
    inputBinding: 'original+previous',
    inputPlaceholder: '粘贴当前内容。\n\n输出重点：\n- 当前卡点\n- 已有接口\n- 缺失接口\n- 冲突/误判\n- 最小补齐路径',
    objective: '对照原文 A 和当前笔记雏形 A\'，找出接口不准确、不完整、或缺少前置知识的地方。',
    synthesisGuidance: '输出时围绕 A 和 A\' 的差异展开：1) 当前卡点 2) 已有接口 3) 缺失接口 4) 冲突/误判 5) 最小补齐路径。',
    stageContract: '必须同时参考原文和上一阶段结果，输出 A 与 A\' 的差异，而不是单独摘要任意一边。',
  },
  'reading-apply': {
    id: 'reading-apply',
    strategyMode: 'reading-apply',
    label: '记忆压缩',
    shortLabel: '压缩',
    description: '把当前理解压成可调用的 A\' 接口集，逐步逼近口诀或关键词串。',
    actionLabel: '按压缩流程执行',
    atoms: ['decompose', 'abstract', 'evaluate'],
    inputBinding: 'original+previous',
    inputPlaceholder: '粘贴你要压缩的内容。\n\n输出重点：\n- A\' 接口集\n- 每个接口代表什么\n- 最短口诀/关键词串\n- 下一步最小动作',
    objective: '把当前理解压缩成最终可调用的 A\' 接口集，要求同时满足简洁、精准、相对全面，并逐步逼近口诀化表达。',
    synthesisGuidance: '输出时优先给出：1) A\' 接口集 2) 每个接口的展开说明 3) 最短口诀/关键词串 4) 下一步最小动作。避免长摘要。',
    stageContract: '必须从“原文 A + 当前 A\'”做对照压缩，指出哪些保留、哪些删去、哪些仍需校正。',
  },
  'reading-advanced': {
    id: 'reading-advanced',
    strategyMode: 'reading-advanced',
    label: '一步进阶',
    shortLabel: '进阶',
    description: '基于已经成型的 A\' 接口集做再判断与延伸，不做泛化发散。',
    actionLabel: '按进阶流程执行',
    atoms: ['associate', 'evaluate', 'abstract'],
    inputBinding: 'previous',
    inputPlaceholder: '粘贴压缩后的接口集或口诀。\n\n输出重点：\n- 延伸问题\n- 一步推断\n- 推断依据来自哪个接口\n- 下一步练习',
    objective: '基于已经成型的 A\' 接口集做再判断与延伸，不泛泛发散，优先关注作者立场、背景假设、遗漏定义和写作意图。',
    synthesisGuidance: '输出时优先给出：1) 延伸问题 2) 一步推断 3) 推断依据来自哪个接口 4) 下一步练习。避免无根据发散。',
    stageContract: '问题必须从 A\' 接口集直接延伸，不能脱离接口集合随意发散。',
  },
};

function cloneAtoms(atoms: AtomName[] | null): AtomName[] | null {
  if (!atoms) return null;
  return [...atoms];
}

export function cloneWorkflowPreset(preset: WorkflowPreset): WorkflowPreset {
  return {
    ...preset,
    atoms: cloneAtoms(preset.atoms),
  };
}

export function getBuiltInWorkflowPreset(mode: WorkflowMode): WorkflowPreset {
  return cloneWorkflowPreset(BUILTIN_WORKFLOW_PRESETS[mode]);
}

export function listBuiltInWorkflowPresets(): WorkflowPreset[] {
  const order: WorkflowMode[] = [
    'general',
    'reading-understand',
    'reading-connect',
    'reading-apply',
    'reading-advanced',
  ];
  return order.map(getBuiltInWorkflowPreset);
}

export function buildWorkspaceWorkflowFromMode(
  mode: WorkflowMode,
  override: Partial<WorkflowPreset> = {},
): WorkflowPreset {
  const base = getBuiltInWorkflowPreset(mode);
  return {
    ...base,
    ...override,
    id: override.id || base.id,
    strategyMode: override.strategyMode || base.strategyMode,
    atoms: override.atoms !== undefined ? cloneAtoms(override.atoms) : cloneAtoms(base.atoms),
  };
}
