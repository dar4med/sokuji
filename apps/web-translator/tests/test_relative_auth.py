"""Offline transaction/transport evidence. Never a real LiteSpeed PASS."""
import hashlib
import importlib.util
import json
from pathlib import Path
import unittest
from unittest.mock import Mock,patch
from test_provision_protection import FakeFTP,AUTH

spec=importlib.util.spec_from_file_location('relative',Path(__file__).resolve().parents[1]/'scripts/test-relative-auth.py')
r=importlib.util.module_from_spec(spec);spec.loader.exec_module(r)


class FTP(FakeFTP):
    def __init__(self):
        super().__init__();self.http=[];self.mode_missing=False;self.bad_hash=False;self.interrupt=False
        self.reported_mode=None;self.lose_mode_on_rename=False
    def mlsd(self,path='',facts=None):
        assert path=='','No external/root listing'
        result=super().mlsd(path,facts)
        if facts and 'unix.mode' in facts:
            return [(n,{**f,**({} if self.mode_missing else {'unix.mode':self.reported_mode or self.modes.get(n,'0644')})}) for n,f in result]
        return result
    def rename(self,source,target):
        super().rename(source,target)
        if source in self.modes:self.modes[target]=self.modes.pop(source)
        if target==r.LOCAL_HASH and self.lose_mode_on_rename:self.modes[target]='0644'
    def sendcmd(self,cmd):
        assert cmd.startswith('SITE CHMOD 600 .htpasswd-relative-') or cmd.startswith('STAT .htpasswd')
        self.events.append(('MODE',cmd))
        if cmd.startswith('SITE CHMOD'):self.modes[cmd.split(' ',3)[3]]='0600';return '200'
        return '211\n-rw------- 1 fictional fictional 0 file\n211 End'
    def storbinary(self,command,source):
        content=source.read(); name=command.removeprefix('STOR ')
        self.events.append(('STOR',name))
        if content.startswith(AUTH[0].encode()+b':'):
            assert self.modes.get(name)=='0600', 'Mode 0600 must precede hash content'
            assert b'<FilesMatch "^\\.">' in self.files['.htaccess']
            assert self.http and all(c['status']==403 for c in self.http), 'Refusal must precede hash'
            if self.interrupt:self.files[name]=content[:4];raise ConnectionError('fictional transfer interrupted')
            if self.bad_hash:content+=b'corrupt'
        self.files[name]=content


class RelativeTests(unittest.TestCase):
    def setUp(self):
        blocker=patch('socket.create_connection',side_effect=AssertionError('No network'));blocker.start();self.addCleanup(blocker.stop)
        self.ftp=FTP();self.runner=r.RelativeTest(AUTH,self.connector,self.fetch)
        self.ftp.files['.htaccess']=self.runner.original_deny
        self.ftp.files[r.PROBE]=r.BODY
        self.relative_works=True;self.leak=False;self.authenticated_leak=False;self.bad_probe=False;self.bad_mime=False;self.bad_csp=False;self.redirect=False
    def connector(self):self.ftp.cwd_value='/';return self.ftp
    def fetch(self,name,auth=None,expected=None):
        active=self.ftp.files.get('.htaccess',b'')
        headers={'content-security-policy':'bad' if self.bad_csp else self.runner.csp,
                 'content-type':'text/html' if self.bad_mime else 'text/plain',
                 'www-authenticate':'Basic realm="Med Partners translator-test"'}
        hidden=name.startswith(('.', '%2e'))
        if hidden and (self.leak or (self.authenticated_leak and auth==AUTH and b'AuthUserFile .htpasswd' in active)):status=200
        elif b'\nRequire all denied\n' in active and active.startswith(self.runner.original_deny):status=403
        elif hidden:status=403
        elif b'AuthUserFile .htpasswd' not in active:status=403
        elif auth!=AUTH or not self.relative_works:status=401
        else:status=302 if self.redirect else 200
        result={'status':status,'headers':headers}
        if status==200 and expected is not None:
            result.update(bytes=len(r.BODY),sha256='0'*64 if self.bad_probe else hashlib.sha256(r.BODY).hexdigest())
        self.ftp.http.append({'path':name,'credentials':auth is not None,'status':status})
        return result
    def test_success_is_only_relative_auth_protection_and_reuses_existing_password(self):
        result=self.runner.execute();self.assertTrue(result['ready'],result)
        self.assertTrue(result['hiddenDeniedBeforeHash']);self.assertTrue(result['hiddenDeniedAfterAuth'])
        self.assertEqual(self.ftp.files['.htaccess'],self.runner.final)
        self.assertEqual(self.ftp.files[r.LOCAL_HASH],self.runner.password_file)
        self.assertEqual(self.ftp.modes[r.LOCAL_HASH],'0600')
        self.assertEqual(set(self.ftp.files),{'.htaccess',r.PROBE,r.LOCAL_HASH})
        for sensitive in [AUTH[0],AUTH[1],self.runner.password_file.decode()]:self.assertNotIn(sensitive,json.dumps(result))
        self.assertFalse(result['externalHashAccessed']);self.assertFalse(result['passwordChanged']);self.assertFalse(result['applicationTransferred'])
        self.assertEqual(result['localHashMode'],'0600')
    def test_relative_path_failure_restores_deny_without_trying_absolute_path(self):
        self.relative_works=False;result=self.runner.execute()
        self.assertFalse(result['ready']);self.assertTrue(result['rollbackDenyVerified'],result)
        self.assertEqual(self.ftp.files['.htaccess'],self.runner.deny)
        self.assertNotIn(r.p.AUTH_USER_FILE.encode(),self.runner.final)
        self.assertTrue(any(e['status']==401 and e['credentials'] for e in result['httpChecks']))
    def test_hidden_download_prevents_any_hash_content(self):
        self.leak=True;result=self.runner.execute()
        self.assertFalse(result['ready']);self.assertFalse(result.get('hiddenDeniedBeforeHash',False))
        self.assertFalse(any(AUTH[0].encode()+b':' in v for v in self.ftp.files.values()))
    def test_authenticated_dotfile_leak_after_activation_restores_deny(self):
        self.authenticated_leak=True;result=self.runner.execute()
        self.assertFalse(result['ready']);self.assertTrue(result['rollbackDenyVerified'],result)
        self.assertEqual(self.ftp.files['.htaccess'],self.runner.deny)
    def test_missing_control_probe_creates_only_the_known_small_static_file(self):
        self.ftp.files.pop(r.PROBE);result=self.runner.execute()
        self.assertTrue(result['ready'],result);self.assertEqual(self.ftp.files[r.PROBE],r.BODY)
    def test_unknown_config_existing_local_hash_or_payload_never_written(self):
        for name,body in [('.htaccess',b'unknown'),('.htpasswd',b'existing'),('index.html',b'app')]:
            with self.subTest(name=name):
                self.setUp();self.ftp.files[name]=body;result=self.runner.execute()
                self.assertFalse(result['ready']);self.assertEqual(result['writes'],0)
    def test_symlink_fact_is_rejected_before_writes(self):
        original=self.ftp.mlsd
        def listing(path='',facts=None):
            return [(name,{**metadata,'unix.slink':'outside'}) if name=='.htaccess' else (name,metadata)
                    for name,metadata in original(path,facts)]
        self.ftp.mlsd=listing;result=self.runner.execute()
        self.assertFalse(result['ready']);self.assertEqual(result['writes'],0)
    def test_bad_hash_or_interrupted_transfer_stays_deny(self):
        for field in ['bad_hash','interrupt']:
            with self.subTest(field=field):
                self.setUp();setattr(self.ftp,field,True);result=self.runner.execute()
                self.assertFalse(result['ready']);self.assertTrue(result['rollbackDenyVerified'],result)
                self.assertEqual(self.ftp.files['.htaccess'],self.runner.deny)
    def test_bad_probe_mime_csp_redirect_each_fails_and_restores_deny(self):
        for field in ['bad_probe','bad_mime','bad_csp','redirect']:
            with self.subTest(field=field):
                self.setUp();setattr(self,field,True);result=self.runner.execute()
                self.assertFalse(result['ready']);self.assertTrue(result['rollbackDenyVerified'],result)
    def test_missing_optional_mode_uses_only_local_stat(self):
        self.ftp.mode_missing=True;result=self.runner.execute();self.assertTrue(result['ready'],result)
        self.assertTrue(any(e[0]=='MODE' and e[1].startswith('STAT ') for e in self.ftp.events))
    def test_wrong_mode_before_hash_aborts_without_secret_content_or_fallback(self):
        self.ftp.reported_mode='0644';result=self.runner.execute()
        self.assertFalse(result['ready']);self.assertTrue(result['rollbackDenyVerified'],result)
        self.assertFalse(any(AUTH[0].encode()+b':' in body for body in self.ftp.files.values()))
        self.assertFalse(any(e[0]=='MODE' and 'CHMOD 644' in e[1] for e in self.ftp.events))
    def test_mode0600_is_verified_again_after_hash_rename(self):
        self.ftp.lose_mode_on_rename=True;result=self.runner.execute()
        self.assertFalse(result['ready']);self.assertTrue(result['rollbackDenyVerified'],result)
        self.assertEqual(self.ftp.files['.htaccess'],self.runner.deny)
        self.assertFalse(any(e[0]=='MODE' and 'CHMOD 644' in e[1] for e in self.ftp.events))
    def test_protocol_forbids_chmod644_and_allows_only0600_for_owned_temporary(self):
        client=r.RelativeFTPS(context=r.t.tls_context());name='.htpasswd-relative-'+'a'*32
        with patch.object(r.t.VerifiedFTPS,'putcmd') as send:
            for mode in ['644','640','666']:
                with self.assertRaises(r.t.DeploymentError):client.putcmd('SITE CHMOD '+mode+' '+name)
            send.assert_not_called()
            client.putcmd('SITE CHMOD 600 '+name)
            send.assert_called_once_with('SITE CHMOD 600 '+name)
    def test_protocol_blocks_external_paths_plain_ftp_payload_delete_and_rename_escape(self):
        client=r.RelativeFTPS(context=r.t.tls_context())
        for cmd in ['RETR '+r.p.HASH_REMOTE,'MLSD /','CWD /public_html','STOR index.html','STOR .htpasswd',
                    'DELE .htpasswd','APPE .htpasswd','SITE CHMOD 644 /public_html','PROT C','AUTH SSL',
                    'RNTO /public_html/.htaccess','RNFR .htpasswd','MKD models']:
            with self.subTest(cmd=cmd),patch.object(r.t.VerifiedFTPS,'putcmd') as send:
                with self.assertRaises(r.t.DeploymentError):client.putcmd(cmd)
                send.assert_not_called()
    def test_http_never_reads_hidden_file_even_when_server_returns200(self):
        response=Mock(status=200);response.getheaders.return_value=[];connection=Mock();connection.getresponse.return_value=response
        with patch.object(r.http.client,'HTTPSConnection',return_value=connection):result=r.https('.htpasswd',AUTH)
        self.assertEqual(result['status'],200);response.read.assert_not_called()
        self.assertEqual(connection.request.call_args.args,('GET','/translator-test/.htpasswd'))
    def test_hash_is_valid_bcrypt_for_existing_password(self):
        import warnings
        with warnings.catch_warnings():warnings.simplefilter('ignore');import crypt
        encoded=self.runner.password_file.decode().rstrip('\n').split(':',1)[1]
        self.assertTrue(encoded.startswith('$2y$12$'))
        self.assertEqual(crypt.crypt(AUTH[1],encoded),encoded)


if __name__=='__main__':unittest.main()
