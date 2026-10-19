"""Generate draft Polish transcripts locally; downloads a model on first use."""
import argparse
import json
import subprocess
import hashlib
from pathlib import Path
from faster_whisper import WhisperModel

parser = argparse.ArgumentParser()
parser.add_argument('--ffmpeg', required=True)
parser.add_argument('--model', default='small')
parser.add_argument('--input', type=Path)
parser.add_argument('--output', type=Path)
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
out = args.output or root / 'work' / 'transcripts'
out.mkdir(parents=True, exist_ok=True)
model = WhisperModel(args.model, device='cpu', compute_type='int8', download_root=str(root / 'work' / 'models'))

def stamp(seconds):
    ms = round(seconds * 1000)
    return f'{ms//3600000:02}:{ms//60000%60:02}:{ms//1000%60:02},{ms%1000:03}'

for source in sorted((args.input or root / 'samples').glob('*')):
    if source.suffix.lower() not in {'.mov', '.mp4', '.mkv', '.m4v'}:
        continue
    target = out / f'{source.stem}.json'
    with source.open('rb') as stream:
        fingerprint = hashlib.file_digest(stream, 'sha256').hexdigest()
    if target.exists():
        previous = json.loads(target.read_text(encoding='utf-8'))
        if previous.get('source_sha256') == fingerprint and previous.get('model') == args.model:
            continue
    audio = out / f'{source.stem}.wav'
    subprocess.run([args.ffmpeg, '-hide_banner', '-loglevel', 'error', '-nostdin', '-y', '-i', str(source),
                    '-map', '0:a:0', '-ac', '1', '-ar', '16000', str(audio)], check=True)
    segments, info = model.transcribe(str(audio), language='pl', task='transcribe', beam_size=5,
                                      word_timestamps=True, vad_filter=True, condition_on_previous_text=False)
    data = [{'start': s.start, 'end': s.end, 'text': s.text.strip(),
             'words': [{'start': w.start, 'end': w.end, 'text': w.word} for w in (s.words or [])]} for s in segments]
    target.write_text(json.dumps({'source': source.name, 'source_sha256': fingerprint, 'model': args.model, 'language': 'pl',
                                  'review_status': 'unreviewed', 'segments': data}, ensure_ascii=False, indent=2), encoding='utf-8')
    (out / f'{source.stem}.srt').write_text('\n\n'.join(
        f'{i}\n{stamp(s["start"])} --> {stamp(s["end"])}\n{s["text"]}' for i, s in enumerate(data, 1))+'\n', encoding='utf-8')
    print(source.name + ': ' + ' '.join(s['text'] for s in data), flush=True)
