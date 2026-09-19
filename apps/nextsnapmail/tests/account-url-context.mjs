// Run with: node --test tests/account-url-context.mjs
// Exercise the URL helpers extracted from the shipped, unminified runtime bundle.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

const appSource = readFileSync(
  new URL('../app/snappymail/v/2.38.2/static/js/app.js', import.meta.url),
  'utf8'
);
const bootSource = readFileSync(
  new URL('../app/snappymail/v/2.38.2/static/js/boot.js', import.meta.url),
  'utf8'
);
const serviceSource = readFileSync(
  new URL('../app/snappymail/v/2.38.2/app/libraries/RainLoop/ServiceActions.php', import.meta.url),
  'utf8'
);
const hashA = 'A'.repeat(40);
const hashB = 'b'.repeat(40);

function urlHelpers(search = `?account=${hashA}&view=compact`) {
  const assigned = [], replaced = [];
  const location = {
    pathname: '/apps/nextsnapmail',
    search,
    href: `https://cloud.example.test/apps/nextsnapmail/${search}#/mailbox/INBOX`,
    assign(value) { assigned.push(value); }
  };
  const context = vm.createContext({
    URL,
    URLSearchParams,
    doc: { location },
    rl: { adminArea: () => false },
    SettingsAdmin: () => '',
    history: {
      state: { fixture: true },
      replaceState(state, title, value) { replaced.push(value); }
    }
  });
  const start = appSource.indexOf('\tconst\n\t\tBASE =');
  const end = appSource.indexOf("\n\t\t// Is '?/Css", start);
  assert.notEqual(start, -1, 'URL helper start is present');
  assert.notEqual(end, -1, 'URL helper end is present');
  let code = appSource.slice(start, end).replace(/,\s*$/, ';');
  code += '\nglobalThis.helpers = {accountContext, syncAccountContext, switchAccountContext, serverRequestRaw, serverRequest};';
  vm.runInContext(code, context);
  return { helpers: context.helpers, assigned, replaced };
}

test('JSON, upload and raw requests carry the tab account context', () => {
  const { helpers } = urlHelpers();
  const normalized = hashA.toLowerCase();
  assert.equal(helpers.accountContext(), normalized);
  assert.match(helpers.serverRequest('Json'), new RegExp(`/Json/&q\\[\\]=/${normalized}/$`));
  assert.match(helpers.serverRequest('Upload'), new RegExp(`/Upload/&q\\[\\]=/${normalized}/$`));
  assert.match(helpers.serverRequestRaw('Download', 'raw-key'), new RegExp(`/Raw/&q\\[\\]=/${normalized}/Download/`));
});

test('invalid or absent URL context starts explicitly on the main account', () => {
  assert.equal(urlHelpers('').helpers.accountContext(), 'main');
  assert.equal(urlHelpers('?account=not-an-account').helpers.accountContext(), 'main');
});

test('canonicalization and switching preserve the mailbox fragment and other query values', () => {
  const { helpers, assigned, replaced } = urlHelpers('?view=compact');
  helpers.syncAccountContext(hashA);
  assert.equal(replaced.length, 1);
  assert.match(replaced[0], /account=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/);
  assert.match(replaced[0], /view=compact/);
  assert.match(replaced[0], /#\/mailbox\/INBOX$/);

  assert.equal(helpers.switchAccountContext(hashB), true);
  assert.equal(assigned.length, 1);
  assert.match(assigned[0], /account=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb/);
  assert.match(assigned[0], /view=compact/);
  assert.match(assigned[0], /#\/mailbox\/INBOX$/);
  assert.equal(helpers.switchAccountContext('invalid'), false);
  assert.equal(assigned.length, 1);
});

test('boot and account menu use URL context instead of the shared switch endpoint', () => {
  assert.match(bootSource, /AppData\/\$\{accountContext\(\)\}/);
  const accountClick = appSource.slice(
    appSource.indexOf('\n\t\taccountClick(account, event)'),
    appSource.indexOf('\n\t\taccountName()', appSource.indexOf('\n\t\taccountClick(account, event)'))
  );
  assert.match(accountClick, /switchAccountContext\(account\.accountHash\)/);
  assert.doesNotMatch(accountClick, /AccountSwitch/);
  assert.match(appSource, /this\.accountHash = accountHash/);
  assert.match(appSource, /syncAccountContext\(SettingsGet\('accountHash'\)\)/);
  const appDataService = serviceSource.slice(
    serviceSource.indexOf('public function ServiceAppData()'),
    serviceSource.indexOf('public function ServiceAdminAppData()')
  );
  assert.match(appDataService, /SetAccountContext\('main'\)/);
});
