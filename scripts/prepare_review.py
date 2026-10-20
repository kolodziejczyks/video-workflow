"""Build a source-timed review document and small MP3 proxies; never edit originals."""
import argparse
import json
import subprocess
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('manifest', type=Path)
parser.add_argument('--ffmpeg', required=True)
args = parser.parse_args()
job = json.loads(args.manifest.read_text(encoding='utf-8'))
directory = Path(job['directory'])
audio = directory / 'review-audio'
audio.mkdir(exist_ok=True)
document = {'sources': [], 'lines': []}
for source in job['sources']:
    media = Path(source['path'])
    transcript = json.loads((directory / 'transcripts' / f'{media.stem}.json').read_text(encoding='utf-8'))
    if not transcript['segments']:
        continue
    document['sources'].append({'id': media.stem, 'name': source['originalName']})
    proxy = audio / f'{media.stem}.mp3'
    if not proxy.exists():
        temporary = audio / f'{media.stem}.tmp.mp3'
        subprocess.run([args.ffmpeg, '-hide_banner', '-loglevel', 'error', '-nostdin', '-y',
                        '-i', str(media), '-map', '0:a:0', '-ac', '1', '-ar', '24000',
                        '-c:a', 'libmp3lame', '-b:a', '48k', str(temporary)], check=True)
        temporary.replace(proxy)
    for segment in transcript['segments']:
        group = []
        groups = []
        for word in segment.get('words', []):
            if group and word['end'] - group[0]['start'] > 20:
                groups.append(group)
                group = []
            group.append(word)
            if word['text'].rstrip().endswith(('.', '!', '?')):
                groups.append(group)
                group = []
        if group:
            groups.append(group)
        for words in groups:
            text = ''.join(w['text'] for w in words).strip()
            if not text or words[-1]['end'] <= words[0]['start']:
                continue
            document['lines'].append({
                'id': str(len(document['lines'])), 'source': media.stem,
                'start': words[0]['start'], 'end': words[-1]['end'], 'text': text,
                'uncertain': [w['text'].strip() for w in words if w.get('review_reasons')]
            })
if not document['lines']:
    raise SystemExit('No speech found to review.')
(directory / 'review.json').write_text(json.dumps(document, ensure_ascii=False), encoding='utf-8')
