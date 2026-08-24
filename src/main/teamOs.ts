import {
  existsSync, lstatSync, readFileSync, realpathSync, statSync
} from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { AgentRoleBinding } from '../shared/agentRole';

export const TEAM_OS_LIMITS = {
  registryBytes: 256 * 1024,
  adapterBytes: 256 * 1024,
  workspaceRegistryBytes: 512 * 1024,
  projects: 100,
  referencesPerProject: 32,
  workspaces: 256,
  roles: 32,
  capabilityProfiles: 64,
  selectedCapabilities: 8,
  nonGoals: 12,
  workOrderBytes: 64 * 1024
} as const;

export type TeamOsHomeSource = 'config' | 'environment' | 'default';
export type TeamOsSnapshotStatus = 'ready' | 'missing' | 'invalid';
export type TeamOsProjectStatus = 'ready' | 'disabled' | 'invalid';

export interface TeamOsReference {
  group: 'authority' | 'machine' | 'evidence';
  key: string;
  relativePath: string;
  absolutePath: string;
  exists: boolean;
  kind: 'file' | 'directory' | 'missing';
}

export interface TeamOsProjectSnapshot {
  id: string;
  name: string;
  enabled: boolean;
  status: TeamOsProjectStatus;
  adapterPath: string;
  root: string | null;
  mode: 'read-only' | null;
  references: TeamOsReference[];
  constraints: Record<string, boolean>;
  error?: { code: string; message: string };
}

export interface TeamOsSnapshot {
  format: 1;
  loadedAt: string;
  status: TeamOsSnapshotStatus;
  teamOsHome: string;
  homeSource: TeamOsHomeSource;
  registryPath: string;
  projects: TeamOsProjectSnapshot[];
  limits: typeof TEAM_OS_LIMITS;
  policy: {
    readOnly: true;
    contentCopied: false;
    autoRouting: false;
    terminalFallback: true;
  };
  error?: { code: string; message: string };
}

export type TeamOsWorkspaceMode = 'managed' | 'reference-only' | 'excluded' | 'unclassified';

export interface TeamOsWorkspace {
  key: string;
  kind: string;
  path: string;
  exists: boolean;
  directory: boolean;
  mode: TeamOsWorkspaceMode;
  group?: string;
  lifecycle?: string;
  authorityRole?: string;
  runtimeOwner?: string;
  supersededBy?: string;
}

export interface TeamOsWorkspaceSnapshot {
  ok: boolean;
  projectId: string;
  registryPath: string | null;
  workspaces: TeamOsWorkspace[];
  error?: { code: string; message: string };
}

export interface LoadTeamOsOptions {
  configuredHome?: string | null;
  environmentHome?: string | null;
  userHome?: string;
  now?: number;
}

export interface TeamOsRole extends AgentRoleBinding {
  capabilities: string[];
  authority: string;
  writePolicy: string;
  knownBlindSpots: string[];
}

export interface TeamOsCapabilityProfile {
  id: string;
  label: string;
  activationSignals: string[];
  evidence: string[];
  defaultMode: string;
}

export interface TeamOsPreparationCatalog {
  status: TeamOsSnapshotStatus;
  teamOsHome: string;
  homeSource: TeamOsHomeSource;
  rolesPath: string;
  outcomeTemplatePath: string;
  outcomeTemplateVersion: number | null;
  roles: TeamOsRole[];
  capabilityProfiles: TeamOsCapabilityProfile[];
  error?: { code: string; message: string };
}

export interface TeamOsWorkOrderRequest {
  projectId: string;
  roleId: string;
  capabilityProfileIds: string[];
  outcome: string;
  nonGoals?: string[];
  acceptance: string[];
  stopConditions: string[];
  targetMinutes?: number | null;
  hardStopMinutes?: number | null;
  localWrite?: boolean;
  locale?: 'zh-CN' | 'en-US';
}

export interface TeamOsCompiledWorkOrder {
  ok: true;
  projectId: string;
  roleId: string;
  capabilityProfileIds: string[];
  prompt: string;
  promptBytes: number;
  sourcePaths: string[];
  resultCard: {
    version: 3;
    status: 'intake';
    owner: string;
    outcome: string;
    nonGoals: string[];
    coordination: { topology: 'solo'; rationale: string };
    delivery: { requiredCapabilities: string[]; capabilityGaps: string[] };
    scope: { read: string[]; write: string[]; excluded: string[] };
    authorization: { localWrite: boolean; remoteWrite: false; destructive: false };
    acceptance: string[];
    budget: { targetMinutes: number | null; hardStopMinutes: number | null };
    stopConditions: string[];
  };
}

export interface TeamOsCompileFailure {
  ok: false;
  error: { code: string; message: string };
}

interface RegistryProject {
  id: string;
  name: string;
  adapter: string;
  enabled: boolean;
}

function object(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function shortString(value: unknown, field: string, max = 512): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) {
    throw new Error(`${field} must be a non-empty string no longer than ${max} characters`);
  }
  return value.trim();
}

function shortStringList(value: unknown, field: string, limit = 32): string[] {
  if (!Array.isArray(value) || value.length > limit) throw new Error(`${field} must be an array with at most ${limit} items`);
  return value.map((entry, index) => shortString(entry, `${field}[${index}]`, 256));
}

function optionalShortString(value: unknown, field: string, max = 256): string | undefined {
  if (value == null || value === '') return undefined;
  return shortString(value, field, max);
}

function projectId(value: unknown, field: string): string {
  const id = shortString(value, field, 80);
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(id)) throw new Error(`${field} has an invalid id`);
  return id;
}

function inside(root: string, candidate: string): boolean {
  const rel = relative(root, candidate);
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel));
}

function expandHome(value: string, userHome: string): string {
  if (value === '~') return userHome;
  if (value.startsWith(`~${sep}`)) return join(userHome, value.slice(2));
  return value;
}

export function resolveTeamOsHome(options: LoadTeamOsOptions = {}): {
  path: string;
  source: TeamOsHomeSource;
} {
  const userHome = options.userHome ?? homedir();
  const configured = options.configuredHome?.trim();
  const environment = options.environmentHome?.trim();
  const source: TeamOsHomeSource = configured ? 'config' : environment ? 'environment' : 'default';
  const raw = configured || environment || join(userHome, 'Munder-Difflin', 'team-os');
  const expanded = expandHome(raw, userHome);
  if (!isAbsolute(expanded)) throw new Error('teamOsHome must be an absolute path or start with ~/');
  return { path: resolve(expanded), source };
}

function readBounded(file: string, maxBytes: number): string {
  const entry = lstatSync(file);
  if (entry.isSymbolicLink() || !entry.isFile()) throw new Error('must be a regular file, not a symlink');
  if (entry.size > maxBytes) throw new Error(`exceeds the ${maxBytes} byte read limit`);
  return readFileSync(file, 'utf8');
}

function safeRelativeFile(rootReal: string, relativePath: string, label: string): string {
  if (isAbsolute(relativePath) || relativePath.includes('\0')) throw new Error(`${label} must be relative`);
  const target = resolve(rootReal, relativePath);
  if (!inside(rootReal, target)) throw new Error(`${label} escapes its root`);
  if (existsSync(target)) {
    const targetReal = realpathSync(target);
    if (!inside(rootReal, targetReal)) throw new Error(`${label} resolves outside its root`);
    return targetReal;
  }
  return target;
}

function parseRegistry(raw: string): RegistryProject[] {
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Error('registry.json is not valid JSON'); }
  const registry = object(parsed);
  if (!registry || registry.version !== 1 || !Array.isArray(registry.projects)) {
    throw new Error('registry.json must have version 1 and a projects array');
  }
  if (registry.projects.length > TEAM_OS_LIMITS.projects) {
    throw new Error(`registry.json exceeds the ${TEAM_OS_LIMITS.projects} project limit`);
  }
  const ids = new Set<string>();
  return registry.projects.map((entry, index) => {
    const item = object(entry);
    if (!item) throw new Error(`projects[${index}] must be an object`);
    const id = projectId(item.id, `projects[${index}].id`);
    if (ids.has(id)) throw new Error(`duplicate project id: ${id}`);
    ids.add(id);
    return {
      id,
      name: shortString(item.name, `projects[${index}].name`, 160),
      adapter: shortString(item.adapter, `projects[${index}].adapter`, 1_024),
      enabled: item.enabled !== false
    };
  });
}

function parseYamlObject(raw: string, label: string): Record<string, unknown> | null {
  try {
    return object(parseYaml(raw, { maxAliasCount: 32, uniqueKeys: true }));
  } catch {
    // Parser diagnostics may include the offending source line. Keep adapter
    // and Team OS contract bodies on the main-process side even when YAML is malformed.
    throw new Error(`${label} YAML is invalid`);
  }
}

function reference(
  projectRoot: string,
  projectRootReal: string,
  group: TeamOsReference['group'],
  key: string,
  value: unknown
): TeamOsReference {
  const relativePath = shortString(value, `${group}.${key}`, 2_048);
  const absolutePath = safeRelativeFile(projectRootReal, relativePath, `${group}.${key}`);
  if (!existsSync(absolutePath)) {
    return { group, key, relativePath, absolutePath: resolve(projectRoot, relativePath), exists: false, kind: 'missing' };
  }
  const stat = statSync(absolutePath);
  return {
    group,
    key,
    relativePath,
    absolutePath,
    exists: true,
    kind: stat.isDirectory() ? 'directory' : stat.isFile() ? 'file' : 'missing'
  };
}

function adapterSnapshot(
  teamRootReal: string,
  registered: RegistryProject
): TeamOsProjectSnapshot {
  let adapterPath = resolve(teamRootReal, registered.adapter);
  const base: TeamOsProjectSnapshot = {
    id: registered.id,
    name: registered.name,
    enabled: registered.enabled,
    status: registered.enabled ? 'invalid' : 'disabled',
    adapterPath,
    root: null,
    mode: null,
    references: [],
    constraints: {}
  };
  if (!registered.enabled) return base;
  try {
    adapterPath = safeRelativeFile(teamRootReal, registered.adapter, `adapter for ${registered.id}`);
    base.adapterPath = adapterPath;
    if (!existsSync(adapterPath)) throw new Error('adapter file does not exist');
    const parsed = parseYamlObject(readBounded(adapterPath, TEAM_OS_LIMITS.adapterBytes), 'adapter');
    if (!parsed || parsed.version !== 1) throw new Error('adapter must be a version 1 object');
    if (projectId(parsed.id, 'adapter.id') !== registered.id) throw new Error('adapter id does not match registry id');
    shortString(parsed.name, 'adapter.name', 160);
    const root = shortString(parsed.root, 'adapter.root', 4_096);
    if (!isAbsolute(root)) throw new Error('adapter.root must be absolute');
    base.root = resolve(root);
    if (!existsSync(base.root) || !statSync(base.root).isDirectory()) throw new Error('project root does not exist');
    const projectRootReal = realpathSync(base.root);
    if (parsed.mode !== 'read-only') throw new Error('adapter.mode must be read-only');
    base.mode = 'read-only';

    const refs: TeamOsReference[] = [];
    for (const group of ['authority', 'machine', 'evidence'] as const) {
      const values = object(parsed[group]) ?? {};
      for (const [key, value] of Object.entries(values)) {
        if (refs.length >= TEAM_OS_LIMITS.referencesPerProject) {
          throw new Error(`adapter exceeds the ${TEAM_OS_LIMITS.referencesPerProject} reference limit`);
        }
        refs.push(reference(base.root, projectRootReal, group, projectId(key, `${group} key`), value));
      }
    }
    base.references = refs;
    const constraints = object(parsed.constraints) ?? {};
    for (const [key, value] of Object.entries(constraints)) {
      if (typeof value !== 'boolean') throw new Error(`constraints.${key} must be boolean`);
      base.constraints[projectId(key, 'constraint key')] = value;
    }
    base.status = 'ready';
    return base;
  } catch (error) {
    return {
      ...base,
      status: 'invalid',
      error: {
        code: 'ADAPTER_INVALID',
        message: error instanceof Error ? error.message : String(error)
      }
    };
  }
}

function snapshotBase(
  home: string,
  source: TeamOsHomeSource,
  now: number
): Omit<TeamOsSnapshot, 'status' | 'projects'> {
  return {
    format: 1,
    loadedAt: new Date(now).toISOString(),
    teamOsHome: home,
    homeSource: source,
    registryPath: join(home, 'projects', 'registry.json'),
    limits: TEAM_OS_LIMITS,
    policy: { readOnly: true, contentCopied: false, autoRouting: false, terminalFallback: true }
  };
}

/** Bounded, read-only Team OS projection. It returns paths and validation facts,
 * never project document bodies, prompts, transcripts, secrets, or task data. */
export function loadTeamOsSnapshot(options: LoadTeamOsOptions = {}): TeamOsSnapshot {
  const now = options.now ?? Date.now();
  let resolved;
  try { resolved = resolveTeamOsHome(options); }
  catch (error) {
    const fallback = options.configuredHome || options.environmentHome || '';
    return {
      ...snapshotBase(String(fallback), options.configuredHome ? 'config' : options.environmentHome ? 'environment' : 'default', now),
      status: 'invalid', projects: [],
      error: { code: 'TEAM_OS_HOME_INVALID', message: error instanceof Error ? error.message : String(error) }
    };
  }
  const base = snapshotBase(resolved.path, resolved.source, now);
  if (!existsSync(resolved.path)) {
    return {
      ...base, status: 'missing', projects: [],
      error: { code: 'TEAM_OS_HOME_MISSING', message: 'Team OS directory does not exist; terminal features remain available.' }
    };
  }
  try {
    const rootEntry = lstatSync(resolved.path);
    if (rootEntry.isSymbolicLink() || !rootEntry.isDirectory()) throw new Error('teamOsHome must be a directory, not a symlink');
    const rootReal = realpathSync(resolved.path);
    const registryPath = join(rootReal, 'projects', 'registry.json');
    if (!existsSync(registryPath)) throw new Error('projects/registry.json does not exist');
    const projects = parseRegistry(readBounded(registryPath, TEAM_OS_LIMITS.registryBytes))
      .map((registered) => adapterSnapshot(rootReal, registered));
    return { ...base, registryPath, status: 'ready', projects };
  } catch (error) {
    return {
      ...base, status: 'invalid', projects: [],
      error: { code: 'REGISTRY_INVALID', message: error instanceof Error ? error.message : String(error) }
    };
  }
}

/** Resolve the workspace registry referenced by one project adapter. The project
 * remains the only registered Team OS object; child repositories are projected
 * on demand and never copied into HarnessConfig.registeredRepos. */
export function resolveProjectWorkspace(
  options: LoadTeamOsOptions,
  requestedProjectId: string,
  requestedKey?: string | null
): TeamOsWorkspaceSnapshot {
  let normalizedProjectId = '';
  try { normalizedProjectId = projectId(requestedProjectId, 'projectId'); }
  catch (error) {
    return { ok: false, projectId: String(requestedProjectId ?? ''), registryPath: null, workspaces: [], error: {
      code: 'WORKSPACE_REQUEST_INVALID', message: error instanceof Error ? error.message : String(error)
    } };
  }
  const snapshot = loadTeamOsSnapshot(options);
  const project = snapshot.projects.find((candidate) => candidate.id === normalizedProjectId);
  if (snapshot.status !== 'ready' || !project || project.status !== 'ready') {
    return { ok: false, projectId: normalizedProjectId, registryPath: null, workspaces: [], error: {
      code: 'PROJECT_UNAVAILABLE', message: project?.error?.message ?? snapshot.error?.message ?? 'selected project is not ready'
    } };
  }
  const reference = project.references.find((candidate) => candidate.group === 'machine' && candidate.key === 'workspaces');
  if (!reference?.exists || reference.kind !== 'file') {
    return { ok: false, projectId: normalizedProjectId, registryPath: reference?.absolutePath ?? null, workspaces: [], error: {
      code: 'WORKSPACE_REGISTRY_MISSING', message: 'project adapter has no readable machine.workspaces file'
    } };
  }
  try {
    const parsed = object(JSON.parse(readBounded(reference.absolutePath, TEAM_OS_LIMITS.workspaceRegistryBytes)));
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.workspaces)) {
      throw new Error('workspace registry must have version 1 and a workspaces array');
    }
    if (parsed.workspaces.length > TEAM_OS_LIMITS.workspaces) {
      throw new Error(`workspace registry exceeds the ${TEAM_OS_LIMITS.workspaces} workspace limit`);
    }
    const documentation = object(parsed.designDocumentation) ?? {};
    const managed = new Set(shortStringList(documentation.managedWorkspaces ?? [], 'designDocumentation.managedWorkspaces', TEAM_OS_LIMITS.workspaces));
    const referenceOnly = new Set(shortStringList(documentation.referenceOnlyWorkspaces ?? [], 'designDocumentation.referenceOnlyWorkspaces', TEAM_OS_LIMITS.workspaces));
    const excluded = new Map<string, string>();
    for (const [group, entries] of Object.entries(object(documentation.excludedWorkspaceGroups) ?? {})) {
      for (const key of shortStringList(entries, `designDocumentation.excludedWorkspaceGroups.${group}`, TEAM_OS_LIMITS.workspaces)) {
        if (excluded.has(key)) throw new Error(`workspace appears in multiple excluded groups: ${key}`);
        excluded.set(key, group);
      }
    }
    const seen = new Set<string>();
    const workspaces = parsed.workspaces.map((entry, index): TeamOsWorkspace => {
      const row = object(entry);
      if (!row) throw new Error(`workspaces[${index}] must be an object`);
      const key = projectId(row.name, `workspaces[${index}].name`);
      if (seen.has(key)) throw new Error(`duplicate workspace key: ${key}`);
      seen.add(key);
      const path = shortString(row.path, `workspaces[${index}].path`, 4_096);
      if (!isAbsolute(path)) throw new Error(`workspaces[${index}].path must be absolute`);
      const exists = existsSync(path);
      const directory = exists && statSync(path).isDirectory();
      const mode: TeamOsWorkspaceMode = managed.has(key) ? 'managed'
        : referenceOnly.has(key) ? 'reference-only'
          : excluded.has(key) ? 'excluded' : 'unclassified';
      return {
        key,
        kind: shortString(row.kind, `workspaces[${index}].kind`, 160),
        path,
        exists,
        directory,
        mode,
        ...(excluded.get(key) ? { group: excluded.get(key) } : {}),
        ...(optionalShortString(row.lifecycle, `workspaces[${index}].lifecycle`) ? { lifecycle: optionalShortString(row.lifecycle, `workspaces[${index}].lifecycle`) } : {}),
        ...(optionalShortString(row.authorityRole, `workspaces[${index}].authorityRole`) ? { authorityRole: optionalShortString(row.authorityRole, `workspaces[${index}].authorityRole`) } : {}),
        ...(optionalShortString(row.runtimeOwner, `workspaces[${index}].runtimeOwner`) ? { runtimeOwner: optionalShortString(row.runtimeOwner, `workspaces[${index}].runtimeOwner`) } : {}),
        ...(optionalShortString(row.supersededBy, `workspaces[${index}].supersededBy`) ? { supersededBy: optionalShortString(row.supersededBy, `workspaces[${index}].supersededBy`) } : {})
      };
    });
    const key = requestedKey == null || requestedKey === '' ? null : projectId(requestedKey, 'workspaceKey');
    const selected = key ? workspaces.filter((workspace) => workspace.key === key) : workspaces;
    if (key && selected.length === 0) throw new Error(`workspace key does not exist: ${key}`);
    return { ok: true, projectId: normalizedProjectId, registryPath: reference.absolutePath, workspaces: selected };
  } catch (error) {
    return { ok: false, projectId: normalizedProjectId, registryPath: reference.absolutePath, workspaces: [], error: {
      code: 'WORKSPACE_REGISTRY_INVALID', message: error instanceof Error ? error.message : String(error)
    } };
  }
}

function emptyPreparation(
  options: LoadTeamOsOptions,
  status: TeamOsSnapshotStatus,
  error: { code: string; message: string }
): TeamOsPreparationCatalog {
  let resolved: { path: string; source: TeamOsHomeSource };
  try { resolved = resolveTeamOsHome(options); }
  catch {
    resolved = {
      path: String(options.configuredHome || options.environmentHome || ''),
      source: options.configuredHome ? 'config' : options.environmentHome ? 'environment' : 'default'
    };
  }
  return {
    status,
    teamOsHome: resolved.path,
    homeSource: resolved.source,
    rolesPath: join(resolved.path, 'roles', 'capabilities.yaml'),
    outcomeTemplatePath: join(resolved.path, 'templates', 'outcome-card.yaml'),
    outcomeTemplateVersion: null,
    roles: [],
    capabilityProfiles: [],
    error
  };
}

/** TOS3 preparation catalog. This is still bounded metadata: only the compact
 * Team OS role/capability contract and template version cross IPC. */
export function loadTeamOsPreparationCatalog(options: LoadTeamOsOptions = {}): TeamOsPreparationCatalog {
  const snapshot = loadTeamOsSnapshot(options);
  if (snapshot.status !== 'ready') {
    return emptyPreparation(options, snapshot.status, snapshot.error ?? {
      code: 'TEAM_OS_UNAVAILABLE', message: 'Team OS is unavailable'
    });
  }
  try {
    const rootReal = realpathSync(snapshot.teamOsHome);
    const rolesPath = safeRelativeFile(rootReal, 'roles/capabilities.yaml', 'roles catalog');
    const outcomeTemplatePath = safeRelativeFile(rootReal, 'templates/outcome-card.yaml', 'outcome template');
    if (!existsSync(rolesPath)) throw new Error('roles/capabilities.yaml does not exist');
    if (!existsSync(outcomeTemplatePath)) throw new Error('templates/outcome-card.yaml does not exist');
    const parsed = parseYamlObject(readBounded(rolesPath, TEAM_OS_LIMITS.adapterBytes), 'roles catalog');
    const template = parseYamlObject(readBounded(outcomeTemplatePath, TEAM_OS_LIMITS.adapterBytes), 'outcome template');
    if (!parsed || parsed.version !== 2 || !Array.isArray(parsed.roles) || !Array.isArray(parsed.capabilityProfiles)) {
      throw new Error('roles catalog must have version 2, roles, and capabilityProfiles');
    }
    if (parsed.roles.length > TEAM_OS_LIMITS.roles) throw new Error(`roles catalog exceeds the ${TEAM_OS_LIMITS.roles} role limit`);
    if (parsed.capabilityProfiles.length > TEAM_OS_LIMITS.capabilityProfiles) {
      throw new Error(`roles catalog exceeds the ${TEAM_OS_LIMITS.capabilityProfiles} capability profile limit`);
    }
    const roles = parsed.roles.map((entry, index): TeamOsRole => {
      const role = object(entry);
      if (!role) throw new Error(`roles[${index}] must be an object`);
      return {
        id: projectId(role.id, `roles[${index}].id`),
        label: shortString(role.label, `roles[${index}].label`, 160),
        capabilities: shortStringList(role.capabilities, `roles[${index}].capabilities`),
        authority: shortString(role.authority, `roles[${index}].authority`, 160),
        writePolicy: shortString(role.writePolicy, `roles[${index}].writePolicy`, 160),
        knownBlindSpots: shortStringList(role.knownBlindSpots, `roles[${index}].knownBlindSpots`)
      };
    });
    const capabilityProfiles = parsed.capabilityProfiles.map((entry, index): TeamOsCapabilityProfile => {
      const profile = object(entry);
      if (!profile) throw new Error(`capabilityProfiles[${index}] must be an object`);
      return {
        id: projectId(profile.id, `capabilityProfiles[${index}].id`),
        label: shortString(profile.label, `capabilityProfiles[${index}].label`, 160),
        activationSignals: shortStringList(profile.activationSignals, `capabilityProfiles[${index}].activationSignals`),
        evidence: shortStringList(profile.evidence, `capabilityProfiles[${index}].evidence`),
        defaultMode: shortString(profile.defaultMode, `capabilityProfiles[${index}].defaultMode`, 160)
      };
    });
    if (new Set(roles.map((role) => role.id)).size !== roles.length) throw new Error('roles catalog has duplicate role ids');
    if (new Set(capabilityProfiles.map((profile) => profile.id)).size !== capabilityProfiles.length) {
      throw new Error('roles catalog has duplicate capability profile ids');
    }
    if (!template || template.version !== 3) throw new Error('outcome template must have version 3');
    return {
      status: 'ready', teamOsHome: snapshot.teamOsHome, homeSource: snapshot.homeSource,
      rolesPath, outcomeTemplatePath, outcomeTemplateVersion: 3, roles, capabilityProfiles
    };
  } catch (error) {
    return emptyPreparation(options, 'invalid', {
      code: 'PREPARATION_CATALOG_INVALID',
      message: error instanceof Error ? error.message : String(error)
    });
  }
}

function compileFailure(code: string, message: string): TeamOsCompileFailure {
  return { ok: false, error: { code, message } };
}

function optionalMinutes(value: unknown, field: string): number | null {
  if (value == null || value === '') return null;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 1_440) {
    throw new Error(`${field} must be an integer between 1 and 1440 minutes`);
  }
  return value;
}

/** Compile a short, reviewable work order. It contains role deltas and source
 * references, never project document bodies, and grants only explicit local scope. */
export function compileTeamOsWorkOrder(
  options: LoadTeamOsOptions,
  request: TeamOsWorkOrderRequest
): TeamOsCompiledWorkOrder | TeamOsCompileFailure {
  const snapshot = loadTeamOsSnapshot(options);
  if (snapshot.status !== 'ready') return compileFailure('TEAM_OS_UNAVAILABLE', snapshot.error?.message ?? 'Team OS is unavailable');
  const catalog = loadTeamOsPreparationCatalog(options);
  if (catalog.status !== 'ready') return compileFailure('PREPARATION_CATALOG_INVALID', catalog.error?.message ?? 'Preparation catalog is invalid');
  try {
    const project = snapshot.projects.find((candidate) => candidate.id === projectId(request.projectId, 'projectId'));
    if (!project || project.status !== 'ready') throw new Error('selected project is not ready');
    const role = catalog.roles.find((candidate) => candidate.id === projectId(request.roleId, 'roleId'));
    if (!role) throw new Error('selected role does not exist');
    if (!Array.isArray(request.capabilityProfileIds)
      || request.capabilityProfileIds.length > TEAM_OS_LIMITS.selectedCapabilities) {
      throw new Error(`capabilityProfileIds must contain at most ${TEAM_OS_LIMITS.selectedCapabilities} items`);
    }
    const requestedCapabilityIds = [...new Set(request.capabilityProfileIds.map((id, index) => projectId(id, `capabilityProfileIds[${index}]`)))];
    const profiles = requestedCapabilityIds.map((id) => {
      const profile = catalog.capabilityProfiles.find((candidate) => candidate.id === id);
      if (!profile) throw new Error(`capability profile does not exist: ${id}`);
      return profile;
    });
    const outcome = shortString(request.outcome, 'outcome', 4_000);
    const nonGoals = request.nonGoals == null ? [] : shortStringList(request.nonGoals, 'nonGoals', TEAM_OS_LIMITS.nonGoals);
    const acceptance = shortStringList(request.acceptance, 'acceptance', 16);
    const stopConditions = shortStringList(request.stopConditions, 'stopConditions', 16);
    if (acceptance.length === 0) throw new Error('acceptance must contain at least one item');
    if (stopConditions.length === 0) throw new Error('stopConditions must contain at least one item');
    const targetMinutes = optionalMinutes(request.targetMinutes, 'targetMinutes');
    const hardStopMinutes = optionalMinutes(request.hardStopMinutes, 'hardStopMinutes');
    if (targetMinutes != null && hardStopMinutes != null && hardStopMinutes < targetMinutes) {
      throw new Error('hardStopMinutes must be greater than or equal to targetMinutes');
    }
    const locale = request.locale === 'en-US' ? 'en-US' : 'zh-CN';
    const localWrite = request.localWrite === true;
    const references = project.references.map((ref) => `${ref.group}.${ref.key}: ${ref.absolutePath}`);
    const constraints = Object.entries(project.constraints).map(([key, value]) => `${key}=${String(value)}`);
    const profileLines = profiles.length > 0
      ? profiles.map((profile) => `- ${profile.label} (${profile.id})：${profile.evidence.join(', ')}`)
      : ['- 无；默认由单一端到端负责人保持上下文连续'];
    const prompt = locale === 'en-US'
      ? [
          '# Team OS work order (TOS3)',
          `Project: ${project.name} (${project.id})`, `Project root: ${project.root}`,
          `Outcome: ${outcome}`, `Non-goals: ${nonGoals.join('; ') || 'none'}`,
          `Acceptance: ${acceptance.join('; ')}`,
          `Stop conditions: ${stopConditions.join('; ')}`,
          `Time budget: target ${targetMinutes ?? 'unset'} min; hard stop ${hardStopMinutes ?? 'unset'} min`,
          `Owner role: ${role.label} (${role.id})`,
          `Role contract (not task authorization): ${role.authority}; write policy: ${role.writePolicy}`,
          `Role blind spots: ${role.knownBlindSpots.join(', ') || 'none declared'}`,
          'Capability overlays:', ...profileLines,
          'Project authority references (read on demand; do not copy bodies):', ...references.map((ref) => `- ${ref}`),
          `Constraints: ${constraints.join('; ') || 'none declared'}`,
          'Execution contract:',
          '1. Read the project AGENTS.md first and obey the project machine plan and gates.',
          '2. Default to one end-to-end owner; add specialists only for a proven capability gap.',
          `3. Local project writes are ${localWrite ? 'explicitly allowed for this task' : 'not authorized'}; remote, destructive, production, and Git writes remain unauthorized. Native tool approval and project gates still apply.`,
          '4. Return implementation decisions and evidence references, not a copied transcript.'
        ].join('\n')
      : [
          '# Team OS 工作单（TOS3）',
          `项目：${project.name}（${project.id}）`, `项目根目录：${project.root}`,
          `业务结果：${outcome}`, `非目标：${nonGoals.join('；') || '无'}`,
          `验收：${acceptance.join('；')}`,
          `停止条件：${stopConditions.join('；')}`,
          `时间预算：目标 ${targetMinutes ?? '未设置'} 分钟；硬止损 ${hardStopMinutes ?? '未设置'} 分钟`,
          `结果负责人角色：${role.label}（${role.id}）`,
          `角色合同（不等于本任务授权）：${role.authority}；写入策略：${role.writePolicy}`,
          `已知盲点：${role.knownBlindSpots.join('、') || '未声明'}`,
          '能力增量：', ...profileLines,
          '项目权威引用（按需读取，不复制正文）：', ...references.map((ref) => `- ${ref}`),
          `项目约束：${constraints.join('；') || '未声明'}`,
          '执行合同：',
          '1. 先读取项目 AGENTS.md，并遵守项目机器计划与 Gate。',
          '2. 默认由一个端到端负责人保持上下文连续；只有真实能力缺口才增加专家。',
          `3. 本任务${localWrite ? '已显式允许项目范围内的本地写入' : '未授权本地写入'}；远端写、破坏性操作、生产写和 Git 写仍未授权，且不得绕过原生工具审批与项目 Gate。`,
          '4. 交付实现决策与证据引用，不复制完整 Transcript。'
        ].join('\n');
    const promptBytes = Buffer.byteLength(prompt, 'utf8');
    if (promptBytes > TEAM_OS_LIMITS.workOrderBytes) {
      throw new Error(`compiled work order exceeds the ${TEAM_OS_LIMITS.workOrderBytes} byte limit`);
    }
    const sourcePaths = [catalog.rolesPath, catalog.outcomeTemplatePath, project.adapterPath, ...project.references.map((ref) => ref.absolutePath)];
    return {
      ok: true,
      projectId: project.id,
      roleId: role.id,
      capabilityProfileIds: requestedCapabilityIds,
      prompt,
      promptBytes,
      sourcePaths,
      resultCard: {
        version: 3,
        status: 'intake',
        owner: role.id,
        outcome,
        nonGoals,
        coordination: {
          topology: 'solo',
          rationale: locale === 'en-US' ? 'One end-to-end owner by default' : '默认由单一端到端负责人保持上下文连续'
        },
        delivery: { requiredCapabilities: requestedCapabilityIds, capabilityGaps: [] },
        scope: { read: sourcePaths, write: localWrite && project.root ? [project.root] : [], excluded: nonGoals },
        authorization: { localWrite, remoteWrite: false, destructive: false },
        acceptance,
        budget: { targetMinutes, hardStopMinutes },
        stopConditions
      }
    };
  } catch (error) {
    return compileFailure('WORK_ORDER_INVALID', error instanceof Error ? error.message : String(error));
  }
}
