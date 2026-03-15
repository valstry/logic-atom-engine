import { MemoryResult, StoredMemoryInfo } from '../api/types';
import { InterfaceGraph } from '../utils/interface-graph';

export type AtomName = 'decompose' | 'associate' | 'transform' | 'abstract' | 'evaluate' | 'iterate';
export type WorkflowMode =
  | 'general'
  | 'reading-understand'
  | 'reading-connect'
  | 'reading-apply'
  | 'reading-advanced';

export interface AtomExecutionOptions {
  mode?: WorkflowMode;
  objective?: string;
  synthesisGuidance?: string;
  workspaceName?: string;
  workflowLabel?: string;
  persistExecutionPlan?: boolean;
}

export interface AtomContext {
  input: string;
  initialMemories: MemoryResult[];
  initialProfiles: MemoryResult[];
  localGraph?: InterfaceGraph;
  previousSteps: AtomStepResult[];
  conversationId: string;
  mode: WorkflowMode;
  objective?: string;
  synthesisGuidance?: string;
}

export interface AtomStepResult {
  atom: AtomName;
  summary: string;
  output: string;
  memoriesRetrieved: MemoryResult[];
  memoriesStored: StoredMemoryInfo[];
  searchCount: number;
  storeCount: number;
  duration: number;
}

export interface LogicAtom {
  name: AtomName;
  description: string;
  execute(ctx: AtomContext): Promise<AtomStepResult>;
}

export interface AtomChainResult {
  input: string;
  atomNames: AtomName[];
  steps: AtomStepResult[];
  finalOutput: string;
  totalSearches: number;
  totalStores: number;
  totalDuration: number;
}
