import { EverMemOSClient } from '../api/client';
import { LLMClient } from '../utils/llm-client';
import { MemoryResult, StoredMemoryInfo } from '../api/types';
import { LogicAtom, AtomContext, AtomStepResult } from './types';
import { extractInterfaceHandles, sanitizeGeneratedHandles } from '../utils/search-query';
import { summarizeInterfaceGraph } from '../utils/interface-graph';

export class DecomposeAtom implements LogicAtom {
  name = 'decompose' as const;
  description = 'Break complex problems into sub-questions, search memory for each';

  private api: EverMemOSClient;
  private llm: LLMClient;

  constructor(api: EverMemOSClient, llm: LLMClient) {
    this.api = api;
    this.llm = llm;
  }

  private extractFallbackHandles(input: string, maxCount: number = 5): string[] {
    const handles = extractInterfaceHandles(input, maxCount);
    return handles.length > 0 ? handles : [input.slice(0, 24)];
  }

  private buildInterfaceLabel(index: number): string {
    return String.fromCharCode('a'.charCodeAt(0) + index);
  }

  async execute(ctx: AtomContext): Promise<AtomStepResult> {
    const start = Date.now();
    let searchCount = 0;
    let storeCount = 0;
    const allMemories: MemoryResult[] = [];
    const stored: StoredMemoryInfo[] = [];
    const warnings: string[] = [];

    const previousContext = ctx.previousSteps.length > 0
      ? `\nPrevious analysis:\n${ctx.previousSteps.map(s => `[${s.atom}]: ${s.summary}`).join('\n')}`
      : '';

    const memoryContext = ctx.initialMemories.length > 0
      ? `\nRelevant memories:\n${ctx.initialMemories.slice(0, 3).map(m => `- ${m.title}`).join('\n')}`
      : '';
    const profileContext = ctx.initialProfiles.length > 0
      ? `\nUser profile hints:\n${ctx.initialProfiles.slice(0, 3).map(p => `- ${p.title}`).join('\n')}`
      : '';

    const objectiveContext = ctx.objective ? `\nCurrent objective:\n${ctx.objective}` : '';
    const graphContext = ctx.localGraph ? `\n${summarizeInterfaceGraph(ctx.localGraph, 5, 3)}` : '';
    const readingMode = ctx.mode.startsWith('reading-');
    let instruction = 'Decompose this into 3-5 sub-questions.';
    if (readingMode) {
      instruction = 'Read the material in a skimming way and extract 3-5 interface candidates. Each candidate should be a short callable handle such as a keyword, noun definition, degree descriptor, relation, action, or hidden prerequisite. Do not summarize sentence by sentence. Prefer handles that can later become compact notes like a/b/c or a mnemonic.';
    }
    if (ctx.mode === 'reading-connect') {
      instruction = 'Extract 3-5 prerequisite interface candidates a beginner would need before fully understanding this material. Each handle should name a foundational concept, missing definition, relation, or blocking point.';
    } else if (ctx.mode === 'reading-apply') {
      instruction = 'Extract 3-5 memory-interface units for note compression. Each unit should point to object, definition, descriptor, relation, or action, and should be short enough to become a compact handle later.';
    }

    let subQuestions: string[];
    try {
      const decomposition = await this.llm.complete(
        'You decompose inputs into 3-5 focused interface candidates. For reading materials, prefer keywords, noun definitions, key descriptors, relation words, degree words, memorable facts, and hidden prerequisites. Each candidate should be short enough to become a reusable note handle. Respond with ONLY a JSON array of strings.',
        `${instruction}\n\n"${ctx.input}"${objectiveContext}${previousContext}${memoryContext}${profileContext}${graphContext}\n\nRespond with a JSON array of strings.`,
      );
      const match = decomposition.match(/\[[\s\S]*\]/);
      subQuestions = match ? JSON.parse(match[0]) : this.extractFallbackHandles(ctx.input, 5);
    } catch (e: any) {
      warnings.push(`拆解降级：${e?.message || String(e)}`);
      subQuestions = this.extractFallbackHandles(ctx.input, 5);
    }
    subQuestions = sanitizeGeneratedHandles(subQuestions, ctx.input, 5);

    const subResults: Array<{ question: string; memories: MemoryResult[] }> = [];
    for (const q of subQuestions) {
      try {
        const memories = await this.api.searchMemories(q, 5);
        searchCount++;
        allMemories.push(...memories);
        subResults.push({ question: q, memories });
      } catch (e: any) {
        warnings.push(`检索失败（${q}）：${e?.message || String(e)}`);
        subResults.push({ question: q, memories: [] });
      }
    }

    const structurePrefix = readingMode ? '[Interface Candidates]' : '[Decomposition]';
    const structureContent = `${structurePrefix} ${ctx.input.slice(0, 120)}\n`
      + subResults.map((sr, i) =>
        `handle_${this.buildInterfaceLabel(i)}: ${sr.question} (found ${sr.memories.length} related memories)`
      ).join('\n');

    try {
      const { eventId } = await this.api.storeMemory(structureContent);
      storeCount++;
      stored.push({ eventId, content: structureContent });
    } catch (e: any) {
      warnings.push(`拆解结果存储失败：${e?.message || String(e)}`);
    }

    const outputHeader = readingMode ? '### 接口候选抓取' : '### 问题拆解';
    const output = subResults.map((sr, i) => {
      const handleName = this.buildInterfaceLabel(i);
      const memSummary = sr.memories.length > 0
        ? sr.memories.slice(0, 3).map(m => `  - ${m.title}`).join('\n')
        : '  (no related memories found)';
      const title = readingMode ? `### 接口 ${handleName}: ${sr.question}` : `### Sub-question ${i + 1}: ${sr.question}`;
      return readingMode
        ? `${title}\n类型建议：对象 / 定义 / 程度 / 关系 / 动作 / 前提 中择一\n可调用说明：后续应能用“${handleName}”代指这块知识\nRelated memories:\n${memSummary}`
        : `${title}\nRelated memories:\n${memSummary}`;
    }).join('\n\n');

    return {
      atom: this.name,
      summary: warnings.length > 0
        ? `已降级执行：拆解 ${subQuestions.length} 项，检索 ${searchCount} 次，告警 ${warnings.length} 条`
        : readingMode
          ? `抓出 ${subQuestions.length} 个接口候选，供后续压缩为 A'，检索 ${searchCount} 次`
          : `Decomposed into ${subQuestions.length} sub-questions, searched ${searchCount} times`,
      output: warnings.length > 0
        ? `${outputHeader}\n\n${output}\n\n### 执行告警\n${warnings.map((w, i) => `${i + 1}. ${w}`).join('\n')}`
        : `${outputHeader}\n\n${output}`,
      memoriesRetrieved: allMemories,
      memoriesStored: stored,
      searchCount,
      storeCount,
      duration: Date.now() - start,
    };
  }
}
