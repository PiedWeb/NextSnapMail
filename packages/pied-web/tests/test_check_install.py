import importlib.util
import hashlib
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('check_install', Path(__file__).resolve().parents[1] / 'tools/check-install.py')
checker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(checker)


class InstallationCheck(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        self.data = self.root / 'external-data'
        self.app = self.root / 'custom_apps/nextsnapmail'
        self.private = self.data / 'appdata_nextsnapmail/_data_/_default_'
        self.write(self.root / 'version.php', "<?php $OC_VersionString = '34.0.3';")
        self.write(self.app / 'appinfo/info.xml', '<info><version>0.1.10</version></info>')
        self.write(self.app / 'app/index.php', "<?php define('APP_VERSION', '2.38.2');")
        self.write(self.private / 'configs/application.ini', '[plugins]\nenable = On\nenabled_list = "nextcloud,pied-web-ux,another"\n')
        self.plugin = self.private / 'plugins/pied-web-ux/index.php'
        self.write(self.plugin, 'plugin')
        self.write(self.root / 'themes/PiedWeb/snappymail/style.css', 'theme')
        self.core = self.app / 'app/snappymail/v/2.38.2/static/js/app.js'
        self.write(self.core, 'core patch')
        sha = lambda s: hashlib.sha256(s.encode()).hexdigest()
        self.release = {'version':'1.6.5', 'tested':{'nextcloud':'34.0.3','nextsnapmail':'0.1.10','snappymail':'2.38.2'},
                        'files':{'plugin/pied-web-ux/index.php':sha('plugin'),'theme/PiedWeb/snappymail/style.css':sha('theme')},
                        'core_patch':{'files':{'static/js/app.js':sha('core patch')}}}

    def write(self, path, text):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text)

    def inspect(self):
        return checker.inspect(self.root, self.data, self.app, self.release)

    def test_matching_external_data_installation_is_read_only(self):
        snapshot = {str(p):p.read_bytes() for p in self.root.rglob('*') if p.is_file()}
        self.assertTrue(self.inspect()['files_and_versions_match'])
        self.assertEqual(snapshot, {str(p):p.read_bytes() for p in self.root.rglob('*') if p.is_file()})

    def test_missing_and_modified_plugin_are_detected(self):
        self.plugin.write_text('changed')
        self.assertFalse(self.inspect()['files_and_versions_match'])
        self.plugin.unlink()
        self.assertIn('missing', [c['detail'] for c in self.inspect()['checks']])

    def test_upstream_version_change_requires_review(self):
        self.write(self.app / 'appinfo/info.xml', '<info><version>0.2.0</version></info>')
        self.assertFalse(self.inspect()['files_and_versions_match'])
        self.write(self.root / 'version.php', "<?php $OC_VersionString = '35.0.0';")
        self.assertFalse(next(c for c in self.inspect()['checks'] if c['check'] == 'Nextcloud version')['ok'])

    def test_app_update_can_remove_only_the_core_patch(self):
        self.core.write_text('unpatched new code')
        failures = [c['check'] for c in self.inspect()['checks'] if not c['ok']]
        self.assertEqual(failures, ['Core unread patch'])

    def test_disabled_plugin_is_detected(self):
        self.write(self.private / 'configs/application.ini', '[plugins]\nenable=Off\nenabled_list=nextcloud,pied-web-ux\n')
        self.assertFalse(next(c for c in self.inspect()['checks'] if c['check'] == 'Plugin enabled')['ok'])


if __name__ == '__main__':
    unittest.main()
