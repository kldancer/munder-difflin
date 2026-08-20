import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from '@/store/store';
import type { ThemeId } from '@/scene/office/themeRegistry';
import { loadTheme } from '@/scene/office/themeLoader';

// Only complete bundles are clickable. A skin remounts the visual floor but
// never kills, archives, or recreates an agent runtime.
interface ThemeMeta { id: ThemeId; labelKey: string; blurbKey: string; swatch: string; }
const THEME_META: ThemeMeta[] = [
  { id: 'office', labelKey: 'office', blurbKey: 'officeBlurb', swatch: '#6b5a4a' },
  { id: 'starship', labelKey: 'starship', blurbKey: 'starshipBlurb', swatch: '#102c62' },
];

export function OfficeThemePicker() {
  const { t } = useTranslation();
  const r = (key: string, options?: Record<string, unknown>) => t(`residual.${key}`, options);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  // App mirrors the persisted theme into the store at boot, and every successful
  // switch updates that same value. Reading it here avoids remounting Settings
  // from the stale, boot-time config prop after a prior switch.
  const current = useStore((s) => s.officeTheme) as ThemeId;
  const setOfficeTheme = useStore((s) => s.setOfficeTheme);

  const applyTheme = async (id: ThemeId) => {
    if (busy || id === current) return;
    setBusy(true);
    setNote('');
    try {
      // Validate before persisting. There is intentionally no lifecycle call:
      // IDs, PTYs, sessions, queues, memory and worktrees remain untouched.
      await loadTheme(id);
      await window.cth.updateConfig({ officeTheme: id });
      setOfficeTheme(id);
      setNote(t('w6.theme.switched'));
    } catch (e) {
      setNote(t('w6.theme.failed', { error: e instanceof Error ? e.message : String(e) }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div style={{ fontFamily: 'var(--cth-font-display)', fontSize: 8, lineHeight: '12px', color: 'var(--cth-ink-500)', textTransform: 'uppercase', marginBottom: 10 }}>
        {r('officeTheme')}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 13, lineHeight: '20px', color: 'var(--cth-ink-900)' }}>{t('w6.theme.title')}</span>
        <span style={{ fontSize: 12, lineHeight: '16px', color: 'var(--cth-ink-500)' }}>{t('w6.theme.help')}</span>
      </div>
      <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
          {THEME_META.map((theme) => {
            const isCurrent = theme.id === current;
            return (
              <button key={theme.id} onClick={() => void applyTheme(theme.id)} disabled={busy}
                style={{ display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left', padding: 8, cursor: busy ? 'default' : 'pointer', background: isCurrent ? 'var(--cth-paper-100)' : 'transparent', boxShadow: isCurrent ? 'inset 0 0 0 1.5px var(--cth-ink-500)' : 'inset 0 0 0 1px var(--cth-ink-300)', opacity: busy && !isCurrent ? 0.6 : 1 }}>
                <span style={{ width: 28, height: 28, flexShrink: 0, background: theme.swatch, boxShadow: 'inset 0 0 0 1.5px var(--cth-ink-500)' }} />
                <span style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 12, lineHeight: '16px', color: 'var(--cth-ink-900)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t(`w6.theme.${theme.labelKey}`)}</span>
                    {isCurrent && <span style={{ fontFamily: 'var(--cth-font-display)', fontSize: 7, color: 'var(--cth-mint)', textTransform: 'uppercase' }}>{r('current')}</span>}
                  </span>
                  <span style={{ fontSize: 11, lineHeight: '14px', color: 'var(--cth-ink-500)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t(`w6.theme.${theme.blurbKey}`)}</span>
                </span>
              </button>
            );
          })}
      </div>
      {note && <div style={{ marginTop: 10, fontSize: 12, color: 'var(--cth-ink-500)' }}>{note}</div>}
    </div>
  );
}
