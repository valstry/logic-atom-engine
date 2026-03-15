import { AtomName } from '../atoms/types';
import { AtomCall, resolveStepToAtoms, ResolverContext, StepIntent } from './step-resolver';

export interface MethodSpec {
  id: string;
  name: string;
  steps: StepIntent[];
}

export interface CompiledMethodPlan {
  methodId: string;
  methodName: string;
  calls: AtomCall[];
  atomNames: AtomName[];
}

export const KNOWLEDGE_BARRIER_METHOD: MethodSpec = {
  id: 'knowledge-barrier-removal',
  name: '知识壁垒消除',
  steps: [
    'extract_hidden_assumptions',
    'diagnose_knowledge_gap',
    'build_prereq_patch',
    'inject_and_rewrite',
    'compress_notes',
    'one_step_advance',
  ],
};

export function compileMethod(spec: MethodSpec, ctx: ResolverContext): CompiledMethodPlan {
  const calls = spec.steps.flatMap(step => resolveStepToAtoms(step, ctx));
  const atomNames = calls.map(call => call.atom);
  return {
    methodId: spec.id,
    methodName: spec.name,
    calls,
    atomNames,
  };
}

