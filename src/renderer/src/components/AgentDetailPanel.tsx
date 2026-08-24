import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PixelPanel } from './PixelPanel';
import { PixelBadge } from './PixelBadge';
import { PixelButton } from './PixelButton';
import { SpritePortrait } from './SpritePortrait';
import { PtyTerminalView } from './PtyTerminalView';
import { terminalInstanceKey } from './terminalRecovery';
import { MessageQueueComposer } from './MessageQueueComposer';
import { CommandCenterPanel } from './CommandCenterPanel';
import { disposeTerminal, resetTerminal } from './terminalPool';
import { SidebarTabs } from './SidebarTabs';
import { ThreadsPanel } from './ThreadsPanel';
import { ToolWaterfall } from './ToolWaterfall';
import { AgentControlStrip } from './AgentControlStrip';
import { GitTab } from './GitTab';
import { Icon } from './Icon';
import { useStore, type Agent } from '@/store/store';
import { usePtyParser } from '@/hooks/usePtyParser';
import { inferAgentProvider } from '@/store/config';

function commandParts(command: string): string[] {
  const parts: string[] = [];
  const re = /"([^"\\]*(?:\\.[^"\\]*)*)"|'([^']*)'|([^\s]+)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(command)) !== null) parts.push(match[1] ?? match[2] ?? match[3]);
  return parts;
}

export interface AgentDetailPanelProps {
  agent: Agent;
}

export function AgentDetailPanel({ agent }: AgentDetailPanelProps) {
  const { t } = useTranslation();
  const [openTerminalState, setOpenTerminalState] = useState<'idle' | 'opening' | 'ok' | 'error'>('idle');
  const [openTerminalError, setOpenTerminalError] = useState<string | undefined>();
  const [recentSessions, setRecentSessions] = useState<Awaited<ReturnType<typeof window.cth.listRecentSessions>>>([]);
  const [selectedSession, setSelectedSession] = useState('');
  const [sessionMessage, setSessionMessage] = useState<string | null>(null);
  const [sessionOutcome, setSessionOutcome] = useState<'idle' | 'success' | 'error'>('idle');
  const [resumingSession, setResumingSession] = useState(false);
  const archiveAgent = useStore(s => s.archiveAgent);
  const updateAgent = useStore(s => s.updateAgent);
  const setFullscreen = useStore(s => s.setFullscreen);
  const fullscreenAgentId = useStore(s => s.fullscreenAgentId);
  const sidebarTab = useStore(s => s.sidebarTab);
  const setSidebarTab = useStore(s => s.setSidebarTab);
  const isReal = !!agent.ptyId;
  // While this agent is shown in the fullscreen overlay, the fullscreen view
  // owns the pty (it sizes it to fill the screen). Keeping the embedded terminal
  // mounted too means two xterms fight over the pty's cols/rows — which corrupts
  // the display and breaks scrolling. So we unmount the embedded one here; it
  // re-mounts and re-fits when fullscreen closes.
  const isFullscreenedHere = fullscreenAgentId === agent.id;

  const onPtyStream = usePtyParser(agent.id);

  useEffect(() => {
    let alive = true;
    window.cth.listRecentSessions(40).then((rows) => {
      if (!alive) return;
      const provider = inferAgentProvider(agent.command, agent.provider);
      const compatible = rows.filter((row) =>
        row.resumable && row.provider === provider &&
        (row.agentId === agent.id || (row.agentId == null && row.cwd === agent.cwd))
      );
      setRecentSessions(compatible);
      setSelectedSession(compatible[0]?.id ?? '');
    }).catch(() => { if (alive) setRecentSessions([]); });
    return () => { alive = false; };
  }, [agent.id, agent.cwd, agent.provider, agent.command]);

  const resumeSelectedSession = async () => {
    const sid = selectedSession.trim();
    if (!sid || !agent.command) return;
    setResumingSession(true);
    setSessionMessage(null);
    setSessionOutcome('idle');
    const ptyId = agent.ptyId ?? `pty-${agent.id}`;
    try {
      const selected = recentSessions.find((session) => session.id === sid);
      const provider = inferAgentProvider(agent.command, agent.provider);
      if (!selected || !selected.resumable || selected.provider !== provider) {
        throw new Error(t('w6.session.incompatible'));
      }
      const parts = commandParts(agent.command);
      const [command, ...args] = parts;
      if (!command) throw new Error(t('w6.session.noCommand'));
      if (agent.ptyId) {
        if (!window.confirm(t('w6.session.replaceConfirm', { name: agent.name }))) {
          setResumingSession(false);
          return;
        }
        const killed = await window.cth.killPty(agent.ptyId);
        if (!killed.ok && !/^no pty:/.test(killed.error ?? '')) {
          throw new Error(killed.error ?? t('w6.session.stopFailed'));
        }
        disposeTerminal(agent.ptyId);
      }
      const result = await window.cth.spawnPty({
        id: ptyId, cwd: agent.cwd, command, args, provider, cols: 100, rows: 30,
        resume: true, resumeSessionId: sid, requireResume: true, isolate: false,
        hive: {
          id: agent.id, name: agent.name, cwd: agent.cwd, provider,
          role: agent.description, isGod: agent.isGod, isAssistant: agent.isAssistant,
          replyLanguage: agent.replyLanguage
        }
      });
      if (!result.ok) throw new Error(result.error ?? t('w6.session.resumeFailed'));
      updateAgent(agent.id, {
        ptyId, terminalGeneration: (agent.terminalGeneration ?? 0) + 1,
        runtimeMode: result.runtimeMode ?? 'pty',
        status: 'idle', action: t('w6.session.action', { id: sid.slice(0, 12) })
      });
      setSessionOutcome('success');
      setSessionMessage(t('w6.session.resumed', { id: sid.slice(0, 12) }));
    } catch (error) {
      setSessionOutcome('error');
      setSessionMessage(t('w6.session.failed', { error: error instanceof Error ? error.message : String(error) }));
    } finally {
      setResumingSession(false);
    }
  };

  // Michael gets the full command-center dashboard instead of the plain panel.
  if (agent.isGod) return <CommandCenterPanel agent={agent} />;

  const openTerminal = async () => {
    setOpenTerminalState('opening');
    setOpenTerminalError(undefined);
    try {
      const result = await window.cth.openTerminalAt(agent.cwd);
      if (result.ok) {
        setOpenTerminalState('ok');
        setTimeout(() => setOpenTerminalState('idle'), 1500);
      } else {
        setOpenTerminalState('error');
        setOpenTerminalError(result.error ?? 'unknown error');
        setTimeout(() => setOpenTerminalState('idle'), 4000);
      }
    } catch (e) {
      setOpenTerminalState('error');
      setOpenTerminalError(e instanceof Error ? e.message : String(e));
      setTimeout(() => setOpenTerminalState('idle'), 4000);
    }
  };

  const onKill = async () => {
    if (!agent.ptyId) return;
    if (!confirm(t('terminal.closeConfirm', { name: agent.name }))) return;
    await window.cth.killPty(agent.ptyId);
    disposeTerminal(agent.ptyId);
    archiveAgent(agent.id);
  };

  const fallbackToPty = async () => {
    if (agent.runtimeMode !== 'codex-native') return;
    if (!confirm('切换到 Codex PTY 兼容模式？当前原生回合会先停止，会话文件会保留。')) return;
    const result = await window.cth.runtimeFallback(agent.id);
    if (!result.ok) { setOpenTerminalError(result.error ?? 'fallback failed'); return; }
    if (agent.ptyId) resetTerminal(agent.ptyId);
    updateAgent(agent.id, {
      runtimeMode: 'pty', runtimeStatus: undefined, runtimeTurnId: undefined,
      runtimeApproval: undefined, status: 'idle', action: 'PTY compatibility'
    });
  };

  return (
    <PixelPanel
      variant="default"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        padding: 0,
        overflow: 'hidden'
      }}
      noPadding
    >
      {/* Thin header strip */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '6px 8px',
        background: 'var(--cth-cream-100)',
        borderBottom: '1px solid var(--cth-ink-700)',
        flexShrink: 0
      }}>
        <div style={{
          width: 32, height: 32,
          background: `var(--cth-${agent.accent}-light)`,
          boxShadow: 'inset 0 0 0 1px var(--cth-ink-300)',
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center', overflow: 'hidden',
          flexShrink: 0
        }}>
          <SpritePortrait character={agent.character} scale={1} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: 'var(--cth-font-display)',
            fontSize: 10, lineHeight: '14px',
            color: 'var(--cth-ink-900)',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
          }}>{agent.name.toUpperCase()}</div>
          <div style={{
            display: 'flex', gap: 6, alignItems: 'center', marginTop: 1
          }}>
            <PixelBadge status={agent.status} />
            {agent.runtimeMode === 'codex-native' && <span title={(agent.runtimeInstructionSources ?? []).join('\n')} style={{ fontSize: 10, color: 'var(--cth-ink-500)' }}>CODEX NATIVE</span>}
            <span style={{
              fontSize: 12, color: 'var(--cth-ink-500)',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
            }}>{agent.project}</span>
          </div>
        </div>
        {/* v0.3.4: the IDE lives at agent level (replaces the old files tab) —
            opens the full-window Monaco editor rooted at this agent's workspace. */}
        <PixelButton variant="secondary" size="sm" onClick={() => useStore.getState().setIdeOpen(true, agent.id)}>
          <span title={t('detail.openIde', { project: agent.project })} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Icon name="code" /> IDE
          </span>
        </PixelButton>
        <PixelButton variant="secondary" size="sm" onClick={openTerminal} disabled={openTerminalState === 'opening'}>
          <span title={t('detail.openTerminal', { cwd: agent.cwd })} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Icon name="terminal" />
            {openTerminalState === 'opening' ? '...' : openTerminalState === 'ok' ? 'ok' : openTerminalState === 'error' ? 'err' : 'open'}
          </span>
        </PixelButton>
        {agent.runtimeMode === 'codex-native' && (
          <PixelButton variant="secondary" size="sm" onClick={() => void fallbackToPty()}>PTY 回退</PixelButton>
        )}
        {isReal && (
          <PixelButton variant="destructive" size="sm" onClick={onKill}>
            <Icon name="x" />
          </PixelButton>
        )}
      </div>

      {openTerminalError && (
        <div style={{
          fontSize: 12, color: 'var(--cth-coral)',
          padding: '2px 8px',
          background: 'var(--cth-coral-light)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
        }}>{openTerminalError}</div>
      )}

      {agent.runtimeMode === 'codex-native' && agent.runtimeLastError && (
        <div style={{
          fontSize: 11, color: 'var(--cth-coral)', padding: '4px 8px',
          background: 'var(--cth-coral-light)', borderBottom: '1px solid var(--cth-ink-300)'
        }}>
          {agent.runtimeLastError}
          {(agent.runtimeUncertainDeliveries?.length ?? 0) > 0
            ? `（${agent.runtimeUncertainDeliveries!.length} 条投递待核对）`
            : ''}
        </div>
      )}

      {recentSessions.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', borderBottom: '1px solid var(--cth-ink-300)', background: 'var(--cth-paper-100)' }}>
          <span style={{ fontSize: 11, color: 'var(--cth-ink-600)', whiteSpace: 'nowrap' }}>{t('w6.session.recent')}</span>
          <select value={selectedSession} onChange={(e) => setSelectedSession(e.target.value)} disabled={resumingSession} style={{ minWidth: 0, flex: 1, fontSize: 11 }}>
            {recentSessions.map((session) => (
              <option key={`${session.provider}:${session.id}`} value={session.id}>
                {session.agentName ?? agent.name} · {session.provider} · {session.id.slice(0, 16)}
              </option>
            ))}
          </select>
          <PixelButton variant="secondary" size="sm" onClick={() => void resumeSelectedSession()} disabled={resumingSession || !selectedSession}>
            {resumingSession ? t('w6.session.resuming') : t('w6.session.resume')}
          </PixelButton>
        </div>
      )}
      {recentSessions.length > 0 && agent.ptyId && (
        <div style={{ fontSize: 11, padding: '3px 8px', color: 'var(--cth-ink-500)' }}>
          {t('w6.session.occupied')}
        </div>
      )}
      {recentSessions.find((session) => session.id === selectedSession)?.limitation && (
        <div style={{ fontSize: 11, padding: '3px 8px', color: 'var(--cth-ink-500)' }}>
          {recentSessions.find((session) => session.id === selectedSession)?.limitation}
        </div>
      )}
      {sessionMessage && <div style={{ fontSize: 11, padding: '3px 8px', color: sessionOutcome === 'error' ? 'var(--cth-coral)' : 'var(--cth-ink-700)' }}>{sessionMessage}</div>}

      {/* #7C — operator control (pause / halt / steer) for live agents */}
      {isReal && <AgentControlStrip agentId={agent.id} />}

      {/* Tabs */}
      <SidebarTabs current={sidebarTab} accent={agent.accent} onChange={setSidebarTab} />

      {/* Active tab body — fills remaining space */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        {sidebarTab === 'terminal' && (
          isReal && agent.ptyId ? (
            isFullscreenedHere ? (
              <EmptyTab title={t('agent.fullscreen')}>
                {t('commandCenter.terminalFullscreen')}
              </EmptyTab>
            ) : (
            <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
              <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
                <PtyTerminalView
                  key={terminalInstanceKey(agent.ptyId, agent.terminalGeneration)}
                  ptyId={agent.ptyId}
                  onStreamData={onPtyStream}
                  onUserPrompt={(t) => {
                    updateAgent(agent.id, { lastPrompt: t });
                    if (t.trim().toLowerCase() === '/clear') {
                      updateAgent(agent.id, { contextTokens: 0, contextLimit: undefined, progress: 0 });
                    }
                    void window.cth.historyAdd({ agentId: agent.id, cwd: agent.cwd, text: t });
                  }}
                  onToggleFullscreen={() => setFullscreen(agent.id)}
                  fullscreen={false}
                  embedded
                />
              </div>
              <MessageQueueComposer agent={agent} />
            </div>
            )
          ) : (
              <EmptyTab title={t('agent.noPty')}>
              {t('residual.noLiveTerminal')}
            </EmptyTab>
          )
        )}

        {sidebarTab === 'git' && (
          <GitTab cwd={agent.cwd} />
        )}

        {sidebarTab === 'messages' && (
          <ThreadsPanel agentId={agent.id} />
        )}

        {sidebarTab === 'traces' && (
          <ToolWaterfall agentId={agent.id} />
        )}
      </div>
    </PixelPanel>
  );
}

function EmptyTab({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: 16, gap: 8,
      background: 'var(--cth-paper-200)'
    }}>
      <div style={{
        fontFamily: 'var(--cth-font-display)', fontSize: 10, lineHeight: '14px',
        color: 'var(--cth-ink-500)'
      }}>{title.toUpperCase()}</div>
      <p style={{
        margin: 0, fontSize: 13, textAlign: 'center', color: 'var(--cth-ink-700)',
        maxWidth: 280
      }}>{children}</p>
    </div>
  );
}
