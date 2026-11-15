import test from 'node:test';
import assert from 'node:assert/strict';
import { parseClientMessage, MAX_MESSAGE_BYTES } from '../src/protocol.ts';
import { getConfig } from '../src/config.ts';

test('Zod validates input, chat, and tagged messages', () => {
  const input = { type: 'input', seq: 12, thrust: true, left: false, right: false, brake: false, fire: true, homing: false };
  assert.equal(parseClientMessage(JSON.stringify(input)).seq, 12);
  assert.deepEqual(parseClientMessage('{"type":"chat","text":"  hi  "}'), { type: 'chat', text: 'hi' });
  for (const wrong of [
    '{', '{"type":"unknown"}', '{"type":"chat","text":12}',
    '{"type":"chat","text":""}', '{"type":"leave","extra":true}',
    JSON.stringify({ ...input, seq: 0 }), JSON.stringify({ ...input, x: 1200 }),
    ' '.repeat(MAX_MESSAGE_BYTES + 1),
  ]) assert.throws(() => parseClientMessage(wrong));
  assert.throws(() => parseClientMessage({ type: 'leave' }));
});

test('Zod validates environment values', () => {
  assert.equal(getConfig({ PORT: '3000', LOGS_DIR: './logs' }).port, 3000);
  assert.throws(() => getConfig({ PORT: '0' }));
  assert.throws(() => getConfig({ PORT: '70000' }));
  assert.throws(() => getConfig({ PORT: 'nope' }));
  assert.throws(() => getConfig({ LOGS_DIR: ' ' }));
});
