"""Assemble selected takes into an unapproved review export."""
import argparse
import json
import subprocess
import sys
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--ffmpeg', required=True)
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
out = root / 'work' / 'draft-v1'
out.mkdir(parents=True, exist_ok=True)
# Editorial selection: hook, explanation, implication, caveat, closing question.
selection = [
    ('IMG_1447', 'Complete opening hook; provisional caption style test'),
    ('IMG_1455', 'Most complete explanation take; product name needs audio review'),
    ('IMG_1456', 'Complete implication sentence without the alternate take stumbles'),
    ('IMG_1466', 'Complete caveat about group photos and children'),
    ('IMG_1462', 'Complete closing thought; omit unfinished outro takes'),
]
parts = []
captions = []
offset = 0
manifest = []
def stamp(seconds):
    ms = round(seconds * 1000)
    return f'{ms//3600000:02}:{ms//60000%60:02}:{ms//1000%60:02},{ms%1000:03}'
for stem, reason in selection:
    subprocess.run([sys.executable, str(root / 'scripts' / 'render_caption_test.py'),
        '--ffmpeg', args.ffmpeg, '--stem', stem, '--edge-fade', '0.06'], check=True)
    part = root / 'work' / 'caption-test' / f'{stem}-caption-test.mp4'
    parts.append(part)
    data = json.loads((root / 'work' / 'transcripts' / f'{stem}.json').read_text(encoding='utf-8'))
    words = [w for segment in data['segments'] for w in segment['words']]
    # 30fps quantization matches the rendered source parts.
    import math
    duration = math.ceil((max(w['end'] for w in words) + 0.12) * 30) / 30
    manifest.append({'source': data['source'], 'source_in': 0, 'source_out': duration,
                     'timeline_start': offset, 'reason': reason})
    for segment in data['segments']:
        captions.append(f'{len(captions)+1}\n{stamp(offset+segment["start"])} --> {stamp(offset+segment["end"])}\n{segment["text"]}')
    offset += duration
concat = out / 'concat.txt'
concat.write_text('\n'.join("file '" + p.as_posix() + "'" for p in parts), encoding='utf-8')
target = out / 'polish-short-v1-review.mp4'
subprocess.run([args.ffmpeg, '-hide_banner', '-loglevel', 'error', '-nostdin', '-y',
    '-f', 'concat', '-safe', '0', '-i', str(concat), '-map', '0:v:0', '-map', '0:a:0',
    '-c:v', 'h264_mf', '-b:v', '5M', '-pix_fmt', 'yuv420p', '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11',
    '-c:a', 'aac', '-b:a', '128k', '-map_metadata', '-1', '-movflags', '+faststart', str(target)], check=True)
(out / 'captions-unreviewed.srt').write_text('\n\n'.join(captions)+'\n', encoding='utf-8')
(out / 'edit-manifest.json').write_text(json.dumps({'status': 'awaiting_review', 'music': None,
    'transitions': '60ms edge fades', 'clips': manifest}, ensure_ascii=False, indent=2), encoding='utf-8')
(out / 'review-notes.md').write_text('''# Draft v1 review

Five selected takes, with duplicate openings, false starts and unfinished endings omitted.
Provisional caption style retained. Short visual dips separate takes; no music.
This is an early experiment; later native MCP projects supersede it. Montage and styling are unapproved.

Needs review before publishing:
- Check the product name in IMG_1455: the automatic transcript says “AI News”. This has not been verified or silently corrected.
- Check subtitle wording and timing against the audio throughout.
- Claims about Meta/Instagram are the speaker’s recorded statements and have not been fact-checked.
- The “Jak to wyłączyć?” fragment was omitted because no answer appears in the provided samples.
- Export is a 720x1280 review copy, not a final publishing approval.
''', encoding='utf-8')
print(target)
