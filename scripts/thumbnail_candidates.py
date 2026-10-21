"""Local face-aware thumbnail selection. Never alters source media or native drafts."""
import argparse
import hashlib
import io
import json
import math
from pathlib import Path
import subprocess

MODEL_SHA256 = '64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff'
VERSION = 3


def candidate_times(words, duration, limit=16):
    """Sample pause interiors first, avoiding the first/last recording frames."""
    intervals = sorted((max(0, float(w['start'])), min(duration, float(w['end'])))
                       for w in words if w['end'] > w['start'])
    gaps = []
    end = .12
    for start, stop in intervals + [(duration - .12, duration)]:
        if start - end >= .16:
            gaps.append((end, start))
        end = max(end, stop)
    pauses = []
    for a, b in sorted(gaps, key=lambda g: g[1]-g[0], reverse=True):
        for fraction in (.5, .3, .7):
            time = round(a + (b-a)*fraction, 3)
            if .12 <= time <= duration-.12 and all(abs(time-t) > .09 for t, _ in pauses):
                pauses.append((time, True))
    # A visual face/mouth check remains necessary even when timings are missing.
    fallback = [(round(duration*i/13, 3), False) for i in range(1, 13)]
    times = pauses[:limit]
    for item in fallback:
        if len(times) >= limit:
            break
        if .12 <= item[0] <= duration-.12 and all(abs(item[0]-t) > .12 for t, _ in times):
            times.append(item)
    return sorted(times)


def expression_quality(blend, sharpness, paused, lip_ratio=0, smile=0):
    """Reject obvious blinks/talking shapes; keep neutral and smiling expressions."""
    jaw = blend.get('jawOpen', 1)
    blink = max(blend.get('eyeBlinkLeft', 1), blend.get('eyeBlinkRight', 1))
    pucker = blend.get('mouthPucker', 0)
    funnel = blend.get('mouthFunnel', 0)
    if jaw > .12 or blink > .28 or pucker > .55 or funnel > .5 or sharpness < 18:
        return None
    # Jaw scores alone miss small mid-word lip openings; allow a clear smile.
    if lip_ratio > (.18 if smile > .6 else .065):
        return None
    return 1.8*(1-jaw) + 1.2*(1-blink) + .5*min(1, sharpness/180) + (.45 if paused else 0) - .4*(pucker+funnel)


def choose_frames(candidates, count=6):
    remaining = sorted(candidates, key=lambda c: (-c['score'], c['source'], c['time']))
    selected = []
    while remaining and len(selected) < count:
        def rank(c):
            if not selected:
                return c['score']
            distance = min(math.dist(c['expression'], other['expression']) for other in selected)
            new_source = not any(other['source'] == c['source'] for other in selected)
            return c['score'] + min(1., distance)*1.3 + (.22 if new_source else 0)
        best = max(remaining, key=rank)
        selected.append(best)
        remaining = [c for c in remaining if c is not best
                     and not any(c['source'] == other['source'] and abs(c['time']-other['time']) < .9 for other in selected)
                     and not any(sum(a != b for a, b in zip(c['hash'], other['hash'])) < 5 for other in selected)]
    return selected


def extract(ffmpeg, media, time, size=None):
    args = [ffmpeg, '-hide_banner', '-loglevel', 'error', '-nostdin', '-ss', str(time), '-i', str(media), '-frames:v', '1']
    if size:
        args += ['-vf', f'scale={size}:{size}:force_original_aspect_ratio=decrease']
    return subprocess.run(args + ['-q:v', '2', '-f', 'image2pipe', '-vcodec', 'mjpeg', '-'],
                          check=True, capture_output=True, timeout=45).stdout


def main():
    import cv2
    import mediapipe as mp
    import numpy as np
    from PIL import Image, ImageOps, ImageDraw

    parser = argparse.ArgumentParser()
    parser.add_argument('manifest', type=Path)
    parser.add_argument('--ffmpeg', required=True)
    parser.add_argument('--model', type=Path, required=True)
    args = parser.parse_args()
    if hashlib.sha256(args.model.read_bytes()).hexdigest() != MODEL_SHA256:
        raise ValueError('Face model checksum mismatch.')
    job = json.loads(args.manifest.read_text(encoding='utf-8'))
    output = Path(job['directory']) / 'thumbnails'
    output.mkdir(exist_ok=True)
    result = output / 'manifest.json'
    if result.exists():
        saved = json.loads(result.read_text(encoding='utf-8'))
        if saved.get('version') == VERSION and all((output / f"{f['id']}.jpg").exists() and (output / f"{f['id']}-preview.jpg").exists() for f in saved['frames']):
            print('Thumbnail candidates already prepared.')
            return
    options = mp.tasks.vision.FaceLandmarkerOptions(
        base_options=mp.tasks.BaseOptions(model_asset_path=str(args.model)),
        output_face_blendshapes=True, num_faces=1)
    candidates = []
    failures = []
    with mp.tasks.vision.FaceLandmarker.create_from_options(options) as detector:
        # Bound runtime even for very large recording batches; spread coverage across sources.
        sources = job['sources']
        if len(sources) > 24:
            sources = [sources[round(i*(len(sources)-1)/23)] for i in range(24)]
        per_source = min(20, max(6, 160//max(1, len(sources))))
        for source in sources:
            media = Path(source['path'])
            try:
                probe = str(Path(args.ffmpeg).with_name('ffprobe.exe' if Path(args.ffmpeg).suffix == '.exe' else 'ffprobe'))
                info = json.loads(subprocess.run([probe, '-v', 'error', '-show_format', '-of', 'json', str(media)], check=True, capture_output=True, timeout=30).stdout)
                duration = float(info['format']['duration'])
                transcript_file = Path(job['directory']) / 'transcripts' / f'{media.stem}.json'
                transcript = json.loads(transcript_file.read_text(encoding='utf-8')) if transcript_file.exists() else {}
                words = [word for segment in transcript.get('segments', []) for word in segment.get('words', [])]
                for time, paused in candidate_times(words, duration, per_source):
                    image = Image.open(io.BytesIO(extract(args.ffmpeg, media, time, 720))).convert('RGB')
                    array = np.asarray(image)
                    detected = detector.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=array))
                    if not detected.face_blendshapes:
                        continue
                    landmarks = detected.face_landmarks[0]
                    x = [point.x for point in landmarks]; y = [point.y for point in landmarks]
                    box = (max(0, int(min(x)*image.width)), max(0, int(min(y)*image.height)), min(image.width, int(max(x)*image.width)), min(image.height, int(max(y)*image.height)))
                    face = image.crop(box)
                    if face.width < 70 or face.height < 70:
                        continue
                    gray = cv2.cvtColor(np.asarray(face), cv2.COLOR_RGB2GRAY)
                    sharpness = float(cv2.Laplacian(gray, cv2.CV_64F).var())
                    blend = {item.category_name: item.score for item in detected.face_blendshapes[0]}
                    lip_ratio = abs(landmarks[14].y-landmarks[13].y)*image.height / max(1, abs(landmarks[291].x-landmarks[61].x)*image.width)
                    smile = (blend.get('mouthSmileLeft', 0)+blend.get('mouthSmileRight', 0))/2
                    score = expression_quality(blend, sharpness, paused, lip_ratio, smile)
                    if score is None:
                        continue
                    small = np.asarray(face.convert('L').resize((9, 8)))
                    hash_bits = (small[:, 1:] > small[:, :-1]).flatten().tolist()
                    expression = [blend.get(key, 0) for key in ('mouthSmileLeft', 'mouthSmileRight', 'browInnerUp', 'browDownLeft', 'browDownRight', 'mouthPressLeft', 'mouthPressRight', 'eyeSquintLeft', 'eyeSquintRight')]
                    expression += [landmarks[1].x - (min(x)+max(x))/2, landmarks[1].y - (min(y)+max(y))/2]
                    candidates.append({'source': media.stem, 'sourceName': source['originalName'], 'media': str(media), 'time': time, 'score': score, 'expression': expression, 'hash': hash_bits, 'paused': paused, 'lipRatio':lip_ratio,'jawOpen': blend['jawOpen'], 'blink': max(blend['eyeBlinkLeft'],blend['eyeBlinkRight'])})
            except (OSError, ValueError, subprocess.SubprocessError) as error:
                failures.append({'source': media.stem, 'error': str(error)[:250]})
    if not candidates and failures:
        raise RuntimeError('Thumbnail extraction failed; see recording/model setup. ' + failures[0]['error'])
    frames = []
    contact = Image.new('RGB', (900, 570), '#191919')
    draw = ImageDraw.Draw(contact)
    for i, candidate in enumerate(choose_frames(candidates)):
        data = extract(args.ffmpeg, candidate['media'], candidate['time'])
        image = Image.open(io.BytesIO(data)); image.load()
        frame_id = hashlib.sha256(data).hexdigest()[:16]
        (output / f'{frame_id}.jpg').write_bytes(data)
        preview = image.copy(); preview.thumbnail((540, 540)); preview.save(output / f'{frame_id}-preview.jpg', quality=88)
        frames.append({key: candidate[key] for key in ('source', 'sourceName', 'time')} | {'id': frame_id, 'width': image.width, 'height': image.height})
        thumb = ImageOps.contain(image, (295, 250))
        contact.paste(thumb, ((i%3)*300+(300-thumb.width)//2, (i//3)*285))
        draw.text(((i%3)*300+8, (i//3)*285+252), f"{i+1}: {candidate['source']} {candidate['time']:.2f}s", fill='white')
    contact.save(output / 'contact.jpg')
    (output / 'evaluation.json').write_text(json.dumps({'candidates': candidates, 'failures': failures}, ensure_ascii=False), encoding='utf-8')
    temporary = output / 'manifest.tmp.json'
    temporary.write_text(json.dumps({'version': VERSION, 'frames': frames}, ensure_ascii=False), encoding='utf-8')
    temporary.replace(result)
    print(f"Prepared {len(frames)} thumbnail suggestions from {len(candidates)} qualifying frames.")


if __name__ == '__main__':
    main()
