#!/usr/bin/env python3
"""Collect one precompressed deployment ZIP and small extras. Never upload/deploy."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import zipfile

ROOT = Path(__file__).resolve().parents[1]


def digest(path):
    with path.open('rb') as handle:
        return hashlib.file_digest(handle, 'sha256').hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--package-output', type=Path, required=True)
    parser.add_argument('--delivery-dir', type=Path, required=True)
    args = parser.parse_args()
    summaries = list(args.package_output.glob('*.zip.delivery.json'))
    if len(summaries) != 1:
        raise ValueError('Expected exactly one verified deployment archive')
    summary = json.loads(summaries[0].read_text())
    archive = Path(summary['archive'])
    if not summary['extractionVerified'] or digest(archive) != summary['sha256']:
        raise ValueError('Unverified archive')
    target = args.delivery_dir.resolve()
    target.mkdir(parents=True, exist_ok=False)
    if target.is_relative_to(ROOT):
        raise ValueError('Keep generated deliverables outside the repository')
    # One compressed copy in the upload tree, never payload/ or the build tree.
    for suffix in ['', '.sha256', '.manifest.json', '.delivery.json']:
        file = archive.with_name(archive.name + suffix)
        os.link(file, target / file.name)
    shutil.copyfile(ROOT / 'delivery/INSTRUKCJA-WinSCP-PL.md', target / 'INSTRUKCJA-WinSCP-PL.md')
    helper_source = ROOT / 'delivery/basic-auth'
    expected_auth = re.search(r"hash!=='([0-9a-f]{64})'", (helper_source / 'KONFIGURATOR_BASIC_AUTH.html').read_text())[1]
    if digest(ROOT / 'dist/.htaccess') != expected_auth:
        raise ValueError('Offline configurator does not match the generated deny-all .htaccess')
    with zipfile.ZipFile(target / 'konfigurator-basic-auth-offline.zip', 'x', zipfile.ZIP_DEFLATED) as handle:
        for file in sorted(helper_source.iterdir()):
            if not file.is_file() or file.suffix not in ['.html', '.txt']:
                raise ValueError('Unexpected helper artifact')
            handle.write(file, file.name)
    manifest = json.loads(Path(summary['manifest']).read_text())
    old_names = set(re.findall(r'^\| `([^`]+)` \|', (ROOT / 'PACKAGE_MANIFEST.md').read_text(), re.M))
    actual_names = set(manifest['files']) | {'MANIFEST.json'}
    difference = {'added': sorted(actual_names - old_names), 'removed': sorted(old_names - actual_names)}
    reports = {}
    for name in ['auth-results.json', 'auth-prefix-browser-results.json', 'auth-root-browser-results.json',
                 'csp-results.json', 'delivery-helper-results.json']:
        report = json.loads((ROOT / 'test-results' / name).read_text())
        if report.get('sourceSha') != summary['sourceSha'] or report.get('sourceDirty') is not False or report.get('passed') is not True:
            raise ValueError('Not a current clean successful report: ' + name)
        reports[name] = report
    proof = {'sourceSha': summary['sourceSha'], 'deploymentFiles': len(actual_names),
             'historicalFileListDifference': difference, 'archive': summary,
             'reports': reports, 'physicalDevicesTtsAndSemantics': 'NIEPRZETESTOWANE',
             'hosting': 'NOT DEPLOYED; deny-all until actual Basic Auth preflight',
             'storage': 'One precompressed ZIP plus small extras; retention 1 day; no second full artifact'}
    (target / 'WERYFIKACJA-DOSTAWY.json').write_text(json.dumps(proof, ensure_ascii=False, indent=2) + '\n')
    hashes = ''.join(f'{digest(file)}  {file.name}\n' for file in sorted(target.iterdir()))
    (target / 'SUMY-DOSTAWY.sha256').write_text(hashes)
    total = sum(f.stat().st_size for f in target.iterdir())
    if total >= 350_000_000:
        raise ValueError('Upload blocked: compressed delivery exceeds the confirmed 350 MB safety envelope')
    print(json.dumps({'sourceSha': summary['sourceSha'], 'files': summary['files'], 'deliveryBytes': total,
                      'zipBytes': archive.stat().st_size, 'zipSha256': digest(archive),
                      'fileListDifference': difference, 'extractionVerified': True}, indent=2))


if __name__ == '__main__':
    main()
