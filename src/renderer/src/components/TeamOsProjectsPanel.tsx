import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TeamOsProjectSnapshot, TeamOsReference, TeamOsSnapshot } from '../../../main/teamOs';
import { Icon } from './Icon';
import { PixelButton } from './PixelButton';

const statusColor: Record<TeamOsProjectSnapshot['status'], string> = {
  ready: 'var(--cth-mint)',
  disabled: 'var(--cth-ink-300)',
  invalid: 'var(--cth-coral)'
};

function pathText(value: string | null): string {
  return value || '—';
}

function ReferenceGroup({
  group, references
}: {
  group: TeamOsReference['group'];
  references: TeamOsReference[];
}) {
  const { t } = useTranslation();
  const values = references.filter((ref) => ref.group === group);
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontFamily: 'var(--cth-font-display)', fontSize: 8, color: 'var(--cth-ink-500)', marginBottom: 5 }}>
        {t(`teamOs.projects.${group}`)}
      </div>
      {values.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--cth-ink-500)' }}>{t('teamOs.projects.noReferences')}</div>
      ) : values.map((ref) => (
        <div key={`${group}-${ref.key}`} style={{ display: 'flex', gap: 6, alignItems: 'baseline', minWidth: 0, marginBottom: 4 }}>
          <span aria-hidden style={{ color: ref.exists ? 'var(--cth-mint)' : 'var(--cth-coral)', flexShrink: 0 }}>
            {ref.exists ? '●' : '○'}
          </span>
          <span style={{ color: 'var(--cth-ink-700)', flexShrink: 0 }}>{ref.key}</span>
          <span title={ref.absolutePath} style={{ color: 'var(--cth-ink-500)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {ref.relativePath}
          </span>
          <span style={{ color: ref.exists ? 'var(--cth-mint)' : 'var(--cth-coral)', flexShrink: 0 }}>
            {t(ref.exists ? 'teamOs.projects.exists' : 'teamOs.projects.absent')}
          </span>
        </div>
      ))}
    </div>
  );
}

function ProjectCard({ project }: { project: TeamOsProjectSnapshot }) {
  const { t } = useTranslation();
  const constraints = Object.entries(project.constraints);
  return (
    <section style={{
      background: 'var(--cth-paper-100)',
      boxShadow: 'inset 0 0 0 1px var(--cth-ink-300)',
      padding: 12,
      display: 'flex',
      flexDirection: 'column',
      gap: 10
    }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <div style={{
          width: 28, height: 28, display: 'grid', placeItems: 'center',
          color: 'var(--cth-ink-700)', background: 'var(--cth-cream-200)',
          boxShadow: 'inset 0 0 0 1px var(--cth-ink-300)', flexShrink: 0
        }}><Icon name="folder" /></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: 'var(--cth-ink-900)', fontSize: 14 }}>{project.name}</div>
          <div style={{ color: 'var(--cth-ink-500)', fontSize: 11 }}>{project.id}</div>
        </div>
        <span style={{
          color: statusColor[project.status], fontSize: 11,
          boxShadow: `inset 0 0 0 1px ${statusColor[project.status]}`,
          padding: '3px 6px 2px', whiteSpace: 'nowrap'
        }}>{t(`teamOs.projects.${project.status}`)}</span>
      </div>

      {project.error && (
        <div style={{ color: 'var(--cth-coral)', background: 'var(--cth-coral-light)', padding: '7px 8px', fontSize: 12 }}>
          {project.error.code}: {project.error.message}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 10 }}>
        <PathFact label={t('teamOs.projects.root')} value={pathText(project.root)} />
        <PathFact label={t('teamOs.projects.adapter')} value={project.adapterPath} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        <ReferenceGroup group="authority" references={project.references} />
        <ReferenceGroup group="machine" references={project.references} />
        <ReferenceGroup group="evidence" references={project.references} />
      </div>

      <div>
        <div style={{ fontFamily: 'var(--cth-font-display)', fontSize: 8, color: 'var(--cth-ink-500)', marginBottom: 5 }}>
          {t('teamOs.projects.constraints')}
        </div>
        {constraints.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--cth-ink-500)' }}>{t('teamOs.projects.noConstraints')}</div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {constraints.map(([key, value]) => (
              <span key={key} style={{
                color: value ? 'var(--cth-mint)' : 'var(--cth-ink-700)',
                background: 'var(--cth-cream-200)', padding: '3px 6px 2px', fontSize: 11,
                boxShadow: 'inset 0 0 0 1px var(--cth-ink-100)'
              }}>{key}: {String(value)}</span>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function PathFact({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontFamily: 'var(--cth-font-display)', fontSize: 8, color: 'var(--cth-ink-500)', marginBottom: 4 }}>{label}</div>
      <div title={value} style={{ fontFamily: 'var(--cth-font-mono, monospace)', color: 'var(--cth-ink-700)', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {value}
      </div>
    </div>
  );
}

export function TeamOsProjectsPanel() {
  const { t } = useTranslation();
  const [snapshot, setSnapshot] = useState<TeamOsSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try { setSnapshot(await window.cth.teamOsSnapshot()); }
    catch (error) { setLoadError(error instanceof Error ? error.message : String(error)); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const sourceLabel = snapshot
    ? t(`teamOs.projects.source${snapshot.homeSource[0].toUpperCase()}${snapshot.homeSource.slice(1)}`)
    : '';

  return (
    <div style={{ height: '100%', overflow: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <header style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--cth-font-display)', fontSize: 8, color: 'var(--cth-ink-500)', marginBottom: 4 }}>
            {t('teamOs.projects.eyebrow')}
          </div>
          <div style={{ fontFamily: 'var(--cth-font-display)', fontSize: 11, color: 'var(--cth-ink-900)', lineHeight: '16px' }}>
            {t('teamOs.projects.title')}
          </div>
          <div style={{ color: 'var(--cth-ink-500)', fontSize: 12, lineHeight: '17px', marginTop: 4, maxWidth: 760 }}>
            {t('teamOs.projects.intro')}
          </div>
        </div>
        <PixelButton variant="secondary" size="sm" onClick={() => { void refresh(); }} disabled={loading}>
          {loading ? t('teamOs.projects.refreshing') : t('teamOs.projects.refresh')}
        </PixelButton>
      </header>

      {snapshot && (
        <div style={{ background: 'var(--cth-cream-200)', padding: '8px 10px', boxShadow: 'inset 0 0 0 1px var(--cth-ink-100)' }}>
          <PathFact label={t('teamOs.projects.home')} value={snapshot.teamOsHome} />
          <div style={{ color: 'var(--cth-ink-500)', fontSize: 11, marginTop: 4 }}>
            {t('teamOs.projects.source', { source: sourceLabel })} · {t('teamOs.projects.readOnly')}
          </div>
        </div>
      )}

      {(loadError || snapshot?.status === 'missing' || snapshot?.status === 'invalid') && (
        <div style={{ background: 'var(--cth-coral-light)', boxShadow: 'inset 0 0 0 1px var(--cth-coral)', padding: 10 }}>
          <div style={{ color: 'var(--cth-coral)', fontSize: 13, marginBottom: 4 }}>
            {loadError
              ? t('teamOs.projects.loadFailed')
              : t(snapshot?.status === 'missing' ? 'teamOs.projects.missingTitle' : 'teamOs.projects.invalidTitle')}
          </div>
          <div style={{ color: 'var(--cth-ink-700)', fontSize: 12, lineHeight: '17px' }}>
            {loadError || snapshot?.error?.message}
          </div>
          {!loadError && <div style={{ color: 'var(--cth-ink-500)', fontSize: 12, marginTop: 5 }}>
            {t(snapshot?.status === 'missing' ? 'teamOs.projects.missingBody' : 'teamOs.projects.invalidBody')}
          </div>}
        </div>
      )}

      {snapshot?.status === 'ready' && snapshot.projects.length === 0 && (
        <div style={{ color: 'var(--cth-ink-500)', fontSize: 12 }}>{t('teamOs.projects.empty')}</div>
      )}
      {snapshot?.projects.map((project) => <ProjectCard key={project.id} project={project} />)}

      <footer style={{ color: 'var(--cth-ink-500)', fontSize: 11, lineHeight: '16px', paddingBottom: 4 }}>
        <div>{t('teamOs.projects.noBodies')}</div>
        <div>{t('teamOs.projects.later')}</div>
      </footer>
    </div>
  );
}
