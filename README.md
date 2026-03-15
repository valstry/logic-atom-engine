# Three Library - Logic Atom Engine

An Obsidian plugin that enables **structured thinking** through composable Logic Atoms, deeply integrated with [EverMemOS](https://www.evermemos.com/) cloud memory.

> Built for **EverMemOS Memory Genesis 2026** - Track 2: Platform Plugins

## Current Planning (2026-03)

- Chinese re-layout blueprint: docs/RELAYOUT_PLAN_ZH.md
- Method mapping protocol (primitive -> atom -> step resolver): src/methods/

## Core Concept

**Logic Atoms** are deterministic code functions that orchestrate EverMemOS API operations (search/add) to implement structured thinking patterns. Unlike pure LLM prompting, each atom follows a predictable CODE → LLM → CODE flow where:

- **CODE** controls all API calls, data flow, and storage decisions
- **LLM** only makes judgments within each atom (decomposition, scoring, pattern finding)
- Every step is **traceable, reproducible, and debuggable**

```
User Input
  ↓
AtomSelector (LLM picks 2-4 atoms)
  ↓
AtomEngine.executeChain()
  ├── Atom 1: Decompose  → search × 3-5, store × 1
  ├── Atom 2: Evaluate   → search × N, store × 1
  └── Synthesize final output
```

## The 6 Logic Atoms

| Atom | Purpose | Memory Ops |
|------|---------|------------|
| **Decompose** | Break complex problems into sub-questions | 3-5 searches + 1 store |
| **Associate** | Find cross-domain connections | 3-5 searches + 1-2 stores |
| **Transform** | View topic from multiple perspectives | 3 searches + 1-3 stores |
| **Abstract** | Extract high-level patterns | 1-2 searches + 1 store |
| **Evaluate** | Score and compare options | N searches + 1 store |
| **Iterate** | Refine through feedback rounds | 3 searches + 3 stores |

A typical execution makes **5-15 memory searches** and **3-6 memory stores**, deeply engaging EverMemOS for context-aware reasoning.

## Deep Memory Integration

Every atom actively reads and writes to EverMemOS:

- **Before thinking**: Search for relevant existing memories
- **During thinking**: Search for supporting evidence per sub-question/option/perspective
- **After thinking**: Store structured results back as new memories

This creates a **growing knowledge graph** that improves with use. Past decompositions inform future ones. Evaluations reference historical decisions. Patterns accumulate into reusable principles.

## Features

- **Auto Mode**: LLM automatically selects the best 2-4 atoms for your input
- **Manual Mode**: Choose and combine atoms yourself
- **Step Tracking**: Watch each atom execute with live progress
- **Memory Browser**: Sidebar to explore your EverMemOS memory
- **Search Modal**: Quick memory search from anywhere
- **Editor Integration**: Run on selected text or entire notes
- **Insert Results**: One-click insert atom results into your notes

## Installation

1. Clone this repo into your Obsidian plugins folder:
   ```bash
   cd /path/to/vault/.obsidian/plugins/
   git clone https://github.com/Valstry/obsidian-three-library.git
   cd obsidian-three-library
   npm install
   npm run build
   ```

2. Enable the plugin in Obsidian Settings → Community Plugins

3. Configure in Settings → Three Library:
   - **EverMemOS API Key**: Get from [memos-dashboard.openmem.net/apikeys/](https://memos-dashboard.openmem.net/apikeys/)
   - **OpenRouter API Key**: Get from [openrouter.ai](https://openrouter.ai/)

## Usage

### Quick Start

1. Click the brain icon in the ribbon, or use command palette: "Open Logic Atom Engine panel"
2. Type or paste a question
3. Click **"Auto Select & Run"** — the engine will:
   - Select the best atoms for your input
   - Execute each atom sequentially
   - Show live progress with memory stats
   - Synthesize a final answer

### Commands

| Command | Description |
|---------|-------------|
| `Open Logic Atom Engine panel` | Main thinking panel |
| `Open Memory Browser sidebar` | Browse and search memories |
| `Search memories` | Quick search modal |
| `Run on selected text` | Analyze selected text |
| `Run on current note` | Analyze the current note |
| `Store selected text to memory` | Save selection to EverMemOS |

### Example Scenarios

**Learning Path Planning**
> "How should I learn machine learning in 2026?"
> → Atoms: Decompose → Evaluate
> → Breaks into sub-topics, evaluates resources, stores learning plan

**Technical Decision Making**
> "Compare React, Vue, and Svelte for a new dashboard project"
> → Atoms: Decompose → Evaluate → Abstract
> → Decomposes criteria, evaluates each framework, extracts decision patterns

**Work Pattern Analysis**
> "What patterns exist in my work this month?"
> → Atoms: Associate → Abstract → Iterate
> → Finds connections, extracts patterns, refines insights

## Architecture

```
src/
├── main.ts              # Plugin entry point
├── settings.ts          # Settings UI
├── api/
│   ├── types.ts         # EverMemOS API types
│   └── client.ts        # API client (search + store)
├── atoms/
│   ├── types.ts         # AtomContext, AtomStepResult, LogicAtom
│   ├── engine.ts        # AtomEngine - chain execution
│   ├── selector.ts      # LLM-based atom auto-selection
│   ├── decompose.ts     # Decompose atom
│   ├── associate.ts     # Associate atom
│   ├── transform.ts     # Transform atom
│   ├── abstract.ts      # Abstract atom
│   ├── evaluate.ts      # Evaluate atom
│   └── iterate.ts       # Iterate atom
├── views/
│   ├── atom-panel.ts    # Main execution panel
│   ├── memory-sidebar.ts # Memory browser
│   └── search-modal.ts  # Quick search
└── utils/
    └── llm-client.ts    # OpenRouter LLM client
```

## API Integration

Uses EverMemOS Cloud API (`memos.memtensor.cn/api/openmem/v1`):

| Endpoint | Usage |
|----------|-------|
| `POST /search/memory` | Memory retrieval (5-15 calls per execution) |
| `POST /add/message` | Memory storage (3-6 calls per execution) |

Authentication: `Token {API_KEY}` header

## License

MIT

---

**三库架构 - 逻辑原子引擎** | Built with EverMemOS Cloud API

