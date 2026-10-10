// Exercise the imported Sieve helpers without a mailbox or server connection.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

const source = readFileSync(new URL('../app/bundled-plugins/nextcloud/js/vacation.js', import.meta.url), 'utf8');
const helpers = vm.runInNewContext(source.slice(source.indexOf('\tconst\n'), source.indexOf('\tclass NextSnapMailVacationUserSettings'))
  + '\n({quote, textLiteral, addRequirements, removeManagedBlock, hasUnmanagedVacation});');

test('Sieve strings escape quotes, line breaks and dot-prefixed message lines', () => {
  assert.equal(helpers.quote('a"b\\c\r\nd'), '"a\\"b\\\\c d"');
  assert.equal(helpers.textLiteral('first\n.\n.last'), 'first\r\n..\r\n..last');
  assert.equal(helpers.textLiteral('first\r\n.last\rtail'), 'first\r\n..last\r\ntail');
  assert.equal(helpers.textLiteral(''), '');
});

test('requirements preserve existing extensions and deduplicate new ones', () => {
  assert.equal(helpers.addRequirements('require "fileinto";\nkeep;', ['vacation', 'fileinto']),
    'require ["fileinto","vacation"];\nkeep;');
  assert.equal(helpers.addRequirements('keep;', ['vacation']), 'require ["vacation"];\r\n\r\nkeep;');
  assert.equal(helpers.addRequirements('require ["fileinto", "date"];\nfileinto "Archive";', ['vacation', 'date']),
    'require ["date","fileinto","vacation"];\nfileinto "Archive";');
});

test('managed blocks and comments do not hide an independent vacation rule', () => {
  const managed = '# BEGIN:NEXTSNAPMAIL:VACATION\nvacation "managed";\n# END:NEXTSNAPMAIL:VACATION';
  assert.equal(helpers.removeManagedBlock(managed), '');
  assert.equal(helpers.removeManagedBlock('keep;\n' + managed + '\nfileinto "Archive";'),
    'keep;\n\nfileinto "Archive";');
  assert.equal(helpers.hasUnmanagedVacation(managed), false);
  assert.equal(helpers.hasUnmanagedVacation('# vacation "comment";\n/* vacation "comment"; */'), false);
  assert.equal(helpers.hasUnmanagedVacation(managed + '\nvacation "existing";'), true);
});
