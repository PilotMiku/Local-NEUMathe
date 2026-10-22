import hashlib
import json
import pathlib
import shutil
import sys
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from catalog import load_inventory


class PdfBankTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.bank = json.loads((ROOT / 'dist/data/bank.json').read_text())
        cls.index = json.loads((ROOT / 'data/render-index.json').read_text())
        cls.report = json.loads((ROOT / 'data/extraction-report.json').read_text())

    def test_all_originals_match_saved_checksums_and_export_counts(self):
        _, inventory = load_inventory(ROOT)
        saved = json.loads((ROOT / 'data/pdf-inventory.json').read_text())
        self.assertEqual(len(inventory), 132)
        self.assertEqual(sum(r['expectedQuestions'] for r in inventory), 3501)
        self.assertEqual(sum(r['pages'] for r in inventory), 1526)
        self.assertEqual({r['path']: r['sha256'] for r in inventory},
                         {r['path']: r['sha256'] for r in saved})
        self.assertTrue(all(pathlib.Path(r['path']).parts[0] == 'question-bank' for r in inventory))
        self.assertFalse(list(ROOT.glob('*.pdf')))
        self.assertEqual(len({r['id'] for r in inventory}), len(inventory))

    def test_document_id_and_checksum_survive_a_file_move(self):
        catalog = json.loads((ROOT / 'data/catalog.json').read_text())
        source = catalog['subjects'][0]['chapters'][0]['documents'][0]
        with tempfile.TemporaryDirectory() as temporary:
            root = pathlib.Path(temporary)
            (root / 'data').mkdir()
            shutil.copyfile(ROOT / source['path'], root / 'before.pdf')
            document = {**source, 'path': 'before.pdf'}
            fixture = {'subjects': [{'id': 'test', 'name': '测试', 'chapters': [
                {'id': 'chapter', 'name': '章节', 'documents': [document]}]}]}
            catalog_path = root / 'data/catalog.json'
            catalog_path.write_text(json.dumps(fixture, ensure_ascii=False))
            _, before = load_inventory(root)
            (root / 'nested').mkdir()
            (root / 'before.pdf').rename(root / 'nested/after.pdf')
            document['path'] = 'nested/after.pdf'
            catalog_path.write_text(json.dumps(fixture, ensure_ascii=False))
            _, after = load_inventory(root)
            self.assertEqual(before[0]['id'], after[0]['id'])
            self.assertEqual(before[0]['sha256'], after[0]['sha256'])
            self.assertEqual(before[0]['expectedQuestions'], after[0]['expectedQuestions'])

    def test_every_question_has_source_regions_and_two_matching_answer_signals(self):
        self.assertEqual(set(self.index['questions']), {q['id'] for q in self.bank['questions']})
        for question in self.bank['questions']:
            with self.subTest(question=question['id']):
                record = self.index['questions'][question['id']]
                self.assertTrue(record['parts']['stem'])
                for option in question['options']:
                    self.assertTrue(record['parts']['option-' + option['id']])
                evidence = question['source']['answerEvidence']
                self.assertEqual(evidence['labels'], evidence['boldRings'])
                self.assertEqual(evidence['labels'], [question['answer']])
                self.assertTrue(question['answerVerified'])
                for clips in record['parts'].values():
                    for clip in clips:
                        self.assertLess(clip['page'], self.index['documents'][record['documentId']]['pages'])
                        x0, y0, x1, y1 = clip['rect']
                        self.assertTrue(0 <= x0 < x1 <= 596)
                        self.assertTrue(0 <= y0 < y1 <= 842)

    def test_known_linear_algebra_originals_and_revision_cache_keys(self):
        quadratic = [q for q in self.bank['questions'] if q['sourceLabel'].startswith('二次型概念、惯性定理、正定二次型 · ')]
        self.assertEqual([q['answer'] for q in quadratic[:2]], ['D', 'A'])
        self.assertEqual(self.report['analysisMissing'], 7)
        self.assertEqual(sum(q['analysisMissing'] for q in self.bank['questions']), 7)
        self.assertEqual(self.bank['revision'], self.index['revision'])
        self.assertEqual(self.bank['revision'], self.report['revision'])
        for q in self.bank['questions']:
            self.assertIn('?v=' + self.bank['revision'], q['stem'])


if __name__ == '__main__':
    unittest.main()
