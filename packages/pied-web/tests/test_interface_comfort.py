"""Presentation contracts: fictional labels, no mailbox/content transport."""
import json
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
APP = ROOT.parent.parent / 'apps/nextsnapmail'


class InterfaceComfort(unittest.TestCase):
    def test_native_source_and_runtime_modal_contract_match(self):
        start = '// show/hide popup/modal'
        end = "vmDom.addEventListener('transitionend', endShowHide);"
        def lifecycle(path):
            source = path.read_text()
            block = source[source.index(start):source.index(end) + len(end)]
            return '\n'.join(line.strip() for line in block.splitlines())
        self.assertEqual(
            lifecycle(APP / 'app/snappymail/v/2.38.2/static/js/app.js'),
            lifecycle(APP / 'legacy-upstream/dev/Knoin/Knoin.js'))

    def test_native_cancel_tag_and_dynamic_folder_roles(self):
        script = r"""
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync('../../apps/nextsnapmail/app/snappymail/v/2.38.2/static/js/app.js','utf8');
const method=source.slice(source.indexOf('\t\tnewTag() {'),source.indexOf('\t\tpgpDecrypt()',source.indexOf('\t\tnewTag() {'))).trim();
let input=null;
const changes=[],added=[];
const ctx={prompt:()=>input,i18n:key=>key,currentMessage:()=>({toggleTag:value=>changes.push(value)}),
 FolderUserStore:{currentFolder:()=>({permanentFlags:{push:value=>added.push(value)}})},
 isAllowedKeyword:value=>!value.startsWith('$pw')};
const tag=vm.runInNewContext('({'+method+'})',ctx);
tag.newTag();
input='';tag.newTag();
input='   ';tag.newTag();
input='$pwsending';tag.newTag();
assert.equal(changes.length,0,'cancel, empty and reserved keyword never change tags');
input='Client';tag.newTag();
assert.deepEqual(changes,['Client']);assert.deepEqual(added,['Client']);
const mailbox=source.match(/mailboxFolders\(\) \{[\s\S]*?\n\t\t\}/)?.[0];
assert.ok(mailbox);
const roles={inbox:'INBOX',trash:'INBOX.Trash',spam:'INBOX.Junk',drafts:'INBOX.Drafts',archive:'INBOX.Archive'};
const app=vm.runInNewContext('({'+mailbox+'})',{getFolderInboxName:()=>roles.inbox,FolderUserStore:Object.fromEntries(['trash','spam','drafts','archive'].map(role=>[role+'Folder',()=>roles[role]]))});
assert.deepEqual(JSON.parse(JSON.stringify(app.mailboxFolders())),roles);
roles.trash='AccountB.Trash';
assert.equal(app.mailboxFolders().trash,'AccountB.Trash','folder roles must be resolved from the active account, not cached');
"""
        subprocess.run(['node', '--input-type=module', '-e', script], cwd=ROOT, check=True)

    def test_label_hooks_preserve_user_data(self):
        script = r"""
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const context = {document:{documentElement:{lang:'fr'}},window:{rl:{mailUi:{
    isInternalKeyword:value=>value==='$other-internal',
    folderLabel:(folder,name)=>name==='Other'?'Autre':name
}}}};
vm.runInNewContext(fs.readFileSync('plugin/pied-web-ux/interface-comfort.js','utf8'),context);
const ui=context.window.rl.mailUi;
for (const tag of ['$pwremind-txyz1','$PWREMIND-123','$pwsending','$PWSENDING','$other-internal'])
    assert.equal(ui.isInternalKeyword(tag),true,tag);
for (const tag of ['important','Client','$pwcustom','$pwremind-','$pwremind-not-a-stamp','pwremind-123','$pwsending-custom'])
    assert.equal(ui.isInternalKeyword(tag),false,tag);
const folder={fullName:'INBOX.Reminders',delimiter:'.'};
const before=JSON.stringify(folder);
assert.equal(ui.folderLabel(folder,'Reminders','INBOX.Drafts'),'Rappels');
assert.equal(JSON.stringify(folder),before,'presentation must not rename a folder');
assert.equal(ui.folderLabel({fullName:'INBOX.Scheduled',delimiter:'.'},'Scheduled','INBOX.Drafts'),'Envois programmés');
assert.equal(ui.folderLabel({fullName:'INBOX.Scheduled',delimiter:'.',isSystemFolder:()=>true},'Envoyés','INBOX.Drafts'),'Envoyés','native folder roles take precedence');
assert.equal(ui.folderLabel({fullName:'Scheduled',delimiter:''},'Scheduled','Drafts'),'Envois programmés');
assert.equal(ui.folderLabel({fullName:'Projects/Scheduled',delimiter:'/'},'Scheduled','INBOX/Drafts'),'Scheduled');
assert.equal(ui.folderLabel({fullName:'Scheduled',delimiter:'/'},'Scheduled',''),'Scheduled');
assert.equal(ui.folderLabel({fullName:'Scheduled',delimiter:'/'},'Scheduled','__UNUSE__'),'Scheduled');
assert.equal(ui.folderLabel({fullName:'Scheduled',delimiter:'/'},'Scheduled','INBOX'),'Scheduled');
assert.equal(ui.folderLabel({},'Other','Drafts'),'Autre','preserve prior extension');
context.document.documentElement.lang='en';
assert.equal(ui.folderLabel(folder,'Reminders','INBOX.Drafts'),'Reminders');
assert.equal(ui.folderLabel({fullName:'INBOX.Scheduled',delimiter:'.'},'Scheduled','INBOX.Drafts'),'Scheduled');
"""
        subprocess.run(['node', '--input-type=module', '-e', script], cwd=ROOT, check=True)

    def test_nextcloud_french_covers_all_native_keys(self):
        active = APP / 'app/bundled-plugins/nextcloud/langs'
        legacy = APP / 'legacy-upstream/plugins/nextcloud/langs'
        french = json.loads((active / 'fr.json').read_text())
        english = json.loads((active / 'en.json').read_text())
        self.assertEqual(french.keys(), english.keys())
        self.assertEqual(french['NEXTCLOUD'].keys(), english['NEXTCLOUD'].keys())
        self.assertTrue(all(french['NEXTCLOUD'].values()))
        self.assertEqual((active / 'fr.json').read_text(), (legacy / 'fr.json').read_text())

    def test_compact_mode_is_opt_in_and_desktop_only(self):
        css = (ROOT / 'theme-src/compact.css').read_text()
        self.assertIn('(min-width:800px) and (pointer:fine)', css)
        self.assertIn('html.pw-theme.pw-compact', css)
        self.assertIn('min-height:52px;', css)
        self.assertNotIn('height:52px;', css.replace('min-height:52px;', ''))
        self.assertNotIn('font-size:', css, 'compact must not make text smaller')


if __name__ == '__main__':
    unittest.main()
