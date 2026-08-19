import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { HarnessConfig } from '@/store/config';
import { MCP_CATALOG, type McpTier } from '@shared/mcpCatalog';

export interface McpDefaultsSettingsProps {
  config: HarnessConfig;
}

const TIER_ORDER: McpTier[] = ['safe-readonly', 'write', 'secret'];
const labelStyle: React.CSSProperties = {
  fontFamily: 'var(--cth-font-display)',
  fontSize: 8,
  lineHeight: '12px',
  color: 'var(--cth-ink-500)',
  textTransform: 'uppercase'
};

export function McpDefaultsSettings({ config }: McpDefaultsSettingsProps) {
  const { t } = useTranslation();
  const [note, setNote] = useState('');

  const enabledFor = (id: string): boolean =>
    config.mcpDefaults?.[id]?.enabled ?? MCP_CATALOG.find((e) => e.id === id)?.defaultEnabled ?? false;

  const toggle = async (id: string) => {
    const next = !enabledFor(id);
    try {
      await window.cth.updateConfig({
        mcpDefaults: { ...(config.mcpDefaults ?? {}), [id]: { enabled: next } }
      });
      setNote(t(`mcpSettings.${next ? 'enabledNotice' : 'disabledNotice'}`, { id }));
      setTimeout(() => setNote(''), 1800);
    } catch {
      setNote(t('mcpSettings.saveFailed'));
      setTimeout(() => setNote(''), 2000);
    }
  };

  const byTier = (tier: McpTier) => MCP_CATALOG.filter((e) => e.tier === tier);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <div style={{ ...labelStyle, marginBottom: 6 }}>{t('settings.defaultMcpServers', { defaultValue: 'Default MCP servers' })}</div>
        <span style={{ fontSize: 12, lineHeight: '16px', color: 'var(--cth-ink-500)' }}>
          {t('mcpSettings.intro')}
        </span>
      </div>

      {TIER_ORDER.map((tier) => {
        const entries = byTier(tier);
        if (entries.length === 0) return null;
        const isConsent = tier !== 'safe-readonly';
        return (
          <div key={tier} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span style={{
                fontFamily: 'var(--cth-font-display)', fontSize: 8, lineHeight: '12px',
                color: isConsent ? '#6E1423' : 'var(--cth-ink-500)',
                textTransform: 'uppercase'
              }}>
                {t(`mcpSettings.tiers.${tier}.label`)}
              </span>
              <span style={{ fontSize: 11, lineHeight: '15px', color: 'var(--cth-ink-400, var(--cth-ink-500))' }}>
                {t(`mcpSettings.tiers.${tier}.note`)}
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {entries.map((entry) => {
                const on = enabledFor(entry.id);
                return (
                  <div
                    key={entry.id}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      gap: 12, padding: '7px 10px',
                      background: 'var(--cth-paper-100)',
                      boxShadow: `inset 0 0 0 1px ${isConsent && on ? '#6E1423' : 'var(--cth-ink-300)'}`
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 1, flex: 1, minWidth: 0 }}>
                      <span style={{ fontSize: 12, lineHeight: '18px', color: 'var(--cth-ink-900)', fontWeight: 600 }}>
                        {entry.label}
                        <code style={{
                          marginLeft: 6,
                          fontFamily: 'var(--cth-font-mono)',
                          fontSize: 11,
                          color: 'var(--cth-ink-500)',
                          fontWeight: 400
                        }}>{entry.id}</code>
                      </span>
                      <span style={{ fontSize: 12, lineHeight: '16px', color: 'var(--cth-ink-500)', wordBreak: 'break-word' }}>
                        {t(`mcpSettings.entries.${entry.id}`, { defaultValue: entry.description })}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => { void toggle(entry.id); }}
                      style={{
                        flexShrink: 0,
                        padding: '3px 10px 1px',
                        background: on
                          ? (isConsent ? 'var(--cth-coral-light, #f6d3c4)' : 'var(--cth-lemon)')
                          : 'var(--cth-cream-200)',
                        boxShadow: `inset 0 0 0 1px ${on ? 'var(--cth-ink-900)' : 'var(--cth-ink-700)'}`,
                        border: 'none',
                        fontFamily: 'var(--cth-font-display)',
                        fontSize: 8,
                        lineHeight: '14px',
                        color: 'var(--cth-ink-900)',
                        cursor: 'pointer',
                        textTransform: 'uppercase'
                      }}
                    >
                      {on ? t('settings.on') : t('settings.off')}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {note && (
        <span style={{ fontSize: 12, color: 'var(--cth-mint)' }}>{note}</span>
      )}
    </div>
  );
}
