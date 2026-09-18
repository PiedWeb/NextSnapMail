<?php
if (PHP_SAPI !== 'cli') { http_response_code(403); exit; }
define('OC_CONSOLE', true);
require '/home/robindfr/nextcloud/lib/base.php';
$_ENV['SNAPPYMAIL_INCLUDE_AS_API']='1';
require '/home/robindfr/nextcloud/apps/nextsnapmail/app/snappymail/v/2.38.2/include.php';
$config=\RainLoop\Api::Config();
$file=APP_PRIVATE_DATA.'configs/application.ini';
$plugin='pied-web-runtime-maintenance-v4';
$concurrent=hash_file('sha256',$file)!==trim(file_get_contents(__DIR__.'/application.ini.after.sha256'));
$before=parse_ini_file(__DIR__.'/application.ini.before',true,INI_SCANNER_RAW);
$enabled=$concurrent ? $config->Get('plugins','enabled_list','') : $before['plugins']['enabled_list'];
$enabled=implode(',',array_filter(array_map('trim',explode(',',$enabled)),static fn($name)=>$name!==''&&$name!==$plugin));
$config->Set('plugins','enabled_list',$enabled);
if(!$config->Save())throw new RuntimeException('Save');
if(!$concurrent)copy(__DIR__.'/application.ini.before',$file);
$dir=APP_PLUGINS_PATH.$plugin;
unlink($dir.'/index.php');rmdir($dir);
echo json_encode(['config_restored'=>!$concurrent&&hash_file('sha256',$file)===hash_file('sha256',__DIR__.'/application.ini.before'),
    'config_merged'=>$concurrent,'temporary_plugin_removed'=>!is_dir($dir)]).PHP_EOL;
