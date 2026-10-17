import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DraftCoach } from '../extension/coaching-client.mjs';
const draft = { request_id: '1', draft_revision: 1, conversation_id: 'c', site: 'chatgpt',
  current_model_label: 'Large', prompt_text: 'hello', opted_in: true };
const response = { ...draft, action: 'suggest_small', target: { website_label: 'Small' },
  decision_id: 'd', ttl_ms: 30000, mode: 'mock' };

for (const action of ['new draft', 'model switch', 'navigation', 'send before result']) {
  test(`discard result after ${action}`, async () => {
    let resolve;
    const shown = [];
    const coach = new DraftCoach({ classify: () => new Promise(r => { resolve = r; }), display: r => shown.push(r) });
    coach.current = draft;
    const work = coach.fetchDraft(draft, coach.generation);
    if (action === 'navigation') coach.navigate();
    else if (action === 'send before result') assert.equal(coach.onSend(), null);
    else coach.update({ ...draft, draft_revision: 2, current_model_label: action === 'model switch' ? 'Other' : 'Large' });
    resolve(response);
    await work;
    assert.equal(shown.filter(Boolean).length, 0);
    coach.navigate();
  });
}

test('accept current result then discard expired suggestion at send', async () => {
  let time = 0;
  const coach = new DraftCoach({ classify: async () => response, now: () => time });
  coach.current = draft;
  await coach.fetchDraft(draft, coach.generation);
  assert.equal(coach.ready.response.decision_id, 'd');
  time = 30001;
  assert.equal(coach.onSend(), null);
});

test('network failures and absent opt-in do not block send', async () => {
  const coach = new DraftCoach({ classify: async () => { throw Error('offline'); } });
  coach.current = draft;
  await coach.fetchDraft(draft, coach.generation);
  assert.equal(coach.onSend(), null);
  coach.update({ ...draft, opted_in: false });
  assert.equal(coach.ready, null);
  coach.navigate();
});

test('late result is recorded after send without displaying advice', async () => {
  let resolve;
  const events = [];
  const coach = new DraftCoach({ classify: () => new Promise(r => { resolve = r; }), emit: type => events.push(type) });
  coach.current = draft;
  const pending = coach.fetchDraft(draft, coach.generation);
  coach.onSend();
  resolve(response);
  await pending;
  assert.deepEqual(events, ['late_result']);
  assert.equal(coach.ready, null);
});

test('profile and policy mismatches never display a suggestion', async () => {
  const coach = new DraftCoach({ classify: async () => ({ ...response, profile_version: 'old' }), expectedProfileVersion: 'new' });
  coach.current = draft;
  await coach.fetchDraft(draft, coach.generation);
  assert.equal(coach.ready, null);
  coach.navigate();
});
