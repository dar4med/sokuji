"""Offline checks for the strictly read-only connection operation."""
import importlib.util
from pathlib import Path
import json
import ssl
import unittest
from unittest.mock import Mock, patch

spec = importlib.util.spec_from_file_location('protection', Path(__file__).resolve().parents[1] / 'scripts/ftps-protection.py')
p = importlib.util.module_from_spec(spec); spec.loader.exec_module(p)


class ProtectionTests(unittest.TestCase):
    def setUp(self):
        self.network = patch('socket.create_connection', side_effect=AssertionError('No real network in tests'))
        self.network.start(); self.addCleanup(self.network.stop)

    def client(self):
        client = Mock()
        client.pwd.side_effect = ['/', p.transport.TARGET]
        client.sock.version.return_value = 'TLSv1.3'
        client.sock.cipher.return_value = ('TLS_AES_256_GCM_SHA384', 'TLSv1.3', 256)
        client._prot_p = True
        client.data_tls = {'version':'TLSv1.3','cipher':'TLS_AES_256_GCM_SHA384','hostnameVerified':True}
        client.mlsd.return_value = [('.',{'type':'cdir'}),('..',{'type':'pdir'})]
        return client

    def test_connection_observes_only_root_pwd_and_fixed_target_metadata(self):
        client = self.client()
        result = p.connection_preflight(p.transport.FTP_USER, 'fictional-password', lambda: client)
        self.assertEqual(result['initialPwd'], '/')
        self.assertEqual(result['targetPwd'], p.transport.TARGET)
        self.assertTrue(result['emptyTarget'])
        self.assertEqual(result['writes'], 0)
        client.cwd.assert_called_once_with(p.transport.TARGET)
        client.mlsd.assert_called_once_with()
        self.assertEqual([c[0] for c in client.mock_calls], ['pwd','cwd','pwd','mlsd','sock.version','sock.cipher','close'])

    def test_no_raw_listing_or_credentials_in_result(self):
        client = self.client()
        client.mlsd.return_value = [('.htaccess',{'type':'file'}),('private-name-not-for-logs',{'type':'file'})]
        result = p.connection_preflight(p.transport.FTP_USER, 'fictional-password', lambda: client)
        text = json.dumps(result)
        self.assertNotIn('private-name-not-for-logs', text)
        self.assertNotIn('fictional-password', text)
        self.assertNotIn(p.transport.FTP_USER, text)
        self.assertEqual(result['targetEntryCount'], 2)
        self.assertTrue(result['htaccessPresent'])

    def test_pwd_mismatch_never_lists_or_writes(self):
        client = self.client(); client.pwd.side_effect = ['/', '/wrong']
        with self.assertRaises(p.transport.DeploymentError):
            p.connection_preflight(p.transport.FTP_USER, 'fictional-password', lambda: client)
        client.mlsd.assert_not_called(); client.close.assert_called_once()

    def test_wrong_account_never_connects(self):
        connect = Mock()
        with self.assertRaises(p.transport.DeploymentError): p.connection_preflight('other', 'fictional', connect)
        connect.assert_not_called()

    def test_no_private_data_proof_is_a_failure(self):
        for private, verified in [(False,True), (True,False)]:
            client = self.client(); client._prot_p = private; client.data_tls['hostnameVerified'] = verified
            with self.assertRaises(p.transport.DeploymentError):
                p.connection_preflight(p.transport.FTP_USER, 'fictional-password', lambda: client)

    def test_protocol_fence_forbids_every_write_and_outside_read(self):
        client = p.ReadOnlyFTPS(context=p.transport.tls_context())
        for command in ['STOR x','MKD x','DELE x','RMD x','RNFR x','RNTO x','SITE CHMOD 600 x',
                        'RETR .htaccess','LIST /','MLSD /','CWD /','CWD ../../wp','PROT C','AUTH SSL','USER x\r\nSTOR y']:
            with self.subTest(command=command), patch.object(p.transport.VerifiedFTPS, 'putcmd') as send:
                with self.assertRaises(p.transport.DeploymentError): client.putcmd(command)
                send.assert_not_called()

    def test_allowlisted_protocol_calls_are_exact_and_debug_is_forbidden(self):
        client = p.ReadOnlyFTPS(context=p.transport.tls_context())
        with patch.object(p.transport.VerifiedFTPS, 'putcmd') as send:
            for command in ['AUTH TLS','USER fictional','PASS fictional','PBSZ 0','PROT P','TYPE A','PASV','EPSV','PWD','CWD '+p.transport.TARGET,'MLSD']:
                client.putcmd(command)
            self.assertEqual(send.call_count, 11)
        with self.assertRaises(p.transport.DeploymentError): client.set_debuglevel(1)

    def test_data_transfer_may_only_be_mlsd_without_resume(self):
        client = p.ReadOnlyFTPS(context=p.transport.tls_context())
        with patch.object(p.transport.VerifiedFTPS, 'ntransfercmd') as transfer:
            for cmd, rest in [('RETR x',None),('STOR x',None),('MLSD /',None),('MLSD',10)]:
                with self.assertRaises(p.transport.DeploymentError): client.ntransfercmd(cmd,rest)
            transfer.assert_not_called()

    def test_data_certificate_failure_never_creates_evidence(self):
        client = p.ReadOnlyFTPS(context=p.transport.tls_context())
        with patch.object(p.transport.VerifiedFTPS, 'ntransfercmd', side_effect=ssl.SSLCertVerificationError('fictional')):
            with self.assertRaises(ssl.SSLCertVerificationError): client.ntransfercmd('MLSD')
        self.assertFalse(hasattr(client,'data_tls'))


if __name__ == '__main__': unittest.main()
