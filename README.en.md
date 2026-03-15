# Logic Atom Engine

[中文说明](./README.md)

An Obsidian plugin for structured thinking and learning workflows, integrated with EverMemOS cloud memory.

## Overview

Logic Atoms are composable thinking primitives. The plugin orchestrates retrieval, storage, structured reasoning, and iterative correction around a stable execution flow.

## Features

- Auto-select or manually arrange atom chains
- Workspace-based workflow organization
- EverMemOS memory retrieval and storage
- Structured execution panel with step cards
- Current-note and selected-text execution
- Interface-oriented compression from A to A'
- A/A' consistency correction and one-step extension

## Installation

1. Clone this repo into your Obsidian plugins folder:

   ```bash
   cd /path/to/vault/.obsidian/plugins/
   git clone https://github.com/valstry/logic-atom-engine.git
   cd logic-atom-engine
   npm install
   npm run build
   ```

2. Enable the plugin in Obsidian Settings -> Community Plugins.

3. Configure the required EverMemOS and LLM settings in the plugin settings page.

## Commands

- `Open Logic Atom Panel`
- `Open Memory Sidebar`
- `Search Memories`
- `Run Logic Atom Flow On Selected Text`
- `Run Logic Atom Flow On Current Note`
- `Store Selected Text To Memory`

## Project Structure

```text
src/
  api/           EverMemOS API client and types
  atoms/         Decompose / Associate / Transform / Abstract / Evaluate / Iterate
  methods/       Method compiler and step resolver
  utils/         LLM client, interface graph, search-query helpers
  views/         Atom panel, memory sidebar, search modal
```

## Notes

- The technical plugin id remains `logic-atom-engine` for compatibility with existing Obsidian data directories.
- Public repository content does not include runtime `data.json` or local vault configuration.

## License

MIT
