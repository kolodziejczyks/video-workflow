import unittest
from thumbnail_candidates import candidate_times, expression_quality, choose_frames


class ThumbnailTests(unittest.TestCase):
    def test_pause_candidates_avoid_speech_and_recording_edges(self):
        words = [{'start': .1, 'end': 1}, {'start': 1.8, 'end': 3}]
        times = candidate_times(words, 3.1)
        self.assertTrue(any(paused and 1 < t < 1.8 for t, paused in times))
        self.assertTrue(all(.12 <= t <= 2.98 for t, _ in times))
        self.assertTrue(all(not (.1 < t < 1 or 1.8 < t < 3) for t, pause in times if pause))
        self.assertEqual(candidate_times([], .1), [])

    def test_blinks_and_open_mouth_rejected_without_penalizing_smiles(self):
        face = {'jawOpen': .05, 'eyeBlinkLeft': .05, 'eyeBlinkRight': .05}
        self.assertIsNotNone(expression_quality(face | {'mouthSmileLeft': .9}, 100, True))
        for edit in ({'jawOpen': .8}, {'eyeBlinkLeft': .9}, {'eyeBlinkRight': .3}, {'mouthPucker': .9}):
            self.assertIsNone(expression_quality(face | edit, 100, True))
        self.assertIsNone(expression_quality(face, 2, True))
        self.assertIsNone(expression_quality(face, 100, True, lip_ratio=.09))
        self.assertIsNotNone(expression_quality(face, 100, True, lip_ratio=.13, smile=.9))

    def test_nearby_and_visually_duplicate_frames_do_not_fill_gallery(self):
        a = {'source':'0001', 'time':1, 'score':4, 'expression':[0, 0], 'hash':[False]*64}
        duplicate = a | {'time':4, 'score':3.9}
        nearby = a | {'time':1.1, 'score':3.8, 'hash':[True]*64}
        different = a | {'source':'0002', 'time':2, 'score':3.7, 'expression':[1, 1], 'hash':[True]*64}
        self.assertEqual(choose_frames([a, duplicate, nearby, different]), [a, different])


if __name__ == '__main__':
    unittest.main()
