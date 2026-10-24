"""No network or actual secrets. Protection-only transactions on in-memory FTP."""
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock, patch

spec = importlib.util.spec_from_file_location('provision', Path(__file__).resolve().parents[1] / 'scripts/provision-protection.py')
p = importlib.util.module_from_spec(spec); spec.loader.exec_module(p)
AUTH = ('fictional_tester', 'fictional-password-at-least-16')
PRIVATE = b'fictional_tester:$2y$12$fictional-hash-test-only\n'


class FakeFTP:
    def __init__(self):
        self.files, self.events, self.modes = {}, [], {}
        self.root_pwd = '/'; self.cwd_value = '/'
        self.no_replace = False; self.missing_mode = False; self.corrupt_private = False
        self.stat_mode = None
    def pwd(self): return self.root_pwd if self.cwd_value == '/' else self.cwd_value
    def cwd(self,name): self.events.append(('CWD',name)); self.cwd_value=name
    def mlsd(self,path='',facts=None):
        self.events.append(('MLSD',path))
        if path == '/':
            names = [n for n in self.files if n.startswith('/')]
            return [(n[1:], {'type':'file', **({} if self.missing_mode else {'unix.mode':self.modes.get(n,'0600')})}) for n in names]
        return [(n, {'type':'file','size':str(len(v))}) for n,v in self.files.items() if not n.startswith('/')]
    def storbinary(self,command,source):
        verb,name=command.split(' ',1);self.events.append((verb,name));data=source.read()
        self.files[name]=(self.files.get(name,b'') if verb=='APPE' else b'')+data
    def retrbinary(self,command,consume):
        name=command.split(' ',1)[1];self.events.append(('RETR',name))
        value=self.files[name]
        consume(value+b'x' if self.corrupt_private and name==p.HASH_REMOTE else value)
    def rename(self,source,target):
        self.events.append(('RENAME',source,target))
        if self.no_replace and target in self.files: raise PermissionError('fictional RNTO refusal')
        self.files[target]=self.files.pop(source)
    def sendcmd(self,command):
        self.events.append(('SITE',command))
        if command.startswith('SITE CHMOD'):self.modes[p.HASH_REMOTE]='0600';return '200'
        return '211\n' + (self.stat_mode + ' 1 fictional fictional 0 file\n' if self.stat_mode else '') + '211 End'
    def close(self): self.events.append(('CLOSE',))


class ProvisionTests(unittest.TestCase):
    def setUp(self):
        blocker=patch('socket.create_connection',side_effect=AssertionError('No real network in tests'))
        blocker.start();self.addCleanup(blocker.stop)
        self.ftp=FakeFTP();self.provision=p.Provision(AUTH,PRIVATE,lambda:self.ftp,self.fetch)
        self.final_status=None;self.redirect=False;self.bad_csp=False;self.maintenance_works=True
        self.calls=[]
    def fetch(self,name,auth=None,expected=None):
        self.calls.append((name,auth==AUTH))
        active=self.ftp.files.get('.htaccess',b'')
        headers=dict(p.t.REQUIRED_HEADERS, **{'content-security-policy':'bad' if self.bad_csp else self.provision.csp,'www-authenticate':'Basic realm="fictional"'})
        if self.redirect:return {'status':302,'headers':headers}
        if not active:return {'status':404,'headers':headers}
        if b'\nRequire all denied\n' in active:return {'status':403,'headers':headers}
        if self.final_status:return {'status':self.final_status,'headers':headers}
        if auth!=AUTH:return {'status':401,'headers':headers}
        if self.ftp.files.get(p.t.MARKER) and self.maintenance_works:return {'status':503,'headers':headers}
        return {'status':404,'headers':headers}
    def test_success_only_protection_files_no_payload_no_delete(self):
        result=self.provision.execute()
        self.assertTrue(result['ready']);self.assertFalse(result['applicationTransferred'])
        self.assertEqual(set(self.ftp.files),{'.htaccess',p.HASH_REMOTE,p.t.MARKER})
        self.assertEqual(self.ftp.files[p.t.MARKER],b'')
        self.assertEqual(self.ftp.files[p.HASH_REMOTE],PRIVATE)
        self.assertEqual(result['htaccessSha256'],hashlib.sha256(self.provision.final).hexdigest())
        self.assertEqual(result['correctPasswordWithMarkerStatus'],503)
        self.assertEqual(result['correctPasswordEmptyDirectoryStatus'],404)
        self.assertNotIn(PRIVATE.decode(),json.dumps(result))
        self.assertEqual(result['privateHashMode'],'0600')
    def test_unknown_initial_root_aborts_before_writes(self):
        self.ftp.root_pwd='/other'
        self.assertFalse(self.provision.execute()['ready'])
        self.assertFalse(any(e[0] in ['STOR','APPE','RENAME','SITE'] for e in self.ftp.events))
    def test_nonempty_target_and_existing_private_file_never_overwritten(self):
        for name in ['index.html',p.HASH_REMOTE,'.htaccess']:
            with self.subTest(name=name):
                self.ftp=FakeFTP();self.ftp.files[name]=b'existing'
                result=self.provision.execute()
                self.assertFalse(result['ready']);self.assertEqual(self.ftp.files[name],b'existing')
                self.assertFalse(any(e[0]=='STOR' for e in self.ftp.events))
    def test_rename_overwrite_must_be_proven_before_hash_content(self):
        self.ftp.no_replace=True
        result=self.provision.execute()
        self.assertFalse(result['ready']);self.assertTrue(result['rollbackDenyVerified'])
        self.assertNotIn(p.HASH_REMOTE,self.ftp.files)
        self.assertFalse(any(e[0]=='APPE' for e in self.ftp.events))
    def test_missing_mode_metadata_prevents_any_hash_content(self):
        self.ftp.missing_mode=True
        result=self.provision.execute()
        self.assertFalse(result['ready']);self.assertTrue(result['rollbackDenyVerified'])
        self.assertEqual(self.ftp.files[p.HASH_REMOTE],b'')
        self.assertFalse(any(e[0]=='APPE' for e in self.ftp.events))
    def test_bad_private_sha_never_activates_basic_auth(self):
        self.ftp.corrupt_private=True
        result=self.provision.execute()
        self.assertFalse(result['ready']);self.assertTrue(result['rollbackDenyVerified'])
        self.assertEqual(self.ftp.files['.htaccess'],self.provision.deny)
    def test_private_stat_can_prove_600_when_mlst_fact_unavailable(self):
        self.ftp.missing_mode=True;self.ftp.stat_mode='-rw-------'
        self.assertTrue(self.provision.execute()['ready'])
    def test_stat_public_permissions_do_not_allow_hash_content(self):
        self.ftp.missing_mode=True;self.ftp.stat_mode='-rw-r--r--'
        result=self.provision.execute()
        self.assertFalse(result['ready']);self.assertTrue(result['rollbackDenyVerified'])
        self.assertFalse(any(e[0]=='APPE' for e in self.ftp.events))
    def test_real_final_500_or_404_restores_owned_deny(self):
        for status in [500,404,200,302]:
            with self.subTest(status=status):
                self.ftp=FakeFTP();self.final_status=status
                result=self.provision.execute()
                self.assertFalse(result['ready']);self.assertTrue(result['rollbackDenyVerified'])
                self.assertEqual(self.ftp.files['.htaccess'],self.provision.deny)
    def test_no_redirect_bypass_initial_deny(self):
        self.redirect=True
        result=self.provision.execute()
        self.assertFalse(result['ready']);self.assertNotIn(p.HASH_REMOTE,self.ftp.files)
    def test_nonfunctional_maintenance_and_bad_csp_roll_back(self):
        for flag in ['bad_csp','maintenance_works']:
            with self.subTest(flag=flag):
                self.ftp=FakeFTP();self.bad_csp=(flag=='bad_csp');self.maintenance_works=(flag!='maintenance_works')
                result=self.provision.execute()
                self.assertFalse(result['ready']);self.assertTrue(result['rollbackDenyVerified'])
    def test_operator_configuration_changed_is_not_overwritten_on_error(self):
        original=self.ftp.rename
        def change(source,target):
            original(source,target)
            if self.ftp.files[target]==self.provision.final:self.ftp.files[target]=b'operator-owned-new-config'
        self.ftp.rename=change
        result=self.provision.execute()
        self.assertFalse(result['ready']);self.assertFalse(result['rollbackDenyVerified'])
        self.assertEqual(self.ftp.files['.htaccess'],b'operator-owned-new-config')


class ProtectionPolicyTests(unittest.TestCase):
    def test_server_config_reproduces_startup_hash_without_build(self):
        deny,final,csp=p.render_configs()
        original_generated = deny.split(b'# Child-only literal errors;')[0]
        self.assertEqual(hashlib.sha256(original_generated).hexdigest(),'a54708f4e6b4b2c26f937fcc845cf4a76b6a874a0ee4c6e34eb471cd944fd971')
        self.assertIn(b'ErrorDocument 401 "Translator authentication required"',deny)
        self.assertIn(b'ErrorDocument 403 "Translator access denied"',deny)
        self.assertIn(b'RewriteCond %{DOCUMENT_ROOT}/translator-test/.deployment-in-progress -s',final)
        self.assertNotIn(b'\nRequire all denied\n',final)
        self.assertIn(p.AUTH_USER_FILE.encode(),final)
        self.assertNotIn("'unsafe-inline'",csp);self.assertNotIn("'unsafe-eval'",csp)
    def test_bcrypt_cost12_real_local_verify_and_no_plaintext(self):
        value=p.make_password_file(*AUTH)
        self.assertRegex(value,rb'^fictional_tester:\$2y\$12\$[./A-Za-z0-9]{53}\n$')
        self.assertNotIn(AUTH[1].encode(),value)
        for user,password in [('x:y',AUTH[1]),(p.t.FTP_USER,AUTH[1]),('valid','short'),('valid','x'*73)]:
            with self.assertRaises(p.t.DeploymentError):p.make_password_file(user,password)
    def test_protocol_rejects_application_wp_delete_and_outside_rename(self):
        client=p.ProtectionFTPS(context=p.t.tls_context())
        for cmd in ['STOR index.html','STOR icon.svg','STOR /public_html/.htaccess','RETR /public_html/wp-config.php',
                    'MKD models','DELE .htaccess','RNFR .htaccess','RNTO /public_html/.htaccess',
                    'SITE CHMOD 777 /public_html','CWD /','MLSD /public_html','PROT C']:
            with self.subTest(cmd=cmd),patch.object(p.t.VerifiedFTPS,'putcmd') as send:
                with self.assertRaises(p.t.DeploymentError):client.putcmd(cmd)
                send.assert_not_called()


if __name__=='__main__':unittest.main()
