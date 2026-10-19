"""Conservative first-pass montage: speech intervals in recording order, near-duplicate removal."""
import argparse
import json
import re
from difflib import SequenceMatcher
from pathlib import Path

def select_clips(transcripts, target):
    clips = []
    phrases = []
    duration = 0
    for source, transcript in transcripts:
        for segment in transcript['segments']:
            words = segment.get('words') or []
            if not words:
                continue
            normalized = re.sub(r'[^\w\s]', '', segment['text'].lower()).strip()
            if not normalized or any(SequenceMatcher(None, normalized, old).ratio() > .88 for old in phrases):
                continue
            start = max(0, words[0]['start'] - .08)
            end = words[-1]['end']
            if end - start < .25:
                continue
            # Soft duration target: never truncate the final spoken segment.
            if duration >= target:
                return clips
            clips.append({'source': source, 'in': start, 'out': end,
                          'reason': 'Complete speech segment in recording order; not a semantic highlight selection'})
            phrases.append(normalized)
            duration += end - start
    return clips

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('manifest', type=Path)
    args = parser.parse_args()
    job = json.loads(args.manifest.read_text(encoding='utf-8'))
    directory = Path(job['directory'])
    transcripts = []
    for source in job['sources']:
        media = Path(source['path'])
        transcript = json.loads((directory/'transcripts'/f'{media.stem}.json').read_text(encoding='utf-8'))
        transcripts.append((media.name, transcript))
    clips = select_clips(transcripts, job['targetSeconds'])
    if not clips:
        raise SystemExit('No timed speech found in this recording batch.')
    (directory/'edit-plan.json').write_text(json.dumps({
        'clips': clips, 'status': 'montage_review_pending', 'subtitle_style': 'reference-montra',
        'selection_mode': 'chronological-speech', 'brief': job['brief'],
        'brief_applied': False, 'note': 'Creative brief stored for review; this first-pass selector does not interpret it.'
    }, ensure_ascii=False, indent=2), encoding='utf-8')
