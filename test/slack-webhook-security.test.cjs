'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const loadTs = require('./load-ts.cjs');

const { SlackWebhookServer, EXTERNAL_BIND_HOST } = loadTs('src/main/slack.ts');

function request(server) {
  return new Promise((resolve) => {
    const req = new EventEmitter();
    req.method = 'POST';
    req.url = '/';
    req.headers = {};
    req.destroy = () => {};
    const res = {
      writeHead(status) { res.status = status; return res; },
      end() { resolve(res.status); }
    };
    server.handleRequest(req, res);
    req.emit('end');
  });
}

test('the Slack tunnel target binds to loopback only', () => {
  assert.equal(EXTERNAL_BIND_HOST, '127.0.0.1');
});

test('Slack ingress rate-limits before signature work', async () => {
  const server = new SlackWebhookServer({
    port: 0,
    signingSecret: 'test-only-secret',
    onMessage: () => {}
  });
  for (let i = 0; i < 120; i++) assert.equal(await request(server), 403);
  assert.equal(await request(server), 429);
});
