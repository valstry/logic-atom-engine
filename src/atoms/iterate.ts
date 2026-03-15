import { EverMemOSClient } from '../api/client';
import { LLMClient } from '../utils/llm-client';
import { MemoryResult, StoredMemoryInfo } from '../api/types';
import { LogicAtom, AtomContext, AtomStepResult } from './types';
import { buildInterfaceSearchQuery } from '../utils/search-query';
import { summarizeInterfaceGraph } from '../utils/interface-graph';

const MAX_ITERATIONS = 3;

export class IterateAtom implements LogicAtom {
  name = 'iterate' as const;
  description = 'Use A to repeatedly correct A\' so the compressed interface set stays aligned with the source';

  private api: EverMemOSClient;
  private llm: LLMClient;

  constructor(api: EverMemOSClient, llm: LLMClient) {
    this.api = api;
    this.llm = llm;
  }

  private buildFallbackFeedback(round: number): string {
    return [
      `第 ${round} 轮一致性校正反馈：`,
      '- 保留当前 A\' 的核心接口，不要整体改写',
      '- 删去过长、重复或无法直接调用的表达',
      '- 优先修正与原文 A 不一致的描述',
      '- 如果删减后会失真，就回补一个更准确的短接口',
    ].join('\n');
  }

  private buildFallbackImprovedDraft(draft: string, feedback: string, round: number): string {
    return `${draft}\n\n[一致性校正 ${round}] 根据以下反馈继续修正 A'，让它和原文 A 保持一致：\n${feedback}`;
  }

  async execute(ctx: AtomContext): Promise<AtomStepResult> {
    const start = Date.now();
    let searchCount = 0;
    let storeCount = 0;
    const allMemories: MemoryResult[] = [];
    const stored: StoredMemoryInfo[] = [];
    const warnings: string[] = [];
    const graphContext = ctx.localGraph ? `\n${summarizeInterfaceGraph(ctx.localGraph, 5, 3)}` : '';

    let currentDraft = ctx.previousSteps.length > 0
      ? ctx.previousSteps[ctx.previousSteps.length - 1].output
      : ctx.input;

    const iterations: Array<{ round: number; feedback: string; improved: string }> = [];
    const iterationSeed = buildInterfaceSearchQuery(ctx.input, { prefix: '校正', maxHandles: 4 });

    for (let round = 1; round <= MAX_ITERATIONS; round++) {
      let iterMemories: MemoryResult[] = [];
      try {
        iterMemories = await this.api.searchMemories(iterationSeed, 5);
        searchCount++;
        allMemories.push(...iterMemories);
      } catch (e: any) {
        warnings.push(`第 ${round} 轮检索失败：${e?.message || String(e)}`);
      }

      const pastIterations = iterMemories.length > 0
        ? `\nPast iteration insights:\n${iterMemories.slice(0, 3).map(m => `- ${m.title}`).join('\n')}`
        : '';

      let feedback = '';
      try {
        feedback = await this.llm.complete(
          'You are correcting an A\' interface set against the original A. The goal is not to display differences, but to use the differences to repair A\' until it stays semantically consistent with A. Do not rewrite broadly. Identify only the compact corrections needed to improve concision, precision, and consistency.',
          `Round ${round}/${MAX_ITERATIONS} consistency-correction review.\n\nOriginal material (A):\n"${ctx.input}"${graphContext}\n\nCurrent draft (A'):\n${currentDraft.slice(0, 1500)}${pastIterations}\n\nProvide 2-3 specific corrections focused on:\n1. semantic consistency with A\n2. concision\n3. precision\n4. relative coverage`
        );
      } catch (e: any) {
        warnings.push(`第 ${round} 轮反馈降级：${e?.message || String(e)}`);
        feedback = this.buildFallbackFeedback(round);
      }

      let improved = '';
      try {
        improved = await this.llm.complete(
          'You improve A\' based on correction feedback. Keep the interface-set structure, make it shorter and sharper, and preserve only what is supported by A. The new A\' must remain semantically aligned with A after compression.',
          `Correct the current A' based on the feedback.\n\nOriginal material (A):\n"${ctx.input}"${graphContext}\n\nCurrent A':\n${currentDraft.slice(0, 1500)}\n\nFeedback:\n${feedback}\n\nReturn:\n1. a revised A' that stays consistent with A\n2. it should be shorter if possible\n3. do not output a difference report`
        );
      } catch (e: any) {
        warnings.push(`第 ${round} 轮改写降级：${e?.message || String(e)}`);
        improved = this.buildFallbackImprovedDraft(currentDraft, feedback, round);
      }

      iterations.push({ round, feedback, improved });
      currentDraft = improved;

      const iterContent = `[A-A' Consistency Correction ${round}] ${ctx.input}\nFeedback: ${feedback.slice(0, 200)}\nStatus: ${round === MAX_ITERATIONS ? 'final' : 'continuing'}`;
      try {
        const { eventId } = await this.api.storeMemory(iterContent);
        storeCount++;
        stored.push({ eventId, content: iterContent });
      } catch (e: any) {
        warnings.push(`第 ${round} 轮存储失败：${e?.message || String(e)}`);
      }
    }

    const output = iterations.map(it =>
      `### 第 ${it.round} 轮一致性校正\n**校正依据：** ${it.feedback}\n\n**修正后的 A'：**\n${it.improved}`
    ).join('\n\n---\n\n');

    return {
      atom: this.name,
      summary: warnings.length > 0
        ? `已降级执行：A 与 A' 一致性校正 ${MAX_ITERATIONS} 轮，告警 ${warnings.length} 条`
        : `已完成 A 与 A' 一致性校正 ${MAX_ITERATIONS} 轮`,
      output: warnings.length > 0
        ? `### A 与 A' 一致性校正（${MAX_ITERATIONS} 轮）\n\n${output}\n\n### 最终 A'\n${currentDraft}\n\n### 执行告警\n${warnings.map((w, i) => `${i + 1}. ${w}`).join('\n')}`
        : `### A 与 A' 一致性校正（${MAX_ITERATIONS} 轮）\n\n${output}\n\n### 最终 A'\n${currentDraft}`,
      memoriesRetrieved: allMemories,
      memoriesStored: stored,
      searchCount,
      storeCount,
      duration: Date.now() - start,
    };
  }
}
