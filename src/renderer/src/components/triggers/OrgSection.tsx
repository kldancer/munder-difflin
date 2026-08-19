import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from '@/store/store';
import { CLONE_NODE_BLURB, type OrgTriggerConfig, type TriggerMode } from '@shared/triggers';
import { getOrgTrigger, setOrgTrigger as persistOrgTrigger } from './api';
import { Callout, Field, Hint, ModePicker, SecretField, Toggle } from './ui';

/**
 * ORGANISATION — peer messaging between teammates' clone nodes.
 *
 * Configuration only. There is no transport service yet, so a key saved here
 * starts nothing; it is the setting the service will read once it exists. The
 * copy says exactly that rather than implying a connection.
 *
 * Renders off the store mirror that Settings → Connections also renders off, and
 * follows the same mirror-then-persist rule: typing the key updates the mirror
 * (so Settings stays live) and commits on blur; the toggle and the trust mode
 * persist on the spot.
 */
export function OrgSection({ onSummary }: { onSummary?: (s: string) => void }) {
  const { t } = useTranslation();
  const cfg = useStore((s) => s.orgTrigger);
  const mirror = useStore((s) => s.setOrgTrigger);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    // Only when the mirror looks unseeded — adopting unconditionally could
    // clobber a key being typed in Settings this second.
    if (useStore.getState().orgTrigger.apiKey) return;
    void getOrgTrigger().then((c) => {
      if (c && !useStore.getState().orgTrigger.apiKey) mirror(c);
    });
  }, [mirror]);

  useEffect(() => {
    onSummary?.(!cfg.apiKey.trim() ? t('triggers.noKey') : cfg.enabled ? t('triggers.on') : t('triggers.off'));
  }, [cfg, onSummary]);

  const apply = (next: OrgTriggerConfig, persist = true) => {
    mirror(next);
    if (persist) persistOrgTrigger(next);
  };

  const hasKey = cfg.apiKey.trim().length > 0;

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ flex: 1, fontSize: 12, color: 'var(--cth-ink-700)' }}>
          {t('triggers.organizationBlurb')}
        </span>
        <Toggle on={cfg.enabled} onClick={() => apply({ ...cfg, enabled: !cfg.enabled })} />
      </div>

      <Field label={t('triggers.organization')}>
        <SecretField
          value={cfg.apiKey}
          revealed={revealed}
          onReveal={() => setRevealed((r) => !r)}
          placeholder={t('triggers.secret')}
          onChange={(apiKey) => apply({ ...cfg, apiKey }, false)}
          onBlur={() => apply(cfg)}
        />
        <Hint>{CLONE_NODE_BLURB}</Hint>
      </Field>

      <Field label={t('triggers.trust')}>
        <ModePicker value={cfg.mode} onChange={(mode: TriggerMode) => apply({ ...cfg, mode })} />
      </Field>

      <Callout tone="note">
        Settings only, for now. The org messaging service does not exist yet, so a key here starts no
        connection and nothing is sent or received. It is stored ready for when it does.
      </Callout>

      {cfg.enabled && !hasKey && (
        <Callout>{t('triggers.noKey')}</Callout>
      )}
    </>
  );
}
