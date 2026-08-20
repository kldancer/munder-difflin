import { useTranslation } from 'react-i18next';

type LifecycleCapacityResult = Awaited<ReturnType<Window['cth']['lifecycleCapacity']>>;
export type LifecycleCapacitySnapshot = Extract<LifecycleCapacityResult, { format: 1 }>;
type CapacityMetric = LifecycleCapacitySnapshot['sessions'];

export interface LifecycleCapacityPanelProps {
  snapshot: LifecycleCapacitySnapshot | null;
  loading?: boolean;
  onRefresh?: () => void;
}

function bytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KiB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MiB`;
}

function Metric({ value }: { value: CapacityMetric }) {
  const { t } = useTranslation();
  return <span>{t('w7.capacity.files', { count: value.files, bytes: bytes(value.bytes) })}{value.partial ? t('w7.capacity.partial') : ''}</span>;
}

export function LifecycleCapacityPanel({ snapshot, loading = false, onRefresh }: LifecycleCapacityPanelProps) {
  const { t } = useTranslation();
  if (loading && !snapshot) return <div style={{ padding: 12 }}>{t('w7.capacity.scanning')}</div>;
  if (!snapshot) return <div style={{ padding: 12 }}>{t('w7.capacity.empty')}</div>;
  const rows: Array<[string, CapacityMetric]> = [
    [t('w7.capacity.sessions'), snapshot.sessions],
    [t('w7.capacity.inboxPending'), snapshot.messages.inboxPending],
    [t('w7.capacity.inboxDone'), snapshot.messages.inboxDone],
    [t('w7.capacity.outboxPending'), snapshot.messages.outboxPending],
    [t('w7.capacity.outboxSent'), snapshot.messages.outboxSent],
    [t('w7.capacity.activity'), snapshot.activityLog],
    [t('w7.capacity.cost'), snapshot.costLedger],
    [t('w7.capacity.memory'), snapshot.memory],
    [t('w7.capacity.worktrees'), snapshot.worktree]
  ];
  return (
    <section aria-label="Lifecycle capacity" style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 12 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <strong>{t('w7.capacity.title')}</strong>
        {onRefresh && <button type="button" onClick={onRefresh} disabled={loading}>{loading ? t('w7.capacity.scanning') : t('w7.capacity.refresh')}</button>}
      </header>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(120px, 1fr) 2fr', gap: 6, fontSize: 12 }}>
        {rows.map(([label, value]) => <div key={label} style={{ display: 'contents' }}><span>{label}</span><span><Metric value={value} /></span></div>)}
      </div>
      <p style={{ margin: 0, fontSize: 11 }}>{t('w7.capacity.policy')}</p>
    </section>
  );
}
