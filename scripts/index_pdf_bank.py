"""Index the user's NeuMathe PDF exports without OCR or rewriting mathematical content.

Original files remain unchanged. Images are rendered on demand by the local server.
"""
import concurrent.futures
import hashlib
import html
import json
import pathlib
import re
import time
import fitz

ROOT = pathlib.Path(__file__).resolve().parents[1]
CHAPTER_NAMES = {
    1: '函数与极限', 2: '导数与微分', 3: '微分中值定理与导数应用',
    4: '积分及其应用', 5: '无穷级数', 6: '空间解析几何与向量代数', 7: '多元函数微分学',
}

def number_key(value):
    return tuple(int(n) for n in re.findall(r'\d+', pathlib.Path(value).stem.split(' ')[0]))

def position(item):
    return (item['page'], item['bbox'][1])

def index_pdf(row):
    path = ROOT / row['path']
    section_number = re.match(r'[\d.]+', path.stem).group(0).rstrip('.')
    chapter_no = int(section_number.split('.')[0])
    sid = 's-' + hashlib.sha256(row['path'].encode()).hexdigest()[:12]
    doc = fitz.open(path)
    pages = []
    all_spans = []
    anchors = []
    for pi, page in enumerate(doc):
        spans = []
        ink = []
        for block in page.get_text('dict')['blocks']:
            for line in block.get('lines', []):
                if abs(line['dir'][0] - 1) > .001 or abs(line['dir'][1]) > .001:
                    continue  # Watermark text is rotated; it remains in the rendered original.
                for span in line['spans']:
                    if not span['text'].strip(): continue
                    s = {'page': pi, 'text': span['text'], 'bbox': list(span['bbox'])}
                    spans.append(s)
                    if span['color'] < 0xCCCCCC:
                        ink.append(list(span['bbox']))
                    if re.fullmatch(r'\d+\.', span['text'].strip()) and 40 < span['bbox'][0] < 45 and span['bbox'][1] < page.rect.height - 40:
                        anchors.append(s)
        circles = []
        for d in page.get_cdrawings():
            rect = list(d['rect'])
            color = d.get('color')
            fill = d.get('fill')
            dark = (fill is not None and min(fill) < .65) or (color is not None and min(color) < .65)
            opacity = max(d.get('fill_opacity') or 0, d.get('stroke_opacity') or 0)
            if dark and opacity > .2:
                ink.append(rect)
            if d.get('width') and d['width'] >= 1.2 and color is not None and max(color) < .2 and 41 < rect[0] < 46 and 12 < rect[2]-rect[0] < 17 and 12 < rect[3]-rect[1] < 17:
                circles.append(rect)
        for image in page.get_image_info(): ink.append(list(image['bbox']))
        pages.append({'width': page.rect.width, 'height': page.rect.height, 'spans': spans, 'ink': ink, 'circles': circles})
        all_spans.extend(spans)
    anchors.sort(key=position)
    actual_numbers = [int(a['text'].strip().rstrip('.')) for a in anchors]
    expected = row['expectedQuestions']
    if actual_numbers != list(range(1, expected + 1)):
        return {'section': sid, 'path': row['path'], 'error': 'Question numbering did not match the exported count', 'expected': expected, 'found': actual_numbers}

    def between(s, start, end):
        return start <= position(s) < end

    def segments(start, end, left=42.5, right=None, masks=None):
        result = []
        for pi in range(start[0], end[0]+1):
            page = pages[pi]
            y0 = start[1] if pi == start[0] else 35.5
            y1 = end[1] if pi == end[0] else page['height'] - 38
            y0 = max(32, y0); y1 = min(page['height'] - 38, y1)
            if y1-y0 < 2: continue
            x1 = right or page['width']-42.5
            ink = [r for r in page['ink'] if r[2] > left and r[0] < x1 and r[3] > y0 and r[1] < y1 and r[3]-r[1] < 700]
            if ink:
                y0 = max(y0, min(r[1] for r in ink)-4)
                y1 = min(y1, max(r[3] for r in ink)+4)
            else:
                continue
            rect = [round(v, 3) for v in [left, y0, x1, y1]]
            applicable = [m['bbox'] for m in (masks or []) if m['page']==pi and m['bbox'][3] > y0 and m['bbox'][1] < y1]
            result.append({'page': pi, 'rect': rect, 'hideAnswerLabels': applicable})
        return result

    def image_markup(qid, part, clips, alt):
        return ''.join(f'<span class="pdf-shot"><img src="/api/question-image/{qid}/{part}/{i}.webp" alt="{html.escape(alt, quote=True)}"></span>' for i in range(len(clips)))

    questions = []; images = {}; review = []
    for i, anchor in enumerate(anchors):
        number = i+1
        qid = f'{sid}-q{number:04d}'
        start = position(anchor)
        end = position(anchors[i+1]) if i+1<len(anchors) else (len(pages)-1, pages[-1]['height']-38)
        members = [s for s in all_spans if between(s, start, end)]
        opts = sorted([s for s in members if re.fullmatch('[A-H]', s['text'].strip()) and 47 < s['bbox'][0] < 49.5 and 7.9 < s['bbox'][3]-s['bbox'][1] < 9.5], key=position)
        labels = sorted([s for s in members if '【答案】' in s['text']], key=position)
        explanations = sorted([s for s in members if '【解析】' in s['text']], key=position)
        explanation = explanations[0] if explanations else None
        if explanation: opts = [o for o in opts if position(o) < position(explanation)]
        letters = [o['text'].strip() for o in opts]
        if len(letters) != len(set(letters)) or not letters or letters != list('ABCDEFGH'[:len(letters)]):
            review.append({'id': qid, 'reason': 'Option sequence is not unambiguous', 'options': letters})
        marked = []
        for label in labels:
            matches = [o for o in opts if o['page']==label['page'] and abs((o['bbox'][1]+o['bbox'][3])/2-(label['bbox'][1]+label['bbox'][3])/2)<4]
            if len(matches)==1: marked.append(matches[0]['text'].strip())
        ring_marked = []
        for option in opts:
            yc = (option['bbox'][1]+option['bbox'][3])/2
            if any(abs((c[1]+c[3])/2-yc)<5 for c in pages[option['page']]['circles']): ring_marked.append(option['text'].strip())
        marked = sorted(set(marked)); ring_marked = sorted(set(ring_marked))
        verified = bool(marked) and marked == ring_marked and all(a in letters for a in marked)
        if not verified: review.append({'id': qid, 'reason': 'Answer label and bold ring did not independently agree', 'labels': marked, 'boldRings': ring_marked})
        # Source page linkage is retained even when a question cannot be auto-graded.
        qimages = {}
        stem_start = (anchor['page'], anchor['bbox'][3]+3)
        stem_end = (opts[0]['page'], opts[0]['bbox'][1]-7) if opts else ((explanation['page'],explanation['bbox'][1]-11) if explanation else end)
        qimages['stem'] = segments(stem_start, stem_end)
        options = []
        for j, option in enumerate(opts):
            letter = option['text'].strip()
            opt_start = (option['page'], option['bbox'][1]-7)
            opt_end = (opts[j+1]['page'],opts[j+1]['bbox'][1]-7) if j+1<len(opts) else ((explanation['page'],explanation['bbox'][1]-12) if explanation else end)
            # Exclude the source's circled answer letter; only its choice content is displayed.
            # Hide the separate 【答案】 annotation, never the mathematical option itself.
            qimages[f'option-{letter}'] = segments(opt_start,opt_end,left=63,masks=labels)
            if not qimages[f'option-{letter}']: verified=False
            options.append({'id':letter,'text':image_markup(qid,f'option-{letter}',qimages[f'option-{letter}'],f'原题选项 {letter}')})
        if explanation:
            qimages['analysis'] = segments((explanation['page'],explanation['bbox'][1]-10), (end[0], end[1]-10) if i+1<len(anchors) else end)
        else:
            qimages['analysis'] = []
            review.append({'id':qid,'reason':'No original explanation label was located'})
        stem_text = ' '.join(s['text'].strip() for s in members if stem_start <= position(s) < stem_end)
        source_label = f'{path.stem} · 第 {number} 题'
        question = {
            'id':qid,'subjectId':'calculus','chapterId':sid,
            'type': 'multiple' if len(marked)>1 else 'single',
            'stem':image_markup(qid,'stem',qimages['stem'],source_label),
            'options':options,'answer':marked if len(marked)>1 else (marked[0] if marked else '?'),
            'analysis':image_markup(qid,'analysis',qimages['analysis'],'原题解析'),
            'acceptedAnswers':[],'difficulty':'medium','tags':[section_number,path.stem],
            'sourceLabel':source_label,'searchText':source_label+' '+stem_text,
            'answerVerified':verified,
            'analysisMissing': not bool(explanation),
            'source':{'documentId':sid,'file':row['path'],'page':anchor['page']+1,'questionNumber':number,'sha256':row['sha256'],'answerEvidence':{'labels':marked,'boldRings':ring_marked}},
        }
        if not verified:
            # Preserve uncertain originals for self-review; never invent an answer.
            question['type']='solution'
            question['answer']='请对照原 PDF 的答案标记与解析'
        questions.append(question)
        images[qid] = {'documentId':sid,'parts':qimages}
    doc.close()
    return {'section':{'id':sid,'name':path.stem,'chapterNo':chapter_no,'number':section_number,'file':row['path'],'questionCount':expected,'pages':row['pages'],'sha256':row['sha256']},'questions':questions,'images':images,'review':review}

def main():
    inventory = json.loads((ROOT/'data/pdf-inventory.json').read_text())
    inventory.sort(key=lambda r:number_key(r['path']))
    results=[]
    with concurrent.futures.ProcessPoolExecutor(max_workers=4) as pool:
        for result in pool.map(index_pdf,inventory):
            results.append(result)
            print(json.dumps({'indexed':len(results),'total':len(inventory),'file':result.get('section',{}).get('name') if isinstance(result.get('section'),dict) else result.get('path'),'questions':len(result.get('questions',[]))},ensure_ascii=False),flush=True)
    errors=[r for r in results if r.get('error')]
    if errors:
        (ROOT/'data/extraction-errors.json').write_text(json.dumps(errors,ensure_ascii=False,indent=2))
        raise RuntimeError(f'{len(errors)} PDF inventories need review; original files were not changed')
    sections=[r['section'] for r in results]
    questions=[q for r in results for q in r['questions']]
    chapters=[]
    for n,name in CHAPTER_NAMES.items():
        children=[{'id':s['id'],'name':s['name'],'questionCount':s['questionCount'],'documentId':s['id']} for s in sections if s['chapterNo']==n]
        chapters.append({'id':f'chapter-{n}','name':f'第{n}章 {name}','children':children,'questionCount':sum(c['questionCount'] for c in children)})
    bank={'format':'shijie.bank.v1','revision':'pdf-'+hashlib.sha256(''.join(s['sha256'] for s in sections).encode()).hexdigest()[:16],'source':{'name':'NeuMathe 高等数学 · 本地 PDF 原题库','note':'来自你提供的七章 PDF 导出；原题、选项与解析以 PDF 原版面显示。'},'subjects':[{'id':'calculus','name':'高等数学','description':'已接入第 1–7 章原题','chapters':chapters}],'questions':questions,'importedAt':int(time.time()*1000),'sections':sections}
    render_index={'revision':bank['revision'],'documents':{s['id']:{'path':s['file'],'sha256':s['sha256'],'pages':s['pages']} for s in sections},'questions':{key:value for r in results for key,value in r['images'].items()}}
    (ROOT/'dist/data').mkdir(exist_ok=True)
    (ROOT/'dist/data/bank.json').write_text(json.dumps(bank,ensure_ascii=False,separators=(',',':')))
    (ROOT/'data/render-index.json').write_text(json.dumps(render_index,ensure_ascii=False,separators=(',',':')))
    review=[i for r in results for i in r['review']]
    report={'documents':len(sections),'pages':sum(s['pages'] for s in sections),'questions':len(questions),'answerVerified':sum(q['answerVerified'] for q in questions),'manualReview':sum(not q['answerVerified'] for q in questions),'analysisMissing':sum(q['analysisMissing'] for q in questions),'reviewItems':review,'originalFilesModified':False,'method':'PDF source geometry and two agreeing answer markers; no OCR or invented mathematical text.'}
    (ROOT/'data/extraction-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
    print(json.dumps({k:v for k,v in report.items() if k!='reviewItems'},ensure_ascii=False),flush=True)

if __name__=='__main__':main()
