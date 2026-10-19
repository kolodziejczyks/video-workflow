"""Render a subtitle style test with Pillow overlays (no FFmpeg libass needed)."""
import argparse
import json
import subprocess
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

parser = argparse.ArgumentParser()
parser.add_argument('--ffmpeg', required=True)
parser.add_argument('--stem', default='IMG_1447')
parser.add_argument('--edge-fade', type=float, default=0, help='Short visual fade at each clip edge, in seconds')
parser.add_argument('--start', type=float, default=0)
parser.add_argument('--end', type=float)
parser.add_argument('--output', type=Path)
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
data = json.loads((root / 'work' / 'transcripts' / f'{args.stem}.json').read_text(encoding='utf-8'))
out = root / 'work' / 'caption-test'
out.mkdir(parents=True, exist_ok=True)
words = [w for segment in data['segments'] for w in segment['words']]
if args.end is None:
    args.end = max(w['end'] for w in words) + 0.12
words = [dict(w, start=max(0, w['start']-args.start), end=min(args.end, w['end'])-args.start)
         for w in words if w['start'] >= args.start and w['end'] <= args.end]
if not words or args.end <= args.start:
    raise ValueError('Selected interval contains no complete words')
groups = []
group = []
for word in words:
    if group and len(' '.join(w['text'].strip() for w in group+[word])) > 30:
        groups.append(group)
        group = []
    group.append(word)
if group:
    groups.append(group)
font = ImageFont.truetype('C:/Windows/Fonts/arialbd.ttf', 38)
command = [args.ffmpeg, '-hide_banner', '-loglevel', 'error', '-nostdin', '-y', '-ss', str(args.start), '-i', str(root / 'samples' / data['source'])]
duration = args.end - args.start
video_filter = 'scale=720:1280,setsar=1,fps=30'
if args.edge_fade:
    video_filter += f',fade=t=in:d={args.edge_fade},fade=t=out:st={duration-args.edge_fade}:d={args.edge_fade}'
filters = [f'[0:v:0]{video_filter}[v0]']
for i, group in enumerate(groups):
    picture = Image.new('RGBA', (720, 140), (0, 0, 0, 0))
    draw = ImageDraw.Draw(picture)
    text = ' '.join(w['text'].strip() for w in group)
    draw.text((360, 70), text, font=font, fill='white', anchor='mm', stroke_width=3, stroke_fill='black')
    path = out / f'{args.stem}-{i}.png'
    picture.save(path)
    command += ['-loop', '1', '-i', str(path)]
    end = groups[i+1][0]['start'] if i+1 < len(groups) else group[-1]['end']
    filters.append(f"[v{i}][{i+1}:v]overlay=0:960:enable='gte(t,{group[0]['start']})*lt(t,{end})'[v{i+1}]")
target = args.output or out / f'{args.stem}-caption-test.mp4'
target.parent.mkdir(parents=True, exist_ok=True)
command += ['-filter_complex', ';'.join(filters), '-map', f'[v{len(groups)}]', '-map', '0:a:0',
            '-t', str(duration), '-c:v', 'h264_mf', '-b:v', '5M', '-pix_fmt', 'yuv420p',
            '-c:a', 'aac', '-b:a', '128k', '-map_metadata', '-1', '-movflags', '+faststart',
            str(target)]
subprocess.run(command, check=True)
print(target)
