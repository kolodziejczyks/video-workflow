"""Render source intervals from a JSON edit plan, retaining a review manifest."""
import argparse
import json
import subprocess
import sys
import re
from pathlib import Path

p = argparse.ArgumentParser()
p.add_argument('--ffmpeg', required=True)
p.add_argument('--plan', required=True, type=Path)
p.add_argument('--reuse-parts', action='store_true', help='Reuse existing parts only with an identical saved plan')
args = p.parse_args()
root = Path(__file__).resolve().parents[1]
plan = json.loads(args.plan.read_text(encoding='utf-8'))
out = root / 'work' / plan['name']
out.mkdir(parents=True, exist_ok=True)
if args.reuse_parts and json.loads((out/'edit-plan.json').read_text(encoding='utf-8')) != plan:
    raise ValueError('Saved plan differs; render parts again')
paths = []
captions = []
offset = 0
def stamp(seconds):
    ms = round(seconds * 1000)
    return f'{ms//3600000:02}:{ms//60000%60:02}:{ms//1000%60:02},{ms%1000:03}'
for i, clip in enumerate(plan['clips']):
    target = out / f'part-{i:02}.mp4'
    if not args.reuse_parts:
        subprocess.run([sys.executable, str(root/'scripts/render_caption_test.py'), '--ffmpeg', args.ffmpeg,
            '--stem', Path(clip['source']).stem, '--start', str(clip['in']), '--end', str(clip['out']),
            '--edge-fade', '0', '--output', str(target)], check=True)
    paths.append(target)
    transcript = json.loads((root/'work/transcripts'/f"{Path(clip['source']).stem}.json").read_text(encoding='utf-8'))
    words = [w for segment in transcript['segments'] for w in segment['words']
             if w['start'] >= clip['in'] and w['end'] <= clip['out']]
    groups = []
    group = []
    for word in words:
        if group and len(' '.join(w['text'].strip() for w in group+[word])) > 30:
            groups.append(group)
            group = []
        group.append(word)
    if group:
        groups.append(group)
    for j, group in enumerate(groups):
        start = offset + group[0]['start'] - clip['in']
        end = offset + (groups[j+1][0]['start'] if j+1 < len(groups) else group[-1]['end']) - clip['in']
        captions.append(f'{len(captions)+1}\n{stamp(start)} --> {stamp(end)}\n'+ ' '.join(w['text'].strip() for w in group))
    probe = subprocess.run([args.ffmpeg, '-hide_banner', '-i', str(target)], capture_output=True, text=True)
    duration = re.search(r'Duration: (\d+):(\d+):(\d+\.\d+)', probe.stderr)
    offset += sum(float(v)*n for v,n in zip(duration.groups(), [3600,60,1]))
listing = out/'concat.txt'
listing.write_text('\n'.join("file '"+path.as_posix()+"'" for path in paths), encoding='utf-8')
target = out/'review.mp4'
subprocess.run([args.ffmpeg, '-hide_banner', '-loglevel', 'error', '-nostdin', '-y', '-f', 'concat',
    '-safe', '0', '-i', str(listing), '-map', '0:v:0', '-map', '0:a:0', '-c:v', 'h264_mf', '-b:v', '5M',
    '-pix_fmt', 'yuv420p', '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', '-c:a', 'aac', '-ar', '48000',
    '-b:a', '128k', '-map_metadata', '-1', '-movflags', '+faststart', str(target)], check=True)
(out/'edit-plan.json').write_text(json.dumps(plan, ensure_ascii=False, indent=2), encoding='utf-8')
(out/'captions-unreviewed.srt').write_text('\n\n'.join(captions)+'\n', encoding='utf-8')
print(target)
