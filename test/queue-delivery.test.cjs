'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');

const { deliverWithAcknowledgement, deliveryFailureDecision } =
  loadTs('src/renderer/src/hooks/queueDelivery.ts');

test('queue item is acknowledged only after delivery succeeds', async () => {
  let finish;
  let acknowledged = false;
  const sending = new Promise((resolve) => { finish = resolve; });
  const attempt = deliverWithAcknowledgement(
    () => sending,
    () => { acknowledged = true; }
  );

  assert.equal(acknowledged, false);
  finish();
  assert.equal(await attempt, true);
  assert.equal(acknowledged, true);
});

test('failed delivery remains unacknowledged for retry', async () => {
  let acknowledged = false;
  const sent = await deliverWithAcknowledgement(
    () => Promise.reject(new Error('PTY unavailable')),
    () => { acknowledged = true; }
  );
  assert.equal(sent, false);
  assert.equal(acknowledged, false);
});

test('delivery failures retry twice, then pause without authorizing deletion', () => {
  const first = deliveryFailureDecision(0, 3);
  const second = deliveryFailureDecision(first.attempts, 3);
  const third = deliveryFailureDecision(second.attempts, 3);

  assert.deepEqual(first, { attempts: 1, pauseDelivery: false });
  assert.deepEqual(second, { attempts: 2, pauseDelivery: false });
  assert.deepEqual(third, { attempts: 3, pauseDelivery: true });
  assert.deepEqual(deliveryFailureDecision(third.attempts, 3), third);
});
