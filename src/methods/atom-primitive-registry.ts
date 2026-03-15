import { AtomName } from '../atoms/types';

export type PrimitiveOp =
  | 'search_memories'
  | 'read_profiles'
  | 'score_candidates'
  | 'extract_hidden_assumptions'
  | 'generate_prereq_patch'
  | 'rewrite_with_patch'
  | 'compress_memory_units'
  | 'generate_one_step_inference'
  | 'store_memory_artifact';

export const ATOM_PRIMITIVE_REGISTRY: Record<AtomName, PrimitiveOp[]> = {
  decompose: ['search_memories', 'read_profiles', 'extract_hidden_assumptions', 'store_memory_artifact'],
  associate: ['search_memories', 'read_profiles', 'score_candidates', 'generate_one_step_inference', 'store_memory_artifact'],
  transform: ['search_memories', 'generate_prereq_patch', 'rewrite_with_patch', 'store_memory_artifact'],
  abstract: ['search_memories', 'read_profiles', 'compress_memory_units', 'store_memory_artifact'],
  evaluate: ['search_memories', 'read_profiles', 'score_candidates', 'store_memory_artifact'],
  iterate: ['search_memories', 'read_profiles', 'rewrite_with_patch', 'store_memory_artifact'],
};

export function describeAtomPrimitives(atom: AtomName): PrimitiveOp[] {
  return ATOM_PRIMITIVE_REGISTRY[atom] || [];
}

