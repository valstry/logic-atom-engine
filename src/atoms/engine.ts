import { EverMemOSClient } from '../api/client';
import { LLMClient } from '../utils/llm-client';
import {
  AtomContext,
  AtomStepResult,
  AtomChainResult,
  AtomName,
  LogicAtom,
  AtomExecutionOptions,
} from './types';
import { buildInterfaceSearchQuery } from '../utils/search-query';
import { buildInterfaceGraph, summarizeInterfaceGraph } from '../utils/interface-graph';

export type AtomProgressCallback = (step: AtomStepResult, index: number, total: number) => void;

export class AtomEngine {
  private atoms: Map<AtomName, LogicAtom> = new Map();
  private apiClient: EverMemOSClient;
  private llmClient: LLMClient;

  constructor(apiClient: EverMemOSClient, llmClient: LLMClient) {
    this.apiClient = apiClient;
    this.llmClient = llmClient;
  }

  registerAtom(atom: LogicAtom): void {
    this.atoms.set(atom.name, atom);
  }

  getAtom(name: AtomName): LogicAtom | undefined {
    return this.atoms.get(name);
  }

  getRegisteredAtoms(): AtomName[] {
    return Array.from(this.atoms.keys());
  }

  async executeChain(
    input: string,
    atomNames: AtomName[],
    onProgress?: AtomProgressCallback,
    options: AtomExecutionOptions = {},
  ): Promise<AtomChainResult> {
    const startTime = Date.now();
    const initializationWarnings: string[] = [];
    const localGraph = buildInterfaceGraph(input);

    if (options.persistExecutionPlan) {
      const executionPlanContent = [
        '[ExecutionPlan]',
        `workspace: ${options.workspaceName || 'default'}`,
        `workflow: ${options.workflowLabel || options.mode || 'general'}`,
        `atom_order: ${atomNames.join(' -> ')}`,
        `input_preview: ${input.slice(0, 240)}`,
        `timestamp: ${new Date().toISOString()}`,
      ].join('\n');
      try {
        await this.apiClient.storeMemory(
          executionPlanContent,
          `exec_plan_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        );
      } catch (e) {
        console.error('[LogicAtom] Failed to store execution plan:', e);
      }
    }

    const initialQuery = this.buildInitialSearchQuery(input, options.mode, localGraph.topHandles);
    let initialMemories: AtomContext['initialMemories'] = [];
    try {
      initialMemories = await this.apiClient.searchMemories(initialQuery, 10);
    } catch (e: any) {
      initializationWarnings.push(`初始化记忆检索失败：${e?.message || String(e)}`);
      initialMemories = [];
    }
    const initialProfiles = initialMemories.filter(m => m.type === 'profile');

    const steps: AtomStepResult[] = [];
    const ctx: AtomContext = {
      input,
      initialMemories,
      initialProfiles,
      localGraph,
      previousSteps: [],
      conversationId: 'obsidian-three-library',
      mode: options.mode || 'general',
      objective: options.objective,
      synthesisGuidance: options.synthesisGuidance,
    };

    for (let i = 0; i < atomNames.length; i++) {
      const atomName = atomNames[i];
      const atom = this.atoms.get(atomName);
      if (!atom) {
        throw new Error(`Atom "${atomName}" not registered`);
      }

      let stepResult: AtomStepResult;
      try {
        stepResult = await atom.execute(ctx);
      } catch (e: any) {
        console.error(`[LogicAtom] Atom "${atomName}" failed:`, e.message);
        stepResult = {
          atom: atomName,
          summary: `执行失败：${e.message}`,
          output: `原子 "${atomName}" 执行出错：${e.message}`,
          memoriesRetrieved: [],
          memoriesStored: [],
          searchCount: 0,
          storeCount: 0,
          duration: Date.now() - startTime,
        };
      }
      steps.push(stepResult);
      ctx.previousSteps = [...steps];

      if (onProgress) {
        onProgress(stepResult, i, atomNames.length);
      }
    }

    const finalOutput = await this.synthesize(
      input,
      steps,
      options,
      initialProfiles,
      initializationWarnings,
    );

    return {
      input,
      atomNames,
      steps,
      finalOutput,
      totalSearches: steps.reduce((sum, s) => sum + s.searchCount, 0),
      totalStores: steps.reduce((sum, s) => sum + s.storeCount, 0),
      totalDuration: Date.now() - startTime,
    };
  }

  private buildInitialSearchQuery(
    input: string,
    mode?: AtomExecutionOptions['mode'],
    preferredHandles: string[] = [],
  ): string {
    const prefix = mode && mode.startsWith('reading-') ? '阅读接口' : '主题';
    const handles = preferredHandles.slice(0, mode && mode.startsWith('reading-') ? 5 : 4);
    if (handles.length > 0) {
      return [prefix, ...handles].join(' ');
    }
    return buildInterfaceSearchQuery(input, {
      prefix,
      maxHandles: mode && mode.startsWith('reading-') ? 5 : 4,
    });
  }

  private async synthesize(
    input: string,
    steps: AtomStepResult[],
    options: AtomExecutionOptions,
    initialProfiles: AtomContext['initialProfiles'],
    initializationWarnings: string[] = [],
  ): Promise<string> {
    const stepsContext = steps
      .map((s, i) => `Step ${i + 1} [${s.atom}]: ${s.summary}\nOutput: ${s.output}`)
      .join('\n\n');

    const profileContext = initialProfiles.length > 0
      ? `\nUser profile hints from memory:\n${initialProfiles
        .slice(0, 5)
        .map((p, i) => `${i + 1}. ${p.title}: ${p.content.slice(0, 120)}`)
        .join('\n')}\n`
      : '\nUser profile hints from memory:\n(none)\n';

    const guidance = options.synthesisGuidance
      ? `\nAdditional synthesis guidance:\n${options.synthesisGuidance}\n`
      : '';
    const objective = options.objective
      ? `\nCurrent workflow objective:\n${options.objective}\n`
      : '';
    const graphSummary = `\n${this.buildGraphSummary(input)}\n`;

    const prompt = `Based on the following structured thinking steps, synthesize a final result that treats the original material as A and the compressed note result as A'.\n\nOriginal Question or Material (A):\n${input}\n${profileContext}${objective}\n${graphSummary}\n\nThinking Steps:\n${stepsContext}${guidance}\nProvide a clear, well-structured synthesis that emphasizes:\n1. The final compact interface set or mnemonic-like handles for A'\n2. What each handle stands for\n3. How A' stays semantically consistent with A after compression\n4. What was corrected in A' to keep that consistency\n5. One-step extensions or deeper judgments grounded in A'\nUse the language of the original question or material. Do not turn the result into a difference report.`;

    try {
      return await this.llmClient.complete(
        'You are a synthesis engine. Combine multi-step thinking results into a coherent final answer. When the workflow is about reading and compression, treat the goal as constructing a compact but callable interface set A\' for the original material A. A\' must stay semantically consistent with A after compression. Respect any requested structure and output language.',
        prompt,
      );
    } catch (e: any) {
      return this.buildFallbackSynthesis(
        input,
        steps,
        initializationWarnings,
        e?.message || String(e),
      );
    }
  }

  private buildGraphSummary(input: string): string {
    const graph = buildInterfaceGraph(input);
    return summarizeInterfaceGraph(graph);
  }

  private buildFallbackSynthesis(
    input: string,
    steps: AtomStepResult[],
    initializationWarnings: string[],
    synthError: string,
  ): string {
    const stepSummary = steps.map((s, i) => `${i + 1}. [${s.atom}] ${s.summary}`).join('\n');
    const stepOutputs = steps.map((s, i) => {
      const clipped = s.output.length > 800 ? `${s.output.slice(0, 800)}\n...(已截断)` : s.output;
      return `### Step ${i + 1} - ${s.atom}\n${clipped}`;
    }).join('\n\n');
    const warningLines = [
      ...initializationWarnings,
      `综合阶段降级：${synthError}`,
    ];

    return [
      '## 综合结果（降级模式）',
      '',
      `原始输入：${input}`,
      '',
      '### 执行摘要',
      stepSummary || '- 无步骤结果',
      '',
      '### 可用输出',
      stepOutputs || '- 无可用输出',
      '',
      '### 执行告警',
      warningLines.map((w, i) => `${i + 1}. ${w}`).join('\n'),
    ].join('\n');
  }
}


