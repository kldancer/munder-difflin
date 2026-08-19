/** Run one queued delivery and acknowledge it only after the sender resolves.
 * Rejections deliberately leave the queue item untouched for the next retry. */
export async function deliverWithAcknowledgement(
  send: () => Promise<void>,
  acknowledge: () => void
): Promise<boolean> {
  try {
    await send();
    acknowledge();
    return true;
  } catch {
    return false;
  }
}

export interface DeliveryFailureDecision {
  attempts: number;
  pauseDelivery: boolean;
}

/** A bounded retry policy that never turns a dead PTY into message loss.
 * Before the ceiling, leave the durable queue item in place for retry. At the
 * ceiling, keep it queued and pause automatic delivery so the operator can
 * repair/restart the PTY, then resume or explicitly choose "send now". */
export function deliveryFailureDecision(
  previousAttempts: number,
  maxAttempts = 3
): DeliveryFailureDecision {
  const ceiling = Number.isFinite(maxAttempts) && maxAttempts > 0
    ? Math.floor(maxAttempts)
    : 1;
  const attempts = Math.min(Math.max(0, Math.floor(previousAttempts)) + 1, ceiling);
  return { attempts, pauseDelivery: attempts >= ceiling };
}
