import type { StatusKind } from './PixelBadge';

export interface FleetStatusInput {
  id: string;
  name: string;
  provider: string;
  status: StatusKind;
  hasLivePty: boolean;
  action?: string;
  activityAt?: number;
}

export interface FleetRecentActivity {
  id: string;
  name: string;
  provider: string;
  action: string;
}

export interface FleetStatusSummary {
  total: number;
  live: number;
  working: number;
  waiting: number;
  blocked: number;
  providers: Array<{ provider: string; count: number }>;
  recent: FleetRecentActivity[];
}

const WORKING = new Set<StatusKind>(['working', 'thinking', 'compacting']);
const BLOCKED = new Set<StatusKind>(['blocked', 'looping']);

/** A renderer-only projection of facts already present in the roster store.
 * It deliberately adds no polling, persistence, or aggregation service. */
export function summarizeFleet(
  agents: readonly FleetStatusInput[],
  recentLimit = 3
): FleetStatusSummary {
  const providerCounts = new Map<string, number>();
  for (const agent of agents) {
    providerCounts.set(agent.provider, (providerCounts.get(agent.provider) ?? 0) + 1);
  }

  const recent = agents
    .filter((agent) => agent.action?.trim())
    .sort((a, b) => {
      const byTime = (b.activityAt ?? 0) - (a.activityAt ?? 0);
      if (byTime !== 0) return byTime;
      return Number(WORKING.has(b.status)) - Number(WORKING.has(a.status));
    })
    .slice(0, Math.max(0, recentLimit))
    .map((agent) => ({
      id: agent.id,
      name: agent.name,
      provider: agent.provider,
      action: agent.action!.trim()
    }));

  return {
    total: agents.length,
    live: agents.filter((agent) => agent.hasLivePty).length,
    working: agents.filter((agent) => WORKING.has(agent.status)).length,
    waiting: agents.filter((agent) => agent.status === 'waiting').length,
    blocked: agents.filter((agent) => BLOCKED.has(agent.status)).length,
    providers: [...providerCounts.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([provider, count]) => ({ provider, count })),
    recent
  };
}
