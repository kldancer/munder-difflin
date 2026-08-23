/** TOS1/TOS2: read-only Team OS project overview. */
export const tos_en = {
  teamOs: {
    projects: {
      eyebrow: 'TEAM OS · READ-ONLY',
      title: 'Projects & authority',
      intro: 'A bounded index of project roots, applicable authority, machine contracts, and evidence locations. Document bodies are loaded only by the agent that needs them.',
      refresh: 'refresh',
      refreshing: 'refreshing…',
      home: 'Team OS home',
      source: 'source: {{source}}',
      sourceConfig: 'settings',
      sourceEnvironment: 'environment',
      sourceDefault: 'default',
      missingTitle: 'Team OS is not connected',
      missingBody: 'Choose the Team OS folder in Settings → General. Existing terminals, agents, and the hive continue to work.',
      invalidTitle: 'Team OS contract is invalid',
      invalidBody: 'Fix the registry or adapter shown below. Existing terminals, agents, and the hive continue to work.',
      empty: 'No projects are registered.',
      ready: 'ready',
      disabled: 'disabled',
      invalid: 'invalid',
      root: 'PROJECT ROOT',
      adapter: 'ADAPTER',
      authority: 'AUTHORITY',
      machine: 'MACHINE',
      evidence: 'EVIDENCE',
      constraints: 'CONSTRAINTS',
      exists: 'available',
      absent: 'missing',
      noReferences: 'No references declared.',
      noConstraints: 'No constraints declared.',
      readOnly: 'Read-only projection',
      noBodies: 'No document bodies, prompts, transcripts, tasks, or secrets are copied into Munder.',
      later: 'Result cards and automatic routing belong to TOS3; this view does not invent execution state.',
      loadFailed: 'Could not load Team OS snapshot.',
      configHelp: 'Independent from the harness home. Changing this path does not restart agents or sessions.',
      useDefault: 'use default'
    }
  }
} as const;

export const tos_zh = {
  teamOs: {
    projects: {
      eyebrow: 'TEAM OS · 只读',
      title: '项目与权威合同',
      intro: '有界展示项目根目录、适用权威、机器合同与证据位置；文档正文只由真正需要它的 Agent 按需读取。',
      refresh: '刷新',
      refreshing: '刷新中…',
      home: 'Team OS 目录',
      source: '来源：{{source}}',
      sourceConfig: '设置',
      sourceEnvironment: '环境变量',
      sourceDefault: '默认约定',
      missingTitle: '尚未连接 Team OS',
      missingBody: '请在“设置 → 常规”选择 Team OS 目录；现有终端、Agent 与蜂巢仍可继续工作。',
      invalidTitle: 'Team OS 合同无效',
      invalidBody: '请修复下方指出的注册表或适配器；现有终端、Agent 与蜂巢仍可继续工作。',
      empty: '尚未登记项目。',
      ready: '就绪',
      disabled: '已停用',
      invalid: '无效',
      root: '项目根目录',
      adapter: '适配器',
      authority: '权威规则',
      machine: '机器合同',
      evidence: '证据位置',
      constraints: '约束',
      exists: '可用',
      absent: '缺失',
      noReferences: '未声明引用。',
      noConstraints: '未声明约束。',
      readOnly: '只读投影',
      noBodies: '不会把文档正文、提示词、Transcript、任务或密钥复制进 Munder。',
      later: '结果卡与自动路由属于 TOS3；本视图不会虚构执行状态。',
      loadFailed: '无法加载 Team OS 快照。',
      configHelp: '该目录与蜂巢主目录相互独立；切换路径不会重启 Agent 或 Session。',
      useDefault: '恢复默认'
    }
  }
} as const;
