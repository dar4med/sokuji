#!/usr/bin/env python3
"""Protection-only bootstrap: no application, models, icon, delete or WP changes."""
import argparse
import base64
import hashlib
import hmac
import importlib.util
import io
import json
import os
from pathlib import Path
import re
import secrets
import warnings

spec = importlib.util.spec_from_file_location('connection', Path(__file__).with_name('ftps-protection.py'))
connection = importlib.util.module_from_spec(spec); spec.loader.exec_module(connection)
t = connection.transport
require = t.require
HASH_REMOTE = '/.translator-test.htpasswd'
# Explicit dPanel mapping supplied by the coordinator, not a guessed home path.
AUTH_USER_FILE = '/home/klient.dhosting.pl/dhostingdar/ai.lekarz.nl-ohp3/.translator-test.htpasswd'
REFERENCE_PREFLIGHT_RUN = '40064907899'
ROOT = Path(__file__).resolve().parents[1]
PROBES = ['', 'index.html', 'sw.js', 'models-manifest.json',
          'assets/index-BF7y0ORU.js', 'models/asr/onnx/encoder_model_quantized.onnx']


class ProtectionFTPS(t.VerifiedFTPS):
    def set_debuglevel(self, level):
        require(level == 0, 'Credential transport debug forbidden')
        super().set_debuglevel(0)

    def putcmd(self, line):
        verb, _, arg = line.partition(' ')
        require('\r' not in line and '\n' not in line, 'FTP control injection rejected')
        require(verb in ['AUTH','USER','PASS','PBSZ','PROT','TYPE','PASV','EPSV','PWD','CWD',
                         'MLSD','STOR','APPE','RETR','RNFR','RNTO','SITE','STAT','OPTS'], 'Command outside protection scope')
        if verb == 'AUTH': require(arg == 'TLS', 'Explicit TLS required')
        if verb == 'PROT': require(arg == 'P', 'Private data TLS required')
        if verb == 'CWD': require(arg == t.TARGET, 'Only fixed target CWD permitted')
        if verb == 'MLSD': require(arg in ['', '/'], 'Only target or private-root metadata permitted')
        if verb in ['PWD','PASV','EPSV']: require(arg == '', 'Unexpected command argument')
        candidate = bool(re.fullmatch(r'\.htaccess-provision-[0-9a-f]{32}', arg))
        if verb == 'STOR': require(arg in [HASH_REMOTE,t.MARKER] or candidate, 'STOR outside dedicated protection files')
        if verb == 'APPE': require(arg == HASH_REMOTE, 'Append only to dedicated private hash')
        if verb == 'RETR': require(arg in [HASH_REMOTE,'.htaccess',t.MARKER] or candidate, 'Read outside owned protection files')
        if verb == 'RNFR': require(candidate, 'Rename source must be a dedicated protection temporary')
        if verb == 'RNTO': require(arg == '.htaccess', 'Rename target must be child .htaccess')
        if verb == 'SITE': require(arg == 'CHMOD 600 ' + HASH_REMOTE, 'Only private hash mode 0600 may be changed')
        if verb == 'STAT': require(arg == HASH_REMOTE, 'Only owned private-file mode may be inspected')
        if verb == 'OPTS': require(arg == 'MLST type;size;unix.mode;', 'Only private-file metadata facts may be requested')
        super().putcmd(line)


def render_configs():
    base = (ROOT / 'public/.htaccess').read_text()
    startup = base64.b64encode(hashlib.sha256((ROOT / 'scripts/startup.js').read_bytes()).digest()).decode()
    base = base.replace("script-src 'self' 'wasm-unsafe-eval'", "script-src 'self' 'wasm-unsafe-eval' 'sha256-" + startup + "'")
    require(base.count('\nRequire all denied\n') == 1, 'Expected unique local publication lock')
    base += '# Child-only literal errors; never delegate these statuses to WordPress.\n'
    base += 'ErrorDocument 401 "Translator authentication required"\n'
    base += 'ErrorDocument 403 "Translator access denied"\n'
    base += 'ErrorDocument 404 "Empty protected translator test directory"\n'
    auth = '\n'.join(['AuthType Basic','AuthName "Med Partners translator-test"','AuthBasicProvider file',
                       'AuthUserFile "' + AUTH_USER_FILE + '"','Require valid-user'])
    final = base.replace('Require all denied', auth) + '\n' + t.MAINTENANCE + '\n'
    return base.encode(), final.encode(), re.search(r'Content-Security-Policy "([^"]+)"', final)[1]


def make_password_file(username, password):
    require(re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.@-]{2,63}', username) and username != t.FTP_USER,
            'Separate valid HTTP tester username required')
    require(len(password) >= 16 and len(password.encode()) <= 72 and not any(c in password for c in '\r\n\0'),
            'HTTP password must have 16+ characters and at most 72 UTF-8 bytes')
    with warnings.catch_warnings():
        warnings.simplefilter('ignore', DeprecationWarning)
        import crypt
    encoded = crypt.crypt(password, crypt.mksalt(crypt.METHOD_BLOWFISH, rounds=4096))
    require(isinstance(encoded,str) and re.fullmatch(r'\$2[by]\$12\$[./A-Za-z0-9]{53}',encoded), 'Local bcrypt cost 12 unavailable')
    encoded = encoded.replace('$2b$', '$2y$', 1)
    require(hmac.compare_digest(crypt.crypt(password, encoded), encoded), 'Local bcrypt verification failed')
    return (username + ':' + encoded + '\n').encode()  # Hash only; never plaintext on disk.


def regular(facts):
    return facts.get('type') == 'file' and not any('slink' in k or 'symlink' in str(v).lower() for k,v in facts.items())


class Provision:
    def __init__(self, auth, password_file, connector, fetch=t.https_get):
        self.auth, self.password_file, self.connector, self.fetch = auth, password_file, connector, fetch
        self.deny, self.final, self.csp = render_configs()
        self.client = None
        self.owned_active = False
        self.evidence = {'operation':'provision-protection','sourceSha':os.environ.get('GITHUB_SHA'),
                         'referenceConnectionRun':REFERENCE_PREFLIGHT_RUN,'applicationTransferred':False,
                         'ready':False,'rollbackDenyVerified':False}

    def pwd(self):
        require(self.client.pwd() == t.TARGET, 'Canonical target PWD mismatch')

    def facts(self, root=False, mode=False):
        self.pwd()
        # Root names exist only transiently in memory; never print/save a listing.
        listing = self.client.mlsd('/' if root else '', facts=['type','size','unix.mode']) if mode else self.client.mlsd('/' if root else '')
        return {n:f for n,f in listing if n not in ['.','..']}

    def read(self, name, expected):
        facts = self.facts(root=name == HASH_REMOTE).get(name[1:] if name == HASH_REMOTE else name, {})
        require(regular(facts), 'Read refuses nonregular protection file or symlink')
        self.pwd(); digest = hashlib.sha256(); size = 0
        def consume(chunk):
            nonlocal size
            size += len(chunk); require(size <= len(expected), 'Protection length exceeds bound'); digest.update(chunk)
        self.client.retrbinary('RETR ' + name, consume)
        require(size == len(expected) and digest.hexdigest() == hashlib.sha256(expected).hexdigest(), 'Protection TLS SHA/length mismatch')

    def store(self, name, data, append=False):
        self.pwd(); self.client.storbinary(('APPE ' if append else 'STOR ') + name, io.BytesIO(data))
        self.read(name, data)  # Append is only used once to an already verified empty private file.

    def install(self, content, first=False):
        if not first:
            # Never replace an operator's concurrent configuration change.
            require(regular(self.facts().get('.htaccess',{})), 'Child configuration is not a regular owned file')
            self.pwd()
            digest, size = hashlib.sha256(), 0
            def consume(chunk):
                nonlocal size
                size += len(chunk); require(size <= max(len(self.deny),len(self.final)), 'Child config exceeds owned bound'); digest.update(chunk)
            self.client.retrbinary('RETR .htaccess', consume)
            require(any(size == len(c) and digest.hexdigest() == hashlib.sha256(c).hexdigest() for c in [self.deny,self.final]),
                    'Child configuration is no longer owned by this run')
        temporary = '.htaccess-provision-' + secrets.token_hex(16)
        require(temporary not in self.facts(), 'Protection temporary already exists')
        self.store(temporary, content)
        self.pwd(); self.client.rename(temporary, '.htaccess')  # Replacement is tested with deny-all first.
        self.owned_active = True
        self.read('.htaccess', content)

    def status(self, name, expected, auth=None, headers=False):
        response = self.fetch(name, auth)
        if response['status'] != expected:
            self.evidence['failedHttpCheck'] = {'path':name, 'expected':expected,
                                                'actual':response['status'], 'authenticated':auth is not None}
        require(response['status'] == expected, 'Real HTTPS protection status did not match required gate')
        if expected == 401:
            require(re.match(r'Basic\s', response['headers'].get('www-authenticate',''), re.I), 'Real Basic challenge required')
        if headers:
            require(response['headers'].get('content-security-policy') == self.csp, 'Real hosting CSP mismatch')
            for key,value in t.REQUIRED_HEADERS.items():
                require(response['headers'].get(key) == value, 'Real hosting security header mismatch')
        return response

    def private_mode(self):
        try:
            facts = self.facts(root=True, mode=True).get(HASH_REMOTE[1:], {})
        except connection.ftplib.error_perm:
            facts = self.facts(root=True).get(HASH_REMOTE[1:], {})
        require(regular(facts), 'Private file type cannot be proven')
        if 'unix.mode' in facts:
            mode = int(facts['unix.mode'], 8)
            require(mode & 0o777 == 0o600 and mode & 0o7000 == 0, 'Private hash must have verified mode 0600')
        else:
            # Some servers omit optional MLST mode facts; STAT may prove the
            # same permissions, for this one dedicated file only, without logs.
            status = self.client.sendcmd('STAT ' + HASH_REMOTE)
            require(re.search(r'(?m)^\s*-rw-------\s', status), 'Private file mode 0600 cannot be proven')

    def execute(self):
        self.client = self.connector()
        try:
            require(self.client.pwd() == '/', 'Observed FTP root must support the operator mapping')
            self.client.cwd(t.TARGET); self.pwd()
            require(not self.facts(), 'Bootstrap only accepts an empty target; no existing protection overwritten')
            require(HASH_REMOTE[1:] not in self.facts(root=True), 'Dedicated private hash already exists; do not overwrite')
            self.install(self.deny, first=True)
            self.evidence['stage'] = 'deny-installed'
            for name in PROBES: self.status(name, 403)
            self.evidence['initialDeny403Verified'] = True
            self.install(self.deny)  # Prove RNTO-overwrite of our OWN deny-all, without DELE.
            for name in PROBES: self.status(name, 403)
            self.evidence['atomicOwnReplacementVerified'] = True
            # Create an empty private file, restrict it before adding any hash,
            # then append to preserve the existing inode/mode. Verify after append.
            self.store(HASH_REMOTE, b'')
            self.evidence['stage'] = 'private-empty-file-created'
            self.pwd(); self.client.sendcmd('SITE CHMOD 600 ' + HASH_REMOTE)
            self.private_mode()
            self.evidence['stage'] = 'private-mode-0600-verified'
            self.store(HASH_REMOTE, self.password_file, append=True)
            self.pwd(); self.client.sendcmd('SITE CHMOD 600 ' + HASH_REMOTE)
            self.private_mode()
            self.evidence.update(privateHashTLSIntegrityVerified=True, privateHashMode='0600')
            self.install(self.final)
            self.evidence['stage'] = 'basic-auth-installed'
            for name in PROBES: self.status(name, 401)
            wrong_password = secrets.token_urlsafe(32)
            while wrong_password == self.auth[1]: wrong_password = secrets.token_urlsafe(32)
            self.status('',401,(self.auth[0],wrong_password))
            self.store(t.MARKER, b'protection-test\n')
            for name in PROBES: self.status(name,503,self.auth,headers=True)
            for name in PROBES: self.status(name,401)
            self.evidence['correctCredentialsMaintenance503Verified'] = True
            self.store(t.MARKER,b'')  # -s guard disabled without deletion or extra receipt files.
            for name in PROBES: self.status(name,401)
            unlocked = self.fetch('', self.auth)
            require(unlocked['status'] in [403,404], 'Empty protected directory should remain empty, not redirect or serve WP')
            self.evidence.update(ready=True, anonymousStatus=401, wrongPasswordStatus=401,
                                 correctPasswordWithMarkerStatus=503, correctPasswordEmptyDirectoryStatus=unlocked['status'],
                                 maintenanceMarkerBytes=0, htaccessSha256=hashlib.sha256(self.final).hexdigest(),
                                 authUserFileDerivedFromOperatorMapping=AUTH_USER_FILE)
            self.evidence['stage'] = 'ready-protection-only'
            return self.evidence
        except Exception as error:
            self.evidence.update(errorType=type(error).__name__)
            if isinstance(error,t.DeploymentError): self.evidence['reason'] = str(error)
            if isinstance(error,connection.ftplib.Error) and re.match(r'^\d{3}',str(error)):
                self.evidence['ftpResponseCode'] = str(error)[:3]
            if self.owned_active:
                try:
                    try:
                        self.read('.htaccess', self.deny)
                    except Exception:
                        self.install(self.deny)
                    for name in PROBES: self.status(name,403)
                    self.evidence['rollbackDenyVerified'] = True
                except Exception:
                    self.evidence['rollbackDenyVerified'] = False
            return self.evidence
        finally:
            self.client.close()


def emit_evidence(result):
    text = json.dumps(result,sort_keys=True)
    print(text)
    print('::notice title=Protection-only bootstrap::' + text.replace('%','%25').replace('\r','%0D').replace('\n','%0A'))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--execute',action='store_true');args=parser.parse_args()
    require(args.execute and os.environ.get('PROTECTION_APPROVED') == 'true', 'Separate protection approval required')
    require(os.environ.get('OPERATOR_MAPPING_CONFIRMED') == 'true', 'Explicit operator mapping confirmation required')
    require(os.environ.get('CONNECTION_PREFLIGHT_RUN') == REFERENCE_PREFLIGHT_RUN, 'Reference successful connection run required')
    require(re.fullmatch(r'[0-9a-f]{40}',os.environ.get('GITHUB_SHA','')) and
            os.environ.get('APPROVAL_SHA') == os.environ.get('GITHUB_SHA'), 'Exact reviewed SHA required')
    user, password = os.environ.get('FTPS_USERNAME',''), os.environ.get('FTPS_PASSWORD','')
    auth = (os.environ.get('TRANSLATOR_BASIC_USERNAME',''), os.environ.get('TRANSLATOR_BASIC_PASSWORD',''))
    require(user == t.FTP_USER and password and not any(c in password for c in '\r\n\0'), 'Approved FTP credentials required')
    require(auth[1] != password, 'HTTP password must differ from FTP')
    private = make_password_file(*auth)
    result = Provision(auth, private, lambda:t.connect_ftps(user,password,client_factory=ProtectionFTPS)).execute()
    emit_evidence(result)
    raise SystemExit(0 if result['ready'] else 1)


if __name__ == '__main__':
    try:
        main()
    except t.DeploymentError as error:
        emit_evidence({'operation':'provision-protection','ready':False,'error':str(error),'applicationTransferred':False})
        raise SystemExit(1)
    except Exception as error:
        result = {'operation':'provision-protection','ready':False,'errorType':type(error).__name__,'applicationTransferred':False}
        if isinstance(error,connection.ftplib.Error) and re.match(r'^\d{3}',str(error)):
            result['ftpResponseCode'] = str(error)[:3]
        emit_evidence(result)
        raise SystemExit(1)
