import { AtomName } from '../atoms/types';

export type StepIntent =
  | 'extract_hidden_assumptions'
  | 'diagnose_knowledge_gap'
  | 'build_prereq_patch'
  | 'inject_and_rewrite'
  | 'compress_notes'
  | 'one_step_advance'
  | 'iterate_to_readable';

export interface ResolverContext {
  difficulty: number; // 0~1, higher means harder source material
  gapScore: number; // 0~1, higher means more missing prerequisites
  wantsAction: boolean;
  iteration: number;
}

export interface AtomCall {
  atom: AtomName;
  reason: string;
}

export function resolveStepToAtoms(intent: StepIntent, ctx: ResolverContext): AtomCall[] {
  switch (intent) {
    case 'extract_hidden_assumptions':
      return [
        { atom: 'decompose', reason: '拆出关键词、定义和隐含前提' },
        ...(ctx.gapScore > 0.55 ? [{ atom: 'associate', reason: '补充前提关系链路' } as AtomCall] : []),
      ];
    case 'diagnose_knowledge_gap':
      return [
        { atom: 'associate', reason: '判断已有/缺失/冲突' },
        { atom: 'evaluate', reason: '对卡点进行优先级排序' },
      ];
    case 'build_prereq_patch':
      return [
        { atom: 'abstract', reason: '输出前置知识补丁结构' },
        ...(ctx.difficulty > 0.6 ? [{ atom: 'transform', reason: '生成低门槛解释版本' } as AtomCall] : []),
      ];
    case 'inject_and_rewrite':
      return [
        { atom: 'transform', reason: '将补丁注入原文并生成第一版 A\'' },
        { atom: 'abstract', reason: '整理成可调用的结构化笔记' },
      ];
    case 'compress_notes':
      return [
        { atom: 'decompose', reason: '抽取记忆单位' },
        { atom: 'abstract', reason: '压缩成短笔记接口结构' },
        ...(ctx.wantsAction ? [{ atom: 'evaluate', reason: '选出最小可执行动作' } as AtomCall] : []),
      ];
    case 'one_step_advance':
      return [
        { atom: 'associate', reason: '生成延伸问题与一步推断' },
        { atom: 'evaluate', reason: '给出基础/进阶下一步' },
      ];
    case 'iterate_to_readable':
      return [
        { atom: 'iterate', reason: `第 ${ctx.iteration + 1} 轮接口校正迭代` },
      ];
    default:
      return [{ atom: 'decompose', reason: '默认拆解起步' }];
  }
}
