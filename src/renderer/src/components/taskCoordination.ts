export interface CoordinationTask {
  id: string;
  title: string;
  status: 'todo' | 'doing' | 'blocked' | 'done';
  dependsOn: string[];
  conversations?: string[];
  assignee?: string;
  humanQA?: Array<{ q: string; a?: string; dismissedAt?: string }>;
}

export interface CoordinationMessage {
  id: string;
  conversation: string;
  in_reply_to: string | null;
  from: string;
  to: string;
  act: string;
  subject: string;
  body: string;
  requires_reply: boolean;
  created_at: string;
}

export interface DependencySummary {
  id: string;
  title?: string;
  status?: CoordinationTask['status'];
  assignee?: string;
  missing: boolean;
}

export interface TaskCoordination {
  dependencies: DependencySummary[];
  missingDependencies: string[];
  messages: CoordinationMessage[];
  wait:
    | { kind: 'none' }
    | { kind: 'missing-dependencies'; items: string[] }
    | { kind: 'tasks'; items: string[] }
    | { kind: 'human'; question: string }
    | { kind: 'reply'; agent: string; message: string }
    | { kind: 'blocked' };
  waiting: string;
}

/** Resolve only stable IDs from the task ledger; never infer from prose. */
export function taskCoordination(task: CoordinationTask, all: CoordinationTask[], messages: CoordinationMessage[] = []): TaskCoordination {
  const dependencyIds = Array.isArray(task.dependsOn) ? task.dependsOn : [];
  const dependencies = dependencyIds.map((id) => {
    const found = all.find((candidate) => candidate.id === id);
    return found
      ? { id, title: found.title, status: found.status, assignee: found.assignee, missing: false }
      : { id, missing: true };
  });
  const missingDependencies = dependencies.filter((dependency) => dependency.missing).map((dependency) => dependency.id);
  const pendingDependencies = dependencies.filter((dependency) => !dependency.missing && dependency.status !== 'done');
  const conversationIds = new Set((task.conversations ?? []).filter((id): id is string => typeof id === 'string' && id.length > 0));
  const orderedMessages = messages
    .filter((message) => typeof message.id === 'string' && typeof message.conversation === 'string')
    .filter((message) => conversationIds.has(message.conversation))
    .slice()
    .sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')));
  const repliedTo = new Set(orderedMessages.map((message) => message.in_reply_to).filter((id): id is string => !!id));
  const unanswered = orderedMessages.filter((message) => message.requires_reply && !repliedTo.has(message.id));
  const openHumanQuestion = [...(task.humanQA ?? [])].reverse()
    .find((entry) => entry && !entry.a && !entry.dismissedAt);

  let wait: TaskCoordination['wait'] = { kind: 'none' };
  if (missingDependencies.length > 0) {
    wait = { kind: 'missing-dependencies', items: missingDependencies };
  } else if (pendingDependencies.length > 0) {
    wait = { kind: 'tasks', items: pendingDependencies.map((dependency) => dependency.title || dependency.id) };
  } else if (openHumanQuestion) {
    wait = { kind: 'human', question: openHumanQuestion.q };
  } else if (unanswered.length > 0) {
    const reply = unanswered[unanswered.length - 1];
    wait = { kind: 'reply', agent: reply.to, message: reply.id };
  } else if (task.status === 'blocked') {
    wait = { kind: 'blocked' };
  }

  const waiting = wait.kind === 'missing-dependencies' ? `缺失依赖：${wait.items.join('、')}`
    : wait.kind === 'tasks' ? `等待任务完成：${wait.items.join('、')}`
      : wait.kind === 'human' ? `等待人工回答：${wait.question}`
        : wait.kind === 'reply' ? `等待 ${wait.agent} 回复消息 ${wait.message}`
          : wait.kind === 'blocked' ? '任务已阻塞，暂无可定位的依赖或回复'
            : '当前没有明确等待项';

  return { dependencies, missingDependencies, messages: orderedMessages, wait, waiting };
}
