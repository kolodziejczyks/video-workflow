"""Conservative first-pass montage: speech intervals in recording order, near-duplicate removal."""
import argparse
import json
import re
from difflib import SequenceMatcher
from pathlib import Path
import wave

def protect_speech(clips, durations, blocked, padding=.5):
    """Join continuous reviewed speech and keep a tail without restoring excluded takes."""
    merged = []
    for clip in clips:
        clip = dict(clip)
        previous = merged[-1] if merged else None
        barriers = blocked.get(clip['source'], [])
        if (previous and previous['source'] == clip['source']
                and clip['in'] - previous['out'] <= .65
                and not any(a < clip['out'] and b > previous['out'] for a, b in barriers)):
            previous['out'] = max(previous['out'], clip['out'])
        else:
            merged.append(clip)
    for clip in merged:
        speech_end = clip['out']
        end = min(durations[clip['source']], speech_end + padding)
        for start, stop in blocked.get(clip['source'], []):
            if stop > speech_end and start < end:
                end = min(end, max(speech_end, start - .03))
        clip.update(out=end, speech_out=speech_end,
                    reason='Reviewed speech with protected ending; continuous sentences joined')
    return merged

def select_clips(transcripts, target=None, deduplicate=True):
    clips = []
    phrases = []
    duration = 0
    for source, transcript in transcripts:
        for segment in transcript['segments']:
            words = segment.get('words') or []
            if not words:
                continue
            normalized = re.sub(r'[^\w\s]', '', segment['text'].lower()).strip()
            if not normalized or (deduplicate and any(SequenceMatcher(None, normalized, old).ratio() > .88 for old in phrases)):
                continue
            start = max(0, words[0]['start'] - .08)
            end = words[-1]['end']
            if end <= start or (target is not None and end - start < .25):
                continue
            # Soft duration target: never truncate the final spoken segment.
            if target is not None and duration >= target:
                return clips
            clips.append({'source': source, 'in': start, 'out': end, 'speech_out': end,
                          'reason': 'Approved review selection; duration is unrestricted' if target is None else 'Complete speech segment in recording order; not a semantic highlight selection'})
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
        transcript = json.loads((directory/('approved-transcripts' if job.get('phase') == 'montage' else 'transcripts')/f'{media.stem}.json').read_text(encoding='utf-8'))
        transcripts.append((media.name, transcript))
    reviewed = job.get('phase') == 'montage'
    review = json.loads((directory/'approved-review.json').read_text(encoding='utf-8')) if reviewed else None
    explicit_retakes = bool(review and review.get('retakeReviewVersion') == 1)
    clips = select_clips(transcripts, None if reviewed else job['targetSeconds'], deduplicate=not explicit_retakes)
    if reviewed:
        blocked = {}
        for line in review['lines']:
            if line['excluded']:
                source = next(s for s, _ in transcripts if Path(s).stem == line['source'])
                blocked.setdefault(source, []).append((line['start'], line['end']))
        # A near-duplicate removed by selection must not return through padding/merging.
        for source, transcript in transcripts:
            for segment in transcript['segments']:
                words = segment.get('words') or []
                if words and not any(c['source'] == source and c['in'] <= words[0]['start'] and c['out'] >= words[-1]['end'] for c in clips):
                    blocked.setdefault(source, []).append((words[0]['start'], words[-1]['end']))
        durations = {}
        for source, _ in transcripts:
            with wave.open(str(directory/'transcripts'/f'{Path(source).stem}.wav'), 'rb') as audio:
                durations[source] = audio.getnframes()/audio.getframerate()
        clips = protect_speech(clips, durations, blocked)
    if not clips:
        raise SystemExit('No timed speech found in this recording batch.')
    (directory/'edit-plan.json').write_text(json.dumps({
        'clips': clips, 'status': 'montage_review_pending', 'subtitle_style': 'reference-montra',
        'selection_mode': 'approved-retake-choices' if explicit_retakes else 'approved-speech-deduplicated' if reviewed else 'chronological-speech', 'brief': job['brief'],
        'brief_applied': False, 'note': 'Creative brief stored for review; this first-pass selector does not interpret it.'
    }, ensure_ascii=False, indent=2), encoding='utf-8')
