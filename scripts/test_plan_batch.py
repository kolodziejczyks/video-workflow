import unittest
from plan_batch import select_clips

def segment(text, start, end):
    return {'text': text, 'words': [{'text': text, 'start': start, 'end': end}]}

class SelectionTests(unittest.TestCase):
    def test_duplicates_and_soft_target_keep_whole_segments(self):
        clips = select_clips([
            ('one.mov', {'segments': [segment('This is a complete thought.', 0, 8), segment('This is a complete thought!', 9, 17)]}),
            ('two.mov', {'segments': [segment('Another complete idea.', 1, 11), segment('Too late.', 12, 15)]})
        ], 15)
        self.assertEqual(len(clips), 2)
        self.assertEqual(clips[1]['out'], 11)
        self.assertEqual(clips[1]['source'], 'two.mov')

    def test_no_speech(self):
        self.assertEqual(select_clips([('silent.mov', {'segments': []})],45), [])

    def test_reviewed_speech_has_no_cutoff_but_still_removes_duplicates(self):
        transcripts = [('one.mov', {'segments': [segment('Same words.', 0, 30), segment('Same words.', 31, 61)]}),
                       ('ending.mov', {'segments': [segment('Yes.', 0, .2), segment('This is the ending.', 1, 9)]})]
        clips = select_clips(transcripts)
        self.assertEqual(len(clips), 3)
        self.assertEqual(clips[-1]['source'], 'ending.mov')

if __name__ == '__main__':
    unittest.main()
