#!/usr/bin/env python3
"""Run one QA command; expose its failure tail as a readable GitHub annotation."""
from collections import deque
import re
import subprocess
import sys

command = sys.argv[1:]
if not command:
    raise SystemExit('Expected a command, not shell source')
tail = deque(maxlen=80)
with subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                      text=True, encoding='utf-8', errors='replace') as process:
    for line in process.stdout:
        print(line, end='', flush=True)
        tail.append(line)
    status = process.wait()
if status:
    message = ''.join(tail)[-6500:]
    message = re.sub(r'(Authorization\s*[:=]\s*)\S+[^\r\n]*', r'\1[omitted]', message, flags=re.I)
    message = re.sub(r'https?://[^\s/@]+:[^\s/@]+@', '[userinfo omitted]@', message)
    message = message.replace('%', '%25').replace('\r', '%0D').replace('\n', '%0A')
    print('::error title=Translator QA command failed::' + message, flush=True)
raise SystemExit(status if status >= 0 else 1)
