<?php
if (PHP_SAPI !== 'cli') { http_response_code(403); exit; }
define('OC_CONSOLE', true);
require '/home/robindfr/nextcloud/lib/base.php';
$_ENV['SNAPPYMAIL_INCLUDE_AS_API']='1';
require '/home/robindfr/nextcloud/apps/nextsnapmail/app/snappymail/v/2.38.2/include.php';
$config=\RainLoop\Api::Config();
$backup=__DIR__.'/application.ini.before';
$file=APP_PRIVATE_DATA.'configs/application.ini';
$plugin='pied-web-runtime-maintenance-v11';
if (file_exists($backup)) throw new RuntimeException('Already installed');
copy($file,$backup); chmod($backup,0600);
$before=$config->Get('plugins','enabled_list','');
if (str_contains($before,$plugin)) throw new RuntimeException('Exists');
$dir=APP_PLUGINS_PATH.$plugin;
if (!mkdir($dir,0755)) throw new RuntimeException('Directory');
copy(__DIR__.'/index.php',$dir.'/index.php');
$config->Set('plugins','enabled_list',$before.','.$plugin);
if(!$config->Save())throw new RuntimeException('Save');
file_put_contents(__DIR__.'/application.ini.after.sha256',hash_file('sha256',$file));
echo json_encode(['temporary_plugin_enabled'=>true]).PHP_EOL;
