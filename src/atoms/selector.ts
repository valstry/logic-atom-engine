import { LLMClient } from '../utils/llm-client';
import { AtomName } from './types';

const VALID_ATOMS: AtomName[] = ['decompose', 'associate', 'transform', 'abstract', 'evaluate', 'iterate'];

const SELECTOR_SYSTEM_PROMPT = `You are an atom selector for a structured thinking engine. Given a user's input, select 2-4 thinking atoms that would best help process the input.

Available atoms:
- decompose: Break complex problems into sub-questions. Best for: multi-faceted questions, complex tasks, "how to" questions.
- associate: Find connections between different concepts. Best for: brainstorming, finding patterns across domains, creative thinking.
- transform: View a topic from multiple perspectives. Best for: reframing problems, understanding different viewpoints, creative solutions.
- abstract: Extract high-level patterns and principles. Best for: finding rules, generalizing from specifics, identifying meta-patterns.
- evaluate: Score and compare options systematically. Best for: decision-making, comparisons, pros/cons analysis.
- iterate: Refine through multiple rounds of feedback. Best for: improving drafts, refining ideas, optimization.

Rules:
1. Select 2-4 atoms (never more, never less)
2. Order matters — atoms execute sequentially, each building on previous results
3. Respond with ONLY a JSON array of atom names, nothing else

Examples:
Input: "How should I learn machine learning?"
Output: ["decompose", "evaluate"]

Input: "What connects philosophy and programming?"
Output: ["associate", "abstract"]

Input: "Compare React vs Vue for my project"
Output: ["decompose", "evaluate", "abstract"]

Input: "Help me improve my essay about climate change"
Output: ["decompose", "transform", "iterate"]`;

export class AtomSelector {
  private llmClient: LLMClient;

  constructor(llmClient: LLMClient) {
    this.llmClient = llmClient;
  }

  async selectAtoms(input: string): Promise<AtomName[]> {
    try {
      const response = await this.llmClient.complete(
        SELECTOR_SYSTEM_PROMPT,
        input,
        0.2
      );
      return this.parseAtomNames(response);
    } catch (e: any) {
      console.warn('[LogicAtom Selector] fallback due to selector error:', e?.message || String(e));
      // Fallback chain: stable and broadly useful for most inputs.
      return ['decompose', 'abstract', 'evaluate'];
    }
  }

  private parseAtomNames(response: string): AtomName[] {
    // Extract JSON array from response
    const match = response.match(/\[([^\]]+)\]/);
    if (!match) {
      // Fallback: decompose + evaluate
      return ['decompose', 'evaluate'];
    }

    try {
      const parsed = JSON.parse(match[0]) as string[];
      const valid = parsed.filter((name): name is AtomName =>
        VALID_ATOMS.includes(name as AtomName)
      );

      if (valid.length < 2) return ['decompose', 'evaluate'];
      if (valid.length > 4) return valid.slice(0, 4);
      return valid;
    } catch {
      return ['decompose', 'evaluate'];
    }
  }
}
