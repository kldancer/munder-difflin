import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  TeamOsCompiledWorkOrder,
  TeamOsPreparationCatalog,
  TeamOsProjectSnapshot
} from '../../../main/teamOs';
import { useStore } from '@/store/store';
import { PixelButton } from './PixelButton';

const inputStyle = {
  width: '100%', border: 'none', outline: 'none', padding: '7px 8px',
  background: 'var(--cth-paper-100)', color: 'var(--cth-ink-900)',
  boxShadow: 'inset 0 0 0 1px var(--cth-ink-300)',
  fontFamily: 'var(--cth-font-ui)', fontSize: 12
} as const;

export function TeamOsWorkComposer({
  project,
  catalog,
  onClose
}: {
  project: TeamOsProjectSnapshot;
  catalog: TeamOsPreparationCatalog;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const defaultRole = useMemo(
    () => catalog.roles.find((role) => role.id === 'delivery-engineer')?.id ?? catalog.roles[0]?.id ?? '',
    [catalog.roles]
  );
  const [roleId, setRoleId] = useState(defaultRole);
  const [capabilityIds, setCapabilityIds] = useState<string[]>([]);
  const [outcome, setOutcome] = useState('');
  const [nonGoals, setNonGoals] = useState('');
  const [acceptance, setAcceptance] = useState('');
  const [stopConditions, setStopConditions] = useState('');
  const [targetMinutes, setTargetMinutes] = useState('60');
  const [hardStopMinutes, setHardStopMinutes] = useState('120');
  const [localWrite, setLocalWrite] = useState(false);
  const [compiling, setCompiling] = useState(false);
  const [error, setError] = useState('');
  const [compiled, setCompiled] = useState<TeamOsCompiledWorkOrder | null>(null);
  const requestDispatchSeed = useStore((state) => state.requestDispatchSeed);
  const requestCommandCenterTab = useStore((state) => state.requestCommandCenterTab);

  useEffect(() => {
    setRoleId(defaultRole);
    setCapabilityIds([]);
    setOutcome('');
    setNonGoals('');
    setAcceptance('');
    setStopConditions('');
    setTargetMinutes('60');
    setHardStopMinutes('120');
    setLocalWrite(false);
    setCompiled(null);
    setError('');
  }, [defaultRole, project.id]);

  const toggleCapability = (id: string) => {
    setCompiled(null);
    setCapabilityIds((current) => current.includes(id)
      ? current.filter((candidate) => candidate !== id)
      : [...current, id]);
  };

  const compile = async () => {
    setCompiling(true);
    setError('');
    setCompiled(null);
    try {
      const result = await window.cth.teamOsCompileWorkOrder({
        projectId: project.id,
        roleId,
        capabilityProfileIds: capabilityIds,
        outcome,
        nonGoals: splitItems(nonGoals),
        acceptance: splitItems(acceptance),
        stopConditions: splitItems(stopConditions),
        targetMinutes: targetMinutes ? Number(targetMinutes) : null,
        hardStopMinutes: hardStopMinutes ? Number(hardStopMinutes) : null,
        localWrite
      });
      if (!result.ok) setError(`${result.error.code}: ${result.error.message}`);
      else setCompiled(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setCompiling(false);
    }
  };

  const fillDispatch = () => {
    if (!compiled) return;
    requestDispatchSeed(compiled.prompt);
    requestCommandCenterTab('floor');
  };

  return (
    <section style={{
      background: 'var(--cth-cream-100)', padding: 12,
      boxShadow: 'inset 0 0 0 1px var(--cth-mint)',
      display: 'flex', flexDirection: 'column', gap: 10
    }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: 'var(--cth-font-display)', fontSize: 9, color: 'var(--cth-ink-900)' }}>
            {t('teamOs.prepare.title')}
          </div>
          <div style={{ fontSize: 12, color: 'var(--cth-ink-500)', marginTop: 4 }}>
            {t('teamOs.prepare.intro', { project: project.name })}
          </div>
        </div>
        <PixelButton variant="secondary" size="sm" onClick={onClose}>{t('teamOs.prepare.close')}</PixelButton>
      </div>

      <label style={{ fontSize: 12, color: 'var(--cth-ink-700)' }}>
        {t('teamOs.prepare.outcome')}
        <textarea
          value={outcome}
          onChange={(event) => { setOutcome(event.target.value); setCompiled(null); }}
          placeholder={t('teamOs.prepare.outcomePlaceholder')}
          rows={3}
          style={{ ...inputStyle, resize: 'vertical', marginTop: 4 }}
        />
      </label>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, .65fr) minmax(240px, 1.35fr)', gap: 10 }}>
        <label style={{ fontSize: 12, color: 'var(--cth-ink-700)' }}>
          {t('teamOs.prepare.ownerRole')}
          <select
            value={roleId}
            onChange={(event) => { setRoleId(event.target.value); setCompiled(null); }}
            style={{ ...inputStyle, marginTop: 4 }}
          >
            {catalog.roles.map((role) => <option key={role.id} value={role.id}>{role.label}</option>)}
          </select>
        </label>
        <label style={{ fontSize: 12, color: 'var(--cth-ink-700)' }}>
          {t('teamOs.prepare.nonGoals')}
          <input
            value={nonGoals}
            onChange={(event) => { setNonGoals(event.target.value); setCompiled(null); }}
            placeholder={t('teamOs.prepare.nonGoalsPlaceholder')}
            style={{ ...inputStyle, marginTop: 4 }}
          />
        </label>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 10 }}>
        <label style={{ fontSize: 12, color: 'var(--cth-ink-700)' }}>
          {t('teamOs.prepare.acceptance')}
          <textarea
            value={acceptance}
            onChange={(event) => { setAcceptance(event.target.value); setCompiled(null); }}
            placeholder={t('teamOs.prepare.acceptancePlaceholder')}
            rows={2}
            style={{ ...inputStyle, resize: 'vertical', marginTop: 4 }}
          />
        </label>
        <label style={{ fontSize: 12, color: 'var(--cth-ink-700)' }}>
          {t('teamOs.prepare.stopConditions')}
          <textarea
            value={stopConditions}
            onChange={(event) => { setStopConditions(event.target.value); setCompiled(null); }}
            placeholder={t('teamOs.prepare.stopConditionsPlaceholder')}
            rows={2}
            style={{ ...inputStyle, resize: 'vertical', marginTop: 4 }}
          />
        </label>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(120px, 180px))', gap: 10 }}>
        <label style={{ fontSize: 12, color: 'var(--cth-ink-700)' }}>
          {t('teamOs.prepare.targetMinutes')}
          <input
            type="number" min={1} max={1440}
            value={targetMinutes}
            onChange={(event) => { setTargetMinutes(event.target.value); setCompiled(null); }}
            style={{ ...inputStyle, marginTop: 4 }}
          />
        </label>
        <label style={{ fontSize: 12, color: 'var(--cth-ink-700)' }}>
          {t('teamOs.prepare.hardStopMinutes')}
          <input
            type="number" min={1} max={1440}
            value={hardStopMinutes}
            onChange={(event) => { setHardStopMinutes(event.target.value); setCompiled(null); }}
            style={{ ...inputStyle, marginTop: 4 }}
          />
        </label>
      </div>

      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        background: 'var(--cth-paper-100)', padding: '7px 8px', boxShadow: 'inset 0 0 0 1px var(--cth-ink-100)'
      }}>
        <div>
          <div style={{ color: 'var(--cth-ink-900)', fontSize: 12 }}>{t('teamOs.prepare.localWrite')}</div>
          <div style={{ color: 'var(--cth-ink-500)', fontSize: 11, marginTop: 2 }}>{t('teamOs.prepare.localWriteHelp')}</div>
        </div>
        <PixelButton
          variant={localWrite ? 'primary' : 'secondary'} size="sm"
          onClick={() => { setLocalWrite((value) => !value); setCompiled(null); }}
        >{localWrite ? t('teamOs.prepare.allowed') : t('teamOs.prepare.notAllowed')}</PixelButton>
      </div>

      <div>
        <div style={{ fontSize: 12, color: 'var(--cth-ink-700)', marginBottom: 5 }}>
          {t('teamOs.prepare.capabilities')}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {catalog.capabilityProfiles.map((profile) => {
            const selected = capabilityIds.includes(profile.id);
            return (
              <button
                key={profile.id}
                type="button"
                title={profile.activationSignals.join(', ')}
                onClick={() => toggleCapability(profile.id)}
                style={{
                  border: 'none', cursor: 'pointer', padding: '4px 7px 3px', fontSize: 11,
                  background: selected ? 'var(--cth-mint)' : 'var(--cth-paper-100)',
                  color: 'var(--cth-ink-900)',
                  boxShadow: `inset 0 0 0 1px ${selected ? 'var(--cth-ink-500)' : 'var(--cth-ink-100)'}`
                }}
              >{selected ? '✓ ' : ''}{profile.label}</button>
            );
          })}
        </div>
        <div style={{ color: 'var(--cth-ink-500)', fontSize: 11, marginTop: 5 }}>
          {t('teamOs.prepare.capabilitiesHelp')}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <PixelButton
          variant="primary"
          size="sm"
          disabled={compiling || !outcome.trim() || !acceptance.trim() || !stopConditions.trim() || !roleId}
          onClick={() => { void compile(); }}
        >
          {compiling ? t('teamOs.prepare.compiling') : t('teamOs.prepare.preview')}
        </PixelButton>
        <span style={{ color: 'var(--cth-ink-500)', fontSize: 11 }}>{t('teamOs.prepare.noGrant')}</span>
      </div>

      {error && <div style={{ color: 'var(--cth-coral)', background: 'var(--cth-coral-light)', padding: 8, fontSize: 12 }}>{error}</div>}

      {compiled && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ flex: 1, color: 'var(--cth-ink-500)', fontSize: 11 }}>
              {t('teamOs.prepare.previewMeta', { bytes: compiled.promptBytes, sources: compiled.sourcePaths.length })}
            </div>
            <PixelButton variant="primary" size="sm" onClick={fillDispatch}>
              {t('teamOs.prepare.fillDispatch')}
            </PixelButton>
          </div>
          <pre style={{
            margin: 0, padding: 10, maxHeight: 280, overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            color: 'var(--cth-ink-700)', background: 'var(--cth-paper-100)',
            boxShadow: 'inset 0 0 0 1px var(--cth-ink-300)', fontSize: 11, lineHeight: '16px'
          }}>{compiled.prompt}</pre>
          <div style={{ color: 'var(--cth-ink-500)', fontSize: 11 }}>{t('teamOs.prepare.reviewThenSend')}</div>
        </div>
      )}
    </section>
  );
}

function splitItems(value: string): string[] {
  return value.split(/\n|；|;/).map((item) => item.trim()).filter(Boolean);
}
