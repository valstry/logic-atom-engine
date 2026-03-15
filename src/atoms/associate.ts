import { EverMemOSClient } from '../api/client';
import { LLMClient } from '../utils/llm-client';
import { MemoryResult, StoredMemoryInfo } from '../api/types';
import { LogicAtom, AtomContext, AtomStepResult } from './types';
import { extractInterfaceHandles, sanitizeGeneratedHandles } from '../utils/search-query';
import { summarizeInterfaceGraph } from '../utils/interface-graph';

export class AssociateAtom implements LogicAtom {
  name = 'associate' as const;
  description = 'Find connections between different concepts across memory domains';

  private api: EverMemOSClient;
  private llm: LLMClient;

  constructor(api: EverMemOSClient, llm: LLMClient) {
    this.api = api;
    this.llm = llm;
  }

  private extractFallbackConcepts(input: string, maxCount: number = 5): string[] {
    const handles = extractInterfaceHandles(input, maxCount);
    return handles.length > 0 ? handles : [input.slice(0, 24)];
  }

  private buildFallbackAssociations(
    conceptResults: Array<{ concept: string; memories: MemoryResult[] }>,
  ): string {
    const lines = conceptResults.map((cr, idx) => {
      const topTitles = cr.memories.slice(0, 3).map(m => m.title).join('、');
      return `${idx + 1}. 接口「${cr.concept}」与记忆的直接关联：${topTitles || '暂无匹配记忆，建议先补前置定义'}。`;
    });
    return lines.join('\n');
  }

  async execute(ctx: AtomContext): Promise<AtomStepResult> {
    const start = Date.now();
    let searchCount = 0;
    let storeCount = 0;
    const allMemories: MemoryResult[] = [];
    const stored: StoredMemoryInfo[] = [];
    const warnings: string[] = [];

    const previousOutput = ctx.previousSteps.length > 0
      ? ctx.previousSteps[ctx.previousSteps.length - 1].output
      : '';
    const objectiveContext = ctx.objective ? `\nCurrent objective: ${ctx.objective}` : '';
    const profileContext = ctx.initialProfiles.length > 0
      ? `\nUser profile hints:\n${ctx.initialProfiles.slice(0, 3).map(p => `- ${p.title}`).join('\n')}`
      : '';
    const graphContext = ctx.localGraph ? `\n${summarizeInterfaceGraph(ctx.localGraph, 6, 3)}` : '';

    let concepts: string[];
    try {
      const conceptExtraction = await this.llm.complete(
        'Extract 3-5 key interface handles from the text. For reading workflows, prioritize noun definitions, descriptors, relation words, and memorable facts that can later be used as compact note handles. Respond with ONLY a JSON array of strings.',
        `Extract interface handles from:\n"${ctx.input}"${objectiveContext}${profileContext}${graphContext}\n${previousOutput ? `Context: ${previousOutput.slice(0, 500)}` : ''}\n\nJSON array of handle strings:`,
      );
      const match = conceptExtraction.match(/\[[\s\S]*\]/);
      concepts = match ? JSON.parse(match[0]) : this.extractFallbackConcepts(ctx.input, 5);
    } catch (e: any) {
      warnings.push(`关键词提取降级：${e?.message || String(e)}`);
      concepts = this.extractFallbackConcepts(ctx.input, 5);
    }
    concepts = sanitizeGeneratedHandles(concepts, ctx.input, 5);

    const conceptResults: Array<{ concept: string; memories: MemoryResult[] }> = [];
    for (const concept of concepts) {
      try {
        const memories = await this.api.searchMemories(concept, 5);
        searchCount++;
        allMemories.push(...memories);
        conceptResults.push({ concept, memories });
      } catch (e: any) {
        warnings.push(`记忆检索失败（${concept}）：${e?.message || String(e)}`);
        conceptResults.push({ concept, memories: [] });
      }
    }

    const associationContext = conceptResults.map(cr =>
      `Concept: "${cr.concept}" → Memories: ${cr.memories.map(m => m.title).join(', ') || 'none'}`
    ).join('\n');

    let associationTask = 'Find meaningful associations between these interface handles and their related memories.';
    if (ctx.mode === 'reading-connect') {
      associationTask = 'Find the strongest direct relationship between these interface handles and identify what prerequisite knowledge experts implicitly assume but beginners usually lack. Keep it concrete and tie every relation back to the original material.';
    } else if (ctx.mode === 'reading-advanced') {
      associationTask = 'Based on the compressed interface set A\', generate extension questions and exactly one step of inference. Focus on author stance, background assumptions, omitted definitions, and missing viewpoints. Do not create multi-hop reasoning.';
    }

    let associations = '';
    try {
      associations = await this.llm.complete(
        'You identify meaningful connections between interface handles based on memory search results. When asked for one-step inference, stay constrained and explain only the strongest direct link. Treat each handle as a compact index into a larger knowledge block.',
        `${associationTask}\n${profileContext}\n\n${associationContext}\n\nList each discovered association as a clear statement. If possible, state which handle supports which other handle.`,
      );
    } catch (e: any) {
      warnings.push(`关联推理降级：${e?.message || String(e)}`);
      associations = this.buildFallbackAssociations(conceptResults);
    }

    const prefix = ctx.mode === 'reading-advanced'
      ? '[Advanced Application]'
      : ctx.mode === 'reading-connect'
        ? '[Foundation Gap Mapping]'
        : '[Association]';
    const storeContent = `${prefix} ${ctx.input.slice(0, 120)}\nHandles: ${concepts.join(', ')}\n\nDiscovered associations:\n${associations}`;
    try {
      const { eventId: eid1 } = await this.api.storeMemory(storeContent);
      storeCount++;
      stored.push({ eventId: eid1, content: storeContent });
    } catch (e: any) {
      warnings.push(`结果存储失败：${e?.message || String(e)}`);
    }

    if (allMemories.length > 5) {
      const crossDomainSummary = `[Cross-domain links] ${concepts.join(' ↔ ')}: ${associations.slice(0, 200)}`;
      try {
        const { eventId: eid2 } = await this.api.storeMemory(crossDomainSummary);
        storeCount++;
        stored.push({ eventId: eid2, content: crossDomainSummary });
      } catch (e: any) {
        warnings.push(`跨域摘要存储失败：${e?.message || String(e)}`);
      }
    }

    return {
      atom: this.name,
      summary: warnings.length > 0
        ? `已降级执行：概念 ${concepts.length} 个，相关记忆 ${allMemories.length} 条，告警 ${warnings.length} 条`
        : `Explored ${concepts.length} concepts, found ${allMemories.length} related memories`,
      output: warnings.length > 0
        ? `### 接口关系\n\n${associations}\n\n### 执行告警\n${warnings.map((w, i) => `${i + 1}. ${w}`).join('\n')}`
        : `### 接口关系\n\n${associations}`,
      memoriesRetrieved: allMemories,
      memoriesStored: stored,
      searchCount,
      storeCount,
      duration: Date.now() - start,
    };
  }
}
