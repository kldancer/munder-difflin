import {
  existsSync, lstatSync, readFileSync, realpathSync, statSync
} from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { parse as parseYaml } from 'yaml';

export const TEAM_OS_LIMITS = {
  registryBytes: 256 * 1024,
  adapterBytes: 256 * 1024,
  projects: 100,
  referencesPerProject: 32
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

export interface LoadTeamOsOptions {
  configuredHome?: string | null;
  environmentHome?: string | null;
  userHome?: string;
  now?: number;
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

function parseAdapter(raw: string): Record<string, unknown> | null {
  try {
    return object(parseYaml(raw, { maxAliasCount: 32, uniqueKeys: true }));
  } catch {
    // Parser diagnostics may include the offending source line. Keep adapter
    // bodies on the main-process side even when the YAML is malformed.
    throw new Error('adapter YAML is invalid');
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
    const parsed = parseAdapter(readBounded(adapterPath, TEAM_OS_LIMITS.adapterBytes));
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
