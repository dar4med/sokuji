#!/usr/bin/env python3
"""Package an already tested static payload; never uploads, downloads or configures hosting."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parents[1]


def digest(path):
    with path.open('rb') as handle:
        return hashlib.file_digest(handle, 'sha256').hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output-dir', type=Path, required=True)
    args = parser.parse_args()
    head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
    sha = json.loads((ROOT / 'test-results/auth-results.json').read_text())['sourceSha']
    if subprocess.check_output(['git', 'status', '--porcelain', '--untracked-files=normal', '--', '.'], cwd=ROOT, text=True).strip():
        raise ValueError('Commit sources before packaging; dirty source is not a tested SHA')
    changed = subprocess.check_output(['git', 'diff', '--name-only', sha, head], cwd=ROOT, text=True).splitlines()
    if any(not name.startswith('apps/web-translator/') or not name.endswith('.md') for name in changed):
        raise ValueError('Only prototype documentation may differ from the tested SHA')
    reports = {}
    tested_payload = None
    for name in ['auth-results.json', 'auth-prefix-browser-results.json', 'auth-root-browser-results.json', 'csp-results.json']:
        file = ROOT / 'test-results' / name
        result = json.loads(file.read_text())
        if result.get('sourceSha') != sha or result.get('sourceDirty') is not False or result.get('passed') is not True:
            raise ValueError(f'{name}: not a clean successful run for {sha}')
        reports[name] = {'sha256': digest(file), 'startedAt': result['startedAt']}
        if name == 'auth-results.json':
            if len(result.get('variants', [])) != 2:
                raise ValueError('Both portable payload variants must have passed')
            tested_payload = result['payload']
    subprocess.run(['python3', 'scripts/verify-models.py', '--directory', 'dist'], cwd=ROOT, check=True)
    apache = (ROOT / 'dist/.htaccess').read_text()
    if '\nRequire all denied\n' not in apache or "'sha256-" not in apache or 'AuthUserFile' in apache:
        raise ValueError('Missing publication lock/CSP or unexpected active auth configuration')
    if '"./assets/' not in (ROOT / 'dist/index.html').read_text():
        raise ValueError('Expected tested portable base ./ payload')
    actual_payload = {str(f.relative_to(ROOT / 'dist')): {'bytes': f.stat().st_size, 'sha256': digest(f)}
                      for f in (ROOT / 'dist').rglob('*') if f.is_file()}
    if actual_payload != tested_payload:
        raise ValueError('Payload differs from the bytes tested through Basic Auth')
    output = args.output_dir.resolve()
    if output.is_relative_to(ROOT):
        raise ValueError('Keep large deliverables outside the repository')
    output.mkdir(parents=True, exist_ok=True)
    target = output / ('translator-private-' + sha[:12])
    if target.exists():
        raise ValueError('Do not overwrite an existing deliverable')
    target.mkdir()
    shutil.copytree(ROOT / 'dist', target / 'payload')
    for file in (target / 'payload').rglob('*'):
        if file.is_symlink() or file.suffix in ['.ts', '.py', '.wav', '.zip', '.pem', '.key', '.map'] or file.name.startswith('.env'):
            raise ValueError(f'Forbidden payload artifact: {file.name}')
    shutil.copyfile(ROOT / 'PRIVATE_TESTING.md', target / 'PRIVATE_TESTING.md')
    (target / 'hosting').mkdir()
    (target / 'hosting/BASIC_AUTH.template.txt').write_text('''INACTIVE TEMPLATE — NOT A DEPLOYABLE .htaccess
The payload has Require all denied. Publication remains blocked until a separate approval
and real directory-only HTTPS Basic Auth configuration are verified on the host.
Do not add Require valid-user beside the deny line; replace the lock only with the
reviewed actual configuration. Never put a password file inside public WWW.

Required settings (not active directives):
- AuthType: Basic, over valid HTTPS only
- AuthName: a distinct test realm
- AuthBasicProvider: host-supported mechanism
- AuthUserFile: REAL provider-verified absolute path outside WWW (not supplied here)
- authorization: valid-user, covering index/assets/SW/models and every alternate path
- anonymous requests: 401; authenticated static responses: correct MIME/length/SHA
- preserve generated CSP startup hash and all security/cache headers
- HTTP must redirect to HTTPS BEFORE the credential challenge

No credentials, hash file or imaginary active AuthUserFile path are included.
Do not modify WordPress/root .htaccess, databases or permissions.
''')
    source = {'sourceSha': sha, 'documentationSha': head, 'base': './', 'publication': 'BLOCKED until real directory-limited access and HTTPS Basic Auth are verified',
              'modelsLockSha256': digest(ROOT / 'models.lock.json'), 'reports': reports,
              'delivery': 'Local archive; this does not establish a downloadable attachment or deployment'}
    (target / 'SOURCE.json').write_text(json.dumps(source, indent=2) + '\n')
    files = {str(f.relative_to(target)): {'bytes': f.stat().st_size, 'sha256': digest(f)} for f in sorted(target.rglob('*')) if f.is_file()}
    (target / 'MANIFEST.json').write_text(json.dumps({'sourceSha': sha, 'excludesSelf': 'MANIFEST.json', 'files': files}, indent=2) + '\n')
    archive = output / (target.name + '.zip')
    with zipfile.ZipFile(archive, 'x', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as handle:
        for file in sorted(target.rglob('*')):
            if file.is_file(): handle.write(file, file.relative_to(target))
    with tempfile.TemporaryDirectory(prefix='verify-extraction-', dir=output) as folder:
        with zipfile.ZipFile(archive) as handle:
            if handle.testzip() is not None: raise ValueError('ZIP CRC failure')
            handle.extractall(folder)
        extracted = Path(folder)
        manifest = json.loads((extracted / 'MANIFEST.json').read_text())
        expected = set(manifest['files']) | {'MANIFEST.json'}
        if {str(p.relative_to(extracted)) for p in extracted.rglob('*') if p.is_file()} != expected:
            raise ValueError('Extracted file list mismatch')
        for name, metadata in manifest['files'].items():
            file = extracted / name
            if file.stat().st_size != metadata['bytes'] or digest(file) != metadata['sha256']:
                raise ValueError(f'Extraction SHA mismatch: {name}')
        subprocess.run(['python3', 'scripts/verify-models.py', '--directory', str(extracted / 'payload')], cwd=ROOT, check=True)
    archive_hash = digest(archive)
    (output / (archive.name + '.sha256')).write_text(f'{archive_hash}  {archive.name}\n')
    shutil.copyfile(target / 'MANIFEST.json', output / (archive.name + '.manifest.json'))
    summary = {'archive': str(archive), 'bytes': archive.stat().st_size, 'sha256': archive_hash,
               'manifest': str(output / (archive.name + '.manifest.json')), 'manifestSha256': digest(target / 'MANIFEST.json'),
               'sourceSha': sha, 'files': len(files) + 1, 'extractionVerified': True, 'uploaded': False}
    (output / (archive.name + '.delivery.json')).write_text(json.dumps(summary, indent=2) + '\n')
    print(json.dumps(summary, indent=2))


if __name__ == '__main__':
    main()
