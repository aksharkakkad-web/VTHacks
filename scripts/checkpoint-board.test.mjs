import assert from 'node:assert/strict';
import test from 'node:test';
import { buildBoard, buildChangeComment, readState } from './checkpoint-board.mjs';

const empty = {
  akshar: [],
  mahin: [],
  rishit: [],
};

test('one teammate ready names the two still outstanding', () => {
  const next = { ...empty, akshar: ['A'] };
  const body = buildBoard(next);
  assert.match(body, /A — Shared contracts/);
  assert.match(body, /Akshar ✅/);
  assert.match(body, /Waiting on Mahin and Rishit/);
  assert.match(buildChangeComment(empty, next), /@aksharkakkad-web is ready for A/);
  assert.match(buildChangeComment(empty, next), /waiting on Mahin and Rishit/);
});

test('all three ready calls a team sync', () => {
  const prev = { akshar: ['A'], mahin: ['A'], rishit: [] };
  const next = { ...prev, rishit: ['A'] };
  assert.match(buildBoard(next), /A — Shared contracts.*Team sync now/);
  assert.match(buildChangeComment(prev, next), /A is ready — 10-minute team sync now/);
});

test('no changes produces no comment', () => {
  assert.equal(buildChangeComment(empty, empty), null);
});

test('invalid status is rejected', () => {
  assert.throws(() => readState({ ...empty, mahin: ['Z'] }), /Invalid checkpoint/);
});
