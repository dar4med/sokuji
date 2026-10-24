#!/usr/bin/env python3
"""One reviewed, protection-only AuthUserFile .htpasswd experiment. No payload."""
import argparse
import hashlib
import http.client
import importlib.util
import io
import json
import os
from pathlib import Path
import re
import secrets
import base64

spec = importlib.util.spec_from_file_location('protection', Path(__file__).with_name('provision-protection.py'))
p = importlib.util.module_from_spec(spec); spec.loader.exec_module(p)
t = p.t
require = t.require
PROBE, BODY = t.PROTECTION_PROBE, t.PROTECTION_PROBE_BYTES
LOCAL_HASH = '.htpasswd'
DOT_DENY = '\n# Deny credentials, configuration and every hidden upload temporary, even after authentication.\n<FilesMatch "^\\.">\n  Require all denied\n</FilesMatch>\nAcceptPathInfo Off\n'
KNOWN_DENY_SHA = '62ab5d71604e646b74beedd6e68212f9d345c1e55cdaf21714b7745e2a531eb1'


def temporary(name):
    return bool(re.fullmatch(r'\.(?:htaccess|htpasswd)-relative-[0-9a-f]{32}', name))


class RelativeFTPS(t.VerifiedFTPS):
    """Only the fixed child directory. No external AuthUserFile read or write."""
    def set_debuglevel(self, level):
        require(level == 0, 'Transport debug forbidden'); super().set_debuglevel(0)

    def putcmd(self, line):
        verb, _, arg = line.partition(' ')
        require('\r' not in line and '\n' not in line, 'FTP control injection rejected')
        require(verb in ['AUTH','USER','PASS','PBSZ','PROT','TYPE','PASV','EPSV','PWD','CWD',
                         'MLSD','OPTS','RETR','STOR','RNFR','RNTO','SITE','STAT'], 'Command outside relative protection scope')
        if verb == 'AUTH': require(arg == 'TLS', 'Explicit TLS required')
        if verb == 'PBSZ': require(arg == '0', 'Unexpected buffer command')
        if verb == 'PROT': require(arg == 'P', 'Private data channel required')
        if verb == 'CWD': require(arg == t.TARGET, 'Only the fixed target CWD permitted')
        if verb in ['MLSD','PWD','PASV','EPSV']: require(not arg, 'No parent/root listing permitted')
        if verb == 'OPTS': require(arg in ['MLST type;size;','MLST type;size;unix.mode;'], 'Only bounded facts permitted')
        if verb == 'RETR': require(arg in ['.htaccess',LOCAL_HASH,PROBE,t.MARKER] or temporary(arg), 'Read outside protection files')
        if verb == 'STOR': require(arg == PROBE or temporary(arg), 'Only control probe and hidden temporaries may be stored')
        if verb == 'RNFR': require(temporary(arg), 'Rename must start at an owned hidden temporary')
        if verb == 'RNTO': require(arg in ['.htaccess',LOCAL_HASH], 'Rename outside child protection files')
        if verb == 'SITE': require(bool(re.fullmatch(r'CHMOD 600 \.htpasswd-relative-[0-9a-f]{32}', arg)), 'Only the new local hash temporary may have mode 0600')
        if verb == 'STAT': require(arg == LOCAL_HASH or bool(re.fullmatch(r'\.htpasswd-relative-[0-9a-f]{32}', arg)), 'Only local hash metadata')
        super().putcmd(line)


def https(name, auth=None, expected=None):
    fixed = ['',PROBE,'.htaccess','.htpasswd','%2ehtpasswd','.htpasswd?download=1','.htaccess?download=1']
    require(name in fixed or temporary(name), 'HTTP request outside fixed protection probes')
    headers = {'Cache-Control':'no-cache'}
    if auth is not None:
        headers['Authorization'] = 'Basic ' + base64.b64encode((auth[0]+':'+auth[1]).encode('utf-8')).decode('ascii')
    connection = http.client.HTTPSConnection(t.WEB_HOST, timeout=30, context=t.tls_context())
    try:
        connection.request('GET', t.WEB_PREFIX + name, headers=headers)
        response = connection.getresponse()
        result = {'status':response.status, 'headers':{k.lower():v for k,v in response.getheaders()}}
        if expected is not None and response.status == 200:
            body = response.read(expected['bytes'] + 1)
            result.update(bytes=len(body),sha256=hashlib.sha256(body).hexdigest())
        # NEVER read a .htpasswd or hidden-temporary HTTP response body.
        return result
    finally: connection.close()


class RelativeTest(p.Provision):
    def __init__(self, auth, connector, fetch=https):
        # Same existing Environment password, same bcrypt cost/format. No read
        # of the former external hash file; no new password or secret is made.
        super().__init__(auth, p.make_password_file(*auth), connector, fetch)
        require(hashlib.sha256(self.deny).hexdigest() == KNOWN_DENY_SHA, 'Known original deny changed')
        self.original_deny = self.deny
        self.deny += DOT_DENY.encode()
        basic = 'AuthType Basic\nAuthName "Med Partners translator-test"\nAuthUserFile .htpasswd\nRequire valid-user'
        self.final = self.deny.replace(b'Require all denied',basic.encode(),1).replace(
            b'DirectoryIndex index.html\n', ('DirectoryIndex index.html '+PROBE+'\n').encode()) + ('\n'+t.MAINTENANCE+'\n').encode()
        self.expected = {}; self.owned_names = set(); self.attempts = 0
        self.evidence = {'operation':'test-relative-auth','sourceSha':os.environ.get('GITHUB_SHA'),
                         'ready':False,'writes':0,'applicationTransferred':False,'passwordChanged':False,
                         'externalHashAccessed':False,'authUserFile':'.htpasswd','httpChecks':[]}

    def guard(self):
        entries = self.facts()
        require(set(entries) == set(self.expected) and all(p.regular(v) for v in entries.values()), 'Target type/list changed')
        for name, body in self.expected.items(): self.read(name,body)

    def store_owned(self, name, body):
        self.guard(); self.pwd()
        require(temporary(name) or name == PROBE, 'STOR outside owned protection files')
        self.owned_names.add(name); self.attempts += 1
        self.client.storbinary('STOR '+name,io.BytesIO(body)); self.evidence['writes'] += 1
        self.read(name,body); self.expected[name] = body

    def install(self, body):
        name = '.htaccess-relative-'+secrets.token_hex(16)
        self.store_owned(name,body); self.guard(); self.pwd(); self.attempts += 1
        self.client.rename(name,'.htaccess'); self.evidence['writes'] += 1
        self.expected.pop(name); self.expected['.htaccess'] = body
        self.read('.htaccess',body)

    def check(self, name, status, auth=None, content=False):
        expected = {'bytes':len(BODY),'sha256':hashlib.sha256(BODY).hexdigest()} if content else None
        response = self.fetch(name,auth,expected)
        self.evidence['httpChecks'].append({'path':name,'credentials':auth is not None,'status':response['status']})
        require(response['status'] == status, 'Real HTTP status mismatch; no alternate AuthUserFile attempted')
        if status == 401: require(re.match(r'Basic\s',response['headers'].get('www-authenticate',''),re.I), 'Basic challenge missing')
        if content:
            require(all(response.get(k) == v for k,v in expected.items()), 'Control probe HTTP integrity mismatch')
            require(response['headers'].get('content-type','').split(';')[0].strip() == 'text/plain', 'Control probe MIME mismatch')
            require(response['headers'].get('content-security-policy') == self.csp, 'Control probe CSP mismatch')

    def hidden_checks(self, name):
        for hidden in ['.htaccess','.htpasswd','%2ehtpasswd','.htpasswd?download=1','.htaccess?download=1',name]:
            for auth in [None,self.auth]: self.check(hidden,403,auth)

    def mode_600(self, name):
        self.guard(); self.pwd(); self.attempts += 1
        self.client.sendcmd('SITE CHMOD 600 '+name); self.evidence['writes'] += 1
        self.verify_mode_600(name)

    def verify_mode_600(self, name):
        facts = self.facts(mode=True).get(name,{})
        if 'unix.mode' in facts:
            require(int(facts['unix.mode'],8) == 0o600, 'Local hash temporary mode not verified')
        else:
            status = self.client.sendcmd('STAT '+name)
            require(re.search(r'(?m)^\s*-rw-------\s',status), 'Local hash temporary mode not proven')

    def execute(self):
        self.client = self.connector()
        try:
            require(self.client.pwd() == '/', 'Initial FTP root mismatch')
            self.client.cwd(t.TARGET); self.pwd()
            entries = self.facts()
            require('.htaccess' in entries and set(entries) <= {'.htaccess',PROBE,t.MARKER} and
                    all(p.regular(v) for v in entries.values()), 'Only the known existing protection is accepted; no retries/cleanup')
            self.read('.htaccess',self.original_deny); self.expected['.htaccess'] = self.original_deny
            if PROBE in entries: self.read(PROBE,BODY); self.expected[PROBE] = BODY
            if t.MARKER in entries: self.read(t.MARKER,b''); self.expected[t.MARKER] = b''
            self.guard()
            self.install(self.deny)
            self.check('',403); self.check(PROBE,403)
            name = '.htpasswd-relative-'+secrets.token_hex(16)
            # Empty file first: prove real dotfile/temporary refusal BEFORE any
            # hash is placed in WWW, with the dedicated file restricted to 0600.
            self.store_owned(name,b''); self.mode_600(name); self.hidden_checks(name)
            self.evidence['hiddenDeniedBeforeHash'] = True
            self.store_owned(name,self.password_file); self.mode_600(name); self.hidden_checks(name)
            self.guard(); self.pwd(); self.attempts += 1
            self.client.rename(name,LOCAL_HASH); self.evidence['writes'] += 1
            self.expected.pop(name); self.expected[LOCAL_HASH] = self.password_file
            self.read(LOCAL_HASH,self.password_file)
            self.verify_mode_600(LOCAL_HASH)
            if PROBE not in self.expected: self.store_owned(PROBE,BODY)
            self.install(self.final)
            self.hidden_checks(name)  # Also the now-absent temporary must be forbidden.
            for path in ['',PROBE]: self.check(path,401)
            wrong = secrets.token_urlsafe(32)
            while wrong == self.auth[1]: wrong = secrets.token_urlsafe(32)
            self.check(PROBE,401,(self.auth[0],wrong))
            for path in ['',PROBE]: self.check(path,200,self.auth,content=True)
            self.guard()
            self.evidence.update(ready=True,hiddenDeniedAfterAuth=True,localHashMode='0600',
                                 relativePathResolvedByServer=True,htaccessSha256=hashlib.sha256(self.final).hexdigest())
        except Exception as error:
            self.evidence['errorType'] = type(error).__name__
            if isinstance(error,t.DeploymentError): self.evidence['reason'] = str(error)
            if self.attempts:
                try:
                    self.client.close(); self.client = self.connector()
                    require(self.client.pwd() == '/', 'Rollback root mismatch')
                    self.client.cwd(t.TARGET); self.pwd()
                    entries = self.facts()
                    allowed = {'.htaccess',PROBE,t.MARKER,LOCAL_HASH,*self.owned_names}
                    require(set(entries) <= allowed and all(p.regular(v) for v in entries.values()), 'Unknown rollback target; no overwrite')
                    # No cleanup or password changes. Only restore our exact
                    # known child config; fresh connection avoids stale FTP 226.
                    size,digest = self.fingerprint('.htaccess',65536)
                    known = next((body for body in [self.original_deny,self.deny,self.final]
                                  if size == len(body) and digest == hashlib.sha256(body).hexdigest()),None)
                    require(known is not None,'Unknown child config: rollback stopped')
                    if known not in [self.original_deny,self.deny]:
                        # Only the child configuration is written on rollback;
                        # partial owned temporaries are left blocked, not deleted.
                        temporary_name = '.htaccess-relative-'+secrets.token_hex(16)
                        require(temporary_name not in entries,'Rollback temporary collision')
                        self.client.storbinary('STOR '+temporary_name,io.BytesIO(self.deny)); self.evidence['writes'] += 1
                        self.read(temporary_name,self.deny); self.client.rename(temporary_name,'.htaccess'); self.evidence['writes'] += 1
                    for path in dict.fromkeys(['',PROBE,'.htpasswd','.htaccess',*sorted(self.owned_names)]):
                        for auth in [None,self.auth]: self.check(path,403,auth)
                    self.evidence.update(rollbackDenyVerified=True,rollbackDenySha256=hashlib.sha256(known if known in [self.original_deny,self.deny] else self.deny).hexdigest())
                except Exception as rollback_error:
                    self.evidence.update(rollbackDenyVerified=False,rollbackErrorType=type(rollback_error).__name__)
        finally: self.client.close()
        return self.evidence


def main():
    parser=argparse.ArgumentParser(description=__doc__); parser.add_argument('--execute',action='store_true'); args=parser.parse_args()
    require(args.execute and os.environ.get('PROTECTION_APPROVED') == 'true','Explicit relative-file experiment approval required')
    require(re.fullmatch(r'[0-9a-f]{40}',os.environ.get('GITHUB_SHA','')) and
            os.environ.get('APPROVAL_SHA') == os.environ.get('GITHUB_SHA'),'Exact reviewed SHA required')
    user,password = os.environ.get('FTPS_USERNAME',''),os.environ.get('FTPS_PASSWORD','')
    auth = (os.environ.get('TRANSLATOR_BASIC_USERNAME',''),os.environ.get('TRANSLATOR_BASIC_PASSWORD',''))
    require(user == t.FTP_USER and password and all(auth),'Existing Environment credentials required')
    require(auth[1] != password,'HTTP tester password must differ from FTP')
    result=RelativeTest(auth,lambda:t.connect_ftps(user,password,client_factory=RelativeFTPS)).execute()
    p.emit_evidence(result)
    raise SystemExit(0 if result.get('ready') else 1)


if __name__ == '__main__':
    try: main()
    except Exception as error:
        # Never print raw FTP/HTTP errors, hashes, passwords or Authorization.
        p.emit_evidence({'operation':'test-relative-auth','ready':False,'errorType':type(error).__name__,'applicationTransferred':False})
        raise SystemExit(1)
