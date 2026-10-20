import unittest
from plan_batch import select_clips, protect_speech

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

    def test_speech_tail_and_continuity_preserve_ending_without_reintroducing_exclusions(self):
        clips = [{'source':'one.mov','in':0,'out':1}, {'source':'one.mov','in':1.2,'out':2},
                 {'source':'two.mov','in':0,'out':1}]
        protected = protect_speech(clips, {'one.mov':3,'two.mov':2}, {'two.mov':[(1.2,1.8)]})
        self.assertEqual(len(protected),2)
        self.assertEqual(protected[0]['out'],2.5)
        self.assertEqual(protected[0]['speech_out'],2)
        self.assertAlmostEqual(protected[1]['out'],1.17)

    def test_reviewed_speech_has_no_cutoff_but_still_removes_duplicates(self):
        transcripts = [('one.mov', {'segments': [segment('Same words.', 0, 30), segment('Same words.', 31, 61)]}),
                       ('ending.mov', {'segments': [segment('Yes.', 0, .2), segment('This is the ending.', 1, 9)]})]
        clips = select_clips(transcripts)
        self.assertEqual(len(clips), 3)
        self.assertEqual(clips[-1]['source'], 'ending.mov')

    def test_removed_duplicate_is_not_reintroduced_by_merging_or_tail_padding(self):
        clips = [{'source':'one.mov','in':0,'out':1}, {'source':'one.mov','in':1.5,'out':2}]
        protected = protect_speech(clips, {'one.mov':3}, {'one.mov':[(1.1,1.3)]})
        self.assertEqual(len(protected),2)
        self.assertAlmostEqual(protected[0]['out'],1.07)

if __name__ == '__main__':
    unittest.main()
