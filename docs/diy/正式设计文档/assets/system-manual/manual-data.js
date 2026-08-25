window.MUNDER_MANUAL_DATA = {
  version: "1.0",
  updatedBy: "正式设计 00",
  layers: [
    {
      id: "munder",
      name: "Munder",
      icon: "🏢",
      metaphor: "办公楼、前台和控制室",
      summary: "把真实 Agent Runtime 组织成可观察、可干预、可恢复的像素办公室。",
      owns: ["地图、人物、队列和终端投影", "Provider 进程与 IPC", "投递、审批、暂停、恢复和 Secret Broker"],
      notOwns: ["模型内部推理历史", "项目业务合同", "Team OS 长期制度"],
      reads: ["Team OS 项目/角色索引", "Hive 状态", "Provider 事件", "项目权威路径"],
      writes: ["Hive 任务与运行投影", "Provider Turn 或 PTY 输入", "Renderer 页面状态"],
      source: "正式设计 01 · src/main/index.ts",
      href: "../../01-Munder-Difflin多Agent角色办公室架构与运行机制.md",
      color: "#6c63ff"
    },
    {
      id: "team-os",
      name: "Team OS",
      icon: "📚",
      metaphor: "公司章程、岗位手册和项目通讯录",
      summary: "保存跨项目稳定的组织制度、角色能力、工作流和项目地址卡。",
      owns: ["组织原则与协作拓扑", "岗位/能力机器目录", "项目注册与适配器", "结果模板和长期评测"],
      notOwns: ["当前任务与 Session", "项目正文", "运行日志和 Transcript"],
      reads: ["由 Munder 有界、默认只读加载"],
      writes: ["只由用户或获准维护任务修改；运行时不反写"],
      source: "正式设计 04 · ~/Munder-Difflin/team-os",
      href: "../../04-Munder-Difflin个人团队操作系统与多项目工作流分层设计.md",
      color: "#9061f9"
    },
    {
      id: "hive",
      name: "Hive",
      icon: "🐝",
      metaphor: "当前办公室的花名册、邮局和任务簿",
      summary: "保存这间办公室正在发生的协作事实，并提供进程重启后的恢复索引。",
      owns: ["Agent 实例与角色投影", "Inbox/Outbox 消息", "Tasks、Board、Fleet", "memory.md 与 runtime.json"],
      notOwns: ["完整 Provider Transcript", "Team OS 制度", "项目正式设计"],
      reads: ["Main、Michael 与对应 Agent 按最小范围读取"],
      writes: ["Main Router 单写跨目录投递；Agent 只写自己的边界"],
      source: "正式设计 01 §6/9 · src/main/hive.ts",
      href: "../../01-Munder-Difflin多Agent角色办公室架构与运行机制.md#6-harness-与持久目录",
      color: "#e3a239"
    },
    {
      id: "codex",
      name: "Codex App Server",
      icon: "🧠",
      metaphor: "Codex 员工的原生电脑和大脑",
      summary: "以 Codex Harness 的 Thread/Turn 协议执行推理、工具、审批、事件和恢复。",
      owns: ["Thread 与 Turn", "工具调用和审批", "原生实时事件与用量", "Provider 上下文与压缩"],
      notOwns: ["团队任务账本", "其他 Agent 信箱", "项目外授权"],
      reads: ["隔离 CODEX_HOME/AGENTS.md", "cwd 分层 AGENTS", "当前 Turn 与所选 Skills"],
      writes: ["目标 Workspace/Worktree", "自身 Session/状态存储", "结构化事件回传 Main"],
      source: "src/main/codexAppServer.ts · codexNativeRuntime.ts",
      href: "../../../../../src/main/codexAppServer.ts",
      color: "#24a978"
    },
    {
      id: "other",
      name: "其他 Provider",
      icon: "🔌",
      metaphor: "使用不同接口的专业设备",
      summary: "Gemini、DeepSeek 等保留各自 CLI、Session 和真实能力，通过 PTY/Hook Bridge 接入办公室。",
      owns: ["各 CLI 的 Session 和工具循环", "Provider 原生配置和输出", "可证明的 Hook/Plugin 状态"],
      notOwns: ["伪造的 Codex Thread 能力", "跨 Agent 路由", "统一认证目录"],
      reads: ["最短角色内核", "Hive 工作单", "目标项目权威"],
      writes: ["自身 Provider Home", "授权工作区", "Hook/PTY 生命周期投影"],
      source: "正式设计 01 §8 · src/main/pty.ts / hooks.ts",
      href: "../../01-Munder-Difflin多Agent角色办公室架构与运行机制.md#8-provider-抽象与生命周期-bridge",
      color: "#de6878"
    },
    {
      id: "project",
      name: "项目仓库",
      icon: "🏭",
      metaphor: "真正生产成果的工厂和资料库",
      summary: "项目自己的规则、设计、代码、Gate 和生产事实始终留在项目内。",
      owns: ["项目 AGENTS.md", "正式设计与业务合同", "机器计划与 Gate", "代码、测试和运行事实"],
      notOwns: ["其他项目规则", "Munder 人物 Session", "Team OS 通用制度"],
      reads: ["由命中本项目任务的 Agent 按需读取"],
      writes: ["仅在当前任务授权与项目合同允许的范围内"],
      source: "项目自己的 AGENTS.md 与正式设计",
      href: "../../00-Munder-Difflin系统说明书.md#4-一次工作怎样从一句话跑到完成",
      color: "#3f86e8"
    }
  ],
  taskSteps: [
    { actor: "human", icon: "💬", title: "先讨论，不立刻组队", text: "你和 Michael 在同一 Thread/Session 中把想法、方案和取舍讨论到满意。普通讨论不创建任务。", target: "munder" },
    { actor: "human", icon: "🚦", title: "明确触发开始", text: "你说或点击“按结论开始推进”。系统只打开项目适配器允许的本地工作，不隐式开放 Git、远端、生产或破坏性能力。", target: "munder" },
    { actor: "michael", icon: "🗂️", title: "定位制度与项目", text: "Michael 通过 Team OS 找到项目、角色和 Workspace 索引，再直接读取项目 AGENTS、规范、正式设计与机器入口。", target: "team-os" },
    { actor: "michael", icon: "🧩", title: "生成最小 Plan Manifest", text: "Michael 定义 outcome、non-goals、DAG、角色、能力、读写集合、验收、时间预算、Gate 和停止条件。", target: "munder" },
    { actor: "coordinator", icon: "🧮", title: "确定性校验，而不是第二个模型", text: "PlanCoordinator 校验 schema、依赖、并发写冲突、项目边界和授权；失败就把精确错误交回同一 Michael 修正。", target: "munder" },
    { actor: "hive", icon: "📮", title: "把计划落成岗位和信件", text: "合法计划写入 Plan 状态、Hive Tasks 与 Inbox；串行任务优先复用人物和 Session，真正并行才创建第二实例。", target: "hive" },
    { actor: "runtime", icon: "⚙️", title: "真实 Provider 开始执行", text: "Codex 走 turn/start 或 turn/steer；Gemini/DeepSeek 等通过 PTY 安全门接收工作单。每个 Agent 在授权工作区实施与验证。", target: "codex" },
    { actor: "workers", icon: "📦", title: "只回传结构化交接和证据", text: "员工把结果、变更集合、验证和证据路径回信，不复制完整 Transcript，也不把大制品塞入 Inbox。", target: "project" },
    { actor: "michael", icon: "✅", title: "Michael 跨 Lane 综合并按 Gate 汇报", text: "Hive 汇聚任务和运行事实；Michael 复核集成、等待项与 Gate，Munder 把真实状态投影给你。", target: "munder" }
  ],
  files: {
    "hive": [
      { path: "hive/registry.json", icon: "🪪", name: "花名册与恢复索引", owner: "Main 原子更新", stores: "Agent ID、Provider、岗位绑定、最近 Session、归档状态", excludes: "完整实时状态和 Transcript" },
      { path: "hive/fleet.json", icon: "🚦", name: "当前值班快照", owner: "Main 周期汇总", stores: "状态、用量、最近工具、断路器、Inbox 积压", excludes: "稳定角色合同和项目事实" },
      { path: "hive/tasks.json", icon: "📋", name: "结构化任务簿", owner: "Hive Task API", stores: "负责人、状态、依赖、Conversation 引用", excludes: "Board 叙事和模型推理" },
      { path: "hive/board.md", icon: "📌", name: "Michael 公告板", owner: "Michael", stores: "面向人的当前协作摘要", excludes: "第二套任务数据库" },
      { path: "hive/agents/<id>/identity.md", icon: "🪪", name: "员工工牌", owner: "Main 按注册信息刷新", stores: "姓名、岗位、能力、cwd、语言", excludes: "本次任务全文" },
      { path: "hive/agents/<id>/memory.md", icon: "🧠", name: "长期笔记", owner: "对应 Agent", stores: "跨 Session 仍有效的提炼事实", excludes: "Transcript、心跳、秘密" },
      { path: "hive/agents/<id>/inbox/", icon: "📥", name: "收件箱", owner: "Main Router", stores: "送达该 Agent 的结构化消息", excludes: "其他 Agent 的私有推理" },
      { path: "hive/agents/<id>/outbox/", icon: "📤", name: "发件箱", owner: "对应 Agent", stores: "准备发送的结构化消息", excludes: "直接写其他 Agent 目录的权限" },
      { path: "hive/agents/<id>/runtime.json", icon: "🔖", name: "原生运行书签", owner: "Codex Native Runtime", stores: "Thread/Turn 状态和有界消息防重索引", excludes: "Prompt、Transcript、Key" }
    ],
    "team-os": [
      { path: "team-os/AGENTS.md", icon: "📜", name: "通用短内核", owner: "Team OS Git", stores: "协作底线、上下文和维护规则", excludes: "项目专属机器合同" },
      { path: "team-os/roles/capabilities.yaml", icon: "🧰", name: "岗位与能力目录", owner: "Team OS Git", stores: "稳定角色 ID、权限、写策略、盲点、专业能力", excludes: "人物名称和本次任务授权" },
      { path: "team-os/workflows/", icon: "🔄", name: "通用工作流", owner: "Team OS Git", stores: "对话式规划、自适应协作、交接与状态合同", excludes: "项目 Gate 的副本" },
      { path: "team-os/projects/registry.json", icon: "🗃️", name: "项目列表", owner: "Team OS Git", stores: "项目 ID、名称和 Adapter", excludes: "项目正文" },
      { path: "team-os/projects/adapters/*.yaml", icon: "🗺️", name: "项目地址卡", owner: "Team OS Git", stores: "权威路径、Workspace/Gate 入口与能力约束", excludes: "因登记而产生的写授权" }
    ],
    "provider": [
      { path: "hive/agents/<id>/.codex/", icon: "🧠", name: "Codex 隔离 Home", owner: "对应 Codex Runtime", stores: "认证链接、配置、Thread/Session、角色 AGENTS 和 Skills", excludes: "其他 Agent Session" },
      { path: "hive/agents/<id>/.gemini-cli/", icon: "💎", name: "Gemini 隔离 Home", owner: "对应 Gemini CLI", stores: "Gemini 配置和 Session", excludes: "Codex Thread 语义" },
      { path: "hive/agents/<id>/.opencode/", icon: "🐋", name: "DeepSeek/OpenCode Home", owner: "对应 OpenCode Runtime", stores: "OpenCode 配置、插件和 Session", excludes: "伪造的原生 App Server 能力" },
      { path: "hive/cache/codex/", icon: "🧱", name: "办公室公共 Codex 缓存", owner: "Main 缓存管理", stores: "公开插件目录和不可变插件版本", excludes: "认证、角色、Session、日志" }
    ],
    "project": [
      { path: "<project>/AGENTS.md", icon: "🛡️", name: "项目执行内核", owner: "项目仓库", stores: "项目安全红线、流程路由和完成合同", excludes: "其他项目规则" },
      { path: "<project>/docs/", icon: "📐", name: "项目权威设计", owner: "项目仓库", stores: "业务、实现、生产和正式设计", excludes: "Hive 动态流水" },
      { path: "<project>/.agents/config/", icon: "⚙️", name: "机器计划入口", owner: "项目仓库", stores: "Workspace、Gate 和适用验证配置", excludes: "Team OS 通用角色" },
      { path: "<project>/.work/", icon: "🧾", name: "动态证据", owner: "当前任务", stores: "计划、收据和一次性运行事实", excludes: "长期产品合同和秘密" }
    ]
  },
  failures: [
    {
      id: "codex-crash",
      icon: "🧯",
      title: "Codex App Server 崩溃",
      symptom: "人物从 running 变为 offline/failed，当前 Turn 可能处于未知窗口。",
      preserved: ["Agent ID", "Hive 信箱与任务", "Thread 索引", "identity.md / memory.md"],
      response: ["只停止受影响进程", "重启该 Agent 的 App Server", "read/resume 原 Thread", "将未知活动 Turn 标为 uncertain"],
      forbidden: "不能静默重投未知 Turn，否则可能重复修改文件或重复发送消息。"
    },
    {
      id: "pty-crash",
      icon: "🔧",
      title: "PTY Provider 终端崩溃",
      symptom: "CLI 进程消失、终端损坏或旧 Session 无法恢复。",
      preserved: ["Agent ID", "Provider Home", "最近 Session", "Inbox/Outbox 与长期记忆"],
      response: ["停止旧 CLI", "用有效 Session ID Restart & Continue", "恢复失败时显式提示", "由用户或任务明确新建 Session"],
      forbidden: "不能猜 Session、伪装恢复成功或删除未送达消息。"
    },
    {
      id: "delivery-blocked",
      icon: "📬",
      title: "消息暂时不可投递",
      symptom: "目标忙碌、PTY 有草稿、自动投递暂停或 Provider 不支持 Inbox drain。",
      preserved: ["原始消息", "发送收据", "队列位置", "积压状态"],
      response: ["消息保留在队列", "等待原生 idle 或 PTY 安全门", "必要时回退 Michael", "达到阈值后暂停自动投递并告警"],
      forbidden: "不能把“尝试写入”记作“已送达”，也不能反复唤醒造成 Token 风暴。"
    },
    {
      id: "team-os-missing",
      icon: "🪫",
      title: "Team OS 或项目 Adapter 不可用",
      symptom: "项目注册、路径或 schema 校验失败，自动规划无法安全定位项目权威。",
      preserved: ["现有 Agent", "基础终端", "Hive 与 Session", "项目仓库本身"],
      response: ["明确显示降级原因", "停止自动计划提交", "保留基础办公室能力", "修复地址卡后重新规划"],
      forbidden: "不能猜项目路径、越界扫描或把 Team OS 故障伪装成 Provider 故障。"
    }
  ]
};
