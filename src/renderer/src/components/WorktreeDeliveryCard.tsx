import { PixelButton } from './PixelButton';
import { useTranslation } from 'react-i18next';

export interface WorktreeDeliveryCardProps {
  sourceBranch: string;
  targetBranch: string;
  sourcePath: string;
  commitsAhead: number;
  canMerge: boolean;
  canReclaim: boolean;
  verification: string[];
  busy?: boolean;
  onInspect?: () => void;
  onMerge?: () => void;
  onReclaim?: () => void;
}

/** Presentational W7.2 card. IPC and orchestration stay with the parent Tab. */
export function WorktreeDeliveryCard(props: WorktreeDeliveryCardProps) {
  const { t } = useTranslation();
  const verificationText = (message: string): string => message === 'source worktree must be clean'
    ? t('w7.delivery.verification.sourceDirty')
    : message === 'target checkout must be clean' ? t('w7.delivery.verification.targetDirty')
      : message === 'could not verify source commits against target' ? t('w7.delivery.verification.unknownAhead')
        : message === 'source has no commits ahead of target' ? t('w7.delivery.verification.noAhead') : message;
  return <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 6, background: 'var(--cth-paper-100)', boxShadow: 'inset 0 0 0 1px var(--cth-ink-100)' }}>
    <div style={{ fontFamily: 'var(--cth-font-ui)', fontSize: 12, fontWeight: 700 }}>{t('w7.delivery.title')}</div>
    <div style={{ fontFamily: 'var(--cth-font-mono)', fontSize: 11, wordBreak: 'break-all' }}>{props.sourceBranch} → {props.targetBranch} · {t('w7.delivery.commits', { count: props.commitsAhead })}</div>
    <div style={{ fontFamily: 'var(--cth-font-mono)', fontSize: 10, color: 'var(--cth-ink-700)', wordBreak: 'break-all' }}>{props.sourcePath}</div>
    {props.verification.map((message) => <div key={message} style={{ color: props.canMerge || props.canReclaim ? 'var(--cth-ink-500)' : 'var(--cth-coral)', fontSize: 11 }}>{verificationText(message)}</div>)}
    <div style={{ display: 'flex', gap: 6 }}>
      {props.onInspect && <PixelButton size="sm" variant="ghost" onClick={props.onInspect}>{t('w7.delivery.inspect')}</PixelButton>}
      {props.onMerge && <PixelButton size="sm" onClick={props.onMerge} disabled={!props.canMerge || props.busy}>{props.busy ? t('w7.delivery.busy') : t('w7.delivery.merge')}</PixelButton>}
      {props.onReclaim && <PixelButton size="sm" variant="ghost" onClick={props.onReclaim} disabled={!props.canReclaim || props.busy}>{t('w7.delivery.reclaim')}</PixelButton>}
    </div>
  </div>;
}
