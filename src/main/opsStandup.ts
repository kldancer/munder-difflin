import { createHash } from 'node:crypto';

export interface OpsStandupTaskFact {
  id: string;
  status: string;
  assignee?: string | null;
  openHumanQuestions?: number;
}

export interface OpsStandupAgentFact {
  id: string;
  role: string;
  status: string;
  isGod: boolean;
  breaker: string;
  actionableInbox: number;
}

export interface OpsStandupFacts {
  tasks: OpsStandupTaskFact[];
  agents: OpsStandupAgentFact[];
}

export interface OpsStandupDecision {
  fingerprint: string;
  shouldDispatch: boolean;
  reasons: string[];
}

/**
 * Decide whether an hourly standup deserves a model turn. The fingerprint is
 * deliberately semantic: timestamps, token counters and transcript activity do
 * not wake the orchestrator. A quiet first observation only establishes the
 * baseline; later quiet observations wake once when the actual task/roster state
 * changes, then go quiet again after the new fingerprint is persisted.
 */
export function evaluateOpsStandup(
  facts: OpsStandupFacts,
  previousFingerprint?: string,
): OpsStandupDecision {
  const tasks = [...facts.tasks]
    .map((task) => ({
      id: task.id,
      status: task.status,
      assignee: task.assignee ?? null,
      openHumanQuestions: task.openHumanQuestions ?? 0,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
  const agents = [...facts.agents]
    .map((agent) => ({
      id: agent.id,
      role: agent.role,
      status: agent.status,
      isGod: agent.isGod,
      breaker: agent.breaker,
      actionableInbox: agent.actionableInbox,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
  const fingerprint = createHash('sha256')
    .update(JSON.stringify({ tasks, agents }))
    .digest('hex');

  const reasons: string[] = [];
  const activeTasks = tasks.filter((task) => task.status !== 'done');
  if (activeTasks.length) reasons.push(`${activeTasks.length} active task(s)`);

  const actionableInbox = agents.reduce((sum, agent) => sum + agent.actionableInbox, 0);
  if (actionableInbox) reasons.push(`${actionableInbox} actionable inbox message(s)`);

  const abnormalBreakers = agents.filter((agent) =>
    agent.breaker !== 'ok' && agent.breaker !== 'none');
  if (abnormalBreakers.length) reasons.push(`${abnormalBreakers.length} breaker alert(s)`);

  if (previousFingerprint && previousFingerprint !== fingerprint) {
    reasons.push('semantic task or roster state changed');
  }

  return { fingerprint, shouldDispatch: reasons.length > 0, reasons };
}
