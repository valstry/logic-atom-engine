# 逻辑原子引擎

[English](./README.en.md)

一个面向 Obsidian 的结构化思维与学习工作流插件，集成 EverMemOS 云端记忆能力。

## 概述

逻辑原子是一组可编排的思维原子。插件围绕稳定执行流组织检索、存储、结构化推理与迭代校正。

## 功能

- 自动选择或手动编排原子链
- 基于工作区的工作流组织
- EverMemOS 记忆检索与写入
- 带步骤卡片的结构化执行面板
- 支持当前笔记与选中文本执行
- 从原文 A 到接口集 A' 的压缩流程
- A/A' 一致性校正与一步延伸

## 安装

1. 将仓库克隆到 Obsidian 插件目录：

   ```bash
   cd /path/to/vault/.obsidian/plugins/
   git clone https://github.com/valstry/logic-atom-engine.git
   cd logic-atom-engine
   npm install
   npm run build
   ```

2. 在 Obsidian 设置 -> 社区插件中启用插件。

3. 在插件设置页中配置 EverMemOS 与 LLM 所需参数。

## 命令

- `打开逻辑原子面板`
- `打开记忆侧边栏`
- `搜索记忆`
- `对选中文本执行逻辑原子流程`
- `对当前笔记执行逻辑原子流程`
- `将选中文本存入记忆`

## 项目结构

```text
src/
  api/           EverMemOS API 客户端与类型
  atoms/         拆解 / 关联 / 变换 / 抽象 / 评估 / 迭代
  methods/       方法编译器与步骤解析器
  utils/         LLM 客户端、接口图、检索词辅助工具
  views/         原子面板、记忆侧边栏、搜索弹窗
```

## 说明

- 技术插件 id 保持为 `logic-atom-engine`，以兼容现有 Obsidian 数据目录。
- 公开仓库不包含运行时 `data.json` 或本地 vault 配置。

## 许可证

MIT
