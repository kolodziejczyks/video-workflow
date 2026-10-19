"""Read sample metadata and make a contact sheet using an existing FFmpeg binary."""
import argparse
import json
import re
import subprocess
from pathlib import Path
from PIL import Image, ImageDraw

parser = argparse.ArgumentParser()
parser.add_argument('--ffmpeg', required=True)
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
out = root / 'work' / 'inspection'
out.mkdir(parents=True, exist_ok=True)
rows = []
tiles = []
for source in sorted((root / 'samples').glob('*')):
    if source.suffix.lower() not in {'.mov', '.mp4', '.mkv'}:
        continue
    result = subprocess.run([args.ffmpeg, '-hide_banner', '-i', str(source)], capture_output=True, text=True, errors='replace')
    info = result.stderr
    duration = re.search(r'Duration: (\d+):(\d+):(\d+\.\d+)', info)
    seconds = sum(float(v) * n for v, n in zip(duration.groups(), [3600, 60, 1])) if duration else None
    video = re.search(r'Video: (.*)', info)
    audio = re.findall(r'Audio: (.*)', info)
    rotation = re.search(r'rotation of ([\d.-]+)', info)
    rows.append({'file': source.name, 'bytes': source.stat().st_size, 'duration_seconds': seconds,
                 'video': video.group(1) if video else None, 'audio': audio,
                 'rotation_degrees': float(rotation.group(1)) if rotation else 0})
    frame = out / (source.stem + '.jpg')
    render = subprocess.run([args.ffmpeg, '-hide_banner', '-loglevel', 'error', '-nostdin', '-y',
        '-ss', str(min(1, (seconds or 0) / 2)), '-i', str(source), '-map', '0:v:0',
        '-frames:v', '1', '-vf', 'scale=240:240:force_original_aspect_ratio=decrease', str(frame)], capture_output=True)
    tile = Image.new('RGB', (260, 280), '#202020')
    if render.returncode == 0:
        with Image.open(frame) as picture:
            tile.paste(picture, ((260-picture.width)//2, 0))
    ImageDraw.Draw(tile).text((8, 246), f'{source.name} | {seconds}s', fill='white')
    tiles.append(tile)
sheet = Image.new('RGB', (260 * 7, 280 * ((len(tiles)+6)//7)), '#202020')
for i, tile in enumerate(tiles):
    sheet.paste(tile, ((i%7)*260, (i//7)*280))
sheet.save(out / 'contact-sheet.jpg')
(out / 'inventory.json').write_text(json.dumps(rows, indent=2), encoding='utf-8')
print(json.dumps({'files': len(rows), 'total_seconds': round(sum(r['duration_seconds'] or 0 for r in rows), 2),
                  'inventory': str(out / 'inventory.json'), 'contact_sheet': str(out / 'contact-sheet.jpg')}))
