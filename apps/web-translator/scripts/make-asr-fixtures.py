"""Generate only fictional synthetic fixtures, never a physical Android acceptance test.

Requires an already available eSpeak1.48.15 and FFmpeg. No package installation,
online TTS, model downloads or production writes. Output is outside the repository.
"""
from pathlib import Path
import json
import os
import subprocess

out = Path(os.environ.get('ASR_RESEARCH_DIR', '/workspace/artifacts/asr-pl-nl-research'))
out.mkdir(parents=True, exist_ok=True)
binary = os.environ['ESPEAK_BINARY']
data = os.environ['ESPEAK_DATA_PARENT']
texts = {
    'pl': 'Nie biorę pięciu miligramów. Biorę dziesięć miligramów dwa razy dziennie. Jutro o dziewiątej pojadę autobusem numer dwanaście do niebieskiego budynku. Proszę powiedzieć, czy wejście jest po lewej stronie. Nie skręcam przy pierwszym skrzyżowaniu, tylko przy drugim.',
    'nl': 'Ik neem geen vijf milligram. Ik neem tien milligram twee keer per dag. Morgen om negen uur neem ik bus twaalf naar het blauwe gebouw. Kunt u zeggen of de ingang aan de linkerkant is? Ik sla niet af bij het eerste kruispunt, maar bij het tweede.',
}
rows = []
for lang, text in texts.items():
    for rate in [160, 220]:
        raw, wav, pcm = [out / f'{lang}-{rate}{suffix}' for suffix in ['-raw.wav', '.wav', '.f32']]
        subprocess.run([binary, '--path=' + data, '-v', lang, '-s', str(rate), '-w', str(raw), text], check=True)
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', str(raw), '-ar', '16000', '-ac', '1', str(wav)], check=True)
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', str(wav), '-f', 'f32le', str(pcm)], check=True)
        rows.append({'id': f'{lang}-{rate}', 'lang': lang, 'wpmSetting': rate, 'reference': text,
                     'duration': pcm.stat().st_size / 4 / 16000, 'file': pcm.name, 'synthetic': True})
(out / 'fixtures.json').write_text(json.dumps(rows, ensure_ascii=False, indent=2) + '\n')
