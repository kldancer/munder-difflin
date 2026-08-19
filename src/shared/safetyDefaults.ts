/** New-install defaults only. Persisted user choices always win on later reads. */
export const SAFE_DEFAULTS = Object.freeze({
  autoMode: false,
  telemetryEnabled: false,
  slackEnabled: false,
  webhookEnabled: false
});
