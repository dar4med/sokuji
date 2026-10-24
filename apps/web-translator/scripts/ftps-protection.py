#!/usr/bin/env python3
"""Separate protection operations. Currently only the explicitly approved READ-ONLY preflight."""
import argparse
import importlib.util
import json
import os
from pathlib import Path
import re
import ssl
import ftplib

spec = importlib.util.spec_from_file_location('ftps_transport', Path(__file__).with_name('deploy-ftps.py'))
transport = importlib.util.module_from_spec(spec)
spec.loader.exec_module(transport)
require = transport.require


class ReadOnlyFTPS(transport.VerifiedFTPS):
    """Protocol fence, not merely a promise by the high-level caller."""
    def set_debuglevel(self, level):
        require(level == 0, 'Debug logging is forbidden for credential-bearing transport')
        super().set_debuglevel(0)

    def putcmd(self, line):
        verb, _, argument = line.partition(' ')
        require(verb in ['AUTH','USER','PASS','PBSZ','PROT','TYPE','PASV','EPSV','PWD','CWD','MLSD'],
                'Write/extra commands are forbidden in connection-preflight')
        require('\r' not in line and '\n' not in line, 'Control-character injection rejected')
        if verb == 'AUTH': require(argument == 'TLS', 'Explicit TLS is mandatory')
        if verb == 'PROT': require(argument == 'P', 'Private data channel is mandatory')
        if verb == 'PBSZ': require(argument == '0', 'Unexpected TLS buffer command')
        if verb == 'CWD': require(argument == transport.TARGET, 'Only the fixed target CWD is permitted')
        if verb in ['PWD','MLSD','PASV','EPSV']: require(argument == '', 'No listing/path outside the fixed target')
        super().putcmd(line)

    def ntransfercmd(self, cmd, rest=None):
        require(cmd == 'MLSD' and rest is None, 'Only MLSD data transfer is permitted')
        connection, size = super().ntransfercmd(cmd, rest)
        try:
            require(isinstance(connection, ssl.SSLSocket), 'Encrypted MLSD socket required')
            require(connection.version() in ['TLSv1.2','TLSv1.3'], 'Modern TLS data channel required')
            self.data_tls = {'version': connection.version(), 'cipher': connection.cipher()[0],
                             'hostnameVerified': self.context.check_hostname and self.context.verify_mode == ssl.CERT_REQUIRED}
            return connection, size
        except Exception:
            connection.close()
            raise


def connection_preflight(username, password, connector=None):
    require(username == transport.FTP_USER and password and not any(c in password for c in '\r\n\0'),
            'Missing/invalid approved FTP environment credentials')
    if connector is None:
        connector = lambda: transport.connect_ftps(username, password, client_factory=ReadOnlyFTPS)
    client = connector()
    try:
        root = client.pwd()  # Observe only: NEVER list this root or read WP/private files.
        require(isinstance(root, str) and root.startswith('/') and len(root) <= 1024 and
                not any(ord(c) < 32 for c in root), 'Unexpected initial FTP PWD format')
        client.cwd(transport.TARGET)
        target = client.pwd()
        require(target == transport.TARGET, 'Canonical target mismatch; no alternate root attempted')
        entries = [(name, facts) for name, facts in client.mlsd()
                   if not (name == '.' and facts.get('type') == 'cdir')
                   and not (name == '..' and facts.get('type') == 'pdir')]
        require(client._prot_p and getattr(client, 'data_tls', {}).get('hostnameVerified') is True,
                'Verified private MLSD data channel not proven')
        types = [facts.get('type', 'unknown') for _, facts in entries]
        # Do not log/save raw listings or file contents; only target-level counts.
        return {'operation':'connection-preflight', 'sourceSha':os.environ.get('GITHUB_SHA'),
                'host':transport.FTP_HOST, 'port':transport.FTP_PORT,
                'initialPwd':root, 'targetPwd':target, 'accountMatchedApproved':True,
                'controlTLS':{'version':client.sock.version(), 'cipher':client.sock.cipher()[0]},
                'dataTLS':client.data_tls, 'targetEntryCount':len(entries),
                'regularFiles':types.count('file'), 'directories':types.count('dir'),
                'nonRegularEntries':sum(t not in ['file','dir'] for t in types),
                'htaccessPresent':any(name == '.htaccess' for name,_ in entries),
                'emptyTarget':len(entries) == 0, 'writes':0, 'applicationTransferred':False}
    finally:
        client.close()


def emit(result):
    text = json.dumps(result, sort_keys=True)
    print(text)
    if os.environ.get('GITHUB_ACTIONS') == 'true':
        print('::notice title=FTPS read-only preflight::' + text.replace('%','%25').replace('\r','%0D').replace('\n','%0A'))
        summary = os.environ.get('GITHUB_STEP_SUMMARY')
        if summary:
            with open(summary, 'a') as handle:
                handle.write('FTPS read-only connection evidence:\n\n```json\n' + text + '\n```\n')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--operation', choices=['connection-preflight'], required=True)
    parser.add_argument('--execute', action='store_true')
    args = parser.parse_args()
    require(args.execute and os.environ.get('CONNECTION_APPROVED') == 'true', 'Explicit read-only connection approval required')
    require(re.fullmatch(r'[0-9a-f]{40}', os.environ.get('GITHUB_SHA','')) and
            os.environ.get('APPROVAL_SHA') == os.environ.get('GITHUB_SHA'), 'Exact reviewed source SHA required')
    emit(connection_preflight(os.environ.get('FTPS_USERNAME',''), os.environ.get('FTPS_PASSWORD','')))


if __name__ == '__main__':
    try:
        main()
    except transport.DeploymentError as error:
        emit({'operation':'connection-preflight', 'passed':False, 'error':str(error), 'writes':0})
        raise SystemExit(1)
    except Exception as error:
        result = {'operation':'connection-preflight', 'passed':False, 'errorType':type(error).__name__, 'writes':0}
        if isinstance(error, ftplib.Error) and re.match(r'^\d{3}', str(error)):
            result['ftpResponseCode'] = str(error)[:3]  # Never raw server text.
        emit(result)
        raise SystemExit(1)
