"""Network-free first-deployment tests. All accounts/content below are fictional."""
import hashlib
import importlib.util
import io
from pathlib import Path
import ssl
import tempfile
import unittest
from unittest.mock import Mock, patch

spec = importlib.util.spec_from_file_location('deploy', Path(__file__).resolve().parents[1] / 'scripts/deploy-ftps.py')
d = importlib.util.module_from_spec(spec)
spec.loader.exec_module(d)
SHA = 'a' * 40
CSP = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval' 'sha256-fictional'"
AUTH = ('fictional_tester', 'fictional-only-test-password')
CONFIG = ('AuthType Basic\nAuthName "Fictional"\nAuthBasicProvider file\nAuthUserFile "/private/.test.htpasswd"\nRequire valid-user\n' + d.MAINTENANCE + '\n').encode()


def setUpModule():
    global no_network
    no_network = patch('socket.create_connection', side_effect=AssertionError('Real network is forbidden in these tests'))
    no_network.start()


def tearDownModule():
    no_network.stop()


class FakeFTP:
    def __init__(self):
        self.files = {'.htaccess': CONFIG}
        self.entries = {'.htaccess': {'type': 'file'}}
        self.events = []
        self.directory = '/'
        self.bad_pwd = False
        self.interrupt = False
        self.corrupt = False
        self.refuse_rename = False

    def cwd(self, path):
        self.events.append(('CWD', path)); self.directory = path

    def pwd(self):
        return d.TARGET + '-wrong' if self.bad_pwd else self.directory

    def mlsd(self):
        return list(self.entries.items())

    def retrbinary(self, command, consume):
        name = command.removeprefix('RETR ')
        content = self.files[name]
        consume(content + b'wrong' if self.corrupt and '.deploy-' in name else content)

    def storbinary(self, command, source):
        name = command.removeprefix('STOR ')
        self.events.append(('STOR', name))
        content = source.read()
        self.files[name] = content[:1] if self.interrupt and name != d.MARKER else content
        if self.interrupt and name != d.MARKER:
            raise ConnectionError('fictional interrupted data connection')

    def mkd(self, name):
        self.events.append(('MKD', name))

    def rename(self, source, target):
        self.events.append(('RENAME', source, target))
        if self.refuse_rename:
            raise PermissionError('fictional server refuses atomic rename')
        self.files[target] = self.files.pop(source)

    def close(self):
        self.events.append(('CLOSE',))


class DeploymentTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.payload = {}
        for name, content in {'index.html': b'<html>fictional</html>', 'sw.js': b'// fake fixture',
                              'icon.svg': b'<svg/>', 'models-manifest.json': b'{}',
                              'assets/app.js': b'// fixture', 'models/asr/test.onnx': b'\x00fixture',
                              'runtime/runtime.wasm': b'\x00asm'}.items():
            file = Path(self.tmp.name) / name
            file.parent.mkdir(parents=True, exist_ok=True); file.write_bytes(content)
            self.payload[name] = dict(d.file_metadata(file), local=file)
        self.ftp = FakeFTP()
        self.calls = []
        self.anon_status = 401
        self.wrong_status = 401
        self.good_credentials = True
        self.broken_guard = False
        self.bad_csp = False
        self.bad_post_mime = False
        self.connects = 0

    def connector(self):
        self.connects += 1
        return self.ftp

    def fetch(self, name, auth=None, expected=None):
        self.calls.append((name, auth is not None))
        headers = dict(d.REQUIRED_HEADERS, **{'content-security-policy': 'bad' if self.bad_csp else CSP,
                                           'www-authenticate': 'Basic realm="Fictional"'})
        if auth != AUTH or not self.good_credentials:
            return {'status': self.anon_status if auth is None else self.wrong_status, 'headers': headers}
        if self.ftp.files.get(d.MARKER) and not self.broken_guard:
            return {'status': 503, 'headers': headers}
        if expected is None:
            return {'status': 200, 'headers': headers}
        if name not in self.ftp.files:
            return {'status': 404, 'headers': headers}
        content = self.ftp.files[name]
        mime = {'.html':'text/html','.js':'application/javascript','.json':'application/json',
                '.svg':'image/svg+xml','.onnx':'application/octet-stream','.wasm':'application/wasm'}[Path(name).suffix]
        headers['content-type'] = 'text/html' if self.bad_post_mime else mime
        return {'status': 200, 'headers': headers, 'bytes':len(content), 'sha256':hashlib.sha256(content).hexdigest()}

    def deployment(self, guard_hash=None):
        return d.Deployment(self.payload, SHA, guard_hash or hashlib.sha256(CONFIG).hexdigest(), AUTH, self.connector, self.fetch)

    def payload_writes(self):
        return [event for event in self.ftp.events if event[0] == 'STOR' and event[1] != d.MARKER]

    def test_complete_commit_keeps_auth_and_never_leaves_scope(self):
        result = self.deployment().execute(CSP)
        self.assertTrue(result['verified'])
        self.assertEqual(self.ftp.files['.htaccess'], CONFIG)
        self.assertNotIn(d.MARKER, self.ftp.files)
        self.assertEqual(sum(n.startswith('.deployment-complete-' + SHA + '-') for n in self.ftp.files), 1)
        for name, metadata in self.payload.items():
            self.assertEqual(self.ftp.files[name], metadata['local'].read_bytes())
        for event in self.ftp.events:
            for path in event[1:]:
                if event[0] != 'CWD':
                    self.assertFalse(path.startswith('/'))
                    self.assertNotIn('..', path.split('/'))
        self.assertFalse(any(e[0] == 'STOR' and e[1] == '.htaccess' for e in self.ftp.events))
        self.assertIn(('', False), self.calls)

    def test_anonymous_403_404_open_and_redirect_all_abort_before_ftp(self):
        for status in [200, 301, 302, 307, 308, 403, 404]:
            with self.subTest(status=status):
                self.anon_status = status
                with self.assertRaises(d.DeploymentError): self.deployment().execute(CSP)
        self.assertEqual(self.connects, 0)

    def test_wrong_password_must_return_401(self):
        self.wrong_status = 200
        with self.assertRaises(d.DeploymentError): self.deployment().execute(CSP)
        self.assertEqual(self.connects, 0)

    def test_correct_credentials_must_reach_maintenance_before_payload(self):
        self.good_credentials = False
        with self.assertRaises(d.DeploymentError): self.deployment().execute(CSP)
        self.assertIn(d.MARKER, self.ftp.files)
        self.assertEqual(self.payload_writes(), [])

    def test_wrong_canonical_pwd_never_writes(self):
        self.ftp.bad_pwd = True
        with self.assertRaises(d.DeploymentError): self.deployment().execute(CSP)
        self.assertFalse(any(e[0] in ['STOR','MKD','RENAME'] for e in self.ftp.events))

    def test_symlink_existing_app_and_old_lock_are_rejected(self):
        for extra, facts in [('index.html', {'type':'file'}), (d.MARKER, {'type':'file'}),
                             ('outside', {'type':'OS.unix=slink'}), ('models', {'type':'dir'})]:
            with self.subTest(extra=extra):
                self.ftp.entries = {'.htaccess': {'type':'file'}, extra: facts}
                if extra == d.MARKER: self.ftp.files[extra] = b'interrupted deployment'
                with self.assertRaises(d.DeploymentError): self.deployment().execute(CSP)
        self.assertEqual(self.payload_writes(), [])

    def test_verified_empty_bootstrap_marker_is_reused_safely(self):
        self.ftp.entries[d.MARKER] = {'type':'file', 'size':'0'}
        self.ftp.files[d.MARKER] = b''
        self.assertTrue(self.deployment().execute(CSP)['verified'])

    def test_symlink_attribute_on_allowed_file_is_rejected(self):
        self.ftp.entries['.htaccess']['unix.slink'] = '/outside'
        with self.assertRaises(d.DeploymentError): self.deployment().execute(CSP)
        self.assertEqual(self.payload_writes(), [])

    def test_mlsd_directory_metadata_does_not_expand_scope(self):
        self.ftp.entries.update({'.': {'type':'cdir'}, '..': {'type':'pdir'}})
        self.assertTrue(self.deployment().execute(CSP)['verified'])
        self.assertEqual([e for e in self.ftp.events if e[0]=='CWD'], [('CWD', d.TARGET)])

    def test_optional_existing_icon_is_verified_and_never_overwritten(self):
        self.ftp.entries['icon.svg'] = {'type':'file'}
        self.ftp.files['icon.svg'] = self.payload['icon.svg']['local'].read_bytes()
        self.assertTrue(self.deployment().execute(CSP)['verified'])
        self.assertFalse(any(e[0]=='RENAME' and e[-1]=='icon.svg' for e in self.ftp.events))

    def test_unapproved_config_and_missing_guard_never_write(self):
        with self.assertRaises(d.DeploymentError): self.deployment('0'*64).execute(CSP)
        self.ftp.files['.htaccess'] = b'AuthType Basic\nRequire valid-user\n'
        with self.assertRaises(d.DeploymentError): self.deployment(hashlib.sha256(self.ftp.files['.htaccess']).hexdigest()).execute(CSP)
        self.assertEqual(self.payload_writes(), [])

    def test_guard_ineffective_or_wrong_csp_leaves_lock_and_no_payload(self):
        self.broken_guard = True
        with self.assertRaises(d.DeploymentError): self.deployment().execute(CSP)
        self.assertIn(d.MARKER, self.ftp.files)
        self.assertEqual(self.payload_writes(), [])
        self.ftp = FakeFTP(); self.broken_guard = False; self.bad_csp = True
        with self.assertRaises(d.DeploymentError): self.deployment().execute(CSP)
        self.assertIn(d.MARKER, self.ftp.files)
        self.assertEqual(self.payload_writes(), [])

    def test_interruption_bad_hash_and_rename_failure_leave_maintenance(self):
        for flag in ['interrupt', 'corrupt', 'refuse_rename']:
            with self.subTest(flag=flag):
                self.ftp = FakeFTP(); setattr(self.ftp, flag, True)
                with self.assertRaises(Exception): self.deployment().execute(CSP)
                self.assertIn(d.MARKER, self.ftp.files)
                self.assertFalse(any(n.startswith('.deployment-complete-') for n in self.ftp.files))
                self.assertEqual(self.ftp.files['.htaccess'], CONFIG)

    def test_postcommit_mime_failure_relocks_complete_payload(self):
        self.bad_post_mime = True
        with self.assertRaises(d.DeploymentError): self.deployment().execute(CSP)
        self.assertIn(d.MARKER, self.ftp.files)

    def test_receipt_collision_never_overwrites_or_unlocks(self):
        receipt = '.deployment-complete-' + SHA + '-' + 'f'*32 + '.json'
        original_rename = self.ftp.rename
        def competing_receipt(source, target):
            original_rename(source, target)
            if target == 'index.html':
                self.ftp.entries[receipt] = {'type':'file'}
                self.ftp.files[receipt] = b'existing receipt must survive'
        self.ftp.rename = competing_receipt
        with patch.object(d.secrets, 'token_hex', return_value='f'*32):
            with self.assertRaises(d.DeploymentError): self.deployment().execute(CSP)
        self.assertIn(d.MARKER, self.ftp.files)
        self.assertEqual(self.ftp.files[receipt], b'existing receipt must survive')

    def test_path_injection_is_rejected(self):
        for name in ['../wp-config.php','/public_html/index.php','a//b','a/./b','a/../b',
                     'a\\b','a%2fb','https://other.test/a','a\r\nDELE x','.htaccess','x.zip','x.py']:
            with self.subTest(name=name):
                with self.assertRaises(d.DeploymentError): d.safe_path(name)


class TransportTests(unittest.TestCase):
    def test_certificate_hostname_and_tls_version_are_required(self):
        context = d.tls_context()
        self.assertTrue(context.check_hostname)
        self.assertEqual(context.verify_mode, ssl.CERT_REQUIRED)
        self.assertGreaterEqual(context.minimum_version, ssl.TLSVersion.TLSv1_2)

    def test_auth_tls_precedes_login_and_prot_p_precedes_data(self):
        client = Mock()
        client.sock = Mock(spec=ssl.SSLSocket)
        client._prot_p = True
        with patch.object(d, 'VerifiedFTPS', return_value=client): d.connect_ftps(d.FTP_USER, 'fictional-only')
        methods = [c[0] for c in client.mock_calls]
        self.assertLess(methods.index('auth'), methods.index('login'))
        self.assertLess(methods.index('login'), methods.index('prot_p'))
        self.assertFalse(client.trust_server_pasv_ipv4_address)

    def test_certificate_failure_never_sends_login(self):
        client = Mock(); client.auth.side_effect = ssl.SSLCertVerificationError('fictional')
        with patch.object(d, 'VerifiedFTPS', return_value=client):
            with self.assertRaises(ssl.SSLCertVerificationError): d.connect_ftps(d.FTP_USER, 'fictional-only')
        client.login.assert_not_called()
        client.close.assert_called_once()

    def test_missing_prot_p_aborts(self):
        client = Mock(); client.sock = Mock(spec=ssl.SSLSocket); client._prot_p = False
        with patch.object(d, 'VerifiedFTPS', return_value=client):
            with self.assertRaises(d.DeploymentError): d.connect_ftps(d.FTP_USER, 'fictional-only')

    def test_other_ftp_account_rejected_before_any_connection(self):
        with patch.object(d, 'VerifiedFTPS') as client:
            with self.assertRaises(d.DeploymentError): d.connect_ftps('not-approved', 'fictional-only')
        client.assert_not_called()

    def test_data_channel_requires_private_and_verifies_host(self):
        client = d.VerifiedFTPS(context=d.tls_context())
        with patch.object(d.ftplib.FTP, 'ntransfercmd') as parent:
            with self.assertRaises(d.DeploymentError): client.ntransfercmd('RETR x')
            parent.assert_not_called()
        client.host = d.FTP_HOST; client.sock = Mock(spec=ssl.SSLSocket); client._prot_p = True
        raw, wrapped = Mock(), Mock()
        context = Mock(); context.wrap_socket.return_value = wrapped; client.context = context
        with patch.object(d.ftplib.FTP, 'ntransfercmd', return_value=(raw, 1)):
            self.assertEqual(client.ntransfercmd('RETR x'), (wrapped, 1))
        context.wrap_socket.assert_called_once_with(raw, server_hostname=d.FTP_HOST, session=client.sock.session)

    def test_https_redirect_is_not_followed(self):
        connection = Mock(); response = Mock(); response.status = 302
        response.getheaders.return_value = [('Location', 'https://foreign.test/')]
        connection.getresponse.return_value = response
        with patch.object(d.http.client, 'HTTPSConnection', return_value=connection):
            result = d.https_get('index.html')
        self.assertEqual(result['status'], 302)
        connection.request.assert_called_once_with('GET', '/translator-test/index.html', headers={'Cache-Control':'no-cache'})

    def test_bad_data_certificate_closes_socket_and_never_downgrades(self):
        client = d.VerifiedFTPS(context=d.tls_context())
        client.host = d.FTP_HOST; client.sock = Mock(spec=ssl.SSLSocket); client._prot_p = True
        raw = Mock(); context = Mock(); client.context = context
        context.wrap_socket.side_effect = ssl.SSLCertVerificationError('fictional')
        with patch.object(d.ftplib.FTP, 'ntransfercmd', return_value=(raw, 1)):
            with self.assertRaises(ssl.SSLCertVerificationError): client.ntransfercmd('RETR x')
        raw.close.assert_called_once()


if __name__ == '__main__':
    unittest.main()
