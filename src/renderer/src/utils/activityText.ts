/** Localize only Munder's own short runtime labels. Free-form prompts, file
 * names, commands and provider tool names remain byte-for-byte unchanged. */
export function localizeActivityText(text: string, language?: string): string {
  const value = text.trim();
  const locale = language ?? (typeof document === 'undefined' ? 'en' : document.documentElement.lang);
  if (!locale.toLowerCase().startsWith('zh') || !value) return value;

  const using = /^using\s+(.+)$/i.exec(value);
  if (using) return `正在使用 ${using[1]}`;

  const labels: Record<string, string> = {
    'starting up': '正在启动',
    'running the floor': '统筹办公室',
    'compacting context': '正在压缩上下文',
    thinking: '正在思考',
    resumed: '已继续',
    idle: '空闲',
    awaiting: '等待任务',
    'on standby': '待命中',
    'waiting on you': '等待你的回复',
    'waiting on god': '等待 Michael',
    'reading inbox': '正在读取收件箱',
    'breaker armed': '已触发止损保护',
    'revived after sleep': '已从休眠恢复',
    'reconnecting…': '正在重新连接…',
    archived: '已归档',
    'recreating terminal…': '正在重建终端…',
    'continuing…': '正在继续会话…',
    'session not found — fresh start': '未找到原会话，已新建会话',
    'worktree gone — using base repo': '工作树已不存在，正在使用主仓库',
  };
  return labels[value.toLowerCase()] ?? value;
}
