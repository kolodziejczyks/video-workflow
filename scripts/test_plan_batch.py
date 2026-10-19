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

if __name__ == '__main__':
    unittest.main()
