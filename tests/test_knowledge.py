import hashlib
import json
import pathlib
import re
import sys
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from index_knowledge import note_sections


class KnowledgeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = json.loads((ROOT / 'dist/data/knowledge.json').read_text())
        cls.registry = json.loads((ROOT / 'data/knowledge-sources.json').read_text())

    def test_every_source_is_registered_and_unchanged(self):
        actual = {p.relative_to(ROOT).as_posix() for p in (ROOT / 'question-bank/习概').rglob('*')
                  if p.suffix in {'.pdf', '.md'}}
        self.assertEqual(actual, {s['path'] for s in self.registry['sources']})
        self.assertEqual(len(actual), 31)
        for source in self.registry['sources']:
            self.assertEqual(hashlib.sha256((ROOT / source['path']).read_bytes()).hexdigest(), source['sha256'])
        self.assertEqual(self.registry['revision'], self.data['revision'])

    def test_all_combined_chapter_sections_preserve_their_original_text(self):
        notes = [a for a in self.data['articles'] if a['kind'] == 'note']
        self.assertEqual(len(notes), 20)
        for source in self.registry['sources']:
            if source['type'] != 'md' or source['name'] == 'README.md':
                continue
            expected = note_sections((ROOT / source['path']).read_text(encoding='utf-8-sig'))
            indexed = [(a['title'], a['body']) for a in notes if a['sources'][0]['id'] == source['id']]
            self.assertEqual(sorted(expected), sorted(indexed), source['path'])
        for article in notes:
            for heading in article['headings']:
                self.assertIn('id="' + heading['id'] + '"', article['html'])
        self.assertEqual(sum(len(a['headings']) for a in notes), 126)
        self.assertEqual(len({a['id'] for a in self.data['articles']}), 22)

    def test_registered_pdf_pages_are_valid_for_each_reading_link(self):
        for article in self.data['articles']:
            for reference in article['sources']:
                source = self.data['sources'][reference['id']]
                if source['type'] == 'pdf':
                    self.assertTrue(1 <= reference['page'] <= source['pages'])
        self.assertEqual(len([a for a in self.data['articles'] if a['kind'] == 'pdf']), 2)


if __name__ == '__main__':
    unittest.main()
