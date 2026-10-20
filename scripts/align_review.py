"""Force-align approved text to source audio using the pinned faster-whisper model."""
import argparse
import json
from pathlib import Path
from faster_whisper import WhisperModel
from faster_whisper.audio import decode_audio, pad_or_trim
from faster_whisper.tokenizer import Tokenizer
from faster_whisper.transcribe import merge_punctuations

parser = argparse.ArgumentParser()
parser.add_argument('manifest', type=Path)
args = parser.parse_args()
job = json.loads(args.manifest.read_text(encoding='utf-8'))
directory = Path(job['directory'])
review = json.loads((directory / 'approved-review.json').read_text(encoding='utf-8'))
if not review.get('approved') or any(not l['accepted'] for l in review['lines'] if not l['excluded']):
    raise SystemExit('Approved transcript required.')
root = Path(__file__).resolve().parents[1]
model = WhisperModel('small', device='cpu', compute_type='int8', download_root=str(root/'work/models'), local_files_only=True)
tokenizer = Tokenizer(model.hf_tokenizer, model.model.is_multilingual, task='transcribe', language='pl')
out = directory / 'approved-transcripts'
out.mkdir(exist_ok=True)
for source in job['sources']:
    media = Path(source['path'])
    original = json.loads((directory/'transcripts'/f'{media.stem}.json').read_text(encoding='utf-8'))
    lines = [l for l in review['lines'] if l['source'] == media.stem and not l['excluded']]
    samples = decode_audio(str(directory/'transcripts'/f'{media.stem}.wav')) if lines else None
    segments = []
    for line in lines:
        text = line['text'].strip()
        original_words = [w for s in original['segments'] for w in s['words'] if w['start'] >= line['start'] and w['end'] <= line['end']]
        if original_words and ''.join(w['text'] for w in original_words).strip() == text:
            segments.append({'start': line['start'], 'end': line['end'], 'text': text, 'words': original_words})
            continue
        # Model alignment handles up to 30 seconds; never silently invent word times.
        start = max(0, line['start'] - .12)
        end = min(len(samples)/16000, line['end'] + .12)
        if end - start > 30:
            raise SystemExit('An edited sentence exceeds the 30-second alignment window. Split the recording before retrying.')
        features = model.feature_extractor(samples[int(start*16000):int(end*16000)])
        frames = min(features.shape[-1]-1, model.feature_extractor.nb_max_frames)
        tokens = tokenizer.encode(' ' + text)
        aligned = model.find_alignment(tokenizer, [tokens], model.encode(pad_or_trim(features)), frames)[0]
        merge_punctuations(aligned, '"\'“¿([{-', '"\'.。,，!！?？:：”)]}、')
        words = [{'text': w['word'], 'start': max(line['start'], start + float(w['start'])),
                  'end': min(line['end'], start + float(w['end']))} for w in aligned if w['word'].strip()]
        if not words or ''.join(w['text'] for w in words).strip() != text or any(w['end'] <= w['start'] for w in words):
            raise SystemExit(f"Could not reliably align reviewed sentence {line['id']}; no project was generated.")
        segments.append({'start': line['start'], 'end': line['end'], 'text': text, 'words': words})
    (out/f'{media.stem}.json').write_text(json.dumps({**original, 'review_status': 'approved', 'segments': segments}, ensure_ascii=False, indent=2), encoding='utf-8')
