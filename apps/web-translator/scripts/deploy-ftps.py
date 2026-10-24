#!/usr/bin/env python3
"""Prepared first-deployment client. Network is used ONLY with explicit --execute.

Never writes .htaccess, deletes remote files, guesses a root, or falls back to FTP.
"""
import argparse
import base64
import ftplib
import hashlib
import http.client
import io
import json
import os
from pathlib import Path
import re
import secrets
import ssl

FTP_HOST = 'dhostingdar.ftp.dhosting.pl'
FTP_PORT = 21
FTP_USER = 'ahsh9u_ailekarz'
TARGET = '/public_html/translator-test'
WEB_HOST = 'ai.lekarz.nl'
WEB_PREFIX = '/translator-test/'
MARKER = '.deployment-in-progress'
MAINTENANCE = '''# BEGIN TRANSLATOR DEPLOYMENT GUARD
ErrorDocument 503 "Translator deployment locked"
RewriteEngine On
RewriteCond %{DOCUMENT_ROOT}/translator-test/.deployment-in-progress -f
RewriteRule ^ - [R=503,L]
# END TRANSLATOR DEPLOYMENT GUARD'''
REQUIRED_HEADERS = {
    'cross-origin-opener-policy': 'same-origin',
    'cross-origin-embedder-policy': 'require-corp',
    'cross-origin-resource-policy': 'same-origin',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    'cache-control': 'private, no-store',
    'permissions-policy': 'microphone=(self), camera=(), geolocation=()',
    'x-robots-tag': 'noindex, nofollow, noarchive',
}


class DeploymentError(Exception):
    """Public, fixed diagnostic; never a raw server response or secret."""


def require(condition, message):
    if not condition:
        raise DeploymentError(message)


def safe_path(name):
    require(isinstance(name, str) and bool(name), 'Invalid relative payload path')
    require(all(re.fullmatch(r'[A-Za-z0-9_-][A-Za-z0-9_.-]*', part) for part in name.split('/')),
            'Unsafe relative payload path')
    require(not name.endswith(('.py', '.ts', '.map', '.wav', '.zip', '.pem', '.key')), 'Forbidden payload file')
    return name


def tls_context():
    context = ssl.create_default_context()
    context.minimum_version = ssl.TLSVersion.TLSv1_2
    return context


class VerifiedFTPS(ftplib.FTP_TLS):
    def ntransfercmd(self, cmd, rest=None):
        require(self._prot_p, 'Private TLS data channel is mandatory')
        raw, size = ftplib.FTP.ntransfercmd(self, cmd, rest)
        try:
            # Verify every passive data connection against the control hostname.
            # Reuse the verified control session where the server requires it.
            connection = self.context.wrap_socket(raw, server_hostname=self.host, session=self.sock.session)
            return connection, size
        except Exception:
            raw.close()
            raise


def connect_ftps(username, password, client_factory=None):
    require(username == FTP_USER, 'FTP account does not match the approved fixed account')
    client = (client_factory or VerifiedFTPS)(context=tls_context(), timeout=30)
    try:
        client.connect(FTP_HOST, FTP_PORT)
        client.auth()  # AUTH TLS before USER/PASS; certificate and hostname checked.
        require(isinstance(client.sock, ssl.SSLSocket), 'TLS control channel is mandatory')
        client.login(username, password)
        client.prot_p()  # PBSZ 0 + PROT P; no unencrypted data fallback.
        require(client._prot_p, 'Private TLS data protection was not enabled')
        client.set_pasv(True)
        client.trust_server_pasv_ipv4_address = False
        return client
    except Exception:
        client.close()
        raise


def https_get(name, auth=None, expected=None):
    if name != '':
        safe_path(name)
    headers = {'Cache-Control': 'no-cache'}
    if auth is not None:
        value = base64.b64encode((auth[0] + ':' + auth[1]).encode('utf-8')).decode('ascii')
        headers['Authorization'] = 'Basic ' + value
    connection = http.client.HTTPSConnection(WEB_HOST, timeout=30, context=tls_context())
    try:
        # http.client does not follow redirects, including same-origin redirects.
        connection.request('GET', WEB_PREFIX + name, headers=headers)
        response = connection.getresponse()
        result = {'status': response.status, 'headers': {k.lower(): v for k, v in response.getheaders()}}
        if expected is not None and response.status == 200:
            digest, size = hashlib.sha256(), 0
            while chunk := response.read(1024 * 1024):
                size += len(chunk)
                require(size <= expected['bytes'], 'HTTPS response exceeds expected length')
                digest.update(chunk)
            result.update(bytes=size, sha256=digest.hexdigest())
        return result
    finally:
        connection.close()


def file_metadata(file):
    with file.open('rb') as handle:
        return {'bytes': file.stat().st_size, 'sha256': hashlib.file_digest(handle, 'sha256').hexdigest()}


def load_package(directory, expected_sha):
    summaries = list(directory.glob('*.zip.delivery.json'))
    require(len(summaries) == 1, 'Expected one locally verified package')
    summary = json.loads(summaries[0].read_text())
    require(summary['extractionVerified'] is True and summary['sourceSha'] == expected_sha, 'Package source is not this tested SHA')
    root = directory / ('translator-private-' + expected_sha[:12])
    manifest_file = root / 'MANIFEST.json'
    require(file_metadata(manifest_file)['sha256'] == summary['manifestSha256'], 'Package manifest mismatch')
    manifest = json.loads(manifest_file.read_text())
    require(manifest['sourceSha'] == expected_sha and len(manifest['files']) + 1 == 74, 'Expected reviewed 74-file package')
    payload = {}
    for name, metadata in manifest['files'].items():
        if not name.startswith('payload/'):
            continue
        relative = name[len('payload/'):]
        file = root / 'payload' / relative
        if relative == '.htaccess':
            require(not file.is_symlink() and file_metadata(file) == metadata, 'Local deny-all configuration integrity failure')
            continue  # The deny-all build file must NEVER overwrite hosting auth.
        safe_path(relative)
        require(file.resolve().is_relative_to((root / 'payload').resolve()) and
                not any(part.is_symlink() for part in [file, *file.parents] if part.is_relative_to(root / 'payload')) and
                file_metadata(file) == metadata, 'Local payload integrity failure')
        payload[relative] = dict(metadata, local=file)
    require(len(payload) == 69 and sum(n.startswith('models/') for n in payload) == 34, 'Expected full reviewed payload and 34 model files')
    apache = (root / 'payload/.htaccess').read_text()
    csp = re.search(r'Content-Security-Policy "([^"]+)"', apache)[1]
    require("'sha256-" in csp and "'unsafe-inline'" not in csp and "'unsafe-eval'" not in csp, 'Unexpected production CSP')
    return payload, csp


class Deployment:
    def __init__(self, payload, source_sha, guard_hash, auth, connector, fetch=https_get):
        require(re.fullmatch(r'[0-9a-f]{40}', source_sha) is not None, 'Invalid source SHA')
        require(re.fullmatch(r'[0-9a-f]{64}', guard_hash) is not None, 'Missing approved .htaccess SHA-256')
        self.payload = {safe_path(k): v for k, v in payload.items()}
        require(all(n in payload for n in ['index.html', 'sw.js', 'icon.svg', 'models-manifest.json']), 'Incomplete application')
        self.source_sha, self.guard_hash, self.auth = source_sha, guard_hash, auth
        self.connector, self.fetch = connector, fetch
        self.client = None
        self.locked, self.committed = False, False
        self.wrong_password_checked = False
        self.samples = ['', 'index.html', 'sw.js', 'models-manifest.json',
                        next(n for n in payload if n.startswith('assets/') and n.endswith('.js')),
                        next(n for n in payload if n.startswith('models/') and n.endswith('.onnx'))]

    def pwd(self):
        require(self.client.pwd() == TARGET, 'Canonical FTP PWD mismatch; no alternate root attempted')

    def read_remote(self, name, metadata=None, limit=65536):
        self.pwd()
        digest, size, chunks = hashlib.sha256(), 0, []
        def consume(chunk):
            nonlocal size
            size += len(chunk)
            require(size <= (metadata['bytes'] if metadata else limit), 'Remote file length exceeds bound')
            digest.update(chunk)
            if metadata is None:
                chunks.append(chunk)
        self.client.retrbinary('RETR ' + name, consume)
        if metadata is not None:
            require({'bytes': size, 'sha256': digest.hexdigest()} == {k: metadata[k] for k in ['bytes','sha256']}, 'Remote SHA-256 mismatch')
        return b''.join(chunks)

    def verify_auth(self):
        for name in ['', *self.payload]:
            response = self.fetch(name)
            require(response['status'] == 401 and re.match(r'Basic\s', response['headers'].get('www-authenticate', ''), re.I),
                    'Anonymous HTTPS must return real Basic Auth 401, never redirects/403/WordPress')
        if not self.wrong_password_checked:
            wrong_password = secrets.token_urlsafe(32)
            while wrong_password == self.auth[1]:
                wrong_password = secrets.token_urlsafe(32)
            require(self.fetch('icon.svg', (self.auth[0], wrong_password))['status'] == 401, 'Wrong HTTP password must return 401')
            self.wrong_password_checked = True  # Do not repeat failed logins during a single run.

    def verify_headers(self, response, csp):
        require(response['headers'].get('content-security-policy') == csp, 'Hosting CSP does not match this build')
        for key, value in REQUIRED_HEADERS.items():
            require(response['headers'].get(key) == value, 'Required hosting security/cache header mismatch')

    def verify_guard(self):
        content = self.read_remote('.htaccess')
        require(hashlib.sha256(content).hexdigest() == self.guard_hash, 'Hosting .htaccess changed or was not approved')
        text = content.decode('utf-8').replace('\r\n', '\n')
        require(MAINTENANCE in text, 'Missing owner-installed maintenance guard')
        require(re.search(r'^AuthType\s+Basic\s*$', text, re.M | re.I) and re.search(r'^Require\s+valid-user\s*$', text, re.M | re.I), 'Missing Basic Auth configuration')
        require(not re.search(r'^\s*(Require\s+all\s+(?:granted|denied)|Satisfy\s+any)\b', text, re.M | re.I), 'Unexpected authorization override or deny-all')
        match = re.search(r'^AuthUserFile\s+"?([^"\r\n]+)"?\s*$', text, re.M | re.I)
        require(match is not None and match[1].startswith('/') and not any(p in ['..', '.', 'public_html'] for p in match[1].split('/')), 'AuthUserFile must be operator-confirmed outside WWW')

    def put(self, name, source):
        self.pwd()
        # Every caller constructs name internally; no remote paths from input.
        require(name == MARKER or re.fullmatch(r'(?:[A-Za-z0-9_-][A-Za-z0-9_.-]*/)*\.deploy-[0-9a-f]{32}', name), 'Forbidden STOR destination')
        self.client.storbinary('STOR ' + name, source)

    def maintenance(self, csp):
        for name in self.samples:
            response = self.fetch(name, self.auth)
            require(response['status'] == 503, 'Correct HTTP credentials must reach real maintenance 503 before payload upload')
            self.verify_headers(response, csp)

    def execute(self, csp):
        self.verify_auth()
        self.client = self.connector()
        try:
            self.client.cwd(TARGET)
            self.pwd()
            entries = {name: facts for name, facts in self.client.mlsd()
                       if not (name == '.' and facts.get('type') == 'cdir')
                       and not (name == '..' and facts.get('type') == 'pdir')}
            require(set(entries) in [{'.htaccess'}, {'.htaccess', 'icon.svg'}] and all(f.get('type') == 'file' and not any('slink' in k.lower() or 'symlink' in str(v).lower() for k,v in f.items()) for f in entries.values()),
                    'First deployment requires only regular .htaccess and optional icon.svg; existing payload/links/locks require manual recovery')
            self.verify_guard()
            if 'icon.svg' in entries:
                self.read_remote('icon.svg', self.payload['icon.svg'])
            receipt = json.dumps({'sourceSha': self.source_sha, 'status': 'complete-only-after-rename'}, sort_keys=True).encode()
            self.put(MARKER, io.BytesIO(receipt))
            self.locked = True
            self.maintenance(csp)
            # Fresh directories only: never follow pre-existing remote links.
            directories = set()
            for name in self.payload:
                parent = Path(name).parent
                while str(parent) != '.':
                    directories.add(parent.as_posix()); parent = parent.parent
            for directory in sorted(directories, key=lambda n: (n.count('/'), n)):
                safe_path(directory); self.pwd(); self.client.mkd(directory)
            order = sorted(self.payload, key=lambda n: (2 if n == 'index.html' else 1 if n == 'sw.js' else 0, n))
            for name in order:
                if name == 'icon.svg' and 'icon.svg' in entries:
                    continue  # Already verified; never overwrite the optional canary.
                metadata = self.payload[name]
                temporary = (name.rsplit('/',1)[0] + '/' if '/' in name else '') + '.deploy-' + secrets.token_hex(16)
                with metadata['local'].open('rb') as handle:
                    self.put(temporary, handle)
                self.read_remote(temporary, metadata)
                self.pwd(); self.client.rename(temporary, name)  # Both relative to the fixed target.
            self.verify_guard()
            self.verify_auth()
            self.maintenance(csp)
            self.pwd()
            receipt_name = '.deployment-complete-' + self.source_sha + '-' + secrets.token_hex(16) + '.json'
            require(receipt_name not in dict(self.client.mlsd()), 'Commit receipt already exists; no overwrite permitted')
            self.client.rename(MARKER, receipt_name)
            self.locked, self.committed = False, True
            try:
                self.verify_auth()
                for name, metadata in self.payload.items():
                    response = self.fetch(name, self.auth, metadata)
                    require(response['status'] == 200 and all(response.get(k) == metadata[k] for k in ['bytes','sha256']), 'Postcommit HTTPS integrity check failed')
                    self.verify_headers(response, csp)
                    allowed_mime = {
                        '.wasm': ['application/wasm'], '.js': ['application/javascript','text/javascript'],
                        '.mjs': ['application/javascript','text/javascript'], '.html': ['text/html'],
                        '.css': ['text/css'], '.svg': ['image/svg+xml'], '.json': ['application/json'],
                        '.webmanifest': ['application/manifest+json'], '.onnx': ['application/octet-stream','application/onnx'],
                    }.get(Path(name).suffix)
                    if allowed_mime:
                        require(response['headers'].get('content-type','').split(';')[0].strip() in allowed_mime, 'Hosted payload MIME mismatch')
            except Exception:
                # No deletes/rollback outside scope. If reachable, relock the
                # complete version; an interrupted precommit transfer stays locked.
                try:
                    self.put(MARKER, io.BytesIO(receipt)); self.locked = True; self.maintenance(csp)
                except Exception:
                    pass
                raise DeploymentError('Postcommit verification failed; owner must check maintenance state; complete payload was committed') from None
            return {'sourceSha': self.source_sha, 'uploadedFiles': len(self.payload), 'verified': True}
        finally:
            self.client.close()  # NEVER remove the lock in finally/error paths.


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--package-dir', type=Path, required=True)
    parser.add_argument('--execute', action='store_true')
    parser.add_argument('--check-anonymous', action='store_true')
    args = parser.parse_args()
    require(args.execute != args.check_anonymous, 'Choose future explicit execution or anonymous-only preflight')
    expected_sha = os.environ.get('GITHUB_SHA', '')
    payload, csp = load_package(args.package_dir, expected_sha)
    if args.check_anonymous:
        for name in ['', *payload]:
            response = https_get(name)
            require(response['status'] == 401 and re.match(r'Basic\s', response['headers'].get('www-authenticate',''), re.I), 'Anonymous real-host Basic Auth 401 gate FAILED')
        print('Anonymous HTTPS 401 gate PASS; no FTP connection or payload write')
        return
    password = os.environ.get('FTPS_PASSWORD', '')
    username = os.environ.get('FTPS_USERNAME', '')
    auth = (os.environ.get('TRANSLATOR_BASIC_USERNAME', ''), os.environ.get('TRANSLATOR_BASIC_PASSWORD', ''))
    require(password and auth[0] and auth[1] and not any(c in password + auth[0] + auth[1] for c in '\r\n\0'), 'Required environment secrets are missing/invalid')
    require(username == FTP_USER, 'FTP account does not match the approved fixed account')
    require(auth[0] != FTP_USER and auth[1] != password, 'HTTP tester credentials must differ from FTP')
    deployment = Deployment(payload, expected_sha, os.environ.get('TRANSLATOR_HTACCESS_SHA256', '').lower(), auth,
                            lambda: connect_ftps(username, password))
    print(json.dumps(deployment.execute(csp)))


if __name__ == '__main__':
    try:
        main()
    except DeploymentError as error:
        print('Deployment stopped: ' + str(error))
        raise SystemExit(1)
    except Exception as error:
        # No raw exception/server output (may contain paths or credentials).
        print('Deployment stopped: transport/local verification failure (' + type(error).__name__ + '); do not retry automatically')
        raise SystemExit(1)
