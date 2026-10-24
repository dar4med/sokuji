"""Offline-only inspection/recovery and actual ftplib reply-queue regressions."""
import ftplib
import hashlib
import importlib.util
from pathlib import Path
import unittest
from unittest.mock import Mock,patch
from test_provision_protection import FakeFTP,AUTH

spec=importlib.util.spec_from_file_location('recovery',Path(__file__).resolve().parents[1]/'scripts/recover-protection.py')
r=importlib.util.module_from_spec(spec);spec.loader.exec_module(r)
PRIVATE=r.p.make_password_file(*AUTH)


class RecoveryTests(unittest.TestCase):
    def setUp(self):
        block=patch('socket.create_connection',side_effect=AssertionError('No network'));block.start();self.addCleanup(block.stop)
        self.ftp=FakeFTP();self.runner=r.Recovery(AUTH,self.connector,self.fetch)
        self.ftp.files['.htaccess']=self.runner.old_final
        self.ftp.files[r.p.HASH_REMOTE]=PRIVATE
        self.bad_root=False
    def connector(self):self.ftp.cwd_value='/';return self.ftp
    def fetch(self,name,auth=None,expected=None):
        active=self.ftp.files.get('.htaccess',b'')
        headers=dict(r.t.REQUIRED_HEADERS,**{'content-security-policy':self.runner.csp,'www-authenticate':'Basic realm="fictional"'})
        if b'\nRequire all denied\n' in active:return {'status':403,'headers':headers}
        # Reproduce the observed LiteSpeed distinction without declaring 403 PASS.
        if name=='' and r.PROBE.encode() not in active:return {'status':403,'headers':headers}
        if auth!=AUTH:return {'status':401,'headers':headers}
        if self.ftp.files.get(r.t.MARKER):return {'status':503,'headers':headers}
        if name=='' and r.PROBE in self.ftp.files:
            content=self.ftp.files[r.PROBE];headers['content-type']='text/plain'
            return {'status':403 if self.bad_root else 200,'headers':headers,'bytes':len(content),'sha256':hashlib.sha256(content).hexdigest()}
        return {'status':404,'headers':headers}
    def test_inspection_is_read_only_and_classifies_existing_final(self):
        result=self.runner.execute_existing(False)
        self.assertEqual(result['writes'],0)
        self.assertEqual(result['childClassification'],'own-final-25e')
        self.assertTrue(result['privateHashMatchesEnvironment'])
        self.assertEqual(result['httpBefore'][0]['anonymous'],403)
        self.assertFalse(any(e[0] in ['STOR','APPE','RENAME','SITE'] and not(e[0]=='SITE' and e[1].startswith('MLST')) for e in self.ftp.events))
    def test_recovery_reuses_hash_and_proves_strict_root401(self):
        result=self.runner.execute_existing(True)
        self.assertTrue(result['ready'],result)
        self.assertEqual(result['anonymousRootStatus'],401)
        self.assertEqual(result['correctRootStatus'],200)
        self.assertEqual(result['correctMaintenanceStatus'],503)
        self.assertEqual(self.ftp.files[r.p.HASH_REMOTE],PRIVATE)
        self.assertEqual(set(self.ftp.files),{'.htaccess',r.p.HASH_REMOTE,r.PROBE,r.t.MARKER})
        self.assertIn(('DirectoryIndex index.html '+r.PROBE).encode(),self.ftp.files['.htaccess'])
        self.assertFalse(any(e[0]=='APPE' or (e[0]=='STOR' and e[1]==r.p.HASH_REMOTE) for e in self.ftp.events))
    def test_unknown_config_or_unexpected_app_never_written(self):
        self.ftp.files['.htaccess']=b'operator config'
        self.assertFalse(self.runner.execute_existing(True)['ready'])
        self.assertFalse(any(e[0]=='STOR' for e in self.ftp.events))
        self.ftp.files['.htaccess']=self.runner.old_final;self.ftp.files['index.html']=b'unknown app'
        self.assertFalse(self.runner.execute_existing(True)['ready'])
        self.assertFalse(any(e[0]=='STOR' for e in self.ftp.events))
    def test_unknown_probe_or_marker_never_overwritten(self):
        self.ftp.files[r.PROBE]=b'unknown'
        self.assertFalse(self.runner.execute_existing(True)['ready'])
        self.assertFalse(any(e[0]=='STOR' for e in self.ftp.events))
    def test_unchanged_root403_is_failure_and_known_deny_is_restored(self):
        self.bad_root=True
        result=self.runner.execute_existing(True)
        self.assertFalse(result['ready'])
        self.assertTrue(result.get('rollbackDenyVerified'),result)
        self.assertEqual(self.ftp.files['.htaccess'],self.runner.deny)
    def test_password_does_not_match_stored_hash_aborts_without_writes(self):
        self.runner.auth=(AUTH[0],'different-fictional-password')
        self.assertFalse(self.runner.execute_existing(True)['ready'])
        self.assertFalse(any(e[0]=='STOR' for e in self.ftp.events))
    def test_protocol_forbids_password_changes_wp_writes_and_deletes(self):
        client=r.RecoveryFTPS(context=r.t.tls_context())
        for cmd in ['STOR '+r.p.HASH_REMOTE,'APPE '+r.p.HASH_REMOTE,'SITE CHMOD 600 '+r.p.HASH_REMOTE,
                    'STOR index.html','STOR /public_html/.htaccess','DELE '+r.PROBE,'RNTO /public_html/.htaccess']:
            with self.subTest(cmd=cmd),patch.object(r.t.VerifiedFTPS,'putcmd') as send:
                with self.assertRaises(r.t.DeploymentError):client.putcmd(cmd)
                send.assert_not_called()
    def test_inspection_protocol_cannot_write_even_protection(self):
        client=r.InspectionFTPS(context=r.t.tls_context())
        for cmd in ['STOR '+r.t.MARKER,'RNFR .htaccess-provision-'+'a'*32,'RNTO .htaccess','STOR '+r.p.HASH_REMOTE]:
            with self.subTest(cmd=cmd),patch.object(r.t.VerifiedFTPS,'putcmd') as send:
                with self.assertRaises(r.t.DeploymentError):client.putcmd(cmd)
                send.assert_not_called()


class Data:
    def __init__(self,content):self.content=content
    def __enter__(self):return self
    def __exit__(self,*args):return False
    def recv(self,size):result=self.content[:size];self.content=self.content[size:];return result


class ReplyQueueFTP(FakeFTP):
    def __init__(self):super().__init__();self.pending=False;self.replies=0
    def voidcmd(self,cmd):
        if self.pending:raise RuntimeError('Pending old 226')
        return '200'
    def transfercmd(self,cmd,rest=None):self.pending=True;return Data(self.files[cmd.split(' ',1)[1]])
    def voidresp(self):self.pending=False;self.replies+=1;return '226'
    def retrbinary(self,cmd,callback):return ftplib.FTP.retrbinary(self,cmd,callback)
    def mlsd(self,path='',facts=None):
        result=super().mlsd(path,facts)
        # Omit optional size to exercise draining, not only metadata rejection.
        return [(n,{k:v for k,v in f.items() if k!='size'}) for n,f in result]


class ReplyQueueTests(unittest.TestCase):
    def test_old_callback_reproduces_unconsumed226(self):
        ftp=ReplyQueueFTP();ftp.files['.htaccess']=b'longer-final-config'
        def old_callback(chunk):
            if len(chunk)>4:raise ValueError('old early limit')
        with self.assertRaises(ValueError):ftp.retrbinary('RETR .htaccess',old_callback)
        self.assertTrue(ftp.pending);self.assertEqual(ftp.replies,0)
    def test_new_reader_rejects_length_but_drains226(self):
        ftp=ReplyQueueFTP();ftp.files['.htaccess']=b'longer-final-config';ftp.cwd_value=r.t.TARGET
        provision=r.p.Provision(AUTH,b'',lambda:ftp);provision.client=ftp
        with self.assertRaises(r.t.DeploymentError):provision.read('.htaccess',b'deny')
        self.assertFalse(ftp.pending);self.assertEqual(ftp.replies,1)
        self.assertEqual(ftp.voidcmd('NOOP'),'200')
    def test_normal_facts_always_reset_optional_mode_selector(self):
        ftp=FakeFTP();ftp.cwd_value=r.t.TARGET;ftp.files['.htaccess']=b'x'
        observed=[];original=ftp.mlsd
        def listing(path='',facts=None):observed.append(facts);return original(path,facts)
        ftp.mlsd=listing
        provision=r.p.Provision(AUTH,b'',lambda:ftp);provision.client=ftp
        provision.facts(mode=True);provision.facts()
        self.assertEqual(observed,[['type','size','unix.mode'],['type','size']])


if __name__=='__main__':unittest.main()
