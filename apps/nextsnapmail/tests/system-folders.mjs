import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../app/snappymail/v/2.38.2/static/js/app.js', import.meta.url), 'utf8');
const method = source.match(/\bsaveSystemFolders\(folders\) \{[\s\S]*?\n\t\t\}/)[0];

function save(folders) {
  const settings = {}, requests = [];
  const store = vm.runInNewContext(`({${method}})`, {
    Settings: { set: (key, value) => { settings[key] = value; } },
    forEachObjectEntry: (record, visit) => Object.entries(record).forEach(([key, value]) => visit(key, value)),
    FolderUserStore: {
      sentFolder: () => 'Sent', draftsFolder: () => 'Drafts', spamFolder: () => 'Junk',
      trashFolder: () => '__UNUSE__', archiveFolder: () => 'Archive',
    },
    rl: { app: { Remote: { request: (action, callback, params) => {
      requests.push({ action, params: { ...params } });
    } } } },
  });
  store.saveSystemFolders(folders);
  return { settings, requests };
}

test('detected folder roles are saved under the HTTP field names on first load', () => {
  const { settings, requests } = save({
    Inbox: 'INBOX', Sent: 'Sent', Drafts: 'Drafts', Junk: 0, Trash: 'Deleted Messages', Archive: 0,
  });
  assert.deepEqual(requests, [{ action: 'SystemFoldersUpdate', params: {
    sent: 'Sent', drafts: 'Drafts', junk: '', trash: 'Deleted Messages', archive: '',
  } }]);
  assert.equal(settings.TrashFolder, 'Deleted Messages');
  assert.equal(settings.JunkFolder, '');
  assert.equal(Object.hasOwn(settings, 'InboxFolder'), false);
});

test('manually disabling Trash updates the settings cache and sends the explicit sentinel', () => {
  const { settings, requests } = save();
  assert.equal(settings.TrashFolder, '__UNUSE__');
  assert.deepEqual(requests, [{ action: 'SystemFoldersUpdate', params: {
    sent: 'Sent', drafts: 'Drafts', junk: 'Junk', trash: '__UNUSE__', archive: 'Archive',
  } }]);
});
