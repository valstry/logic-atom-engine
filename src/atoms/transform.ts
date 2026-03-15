import { EverMemOSClient } from '../api/client';
import { LLMClient } from '../utils/llm-client';
import { MemoryResult, StoredMemoryInfo } from '../api/types';
import { LogicAtom, AtomContext, AtomStepResult } from './types';
import { buildInterfaceSearchQuery } from '../utils/search-query';

export class TransformAtom implements LogicAtom {
  name = 'transform' as const;
  description = 'View a topic from multiple different perspectives';

  private api: EverMemOSClient;
  private llm: LLMClient;

  constructor(api: EverMemOSClient, llm: LLMClient) {
    this.api = api;
    this.llm = llm;
  }

  private buildFallbackTransformation(
    input: string,
    perspectiveResults: Array<{ lens: string; memories: MemoryResult[] }>,
  ): string {
    const lensLabel: Record<string, string> = {
      analytical: '分析视角',
      practical: '实践视角',
      'minimal-action': '最小动作视角',
    };
    return perspectiveResults.map((pr) => {
      const titles = pr.memories.slice(0, 3).map(m => m.title).join('、');
      const label = lensLabel[pr.lens] || pr.lens;
      return `### ${label}\n- 主题：${input.slice(0, 80)}\n- 关联记忆：${titles || '暂无匹配记忆'}\n- 建议：先围绕该视角补一个最小可执行结论。`;
    }).join('\n\n');
  }

  async execute(ctx: AtomContext): Promise<AtomStepResult> {
    const start = Date.now();
    let searchCount = 0;
    let storeCount = 0;
    const allMemories: MemoryResult[] = [];
    const stored: StoredMemoryInfo[] = [];
    const warnings: string[] = [];

    const lenses = [
      { name: 'analytical', query: buildInterfaceSearchQuery(ctx.input, { prefix: '分析', maxHandles: 4 }) },
      { name: 'practical', query: buildInterfaceSearchQuery(ctx.input, { prefix: '应用', maxHandles: 4 }) },
      { name: 'minimal-action', query: buildInterfaceSearchQuery(ctx.input, { prefix: '动作', maxHandles: 4 }) },
    ];

    const perspectiveResults: Array<{ lens: string; memories: MemoryResult[] }> = [];
    for (const lens of lenses) {
      try {
        const memories = await this.api.searchMemories(lens.query, 5);
        searchCount++;
        allMemories.push(...memories);
        perspectiveResults.push({ lens: lens.name, memories });
      } catch (e: any) {
        warnings.push(`视角检索失败（${lens.name}）：${e?.message || String(e)}`);
        perspectiveResults.push({ lens: lens.name, memories: [] });
      }
    }

    const previousContext = ctx.previousSteps.length > 0
      ? `Previous analysis: ${ctx.previousSteps[ctx.previousSteps.length - 1].summary}`
      : '';
    const objectiveContext = ctx.objective ? `\nCurrent objective: ${ctx.objective}` : '';

    const memoryInsights = perspectiveResults.map(pr =>
      `${pr.lens} perspective memories: ${pr.memories.map(m => m.title).join(', ') || 'none'}`
    ).join('\n');

    const transformationTask = ctx.mode === 'reading-apply'
      ? 'Reframe the reading material into three compact views: what it means, how it could be used, and what the smallest useful action would be.'
      : 'Reframe this topic from 3 perspectives (analytical, creative, practical).';

    let transformation = '';
    try {
      transformation = await this.llm.complete(
        'You reframe topics from multiple perspectives. For each perspective, provide a unique insight that differs from the others.',
        `${transformationTask}\n\n"${ctx.input}"\n\n${previousContext}${objectiveContext}\nMemory context:\n${memoryInsights}\n\nProvide each perspective as a distinct paragraph.`,
      );
    } catch (e: any) {
      warnings.push(`转化生成降级：${e?.message || String(e)}`);
      transformation = this.buildFallbackTransformation(ctx.input, perspectiveResults);
    }

    for (const pr of perspectiveResults) {
      if (pr.memories.length > 0) {
        const content = `[Transform/${pr.lens}] ${ctx.input.slice(0, 120)}: perspective with ${pr.memories.length} memory references`;
        try {
          const { eventId } = await this.api.storeMemory(content);
          storeCount++;
          stored.push({ eventId, content });
        } catch (e: any) {
          warnings.push(`转化存储失败（${pr.lens}）：${e?.message || String(e)}`);
        }
      }
    }

    return {
      atom: this.name,
      summary: warnings.length > 0
        ? `已降级执行：视角 ${lenses.length} 个，记忆 ${allMemories.length} 条，告警 ${warnings.length} 条`
        : `Examined ${lenses.length} perspectives, found ${allMemories.length} supporting memories`,
      output: warnings.length > 0
        ? `### 多视角转化\n\n${transformation}\n\n### 执行告警\n${warnings.map((w, i) => `${i + 1}. ${w}`).join('\n')}`
        : `### 多视角转化\n\n${transformation}`,
      memoriesRetrieved: allMemories,
      memoriesStored: stored,
      searchCount,
      storeCount,
      duration: Date.now() - start,
    };
  }
}
