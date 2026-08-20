/** Wave 7: explain existing task/message facts, deliver Worktrees safely, and
 * report local lifecycle growth without adding new top-level systems. */
export const w7_en = {
  w7: {
    task: {
      coordination: 'COORDINATION', noWaiting: 'No explicit wait is known.',
      count_one: '{{count}} task', count_other: '{{count}} tasks', newWork: 'New work? Dispatch it to Michael in Monitor.',
      missingDependency: 'Waiting for missing dependencies: {{items}}',
      waitingTasks: 'Waiting for tasks: {{items}}', waitingHuman: 'Waiting for your answer: {{question}}',
      waitingReply: 'Waiting for {{agent}} to reply to {{message}}',
      blockedUnknown: 'Blocked, but no dependency or reply identifies the cause.',
      dependencies: 'Dependencies', none: 'none', missing: 'missing', owner: 'owner {{agent}}', unassigned: 'unassigned',
      status: { todo: 'todo', doing: 'doing', blocked: 'blocked', done: 'done' },
      conversations: 'Conversations', noConversation: 'not linked; messages are not scanned',
      noMessages: 'No linked messages.', replyTo: 'reply to {{message}}', newMessage: 'new message',
      humanQA: 'HUMAN Q&A', awaitingHuman: 'AWAITING YOUR ANSWER — ASK ME TAB', assign: 'assign'
    },
    delivery: {
      title: 'Worktree delivery', commits_one: '{{count}} commit', commits_other: '{{count}} commits',
      inspect: 'inspect', merge: 'merge', reclaim: 'reclaim', busy: 'working…',
      mergeConfirm: 'Merge {{source}} into {{target}}? Both trees will be rechecked; conflicts are aborted and the source Worktree is retained.',
      reclaimConfirm: 'Reclaim this Worktree? This is allowed only after Git proves it is clean and integrated. The branch remains available.',
      merged: 'Merged. The Worktree is still retained until you explicitly reclaim it.',
      reclaimed: 'Worktree reclaimed safely.', failed: 'Delivery action failed: {{error}}',
      verification: {
        sourceDirty: 'The source Worktree must be clean.', targetDirty: 'The target checkout must be clean.',
        unknownAhead: 'Could not verify source commits against the target.', noAhead: 'No unmerged source commits remain.'
      }
    },
    capacity: {
      title: 'LIFECYCLE CAPACITY', scanning: 'Scanning bounded local metadata…', empty: 'No capacity snapshot yet.',
      refresh: 'refresh', sessions: 'Sessions', inboxPending: 'Inbox pending', inboxDone: 'Inbox archived',
      outboxPending: 'Outbox pending', outboxSent: 'Outbox archived', activity: 'Activity log', cost: 'Cost ledger',
      memory: 'memory.md', worktrees: 'Worktrees', files: '{{count}} files · {{bytes}}', partial: ' · partial',
      policy: 'Retain by default. Back up before manual governance. This report cannot delete data; “partial” means a scan budget was reached.',
      failed: 'Capacity report unavailable: {{error}}'
    }
  }
} as const;

export const w7_zh = {
  w7: {
    task: {
      coordination: '协作状态', noWaiting: '当前没有明确等待项。',
      count_one: '{{count}} 个任务', count_other: '{{count}} 个任务', newWork: '新工作请在“监控”中交给 Michael 分派。',
      missingDependency: '正在等待缺失依赖：{{items}}', waitingTasks: '正在等待任务：{{items}}',
      waitingHuman: '正在等待你的回答：{{question}}', waitingReply: '正在等待 {{agent}} 回复消息 {{message}}',
      blockedUnknown: '任务已阻塞，但没有依赖或回复可定位原因。',
      dependencies: '依赖', none: '无', missing: '缺失', owner: '负责人 {{agent}}', unassigned: '未分配',
      status: { todo: '待处理', doing: '执行中', blocked: '已阻塞', done: '已完成' },
      conversations: 'Conversation', noConversation: '未关联；不扫描消息',
      noMessages: '暂无关联消息。', replyTo: '回复 {{message}}', newMessage: '新消息',
      humanQA: '人工问答', awaitingHuman: '等待你的回答——请查看“问我”标签', assign: '分派'
    },
    delivery: {
      title: 'Worktree 安全交付', commits_one: '{{count}} 个提交', commits_other: '{{count}} 个提交',
      inspect: '重新检查', merge: '合并', reclaim: '安全回收', busy: '处理中…',
      mergeConfirm: '将 {{source}} 合并到 {{target}}？系统会重新检查两个工作树；若有冲突会退出合并态并保留源 Worktree。',
      reclaimConfirm: '回收此 Worktree？只有 Git 证明它干净且已集成后才会执行；对应分支仍会保留。',
      merged: '合并完成；Worktree 仍保留，只有显式点击安全回收后才会移除。',
      reclaimed: 'Worktree 已安全回收。', failed: '交付操作失败：{{error}}',
      verification: {
        sourceDirty: '源 Worktree 必须先保持干净。', targetDirty: '目标主工作区必须先保持干净。',
        unknownAhead: '无法核对源分支相对目标分支的提交。', noAhead: '源分支已没有待合并提交。'
      }
    },
    capacity: {
      title: '生命周期容量', scanning: '正在进行有界本地元数据扫描…', empty: '暂无容量快照。', refresh: '刷新',
      sessions: 'Session', inboxPending: '待处理收件', inboxDone: '已归档收件',
      outboxPending: '待发送发件', outboxSent: '已归档发件', activity: '活动日志', cost: '成本账本',
      memory: 'memory.md', worktrees: 'Worktree', files: '{{count}} 个文件 · {{bytes}}', partial: ' · 已达扫描上限',
      policy: '默认保留；手工治理前先完成可验证备份。本报告不能删除数据；“已达扫描上限”表示结果为有界局部统计。',
      failed: '无法生成容量报告：{{error}}'
    }
  }
} as const;
