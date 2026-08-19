/** W1.5: IDE, Git, updates, and release surfaces. */
export const w1_5_en = {
  labels: { boss: 'BOSS', fullscreen: 'FULLSCREEN' },
  sidebarTabs: { terminal: 'TERMINAL', git: 'GIT', messages: 'MESSAGES', traces: 'TRACES' },
  ide: {
    noFile: 'No file open', pickFile: 'Pick a file from the tree to view it here.',
    copyPath: 'copy path', copyAbsolutePath: 'Copy absolute path', save: 'save', saved: 'saved',
    saving: '...', error: 'err', saveTitle: 'Save (Cmd-S)', fullscreen: 'Fullscreen',
    exitFullscreen: 'Exit fullscreen (Esc)', loading: 'loading…', openInIde: 'open in IDE',
    close: 'Close (Esc)', editSource: 'Edit the source', preview: 'Rendered preview (of the saved file)',
    noNote: 'no note', privateNote: 'PRIVATE NOTE', notePlaceholder: 'one line per bullet…',
    noteHelp: 'one line = one bullet · esc to close', terminalPane: 'live · pipe-pane',
    noTelemetry: 'no live telemetry yet — spawn / respawn this agent to instrument it',
    openIdeTitle: 'Open the IDE — file editor + git diff',
  },
  git: { notRepo: "Not a git repo.", runInit: "Run", inTerminal: "in the agent's terminal.", clean: 'working tree clean', noCommits: 'no commits yet', status: 'status', branches: 'branches', log: 'log', copyPath: 'Copy path', group: { staged: 'staged', changes: 'changes', untracked: 'untracked' }, state: { modified: 'modified', added: 'added', deleted: 'deleted', renamed: 'renamed', untracked: 'untracked' } },
  release: { star: '⭐ Star us on GitHub', later: 'Later', open: 'Open releases', close: 'Close', whatsNew: "What's new in {{version}}", readMore: 'Read more' },
  update: { check: 'check for updates', version: 'Version {{version}}', downloaded: 'Update v{{version}} downloaded', available: 'v{{version}} is available', restartMessage: 'Restart Munder Difflin whenever you like to apply it — nothing restarts on its own.', manualMessage: "This install can’t update itself — grab the new build from the releases page.", restart: 'restart to update' },
  terminal: { showAgents: 'Show the agent list', hideAgents: 'Hide the agent list — full-width terminal', light: 'Switch to the light theme', dark: 'Switch to the dark theme', toggleDark: 'Toggle dark mode', settings: 'Settings', exit: 'Exit fullscreen (Esc)', addAgent: 'Add agent', openTerminal: 'open', openTerminalTitle: 'Open your terminal app at {{path}}', closeAgent: 'Close {{name}} — ends the process and archives the agent', closeConfirm: 'Close {{name}}? The PTY process will terminate and the agent is archived (kept in history, off the floor).', openModel: 'Runs the CLI default model', cliDefault: 'CLI default', editNote: 'Edit private note', addNote: 'Add private note', noteFor: 'Note for {{name}}', dismiss: 'Dismiss {{name}}', respawn: 'Respawn from last session: {{names}} — same ids, memory and inboxes reattach automatically', zoomOut: 'Zoom out (Cmd -)', resetZoom: 'Reset zoom (Cmd 0)', zoomIn: 'Zoom in (Cmd +)', resizeSidebar: 'Drag to resize · double-click to reset' },
  recent: { title: 'recent', idle: 'idle', live: 'live' },
  app: { light: 'Switch to the light theme', dark: 'Switch to the dark theme', toggleDark: 'Toggle dark mode', settings: 'Settings', exitFullscreen: 'Exit fullscreen (Esc)', fullscreenTerminal: 'Fullscreen terminal — selected agent', toggleFullscreen: 'Toggle fullscreen terminal', autoOn: 'auto mode on', autoOff: 'auto mode off', emptyFloor: 'EMPTY FLOOR', emptyFloorMessage: 'No agents on the floor yet. Spawn one to see real claude output stream in here.', addAgent: 'add agent', waking: 'WAKING THE FLOOR', wakingMessage: "Michael is clocking in.", wakingDetail: "The terminal will land here once he's seated.", noAgent: 'NO AGENT SELECTED', noAgentMessage: 'Spawn an agent from the strip below.', noAgentDetail: 'The terminal and command bar will land here.', noAgentLabel: 'no agent', noWorkspace: 'no workspace', closeIde: 'Close IDE (Esc)', closeIdeLabel: 'Close IDE', noWorkspaceMessage: 'No workspace available.', noWorkspaceDetail: 'Spawn an agent first — the IDE opens on its working directory.' },
  ideApp: { inferredTitle: "No agent was named when the IDE opened — showing {{name}}'s workspace (the current selection)", workspaceTitle: "{{name}}'s workspace", assumed: '(assumed)', god: 'god', files: 'files', changes: 'CHANGES', history: 'HISTORY', compare: 'COMPARE', expandGit: 'Expand the git panel', collapseGit: 'Collapse the git panel — more room for the file tree', pickFile: 'Pick a file from the tree to edit, or a changed file to diff.', closeTab: 'Close tab', refresh: 'Refresh', notRepo: 'not a git repo', clean: 'working tree clean', workingTree: 'working tree', head: 'HEAD', loading: 'loading…', loadingDiff: 'loading diff…', binary: 'binary file — no text diff', refreshDiff: 'Refresh diff', viewImage: 'view image', imageError: 'could not decode this image — the file may be corrupt or misnamed', save: 'Save (Cmd/Ctrl+S)', copyPath: 'Copy path', editor: 'editor', diff: 'diff', preview: 'preview', split: 'split' },
  gitPanes: { loadingHistory: 'loading history…', noCommits: 'no commits', loadOlder: 'load older…', checkoutTitle: 'Check out this commit (detached HEAD)', jumpHere: 'jump here', close: 'Close', loadingFiles: 'loading files…', noFileChanges: 'no file changes (merge?)', baseTitle: "Base — the branch you're comparing against", swap: 'Swap base ↔ compare', compareTitle: "Compare — the branch whose changes you're viewing", prModeTitle: 'Showing what the compare branch ADDS since the common ancestor (PR-style). Click for the literal two-dot difference.', twoModeTitle: 'Showing the literal difference between the two branch states. Click for PR-style (what compare adds).', sinceAncestor: 'since common ancestor', literalDifference: 'literal difference', switchTo: 'switch to {{branch}}', checkoutBranch: "Check out '{{branch}}'", jumpConfirm: 'Jump the repo to {{sha}} ("{{subject}}")?\n\nThis detaches HEAD. Blocked automatically if the tree is dirty or an agent is mid-run.', switchConfirm: "Switch this repo to '{{branch}}'?\n\nBlocked automatically if the tree is dirty or an agent is mid-run.", noDifferences: 'no differences' },
  realtime: { dismiss: 'Dismiss', completed: 'Michael · completed', spendCap: 'Spend cap', none: 'none', off: 'off', thisSession: 'this session', audioTokens: 'audio tokens', overCap: 'Over the spend cap — time to wrap up.', approachingCap: 'Approaching the spend cap.', lastSession: 'Last session: {{amount}}', noActiveSession: 'No active voice session.', microphone: 'Microphone', speaker: 'Speaker', systemDefault: 'System default', deviceHint: 'Device names appear after you first start a voice session and grant mic access.', deviceHintDetail: 'The microphone choice applies the next time Michael connects; the speaker switches live.' },
  threads: { reply: 'Reply to {{name}}…' },
  waterfall: { ok: 'ok', failed: 'failed' },
  main: {
    hireImportTitle: 'Import a hire manifest', hireManifest: 'Hire manifest',
    closeFloor: 'Close floor', cancel: 'Cancel',
    closeFloorMessage_one: 'Close this floor? {{count}} running terminal on it will be stopped.',
    closeFloorMessage_other: 'Close this floor? {{count}} running terminals on it will be stopped.',
    otherFloorsRunning: 'Other floors keep running.', pickFolder: 'Pick a folder',
    addKnowledgeDocuments: 'Add documents to the Knowledge Graph', attachFiles: 'Attach images or files',
    images: 'Images', allFiles: 'All Files', finishedIdle: 'finished — idle',
    needsAttention: 'needs your attention'
  }
} as const;

export const w1_5_zh = {
  labels: { boss: '主管', fullscreen: '全屏' },
  sidebarTabs: { terminal: '终端', git: 'Git', messages: '消息', traces: '追踪' },
  ide: {
    noFile: '未打开文件', pickFile: '从文件树中选择文件后即可在此查看。',
    copyPath: '复制路径', copyAbsolutePath: '复制绝对路径', save: '保存', saved: '已保存',
    saving: '…', error: '错误', saveTitle: '保存（Cmd-S）', fullscreen: '全屏',
    exitFullscreen: '退出全屏（Esc）', loading: '加载中…', openInIde: '在 IDE 中打开',
    close: '关闭（Esc）', editSource: '编辑源文件', preview: '渲染预览（已保存文件）',
    noNote: '暂无备注', privateNote: '私人备注', notePlaceholder: '每行一个要点…',
    noteHelp: '每行一个要点 · Esc 关闭', terminalPane: '实时 · 管道面板',
    noTelemetry: '暂无实时遥测数据——启动或重新启动此 Agent 以记录数据',
    openIdeTitle: '打开 IDE——文件编辑器 + Git diff',
  },
  git: { notRepo: '不是 Git 仓库。', runInit: '请在 Agent 的终端中运行', inTerminal: '。', clean: '工作树干净', noCommits: '暂无提交', status: '状态', branches: '分支', log: '日志', copyPath: '复制路径', group: { staged: '已暂存', changes: '变更', untracked: '未跟踪' }, state: { modified: '已修改', added: '已添加', deleted: '已删除', renamed: '已重命名', untracked: '未跟踪' } },
  release: { star: '⭐ 在 GitHub 上支持我们', later: '稍后', open: '打开 Releases', close: '关闭', whatsNew: '{{version}} 的更新内容', readMore: '阅读更多' },
  update: { check: '检查更新', version: '版本 {{version}}', downloaded: '更新 v{{version}} 已下载', available: 'v{{version}} 可用', restartMessage: '你可以随时重启 Munder Difflin 以应用更新——不会自动重启。', manualMessage: '此安装无法自动更新——请从 Releases 页面获取新版本。', restart: '重启以更新' },
  terminal: { showAgents: '显示 Agent 列表', hideAgents: '隐藏 Agent 列表——终端全宽显示', light: '切换到浅色主题', dark: '切换到深色主题', toggleDark: '切换深色模式', settings: '设置', exit: '退出全屏（Esc）', addAgent: '添加 Agent', openTerminal: '打开', openTerminalTitle: '在 {{path}} 打开终端应用', closeAgent: '关闭 {{name}}——结束进程并归档 Agent', closeConfirm: '关闭 {{name}}？PTY 进程将终止，Agent 会被归档（保留在历史记录中，不再显示在工作区）。', openModel: '运行 CLI 默认模型', cliDefault: 'CLI 默认', editNote: '编辑私人备注', addNote: '添加私人备注', noteFor: '{{name}} 的备注', dismiss: '移除 {{name}}', respawn: '从上次会话重新启动：{{names}}——将重新连接相同 ID、记忆和收件箱', zoomOut: '缩小（Cmd -）', resetZoom: '重置缩放（Cmd 0）', zoomIn: '放大（Cmd +）', resizeSidebar: '拖动调整大小 · 双击重置' },
  recent: { title: '最近消息', idle: '空闲', live: '实时' },
  app: { light: '切换到浅色主题', dark: '切换到深色主题', toggleDark: '切换深色模式', settings: '设置', exitFullscreen: '退出全屏（Esc）', fullscreenTerminal: '全屏终端——当前 Agent', toggleFullscreen: '切换全屏终端', autoOn: '自动模式已开启', autoOff: '自动模式已关闭', emptyFloor: '工作区为空', emptyFloorMessage: '工作区还没有 Agent。启动一个即可在这里看到实时 Claude 输出。', addAgent: '添加 Agent', waking: '正在唤醒工作区', wakingMessage: 'Michael 正在打卡上班。', wakingDetail: '他就位后，终端会显示在这里。', noAgent: '未选择 Agent', noAgentMessage: '从下方列表启动一个 Agent。', noAgentDetail: '终端和命令栏会显示在这里。', noAgentLabel: '未选择 Agent', noWorkspace: '无工作区', closeIde: '关闭 IDE（Esc）', closeIdeLabel: '关闭 IDE', noWorkspaceMessage: '没有可用的工作区。', noWorkspaceDetail: '请先启动 Agent——IDE 会打开其工作目录。' },
  ideApp: { inferredTitle: '打开 IDE 时没有指定 Agent——正在显示 {{name}} 的工作区（当前选择）', workspaceTitle: '{{name}} 的工作区', assumed: '（推测）', god: 'god', files: '文件', changes: '变更', history: '历史', compare: '比较', expandGit: '展开 Git 面板', collapseGit: '收起 Git 面板——为文件树留出更多空间', pickFile: '从文件树选择文件进行编辑，或选择变更文件查看 diff。', closeTab: '关闭标签页', refresh: '刷新', notRepo: '不是 Git 仓库', clean: '工作树干净', workingTree: '工作树', head: 'HEAD', loading: '加载中…', loadingDiff: '正在加载 diff…', binary: '二进制文件——无法进行文本 diff', refreshDiff: '刷新 diff', viewImage: '查看图片', imageError: '无法解码此图片——文件可能已损坏或名称不正确', save: '保存（Cmd/Ctrl+S）', copyPath: '复制路径', editor: '编辑器', diff: 'diff', preview: '预览', split: '分屏' },
  gitPanes: { loadingHistory: '正在加载历史…', noCommits: '暂无提交', loadOlder: '加载更早记录…', checkoutTitle: '检出此提交（分离 HEAD）', jumpHere: '跳转到这里', close: '关闭', loadingFiles: '正在加载文件…', noFileChanges: '没有文件变更（合并提交？）', baseTitle: '基准——正在比较的分支', swap: '交换基准 ↔ 比较分支', compareTitle: '比较——正在查看其变更的分支', prModeTitle: '显示比较分支自共同祖先以来新增的内容（PR 风格）。点击切换为字面上的两点差异。', twoModeTitle: '显示两个分支状态之间的字面差异。点击切换为 PR 风格（比较分支新增内容）。', sinceAncestor: '自共同祖先以来', literalDifference: '字面差异', switchTo: '切换到 {{branch}}', checkoutBranch: '检出“{{branch}}”', jumpConfirm: '将仓库跳转到 {{sha}}（“{{subject}}”）？\n\n这会使 HEAD 分离。如果工作树有未提交变更或 Agent 正在运行，操作会自动阻止。', switchConfirm: '将此仓库切换到“{{branch}}”？\n\n如果工作树有未提交变更或 Agent 正在运行，操作会自动阻止。', noDifferences: '没有差异' },
  realtime: { dismiss: '关闭', completed: 'Michael · 已完成', spendCap: '支出上限', none: '无', off: '关闭', thisSession: '本次会话', audioTokens: '音频 token', overCap: '已超过支出上限——该收尾了。', approachingCap: '即将达到支出上限。', lastSession: '上次会话：{{amount}}', noActiveSession: '没有进行中的语音会话。', microphone: '麦克风', speaker: '扬声器', systemDefault: '系统默认', deviceHint: '首次启动语音会话并授予麦克风权限后，设备名称才会显示。', deviceHintDetail: '麦克风选择会在 Michael 下次连接时生效；扬声器会立即切换。' },
  threads: { reply: '回复 {{name}}…' },
  waterfall: { ok: '成功', failed: '失败' },
  main: {
    hireImportTitle: '导入雇佣清单', hireManifest: '雇佣清单', closeFloor: '关闭工作区', cancel: '取消',
    closeFloorMessage_one: '关闭此工作区？其中正在运行的 {{count}} 个终端将被停止。',
    closeFloorMessage_other: '关闭此工作区？其中正在运行的 {{count}} 个终端将被停止。',
    otherFloorsRunning: '其它工作区会继续运行。', pickFolder: '选择文件夹',
    addKnowledgeDocuments: '向知识图谱添加文档', attachFiles: '附加图片或文件',
    images: '图片', allFiles: '所有文件', finishedIdle: '已完成 — 空闲',
    needsAttention: '需要你的处理'
  }
} as const;
