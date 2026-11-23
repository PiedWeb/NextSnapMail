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

test('the native folder model uses confirmed roles and clears stale roles when loading another account', () => {
  const from = source.indexOf('class FolderCollectionModel extends AbstractCollectionModel');
  const to = source.indexOf('class FolderModel extends AbstractModel', from);
  const settings = { SentFolder: 'old sent', DraftsFolder: '', TrashFolder: 'old trash' };
  const system = { Inbox: '', Sent: '', Drafts: '', Junk: '', Trash: '', Archive: '' };
  const folders = new Map(), types = new Map();
  const collection = vm.runInNewContext(`(${source.slice(from, to)})`, {
    AbstractCollectionModel: class {
      static reviveFromJson(input, visit) { return input.rows.map(visit); }
    },
    FolderModel: {
      reviveFromJson: row => ({ ...row, type: value => types.set(row.fullName, value), collapsed() {} }),
    },
    FolderType: { Inbox: 1, Drafts: 3, Trash: 5 },
    ClientSideKeyNameExpandedFolders: '',
    SystemFolders: system,
    SettingsGet: key => settings[key],
    Settings: { set: (key, value) => { settings[key] = value; } },
    forEachObjectEntry: (record, visit) => Object.entries(record).forEach(([key, value]) => visit(key, value)),
    getKeyByValue: (record, value) => Object.keys(record).find(key => record[key] === value),
    getFolderFromCacheList: name => folders.get(name),
    setFolder: folder => folders.set(folder.fullName, folder),
    sortFolders() {}, setFolderInboxName() {}, get() {},
  });

  collection.reviveFromJson({
    systemFolders: { sent: '', drafts: 'Brouillons', trash: '__UNUSE__' },
    rows: [{ fullName: 'INBOX', role: 'inbox' }, { fullName: 'Brouillons', role: 'drafts' }, { fullName: 'Trash', role: 'trash' }],
  });
  assert.equal(settings.SentFolder, '');
  assert.equal(settings.DraftsFolder, 'Brouillons');
  assert.equal(settings.TrashFolder, '__UNUSE__');
  assert.equal(types.get('Brouillons'), 3);
  assert.equal(types.get('Trash'), 0);

  collection.reviveFromJson({
    systemFolders: { drafts: '', trash: 'Corbeille' },
    rows: [{ fullName: 'Other drafts', role: 'drafts' }, { fullName: 'Corbeille', role: 'trash' }],
  });
  assert.equal(settings.DraftsFolder, '');
  assert.equal(types.get('Other drafts'), 0);
  assert.equal(settings.TrashFolder, 'Corbeille');
  assert.equal(types.get('Corbeille'), 5);
});
