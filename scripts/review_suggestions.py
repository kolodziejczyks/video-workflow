"""Private local multilingual similarity analysis. Suggestions never remove speech."""
import argparse
import json
import re
from pathlib import Path
import numpy as np
import onnxruntime as ort
from huggingface_hub import hf_hub_download
from tokenizers import Tokenizer

MODEL = 'Xenova/multilingual-e5-small'
REVISION = '761b726dd34fb83930e26aab4e9ac3899aa1fa78'


def find_retakes(lines, encode, threshold=.92):
    eligible = [line for line in lines if len(re.findall(r'\w+', line['text'])) >= 6]
    if len(eligible) < 2:
        return []
    views, owners = [], []
    for i, line in enumerate(eligible):
        words = line['text'].split()
        for text in dict.fromkeys([line['text'], ' '.join(words[:18])]):
            views.append(text)
            owners.append(i)
    vectors = encode(views)
    pairs = {}
    # Bounded blocks avoid an N x N allocation for long recording batches.
    for first in range(0, len(views), 64):
        scores = vectors[first:first+64] @ vectors.T
        for row, column in np.argwhere(scores >= threshold):
            a, b = owners[first+int(row)], owners[int(column)]
            if a >= b:
                continue
            # Neighboring clauses within one take are usually continuation, not retakes.
            if eligible[a]['source'] == eligible[b]['source'] and abs(eligible[b]['start'] - eligible[a]['end']) < 1:
                continue
            score = float(scores[row, column])
            pairs[(a, b)] = max(score, pairs.get((a, b), 0))
    # Pair cards avoid transitive grouping of passages that do not match each other.
    return [{'id': f"retake-{eligible[a]['id']}-{eligible[b]['id']}",
             'lineIds': [eligible[a]['id'], eligible[b]['id']],
             'similarity': round(score, 4), 'decision': None}
            for (a, b), score in sorted(pairs.items(), key=lambda item: (-item[1], item[0]))[:60]]


def local_encoder(cache):
    model = hf_hub_download(MODEL, 'onnx/model_quantized.onnx', revision=REVISION, cache_dir=str(cache))
    vocabulary = hf_hub_download(MODEL, 'tokenizer.json', revision=REVISION, cache_dir=str(cache))
    tokenizer = Tokenizer.from_file(vocabulary)
    tokenizer.enable_truncation(max_length=128)
    tokenizer.enable_padding(pad_id=1, pad_token='<pad>')
    options = ort.SessionOptions()
    options.intra_op_num_threads = 2
    session = ort.InferenceSession(model, sess_options=options, providers=['CPUExecutionProvider'])
    names = {entry.name for entry in session.get_inputs()}

    def encode(texts):
        output = []
        for start in range(0, len(texts), 8):
            batch = tokenizer.encode_batch(['query: ' + text for text in texts[start:start+8]])
            ids = np.array([entry.ids for entry in batch], dtype=np.int64)
            mask = np.array([entry.attention_mask for entry in batch], dtype=np.int64)
            inputs = {'input_ids': ids, 'attention_mask': mask}
            if 'token_type_ids' in names:
                inputs['token_type_ids'] = np.zeros_like(ids)
            hidden = session.run(None, inputs)[0]
            pooled = (hidden * mask[..., None]).sum(axis=1) / mask.sum(axis=1, keepdims=True)
            pooled /= np.maximum(np.linalg.norm(pooled, axis=1, keepdims=True), 1e-12)
            output.append(pooled.astype(np.float32))
        return np.concatenate(output)
    return encode


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('review', type=Path)
    args = parser.parse_args()
    document = json.loads(args.review.read_text(encoding='utf-8'))
    root = Path(__file__).resolve().parents[1]
    document['retakes'] = find_retakes(document['lines'], local_encoder(root/'work/models/retake-e5'))
    document['retakeAnalysis'] = {'model': MODEL, 'revision': REVISION, 'version': 1}
    temporary = args.review.with_suffix('.tmp.json')
    temporary.write_text(json.dumps(document, ensure_ascii=False), encoding='utf-8')
    temporary.replace(args.review)
    print(f"Prepared {len(document['retakes'])} possible retake comparisons.", flush=True)
