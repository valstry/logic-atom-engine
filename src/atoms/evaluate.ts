import { EverMemOSClient } from '../api/client';
import { LLMClient } from '../utils/llm-client';
import { MemoryResult, StoredMemoryInfo } from '../api/types';
import { LogicAtom, AtomContext, AtomStepResult } from './types';
import { extractInterfaceHandles, sanitizeGeneratedHandles } from '../utils/search-query';
import { summarizeInterfaceGraph } from '../utils/interface-graph';

export class EvaluateAtom implements LogicAtom {
  name = 'evaluate' as const;
  description = 'Systematically score and compare options';

  private api: EverMemOSClient;
  private llm: LLMClient;

  constructor(api: EverMemOSClient, llm: LLMClient) {
    this.api = api;
    this.llm = llm;
  }

  private extractFallbackOptions(input: string, maxCount: number = 5): string[] {
    const handles = extractInterfaceHandles(input, maxCount);
    if (handles.length >= 2) return handles;
    return ['选项A', '选项B'];
  }

  private buildFallbackEvaluation(
    optionResults: Array<{ option: string; memories: MemoryResult[] }>,
  ): string {
    if (optionResults.length === 0) {
      return '暂无可评估选项。请先补充至少两个候选项后重试。';
    }
    const lines = optionResults.map((or, index) => {
      const score = Math.min(10, Math.max(3, 4 + or.memories.length));
      const evidence = or.memories.slice(0, 2).map(m => m.title).join('、');
      return [
        `${index + 1}. ${or.option}`,
        `- 简洁度：${score}/10`,
        `- 优势：${or.memories.length > 0 ? '有历史记忆支持，便于成为稳定接口' : '范围清晰，便于先试'} `,
        `- 风险：${or.memories.length > 0 ? '可能受历史样本偏差影响，需回原文校正' : '缺少记忆证据，需要快速验证'} `,
        `- 依据：${evidence || '暂无相关记忆'}`,
      ].join('\n');
    });
    const best = optionResults.reduce((acc, cur) => cur.memories.length > acc.memories.length ? cur : acc, optionResults[0]);
    return `${lines.join('\n\n')}\n\n总体建议：先执行「${best.option}」的最小版本并记录反馈。`;
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
    const objectiveContext = ctx.objective ? `\nCurrent objective:\n${ctx.objective}` : '';
    const profileContext = ctx.initialProfiles.length > 0
      ? `\nUser profile hints:\n${ctx.initialProfiles.slice(0, 3).map(p => `- ${p.title}`).join('\n')}`
      : '';
    const graphContext = ctx.localGraph ? `\n${summarizeInterfaceGraph(ctx.localGraph, 5, 3)}` : '';

    let options: string[];
    try {
      const optionExtraction = await this.llm.complete(
        'Extract 2-5 distinct interface candidates, actions, or compact note units to evaluate from the text. Respond with ONLY a JSON array of strings.',
        `What are the key interface candidates / items to evaluate in:\n"${ctx.input}"${previousContext}${objectiveContext}${profileContext}${graphContext}\n\nJSON array of strings:`,
      );
      const match = optionExtraction.match(/\[[\s\S]*\]/);
      options = match ? JSON.parse(match[0]) : this.extractFallbackOptions(ctx.input, 5);
    } catch (e: any) {
      warnings.push(`选项提取降级：${e?.message || String(e)}`);
      options = this.extractFallbackOptions(ctx.input, 5);
    }
    options = sanitizeGeneratedHandles(options, ctx.input, 5);
    if (options.length === 0) {
      options = this.extractFallbackOptions(ctx.input, 5);
    }

    const optionResults: Array<{ option: string; memories: MemoryResult[] }> = [];
    for (const opt of options) {
      try {
        const memories = await this.api.searchMemories(opt, 5);
        searchCount++;
        allMemories.push(...memories);
        optionResults.push({ option: opt, memories });
      } catch (e: any) {
        warnings.push(`评估检索失败（${opt}）：${e?.message || String(e)}`);
        optionResults.push({ option: opt, memories: [] });
      }
    }

    const evaluationContext = optionResults.map(or =>
      `Option: "${or.option}"\nRelated memories: ${or.memories.map(m => `${m.title} (score: ${m.score})`).join(', ') || 'none'}`
    ).join('\n\n');

    let evaluationTask = 'For each option, judge whether it can serve as a good knowledge handle. Provide: 1. Concision 2. Precision 3. Coverage 4. Verdict. End with an overall recommendation.';
    if (ctx.mode === 'reading-apply') {
      evaluationTask = 'Judge which compressed note units are best suited to become the current A\' interface set. Favor units that are short, accurate, and still cover the original material. End by naming the best compact version and one next action.';
    } else if (ctx.mode === 'reading-advanced') {
      evaluationTask = 'Select the best advanced extension path from the interface set. Output one prioritized question, one inference exercise, and two-level guidance (basic vs advanced). Prefer author stance, context, omission, and motive over generic questions.';
    }

    let evaluation = '';
    try {
      evaluation = await this.llm.complete(
        'You are a systematic evaluator. Judge each candidate as a knowledge interface handle. Optimize for brevity, precision, and relative completeness. Use evidence from memories when available.',
        `Evaluate these options for: "${ctx.input}"\n\n${evaluationContext}${profileContext}${objectiveContext}${graphContext}\n\n${evaluationTask}`,
      );
    } catch (e: any) {
      warnings.push(`评估生成降级：${e?.message || String(e)}`);
      evaluation = this.buildFallbackEvaluation(optionResults);
    }

    const prefix = ctx.mode === 'reading-advanced'
      ? '[Advanced Guidance]'
      : ctx.mode === 'reading-apply'
        ? '[Interface Quality Check]'
        : '[Evaluation]';
    const storeContent = `${prefix} ${ctx.input.slice(0, 120)}\nOptions: ${options.join(', ')}\n\n${evaluation}`;
    try {
      const { eventId } = await this.api.storeMemory(storeContent);
      storeCount++;
      stored.push({ eventId, content: storeContent });
    } catch (e: any) {
      warnings.push(`评估结果存储失败：${e?.message || String(e)}`);
    }

    return {
      atom: this.name,
      summary: warnings.length > 0
        ? `已降级执行：评估 ${options.length} 项，检索 ${searchCount} 次，告警 ${warnings.length} 条`
        : ctx.mode === 'reading-apply'
          ? `已评估 ${options.length} 个接口候选，完成 ${searchCount} 次检索`
          : ctx.mode === 'reading-advanced'
            ? `已筛选一步延伸路径，完成 ${searchCount} 次检索`
            : `已评估 ${options.length} 项，完成 ${searchCount} 次检索`,
      output: warnings.length > 0
        ? `### 选项评估\n\n${evaluation}\n\n### 执行告警\n${warnings.map((w, i) => `${i + 1}. ${w}`).join('\n')}`
        : `### 选项评估\n\n${evaluation}`,
      memoriesRetrieved: allMemories,
      memoriesStored: stored,
      searchCount,
      storeCount,
      duration: Date.now() - start,
    };
  }
}



