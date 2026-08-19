# Munder Difflin DIY 可行性与功能价值分析结论

## 1. 结论

Munder Difflin 适合作为“多模型 Agent 协作 + 角色化像素世界”产品的二次开发底座，优先级高于从零继续建设同类深度 DIY 系统。

项目已经实现了成本最高、耦合最深的基础能力：

- 以真实 CLI 进程运行不同厂商的 Agent，而不是模拟对话；
- 通过 Michael 总调度 Agent、Hive 文件协议和消息路由组织多 Agent 协作；
- 将终端、任务、消息、状态和工具活动映射到像素办公室；
- 提供 Worktree 隔离、人工介入、预算、断路器和优雅停止；
- 提供任务、记忆、知识库、触发器、集成、IDE 和技能管理等控制面。

推荐保留 PTY、Hive、像素办公室、Worktree 和 Command Center 主体，只在外围实施汉化、模型适配、安全默认值、中国化角色模板和必要的产品收敛。不要先重写 Agent 调度内核。

## 2. 分析基线与代码规模

分析基线为项目 `v0.4.4` 源码。静态规模如下：

| 范围 | 规模 |
| --- | ---: |
| `src` 文件 | 约 206 个 |
| Renderer TypeScript/CSS | 约 33,389 行 |
| Main、Preload、Shared | 约 24,367 行 |
| TSX 界面文件 | 72 个 |
| 测试文件 | 39 个 |

测试主要覆盖 Provider 配置、Hive、队列、任务、终端恢复、控制与断路器、Git 图、Skills、Slack、Webhook、知识库和更新状态。当前未发现专门的国际化测试、截图回归或端到端 UI 测试。

## 3. 汉化可行性与边界

### 3.1 结论

整体汉化可行，但不能使用 DOM 运行时替换或全仓字符串搜索替换。项目当前没有 i18n 框架，用户可见文案分散在 Renderer、Electron 主进程、共享配置和错误返回中，需要先建立语言资源边界。

静态 AST 粗扫得到以下量级：

- 约 62 个界面文件含用户可见英文候选；
- 约 1,863 处界面候选文案；
- 约 1,123 条不重复候选英文；
- Main/Shared 还存在大量错误、状态、通知和对话框提示。

候选数量包含部分状态常量和技术标识，只用于评估工作量，不作为翻译资源的最终清单。文案最集中的入口是：

| 文件 | 主要内容 |
| --- | --- |
| [`SettingsModal.tsx`](../../src/renderer/src/components/SettingsModal.tsx) | 七类全局设置 |
| [`OnboardingWizard.tsx`](../../src/renderer/src/components/OnboardingWizard.tsx) | 首次启动向导 |
| [`CommandCenterPanel.tsx`](../../src/renderer/src/components/CommandCenterPanel.tsx) | Michael 总控中心 |
| [`AddAgentModal.tsx`](../../src/renderer/src/components/AddAgentModal.tsx) | Agent 创建与 Provider 配置 |
| [`IdePanel.tsx`](../../src/renderer/src/ide/IdePanel.tsx) | IDE 与 Git 工作区 |
| [`IntegrationsRegistry.tsx`](../../src/renderer/src/components/IntegrationsRegistry.tsx) | 外部集成 |

### 3.2 翻译范围

应当汉化：

- 导航、标题、按钮、表单、Tooltip 和无障碍标签；
- 首次启动、设置、Agent 创建和控制界面；
- 任务、消息、记忆、知识、触发器、集成和 Skills 界面；
- Electron 对话框、通知、错误和恢复提示；
- 产品内置的角色说明、功能说明和安全警告。

保留英文标识并补充中文解释：

- Provider、模型和产品名称；
- CLI 命令、参数、环境变量和模型 ID；
- Git 分支、SHA、状态码、路径和 JSON 字段；
- 工具调用名、Hook 名和协议枚举值。

第一阶段禁止翻译：

- Hive 内部消息协议和字段；
- Provider Hook 事件与生命周期协议；
- 注入 Agent 的协作协议正文；
- CLI 原始终端输出；
- Provider wire protocol。

最后一类内容属于机器合同，直接翻译可能造成 Agent 无法收件、无法回信或生命周期判断失效。Agent 的自然语言回复可以另行增加“默认使用中文”的可配置提示，但不应修改协议字段。

### 3.3 推荐实现

推荐引入 `i18next + react-i18next`，至少提供：

- `zh-CN`；
- `en-US`；
- 缺失 Key 回退到英文；
- 插值、复数和状态映射；
- 开发环境缺失 Key 检查。

Renderer 使用 React Hook；Electron Main 使用共享的轻量 `t()` 接口。Provider、模型和协议枚举继续使用稳定 ID，只翻译展示层 Label。

字体也必须纳入汉化。当前标题字体 `Press Start 2P` 不包含中文字形，中文会回退到系统字体；大量 7–10px 固定字号和窄面板可能出现截断。需要增加中文像素风或清晰的 CJK 字体栈，并对首次向导、Settings、Command Center、Agent Modal 和任务卡进行截图回归。

### 3.4 推荐分波

1. 建立 locale 状态、资源目录、语言切换和中文字体；
2. 汉化首次向导、顶部导航和 Settings；
3. 汉化 Add Agent、Command Center、任务和消息主链；
4. 汉化记忆、知识、触发器、集成和 Skills；
5. 汉化 IDE、Git、更新、通知和错误；
6. 增加缺失 Key、超长文本和中英文截图回归；
7. 最后再评估 Agent 默认中文回复，不改 Hive 协议。

## 4. 功能地图与价值判断

| 功能域 | 已实现能力 | 价值 | 成熟度判断 |
| --- | --- | --- | --- |
| 多 Provider Agent | Claude、Codex、Grok、Kimi、Antigravity、Qwen、OpenCode、Crush、Pi、Copilot 和 Custom | 极高 | Provider 间能力不完全等价 |
| Michael 总调度 | 请求分流、任务分配、团队管理和人工升级 | 极高 | 核心已实现 |
| 像素办公室 | 角色、座位、走动、工具气泡、消息信封和任务板 | 极高 | 真实状态驱动，不是纯演示动画 |
| 真实终端 | 每个 Agent 运行独立 `node-pty` 进程，可观看、输入和恢复 | 极高 | 核心已实现 |
| Hive 协作 | 注册表、Inbox/Outbox、共享任务板、事件日志和记忆文件 | 极高 | 核心已实现 |
| Git Worktree | 为 Agent 创建隔离工作目录，减少并行修改冲突 | 极高 | 已实现 |
| Command Center | Terminal、Monitor、Tasks、Ask Me、Triggers、History、Memory、Graph、Activity、Skills、Workers | 极高 | 已实现 |
| 任务管理 | Todo/Doing/Blocked/Done、依赖、优先级、分配和人工问题 | 高 | 已实现 |
| 控制与安全 | Pause、Resume、Steer、Graceful Halt、工具门禁、预算和断路器 | 极高 | 已实现，默认策略仍需收紧 |
| 长期记忆 | Markdown 记忆、语义检索、反思和关系图 | 高 | 部分能力依赖附加组件 |
| 知识库 | 文档/图片导入、切片、标签、检索和模态统计 | 高 | 已有本地实现 |
| 自动触发 | Schedule、上下文阈值、Webhook 和组织触发 | 高 | 已实现，公网入口需安全治理 |
| 外部集成 | Slack、Webhook、GitHub Issues/CI、MCP 和 Provider Key | 高 | 依赖外部服务配置 |
| 内置 IDE | Monaco、文件树、编辑、Diff、历史和分支比较 | 中 | 有用，但与专业 IDE 重叠 |
| Skills | 本地 Skill 检查、远程目录浏览、安装和卸载 | 中 | 有供应链风险，需要信任策略 |
| Voice | Groq 转录、OpenAI Realtime Michael 和语音操作 | 中 | 依赖 API Key、权限和成本 |
| 角色导入 | `munderdifflin://hire` 清单导入和角色预填 | 中 | 保留人工确认，不会自动 Spawn |
| 办公室主题 | The Office、Brooklyn Nine-Nine 及其他主题入口 | 中 | 仅两个主题具备真实地图，其余为占位 |
| 前置检查与更新 | CLI、Node、Git 检查、安装阶梯和应用更新 | 中高 | 产品化价值较高 |

核心功能入口证据：

- Provider 合同：[`agentProvider.ts`](../../src/shared/agentProvider.ts)
- Michael 总控标签：[`CommandCenterPanel.tsx`](../../src/renderer/src/components/CommandCenterPanel.tsx)
- Hive 实现：[`hive.ts`](../../src/main/hive.ts)
- PTY 生命周期：[`pty.ts`](../../src/main/pty.ts)
- 任务模型：[`TasksKanban.tsx`](../../src/renderer/src/components/TasksKanban.tsx)
- 控制与断路器：[`control.ts`](../../src/main/control.ts)、[`breaker.ts`](../../src/main/breaker.ts)
- 知识库：[`knowledge.ts`](../../src/main/knowledge.ts)
- Git/Worktree：[`git.ts`](../../src/main/git.ts)

## 5. 最有价值的产品组合

### 5.1 多模型 CLI + 统一调度

项目不重新实现每个模型 API，而是运行用户已有的 Agent CLI。每个 Agent 可以使用不同 Provider 和模型，Michael 作为统一入口进行拆分和调度。这与“不同模型可配置、可切换并互相配合”的目标高度一致。

### 5.2 协作过程可视且可干预

像素角色不是孤立动画，而是 Agent 状态、终端、工具活动、消息和任务的可视化投影。用户既能获得角色化、游戏化体验，也能看到真实工作证据并中途干预。

### 5.3 本地优先的轻量控制面

Hive 主要使用本地文件、SQLite、消息信箱和日志，不要求先建设中心服务。这显著降低个人或小团队的部署与维护成本。

### 5.4 Worktree + 人工控制 + 断路器

项目已具备并行 Agent 最需要的工作隔离和控制机制。断路器采用 `steer → constrain → stop` 的渐进策略，而不是直接杀进程；配合预算、工具门禁和人工审批，可以作为后续安全增强的基础。

### 5.5 任务、记忆和触发器形成长期运行闭环

任务板、Agent 记忆、语义检索、定时任务和 Webhook 让产品不只是一组聊天窗口，而是可以持续运行和恢复的本地 Agent 工作环境。

## 6. 成熟度与风险边界

### 6.1 Provider 支持不完全等价

Provider 预设共十种加 Custom，其中 Kimi、Copilot 和 Custom 当前不能直接接收 Hive Inbox。Qwen、OpenCode、Crush 和 Pi 的部分 Bridge 在源码中仍标注 `TODO-verify` 或 `LIVE-UNVERIFIED`。首条可靠主链应优先验证 Codex，随后验证 Antigravity/Claude，再扩大到其他 Provider。

当前环境还存在 Codex 启动形态差异：项目的 Codex Remote Daemon 期望 Codex Installer 管理的 standalone 固定路径，而 ChatGPT App 内置 Codex 不具备该路径。程序会回退到本地 Codex TUI，因此 UI 可以运行，但 Remote Daemon、会话恢复和 Hook 闭环必须单独验收。DIY 时应增加 Codex 可执行文件来源探测，或明确要求 standalone 安装。

### 6.2 Auto Mode 默认值过于激进

Codex Auto Mode 使用 `--dangerously-bypass-approvals-and-sandbox`，会绕过审批和沙箱。面向真实用户的版本应默认关闭 Auto Mode，并按测试项目、普通项目、受保护项目提供权限分级。

### 6.3 主题完成度不一致

六个主题入口中，The Office 和 Brooklyn Nine-Nine 具备真实地图；Friends、Silicon Valley、Game of Thrones 和 Harry Potter 仍回退到默认办公室。未完成主题不应在中文产品中表现为正式可用功能。

### 6.4 公网和供应链能力需要单独治理

Slack、Webhook、Tunnel 和远程 Skills 会引入公网暴露、凭据、第三方内容和安装脚本风险。默认保持本地运行；公网入口需要身份验证、最小权限、速率限制、审计和明确的人工启用过程。

### 6.5 依赖治理

项目依赖包含原生模块和较旧依赖链，Node 26 无法完成当前 `better-sqlite3` 安装，Node 22 可以正常构建。应增加 `.nvmrc`、`engines` 或等价版本约束，并在长期自用前完成依赖漏洞审计和升级验证。

### 6.6 个人自用素材边界

本 DIY 定位为个人非商业自用，不将商业授权、商业发布或素材替换纳入实施 Gate 和时间预算。保留 [`LICENSE`](../../LICENSE) 与 [`ATTRIBUTION.md`](../../src/renderer/src/assets/ATTRIBUTION.md)，不单独对外分发 LimeZu 及其衍生像素素材。如未来从个人自用改为公开或商业分发，再另立边界复核，不阻塞当前 DIY。

## 7. 推荐 DIY 路线

### M1：中文基础与核心可用性

- 建立 `zh-CN/en-US` i18n；
- 增加 CJK 字体和布局回归；
- 完成首次向导、Settings、Add Agent、Command Center 主链汉化；
- 默认关闭 Auto Mode 和匿名遥测；
- 固定 Node 22 开发基线。

### M2：Codex 黄金主链

- 明确 standalone Codex 与 ChatGPT App 内置 Codex 的发现策略；
- 验证 Michael 启动、派单、Worker 执行、回信、任务完成和恢复；
- 验证关闭 Auto Mode 时的人工审批；
- 验证 Worktree 隔离和 Git 状态保护。

### M3：Gemini 与 DeepSeek Provider

- 区分项目现有 `agy` Antigravity 和官方 `gemini` CLI；
- 为官方 Gemini CLI 建立独立 Provider 合同；
- 验证初始提示、Hook、Inbox Drain、恢复和模型选择；
- 不通过伪装成 `agy` 的方式复用未经验证参数。
- 新增用户可直接选择的 `deepseek` Provider 入口，但不在 Electron 内重写 Agent Loop；
- 优先验证“独立 DeepSeek 展示/Provider ID + OpenCode 运行引擎 + DeepSeek API”，复用已有 OpenCode 生命周期 Bridge；
- 将第三方 `deepseek` TUI 仅作备选，只有当安装来源、沙箱/权限、Hook、Inbox、恢复和 per-agent 配置均可验时才采用；
- Key 只由 Main/运行引擎从环境或独立认证存储获取，不进 Renderer、日志、Prompt 或 `.work` 收据。

### M4：中文角色与协作模板

- 建立中文产品经理、架构师、开发、测试和审查角色；
- 建立中文任务合同和协作话术；
- 只配置自然语言输出，不修改 Hive 协议；
- 提供可审查的 Hire Manifest。

### M5：安全与长期运行

- 权限分级、预算模板和受保护路径；
- Trigger、Webhook、Slack 和 Skills 信任策略；
- 凭据存储、审计、限流和故障恢复；
- 中英文错误与恢复路径统一。

### M6：选择性产品增强

- 根据真实使用频率决定是否深化 Voice、Knowledge Graph、IDE 和更多主题；
- 未形成稳定主链前，不扩张新的像素世界玩法；
- 只维护个人自用需要的本地启动、备份、升级和故障恢复能力。

## 8. 产品决策

推荐将 Munder Difflin 作为独立 Fork 维护，不直接混入原有深度 DIY 项目。产品定位收敛为：

> 一个本地优先、可配置不同模型、可让多个真实 CLI Agent 协作，并以像素办公室呈现状态和角色关系的中文 Agent 工作环境。

短期成功标准不是覆盖所有 Provider 和功能，而是先形成一条稳定、可观察、可停止、可恢复的中文 Codex 多 Agent 黄金主链。完成后再扩展 Gemini、DeepSeek、角色模板、自动触发和更多游戏化表现。
