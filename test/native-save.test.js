import assert from 'node:assert/strict';
import test from 'node:test';
import { NativeSave } from '../homebridge-ui/public/native-save.js';

test('native Save only enables validated restart drafts and never writes configuration', async () => {
  let enabled = false;
  let staged;
  let current = { revision: 'one', blocks: [{ platform: 'NestClimateCntrl', name: 'Saved' }] };
  const host = {
    disableSaveButton: () => {
      enabled = false;
    },
    enableSaveButton: () => {
      enabled = true;
    },
    updatePluginConfig: async (blocks) => {
      staged = structuredClone(blocks);
    },
    savePluginConfig: () => assert.fail('Homebridge must own the save'),
  };
  const native = new NativeSave(host, async () => structuredClone(current));
  const draft = { revision: 'one', blocks: [{ platform: 'NestClimateCntrl', name: 'New' }], restartRequired: true };
  await native.stage('climate', async () => draft);
  assert.equal(enabled, true);
  assert.equal(current.blocks[0].name, 'Saved');
  assert.equal(staged[0].name, 'New');
  await native.stage('climate', async () => ({ ...draft, restartRequired: false }));
  assert.equal(enabled, false);
  assert.deepEqual(staged, current.blocks);
  await assert.rejects(native.stage('climate', async () => {
    throw new Error('Invalid draft');
  }), /Invalid/);
  assert.equal(enabled, false);
  await native.stage('climate', async () => draft);
  await assert.rejects(native.stage('accounts', async () => draft), /other edits/);
  assert.equal(enabled, false);
  await native.clear('accounts');
  await native.stage('climate', async () => draft);
  current = { ...current, revision: 'two' };
  await assert.rejects(native.stage('climate', async () => draft), /changed elsewhere/);
  assert.equal(enabled, false);
  await native.clear('climate');
  assert.deepEqual(staged, current.blocks);
});

test('late validation and parent staging replies cannot enable Save for a newer or discarded draft', async () => {
  let enabled = false;
  let release;
  let started;
  const ready = new Promise((resolve) => {
    started = resolve;
  });
  const current = { revision: 'one', blocks: [{ name: 'Saved' }] };
  const native = new NativeSave({
    disableSaveButton: () => {
      enabled = false;
    },
    enableSaveButton: () => {
      enabled = true;
    },
    updatePluginConfig: async () => {},
  }, async () => current);
  const pending = native.stage('climate', async () => {
    started();
    await new Promise((resolve) => {
      release = resolve;
    });
    return { ...current, restartRequired: true };
  });
  await ready;
  const discarded = native.clear('climate');
  release();
  await Promise.all([pending, discarded]);
  assert.equal(enabled, false);
  const old = native.stage('climate', () => assert.fail('Obsolete validation must be skipped'));
  const latest = native.stage('climate', async () => ({ ...current, restartRequired: true }));
  await Promise.all([old, latest]);
  assert.equal(enabled, true);
  native.invalidate('climate');
  assert.equal(enabled, false);
});
