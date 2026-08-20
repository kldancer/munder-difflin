/** Wave 6: compact operational surfaces layered onto existing entry points. */
export const w6_en = {
  w6: {
    status: {
      title: 'FLEET AT A GLANCE',
      total: 'agents',
      live: 'live',
      working: 'working',
      waiting: 'waiting',
      blocked: 'blocked',
      providers: 'providers',
      recent: 'recent activity',
      noRecent: 'No recent activity.'
    },
    memory: {
      edit: 'edit',
      save: 'save',
      cancel: 'cancel',
      saving: 'saving…',
      saved: 'Saved · {{bytes}} bytes',
      conflict: 'Save failed: {{error}}',
      hint: 'Edit this role memory directly. Each save creates a recoverable backup; it does not change the Provider session or shared task ledger.',
      size: '{{bytes}} bytes'
    },
    theme: {
      title: 'Office skins',
      help: 'Choose a complete built-in skin. Agents, terminals, sessions, tasks and memory stay in place.',
      office: 'Default office',
      officeBlurb: 'The original Munder Difflin floor',
      starship: 'Crystal Sea Starport',
      starshipBlurb: 'A calm deep-space port with crystal-blue grids and stardust',
      starfieldFarm: 'Starfield Farmstead',
      starfieldFarmBlurb: 'Warm frontier workshop with paper, wood and starlight',
      switched: 'Theme switched. Running agents, sessions and tasks were preserved.',
      failed: 'Theme was not switched: {{error}}'
    },
    session: {
      recent: 'Recent sessions',
      resume: 'continue',
      resuming: 'continuing…',
      occupied: 'This agent has a live terminal. Continuing another session performs a confirmed cold restart, never a hot TUI switch.',
      replaceConfirm: 'Stop {{name}}\'s current terminal and continue the selected session? Unsaved terminal input will be lost.',
      incompatible: 'The selected session does not belong to this agent/provider.',
      noCommand: 'This agent has no resumable CLI command.',
      stopFailed: 'Could not stop the current PTY.',
      resumeFailed: 'The CLI refused to continue the selected session.',
      action: 'continued session {{id}}…',
      resumed: 'Continued {{id}}…',
      failed: 'Continue failed: {{error}}'
    }
  }
} as const;

export const w6_zh = {
  w6: {
    status: {
      title: '团队状态速览',
      total: 'Agent 总数',
      live: '终端在线',
      working: '运行中',
      waiting: '等待中',
      blocked: '已阻塞',
      providers: 'Provider',
      recent: '最近活动',
      noRecent: '暂无最近活动。'
    },
    memory: {
      edit: '编辑',
      save: '保存',
      cancel: '取消',
      saving: '保存中…',
      saved: '已保存 · {{bytes}} 字节',
      conflict: '保存失败：{{error}}',
      hint: '直接编辑此角色的长期记忆；每次保存前都会先创建可恢复备份，且不会修改 Provider Session 或公共任务账本。',
      size: '{{bytes}} 字节'
    },
    theme: {
      title: '办公室皮肤',
      help: '点选一个已完成的内置皮肤；Agent、终端、Session、任务和记忆均保持原位。',
      office: '默认办公室',
      officeBlurb: 'Munder Difflin 原始办公层',
      starship: '晶海星港',
      starshipBlurb: '深空协作港：晶蓝网格与星尘',
      starfieldFarm: '星穹田园公社',
      starfieldFarmBlurb: '温暖的星穹工坊：纸张、木材与星光',
      switched: '主题已切换；运行中的 Agent、Session 和任务保持不变。',
      failed: '主题未切换：{{error}}'
    },
    session: {
      recent: '最近 Session',
      resume: '继续会话',
      resuming: '继续中…',
      occupied: '此 Agent 的终端正在运行。继续其他 Session 会先明确确认，再冷重启进程；不会在运行中的 TUI 内热切换。',
      replaceConfirm: '停止 {{name}} 当前终端并继续所选 Session？终端中未提交的输入会丢失。',
      incompatible: '所选 Session 不属于此 Agent 或 Provider。',
      noCommand: '此 Agent 没有可恢复的 CLI 命令。',
      stopFailed: '无法停止当前 PTY。',
      resumeFailed: 'CLI 拒绝继续所选 Session。',
      action: '已继续 Session {{id}}…',
      resumed: '已继续 {{id}}…',
      failed: '继续失败：{{error}}'
    }
  }
} as const;
