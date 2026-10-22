"""Read the explicit subject catalog and verify all source PDF files before indexing."""
import hashlib
import json
import pathlib
import re

import fitz


def load_inventory(root):
    root = pathlib.Path(root).resolve()
    catalog = json.loads((root / 'data/catalog.json').read_text())
    inventory, paths, subject_ids, chapter_ids = [], set(), set(), set()
    for subject in catalog['subjects']:
        if subject['id'] in subject_ids:
            raise ValueError('Duplicate subject: ' + subject['id'])
        subject_ids.add(subject['id'])
        for chapter_number, chapter in enumerate(subject['chapters'], 1):
            key = (subject['id'], chapter['id'])
            if key in chapter_ids:
                raise ValueError('Duplicate chapter: ' + str(key))
            chapter_ids.add(key)
            for section_number, item in enumerate(chapter['documents'], 1):
                relative = pathlib.Path(item['path'])
                path = (root / relative).resolve()
                if relative.is_absolute() or root not in path.parents or path.suffix.lower() != '.pdf':
                    raise ValueError('Invalid source PDF path: ' + str(relative))
                if str(relative) in paths:
                    raise ValueError('Duplicate source PDF: ' + str(relative))
                paths.add(str(relative))
                with fitz.open(path) as document:
                    match = re.search(r'共\s*(\d+)\s*道题', document[0].get_text())
                    if not match:
                        raise ValueError('Missing exported question count: ' + str(relative))
                    pages = len(document)
                exported_number = re.match(r'^\d+(?:\.\d+)*', item['name'])
                inventory.append({
                    'path': str(relative), 'name': item['name'],
                    'subjectId': subject['id'], 'subjectName': subject['name'],
                    'parentId': chapter['id'], 'chapterNo': chapter_number,
                    'number': exported_number[0] if exported_number else f'{chapter_number}.{section_number}',
                    'bytes': path.stat().st_size, 'pages': pages,
                    'expectedQuestions': int(match[1]),
                    'sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
                })
    candidates = {str(p.relative_to(root)) for p in root.rglob('*.pdf')
                  if not any(part.startswith('.') or part in {'node_modules', 'artifacts'}
                             for part in p.relative_to(root).parts)}
    unknown = candidates - paths
    if unknown:
        raise ValueError('Add these PDFs to data/catalog.json before rebuilding: ' + ', '.join(sorted(unknown)))
    return catalog, inventory


def write_json(path, value, pretty=False):
    path = pathlib.Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + '.tmp')
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2 if pretty else None,
                                    separators=None if pretty else (',', ':')) + '\n')
    temporary.replace(path)
