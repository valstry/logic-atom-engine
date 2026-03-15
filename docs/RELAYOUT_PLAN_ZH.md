# Obsidian Three Library 重布局规划（学习工作流版）

## 1. 选择的项目文件夹
本次重布局规划基于以下项目目录：

- `D:\obsidian-three-library`

选择原因：

1. 这是你当前已接入 EverMind（EverMemOS API）的 Obsidian 插件工程。
2. 现有代码已经具备「检索记忆 + 原子链执行 + 回写 Markdown」能力。
3. 你的新目标不是重写平台，而是把平台能力转译成可执行的学习流程，这个仓库最匹配。

## 2. 统一产品定位（重定义）
从现在起，产品不再定位为「通用逻辑原子引擎」，而是：

**基于 EverMind 记忆/画像/预测能力的 AI 学习工作流插件。**

一句话职责分层：

- EverMind 负责「记住你、理解你、预测你」。
- 插件负责「把这些能力编排成低摩擦学习动作」。

本阶段第一优先级：

- **零基础可读性优先于分析复杂度。**
- 先保证普通用户能读懂专业文本和代码，再追求高级推理。

## 3. 你方法论与插件的统一逻辑
你现在给出的读书与记笔记方法，和插件能力可以合并成一个闭环。这个闭环可迁移到任意专业领域（代码、法律、医学、工程、金融等）：

1. 输入高熵文本（书摘、文章、课堂内容）。
2. 先搭框架和主问题，不逐字逐句。
3. 抽取专家隐含前提，并抓记忆单位（对象、定义、描述、关系、动作）。
4. 压缩成短笔记（短语/符号/口诀）。
5. 与原文对照，迭代修正。
6. 进入高级应用：基于短笔记做提问或一步推断。
7. 回写 Markdown + 写回 EverMind，沉淀为下一轮个性化输入。

这个闭环的核心不是「摘要」，而是：

- 压缩
- 对照
- 迭代
- 梯度引导

## 4. 高级应用的产品化定义（你特别强调的部分）
高级应用要基于「已经压缩后的短笔记」，不是基于整段原文直接发散。

高级应用输出固定为四项：

1. 延伸问题（Question）
2. 一步推断（One-step Inference）
3. 证据依据（Evidence）
4. 下一步动作（Next Action）

高级应用与 EverMind 预测的关系：

- 平台提供预测信号（例如近期易忘、行为倾向、优先主题）。
- 插件消费预测信号，决定提问难度和推断方向。
- 插件不自建预测系统，只做交互编排和输出落地。

## 5. 用户画像在学习系统中的作用（你提出的关键洞察）
用户画像不是展示用标签，而是学习引导器。

在本插件中，画像至少承担三类作用：

1. 学习成果评估
2. 内容差分判断（已知/新知/冲突）
3. 梯度式引导（下一轮该给你什么难度和什么类型任务）

建议把画像拆成三层：

1. 认知层
2. 行为层
3. 目标层

### 5.1 认知层（Knowledge State）
- 已掌握概念（mastered concepts）
- 新增概念（new concepts）
- 冲突概念（conflicting concepts）
- 待验证概念（to-verify concepts）

### 5.2 行为层（Learning Behavior）
- 常用阅读模式
- 笔记压缩深度
- 复盘频率
- 动作执行率

### 5.3 目标层（Outcome）
- 当前学习主题
- 本周目标
- 本轮最小可执行成果

## 6. 第一阶段目标模式（建议落地顺序）
先做四模式主流程：

1. 白话读懂（零基础理解）
2. 补齐基础（前置知识缺口）
3. 压缩笔记（记忆单位）
4. 高级应用（提问 + 一步推断，接平台预测）

对照优化放在第二阶段并入压缩流程。

## 7. 每个模式的输入输出契约（固定模板）
固定模板是你要的「低摩擦」关键，不依赖临时提示词。

### 7.1 模式 A：白话读懂
输入：

- 当前文本

调用：

- EverMind 检索：记忆 + 画像 + 预测信号（如果接口可得）

输出：

- 这段在讲什么（白话）
- 必懂概念（定义）
- 容易卡住的前置知识
- 一个最小例子

### 7.2 模式 B：补齐基础
输入：

- 当前文本
- 用户已有记忆/画像

输出：

- 已具备基础（推断）
- 缺失前置
- 三步补齐路径
- 补齐后回看原文的关键句

### 7.3 模式 C：压缩笔记
输入：

- 可读懂后的核心内容

输出（记忆单位）：

- 对象
- 定义/性质
- 描述词（程度词）
- 关系/动作
- 压缩表达（短语/符号/口诀）
- 一步推理
- 下一步动作

### 7.4 模式 D：高级应用
输入：

- 压缩后的短笔记
- 用户画像（认知层 + 行为层）
- 预测信号（优先主题/遗忘风险）

输出：

- 延伸问题（1-3 个）
- 一步推断（仅一步）
- 推断证据
- 下一步动作

## 8. 目标代码架构（目录重布局）
以下是建议目标结构（分层后可维护性更高）：

```text
src/
  main.ts
  settings.ts

  domain/
    models/
      memory-unit.ts
      learning-delta.ts
      learning-profile.ts
      guidance-level.ts
    contracts/
      workflow.ts
      pipeline-step.ts

  application/
    orchestrators/
      learning-orchestrator.ts
      markdown-orchestrator.ts
    services/
      differential-reader.ts
      note-compressor.ts
      note-optimizer.ts
      advanced-applier.ts
      guidance-engine.ts

  workflows/
    presets.ts
    templates.ts
    mode-definitions.ts

  pipelines/
    differential/
      run.ts
    compression/
      run.ts
    optimize/
      run.ts
    advanced/
      run.ts

  infrastructure/
    evermind/
      client.ts
      memory-repository.ts
      profile-repository.ts
      prediction-repository.ts
      mappers.ts
    llm/
      client.ts
      prompt-builder.ts

  ui/
    views/
      learning-panel.ts
      memory-sidebar.ts
      search-modal.ts
    components/
      workflow-switcher.ts
      result-renderer.ts

  markdown/
    templates/
      differential-template.ts
      compression-template.ts
      optimize-template.ts
      advanced-template.ts
    writer.ts

  legacy/
    atoms/
      decompose.ts
      associate.ts
      transform.ts
      abstract.ts
      evaluate.ts
      iterate.ts
      engine.ts
      selector.ts
```

说明：

1. `legacy/atoms` 保留旧能力，便于平滑迁移。
2. 新增 `domain/application/infrastructure` 后，逻辑会从「原子驱动」转为「学习流程驱动」。
3. 高级应用从一开始就作为独立模块设计，不塞进普通摘要流程。

## 9. 现有文件到新结构的映射（迁移视图）
当前文件与目标归位建议：

1. `src/workflows.ts` -> `src/workflows/presets.ts`
2. `src/atoms/engine.ts` -> `src/application/orchestrators/learning-orchestrator.ts`
3. `src/views/atom-panel.ts` -> `src/ui/views/learning-panel.ts`
4. `src/api/client.ts` -> `src/infrastructure/evermind/client.ts`
5. `src/api/types.ts` -> `src/infrastructure/evermind/mappers.ts` + `src/domain/models/*`
6. `src/atoms/*.ts` -> `src/legacy/atoms/*`（短期）或分解迁移到 `src/application/services/*`

## 10. 分阶段实施计划（建议 4 个迭代）

### 迭代 1：定位与模式固定（低风险）
目标：

1. 完成命名统一（学习工作流插件）
2. 固定四模式输出模板（读懂/补基/压缩/高阶）
3. 保留现有引擎，先不拆大结构

交付：

- 统一文案
- 统一模板
- 新 workflow preset

### 迭代 2：分层改造（中风险）
目标：

1. 引入 domain + application 层
2. 把模式逻辑从原子拼接中剥离
3. 建立标准输入输出 contract

交付：

- `learning-orchestrator`
- `differential-reader / note-compressor / note-optimizer`

### 迭代 3：高级应用接入（中高价值）
目标：

1. 新增 Advanced 模式
2. 基于短笔记生成问题与一步推断
3. 使用画像与预测信号做难度分层

交付：

- `advanced-applier.ts`
- `guidance-engine.ts`
- 高级应用模板

### 迭代 4：学习成果追踪（高价值）
目标：

1. 定义可量化学习指标
2. 在 Markdown 中展示每轮学习增量
3. 回写 EverMind 形成长期学习档案

交付：

- 学习增量报告（新增/冲突解决/动作完成）
- 梯度引导建议（下一步学习建议）

## 11. 关键数据结构（建议）
建议新增以下领域模型：

1. `MemoryUnit`
2. `LearningDelta`
3. `LearningProfile`
4. `GuidancePlan`
5. `AdvancedApplicationResult`

建议字段如下：

### 11.1 MemoryUnit
- `object`
- `definition`
- `descriptors`
- `relations`
- `action`
- `compressed`

### 11.2 LearningDelta
- `known`
- `new`
- `conflict`
- `worthRemembering`
- `worthPracticing`

### 11.3 GuidancePlan
- `level`
- `focusTopics`
- `questionStyle`
- `inferenceConstraint`（固定一步）
- `nextAction`

## 12. 交互原则（防止再次滑回“泛化摘要器”）
必须坚持以下约束：

1. 不做自由聊天为主入口。
2. 不把预测逻辑复制到插件内部。
3. 不把用户画像只当展示标签。
4. 所有模式都要有固定输出结构。
5. 最终都要回写 Markdown。
6. 一步推断必须有边界，不允许多跳发散。

## 13. 第一批验收标准（Definition of Done）
当以下条件满足，可判定第一阶段完成：

1. 用户在一个面板内完成：白话读懂 -> 补齐基础 -> 压缩笔记 -> 高级应用。
2. 每个模式输出都符合模板，无需手写提示词。
3. 结果可一键插入当前笔记，且结构稳定。
4. 可读取 EverMind 返回的 `profiles` 并进入流程。
5. 高级应用可从短笔记生成提问和一步推断（即使预测接口先用占位数据）。

## 14. 你接下来给“读书方法”的接入方式
你后续新增的方法，不直接改底层引擎，而是以「流程配置」接入：

1. 定义方法步骤
2. 映射到四模式中的一个或多个环节
3. 为该方法提供模板和按钮
4. 复用同一套回写和画像机制

这样可以保证：

- 增加新方法成本低
- 不破坏主架构
- 用户体验稳定
