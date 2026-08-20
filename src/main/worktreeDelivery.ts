import { realpath } from 'node:fs/promises';
import {
  getBranch,
  getStatus,
  listWorktrees,
  mainRepoRoot,
  removeWorktreeSafely,
  worktreeIsGcSafe,
  isSafeRev
} from './git';

export interface WorktreeDeliveryRequest {
  sourceCwd: string;
  targetCwd: string;
  targetBranch: string;
}

export interface WorktreeDeliveryInspection {
  ok: true;
  sourcePath: string;
  targetPath: string;
  sourceBranch: string;
  targetBranch: string;
  sourceDirty: boolean;
  targetDirty: boolean;
  sourceStatus: Awaited<ReturnType<typeof getStatus>>;
  targetStatus: Awaited<ReturnType<typeof getStatus>>;
  sourceWorktree: { path: string; head: string; branch: string | null };
  commitsAhead: number;
  canMerge: boolean;
  canReclaimAfterMerge: boolean;
  reclaimDetail: string;
  verification: string[];
}

export interface WorktreeDeliveryFailure { ok: false; error: string; sourcePath?: string }
export type WorktreeDeliveryResult = WorktreeDeliveryInspection | WorktreeDeliveryFailure;

type RequestContext = {
  sourcePath: string;
  targetPath: string;
  sourceBranch: string;
  sourceWorktree: { path: string; head: string; branch: string | null };
};

async function canonical(path: string): Promise<string | null> {
  try { return await realpath(path); } catch { return null; }
}

function statusDirty(status: Awaited<ReturnType<typeof getStatus>>): boolean {
  return 'error' in status || status.staged.length > 0 || status.unstaged.length > 0 || status.untracked.length > 0;
}

async function context(req: WorktreeDeliveryRequest): Promise<RequestContext | WorktreeDeliveryFailure> {
  if (!isSafeRev(req.targetBranch) || req.targetBranch.includes('..')) return { ok: false, error: 'invalid target branch ref' };
  const sourcePath = await canonical(req.sourceCwd);
  const targetPath = await canonical(req.targetCwd);
  if (!sourcePath || !targetPath) return { ok: false, error: 'source or target worktree does not exist' };
  const mainRaw = await mainRepoRoot(sourcePath);
  const targetMainRaw = await mainRepoRoot(targetPath);
  const [main, targetMain] = await Promise.all([
    mainRaw ? canonical(mainRaw) : null,
    targetMainRaw ? canonical(targetMainRaw) : null
  ]);
  if (!main || !targetMain || main !== targetMain || targetPath !== main) {
    return { ok: false, error: 'source and target are not worktrees in the same repository' };
  }
  if (sourcePath === targetPath) return { ok: false, error: 'source must be a linked worktree, not the main checkout' };
  const worktrees = await listWorktrees(main);
  if (!Array.isArray(worktrees)) return { ok: false, error: `could not list worktrees: ${worktrees.error}` };
  const canonicalWorktrees = await Promise.all(worktrees.map(async (worktree) => ({
    worktree,
    path: await canonical(worktree.path)
  })));
  const sourceWorktree = canonicalWorktrees.find(w => w.path === sourcePath)?.worktree;
  if (!sourceWorktree || !sourceWorktree.branch) return { ok: false, error: 'source is not a linked worktree with a branch' };
  if (!isSafeRev(sourceWorktree.branch)) return { ok: false, error: 'invalid source branch ref' };
  const branch = await getBranch(sourcePath);
  if ('error' in branch || branch.detached || branch.current !== sourceWorktree.branch) {
    return { ok: false, error: 'source worktree branch is missing or detached' };
  }
  const targetBranch = await getBranch(main);
  if ('error' in targetBranch || targetBranch.detached || targetBranch.current !== req.targetBranch) {
    return { ok: false, error: `target checkout is not on '${req.targetBranch}'` };
  }
  return { sourcePath, targetPath, sourceBranch: branch.current, sourceWorktree };
}

async function aheadCount(sourcePath: string, targetBranch: string): Promise<number | null> {
  const { execFile } = await import('node:child_process');
  return await new Promise(resolve => execFile('git', ['rev-list', '--count', `${targetBranch}..HEAD`], {
    cwd: sourcePath, timeout: 15_000, maxBuffer: 4 * 1024 * 1024
  }, (error, stdout) => {
    if (error) return resolve(null);
    const n = Number.parseInt(stdout.trim(), 10);
    resolve(Number.isFinite(n) ? n : null);
  }));
}

export async function inspectWorktreeDelivery(req: WorktreeDeliveryRequest): Promise<WorktreeDeliveryResult> {
  const ctx = await context(req);
  if ('ok' in ctx && !ctx.ok) return ctx;
  if (!('sourceBranch' in ctx)) return ctx;
  const [sourceStatus, targetStatus, ahead, reclaim] = await Promise.all([
    getStatus(ctx.sourcePath), getStatus(ctx.targetPath), aheadCount(ctx.sourcePath, req.targetBranch),
    worktreeIsGcSafe(ctx.sourcePath, req.targetBranch)
  ]);
  const sourceDirty = statusDirty(sourceStatus);
  const targetDirty = statusDirty(targetStatus);
  const verification: string[] = [];
  if (sourceDirty) verification.push('source worktree must be clean');
  if (targetDirty) verification.push('target checkout must be clean');
  if (ahead === null) verification.push('could not verify source commits against target');
  else if (ahead === 0) verification.push('source has no commits ahead of target');
  return {
    ok: true, sourcePath: ctx.sourcePath, targetPath: ctx.targetPath, sourceBranch: ctx.sourceBranch,
    targetBranch: req.targetBranch, sourceDirty, targetDirty, sourceStatus, targetStatus,
    sourceWorktree: ctx.sourceWorktree, commitsAhead: ahead ?? 0,
    canMerge: !sourceDirty && !targetDirty && ahead !== null && ahead > 0,
    canReclaimAfterMerge: reclaim.gc, reclaimDetail: reclaim.detail, verification
  };
}

export async function mergeWorktreeDelivery(req: WorktreeDeliveryRequest): Promise<{ ok: true; sourceBranch: string } | WorktreeDeliveryFailure> {
  const inspection = await inspectWorktreeDelivery(req);
  if (!inspection.ok) return inspection;
  if (!inspection.canMerge) return { ok: false, error: `merge refused: ${inspection.verification.join('; ')}`, sourcePath: inspection.sourcePath };
  const { execFile } = await import('node:child_process');
  const result = await new Promise<{ code: number | null; stderr: string }>(resolve => {
    execFile('git', ['merge', '--no-edit', '--', inspection.sourceBranch], {
      cwd: inspection.targetPath, timeout: 60_000, maxBuffer: 4 * 1024 * 1024
    }, (error, _stdout, stderr) => resolve({ code: error ? 1 : 0, stderr: stderr.trim() }));
  });
  if (result.code === 0) return { ok: true, sourceBranch: inspection.sourceBranch };
  const abort = await new Promise<{ ok: boolean; error?: string }>(resolve => {
    execFile('git', ['merge', '--abort'], {
      cwd: inspection.targetPath, timeout: 15_000, maxBuffer: 4 * 1024 * 1024
    }, error => resolve(error ? { ok: false, error: error.message } : { ok: true }));
  });
  return { ok: false, sourcePath: inspection.sourcePath, error: `merge failed${result.stderr ? `: ${result.stderr}` : ''}${abort.ok ? '; merge aborted, source retained' : `; merge abort failed: ${abort.error}`}` };
}

export async function reclaimWorktreeDelivery(req: WorktreeDeliveryRequest): Promise<{ ok: true; detail: string } | WorktreeDeliveryFailure> {
  const ctx = await context(req);
  if ('ok' in ctx && !ctx.ok) return ctx;
  if (!('sourceBranch' in ctx)) return ctx;
  const safe = await worktreeIsGcSafe(ctx.sourcePath, req.targetBranch);
  if (!safe.gc) return { ok: false, sourcePath: ctx.sourcePath, error: `reclaim refused: ${safe.detail}` };
  const removed = await removeWorktreeSafely(ctx.targetPath, ctx.sourcePath);
  return removed.ok ? { ok: true, detail: safe.detail } : { ok: false, sourcePath: ctx.sourcePath, error: `reclaim failed: ${removed.error}` };
}
