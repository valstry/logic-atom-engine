import { EverMemOSClient } from '../api/client';
import { LLMClient } from '../utils/llm-client';
import { MemoryResult, StoredMemoryInfo } from '../api/types';
import { LogicAtom, AtomContext, AtomStepResult } from './types';
import { buildInterfaceSearchQuery } from '../utils/search-query';
import { summarizeInterfaceGraph } from '../utils/interface-graph';

export class AbstractAtom implements LogicAtom {
  name = 'abstract' as const;
  description = 'Extract high-level patterns and principles from specific cases';

  private api: EverMemOSClient;
  private llm: LLMClient;

  constructor(api: EverMemOSClient, llm: LLMClient) {
    this.api = api;
    this.llm = llm;
  }

  private buildFallbackAbstraction(
    input: string,
    memories: MemoryResult[],
    mode: AtomContext['mode'],
  ): string {
    const topMemoryLines = memories.slice(0, 5).map((m, i) => `${i + 1}. ${m.title}`);
    if (mode === 'reading-understand') {
      return [
        '1. 这段在讲什么（白话）',
        `${input.slice(0, 120)}...`,
        '',
        '2. 必懂概念（先补基础）',
        topMemoryLines.length > 0 ? topMemoryLines.join('\n') : '- 暂无可用记忆，建议先补关键词定义',
        '',
        '3. 最短理解路径',
        '- 先看核心对象定义',
        '- 再看对象之间关系',
        '- 最后回到原文验证',
      ].join('\n');
    }
    if (mode === 'reading-apply') {
      return [
        '1. 记忆单位（对象/定义/关系）',
        `- 对象：${input.slice(0, 40)}`,
        '- 定义：待补充（LLM 暂不可用）',
        '- 关系：待补充（LLM 暂不可用）',
        '',
        '2. 下一步动作',
        '- 基于关键词手动补一个最小定义后再执行一次',
      ].join('\n');
    }
    return [
      '1. 核心主题',
      input.slice(0, 120),
      '',
      '2. 可复用模式',
      topMemoryLines.length > 0 ? topMemoryLines.join('\n') : '- 暂无可复用记忆',
      '',
      '3. 下一步',
      '- 先补充基础定义，再做精炼抽象',
    ].join('\n');
  }

  async execute(ctx: AtomContext): Promise<AtomStepResult> {
    const start = Date.now();
    let searchCount = 0;
    let storeCount = 0;
    const allMemories: MemoryResult[] = [];
    const stored: StoredMemoryInfo[] = [];
    const warnings: string[] = [];

    const patternQuery = buildInterfaceSearchQuery(ctx.input, { prefix: '模式', maxHandles: 4 });
    try {
      const patternMemories = await this.api.searchMemories(patternQuery, 5);
      searchCount++;
      allMemories.push(...patternMemories);
    } catch (e: any) {
      warnings.push(`模式检索失败：${e?.message || String(e)}`);
    }

    const topicSeed = buildInterfaceSearchQuery(ctx.input, { prefix: '主题', maxHandles: 5 });
    try {
      const topicMemories = await this.api.searchMemories(topicSeed, 10);
      searchCount++;
      allMemories.push(...topicMemories);
    } catch (e: any) {
      warnings.push(`主题检索失败：${e?.message || String(e)}`);
    }

    const previousStepsContext = ctx.previousSteps.map(s =>
      `[${s.atom}]: ${s.output.slice(0, 300)}`
    ).join('\n\n');

    const memoryContext = allMemories.slice(0, 10).map(m =>
      `- ${m.title}: ${m.content.slice(0, 150)}`
    ).join('\n');
    const profileContext = ctx.initialProfiles.slice(0, 5).map(p =>
      `- ${p.title}: ${p.content.slice(0, 120)}`
    ).join('\n');

    const objectiveContext = ctx.objective ? `\nCurrent objective:\n${ctx.objective}` : '';
    const graphContext = ctx.localGraph ? `\n${summarizeInterfaceGraph(ctx.localGraph, 6, 3)}` : '';
    let readingTask = 'Identify 2-4 key patterns or principles. For each, state the pattern clearly and explain why it matters.';
    if (ctx.mode === 'reading-understand') {
      readingTask = 'Explain the material for a beginner: what it means in plain language, explicitly surface hidden assumptions experts usually keep in mind, list must-know concepts with definitions, identify prerequisite blockers, and provide one minimal example.';
    } else if (ctx.mode === 'reading-connect') {
      readingTask = 'Output a foundation-gap bridge: explicitly list hidden assumptions, inferred known basics, missing prerequisites, and a 3-step path to close gaps before revisiting the original text.';
    } else if (ctx.mode === 'reading-apply') {
      readingTask = 'Compress into memory units: object, definition/property, descriptor words, relation/action, and a compressed expression (phrase/symbol/mnemonic). Add one-step inference and one small action.';
    } else if (ctx.mode === 'reading-advanced') {
      readingTask = 'Based on compressed notes, output 2-3 extension questions, exactly one-step inference, evidence, and next practice action with basic vs advanced gradient.';
    }

    let abstraction = '';
    try {
      abstraction = await this.llm.complete(
        'You extract high-level patterns, principles, and memorable knowledge from context. Focus on reusable insights and keep the result compact.',
        `Extract patterns and memorable knowledge from the following context about "${ctx.input}":\n\nPrevious analysis:\n${previousStepsContext || '(none)'}\n\nRelated memories:\n${memoryContext || '(none)'}\n\nUser profile hints:\n${profileContext || '(none)'}${objectiveContext}${graphContext}\n\n${readingTask}`,
      );
    } catch (e: any) {
      warnings.push(`抽象生成降级：${e?.message || String(e)}`);
      abstraction = this.buildFallbackAbstraction(ctx.input, allMemories, ctx.mode);
    }

    const prefix = ctx.mode.startsWith('reading-') ? '[Learning Workflow Notes]' : '[Pattern]';
    const storeContent = `${prefix} ${ctx.input.slice(0, 120)}\n${abstraction}`;
    try {
      const { eventId } = await this.api.storeMemory(storeContent);
      storeCount++;
      stored.push({ eventId, content: storeContent });
    } catch (e: any) {
      warnings.push(`抽象结果存储失败：${e?.message || String(e)}`);
    }

    const summaryByMode: Record<string, string> = {
      'reading-understand': `已生成接口化读懂结果（参考记忆 ${allMemories.length} 条）`,
      'reading-connect': `已生成前置补齐路径（参考记忆 ${allMemories.length} 条）`,
      'reading-apply': `已生成 A' 压缩结构（参考记忆 ${allMemories.length} 条）`,
      'reading-advanced': `已生成高阶提问与一步推断（参考记忆 ${allMemories.length} 条）`,
    };
    const rawSummary = summaryByMode[ctx.mode] || `Extracted patterns from ${allMemories.length} memories`;
    const summary = warnings.length > 0
      ? `${rawSummary}（降级执行，告警 ${warnings.length} 条）`
      : rawSummary;

    return {
      atom: this.name,
      summary,
      output: warnings.length > 0
        ? `### 结构化笔记\n\n${abstraction}\n\n### 执行告警\n${warnings.map((w, i) => `${i + 1}. ${w}`).join('\n')}`
        : `### 结构化笔记\n\n${abstraction}`,
      memoriesRetrieved: allMemories,
      memoriesStored: stored,
      searchCount,
      storeCount,
      duration: Date.now() - start,
    };
  }
}

