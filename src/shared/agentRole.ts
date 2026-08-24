export interface AgentRoleBinding {
  id: string;
  label: string;
  capabilities?: string[];
  authority?: string;
  writePolicy?: string;
  knownBlindSpots?: string[];
}

export interface AgentRoleSelection {
  roleId: string;
  defaultCapabilityProfileIds: string[];
}

const ROLE_LABELS: Record<string, string> = {
  'chief-of-staff': '总协调/参谋长',
  'product-architect': '产品与架构',
  'delivery-engineer': '端到端交付/Feature Owner',
  'evidence-researcher': '事实研究',
  'quality-verifier': '质量验证',
  'release-operator': '发布与运行',
  'independent-challenger': '独立挑战者'
};

const LEGACY_SELECTIONS: Record<string, AgentRoleSelection> = {
  '中文产品经理，负责需求边界、验收标准与优先级': {
    roleId: 'product-architect', defaultCapabilityProfileIds: ['product-discovery']
  },
  '中文架构师，负责接口、依赖方向与演进边界': {
    roleId: 'product-architect', defaultCapabilityProfileIds: ['backend-domain']
  },
  '中文开发工程师，负责有界实现与适用验证': {
    roleId: 'delivery-engineer', defaultCapabilityProfileIds: []
  },
  '中文测试工程师，负责可复现验证与运行证据': {
    roleId: 'quality-verifier', defaultCapabilityProfileIds: ['test-engineering']
  },
  '中文审查员，负责正确性、安全与 Gate 关闭复核': {
    roleId: 'quality-verifier', defaultCapabilityProfileIds: ['security-engineering']
  },
  'keeps the codebase tidy and healthy': {
    roleId: 'delivery-engineer', defaultCapabilityProfileIds: []
  },
  'keeps docs in sync with the code': {
    roleId: 'delivery-engineer', defaultCapabilityProfileIds: []
  },
  'investigates and root-causes bugs': {
    roleId: 'delivery-engineer', defaultCapabilityProfileIds: ['test-engineering']
  },
  'gathers and summarizes information': {
    roleId: 'evidence-researcher', defaultCapabilityProfileIds: []
  },
  'prepares and ships releases': {
    roleId: 'release-operator', defaultCapabilityProfileIds: ['sre-observability']
  }
};

function copySelection(selection: AgentRoleSelection): AgentRoleSelection {
  return { roleId: selection.roleId, defaultCapabilityProfileIds: [...selection.defaultCapabilityProfileIds] };
}

/** Forward-only bridge for rosters created before Team OS role ids were durable. */
export function inferLegacyRoleSelection(value?: string): AgentRoleSelection | null {
  const text = value?.trim();
  if (!text) return null;
  const mapped = LEGACY_SELECTIONS[text] ?? LEGACY_SELECTIONS[text.toLowerCase()];
  if (mapped) return copySelection(mapped);
  if (ROLE_LABELS[text]) return { roleId: text, defaultCapabilityProfileIds: [] };
  const byLabel = Object.entries(ROLE_LABELS).find(([, label]) => label === text);
  return byLabel ? { roleId: byLabel[0], defaultCapabilityProfileIds: [] } : null;
}

/** Prefer the current Team OS contract, retain an existing snapshot when the
 * catalog is unavailable, then fall back to the minimal built-in migration label. */
export function resolveRoleBinding(
  roleId: string | undefined,
  roles: AgentRoleBinding[],
  existing?: AgentRoleBinding
): AgentRoleBinding | undefined {
  const id = roleId?.trim();
  if (!id) return undefined;
  const current = roles.find((role) => role.id === id);
  if (current) return {
    ...current,
    ...(current.capabilities ? { capabilities: [...current.capabilities] } : {}),
    ...(current.knownBlindSpots ? { knownBlindSpots: [...current.knownBlindSpots] } : {})
  };
  if (existing?.id === id) return {
    ...existing,
    ...(existing.capabilities ? { capabilities: [...existing.capabilities] } : {}),
    ...(existing.knownBlindSpots ? { knownBlindSpots: [...existing.knownBlindSpots] } : {})
  };
  const label = ROLE_LABELS[id];
  return label ? { id, label } : undefined;
}

export function mergeRoleCapabilities(binding?: AgentRoleBinding, extra: string[] = []): string[] {
  return [...new Set([...(binding?.capabilities ?? []), ...extra].map((value) => value.trim()).filter(Boolean))];
}
