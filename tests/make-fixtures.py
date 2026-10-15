from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
from zipfile import ZipFile, ZIP_DEFLATED

out = Path(__file__).parent / 'fixtures'
out.mkdir(exist_ok=True)
image = Image.new('RGB', (1400, 600), 'white')
draw = ImageDraw.Draw(image)
font = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 60)
for y, word in zip((70, 180, 290, 400), ('curiosity', 'resilience', 'perspective', 'opportunity')):
    draw.text((80, y), word, font=font, fill='black')
image.save(out / 'printed-words.png')
image.save(out / 'scanned-words.pdf', 'PDF', resolution=150)
(out / 'words.txt').write_text('curiosity\nresilience\napple\nApple\n123', encoding='utf-8')
(out / 'words.csv').write_text('apple,苹果\nbanana,香蕉\n', encoding='utf-8')
with ZipFile(out / 'words.docx', 'w', ZIP_DEFLATED) as z:
    z.writestr('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>')
    z.writestr('_rels/.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>')
    z.writestr('word/document.xml', '<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>confidence achieve thoughtful</w:t></w:r></w:p></w:body></w:document>')

stream = b'BT /F1 24 Tf 60 730 Td (consistent progress confidence) Tj ET'
objects = [b'<< /Type /Catalog /Pages 2 0 R >>', b'<< /Type /Pages /Kids [3 0 R] /Count 1 >>', b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>', b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', b'<< /Length ' + str(len(stream)).encode() + b' >>\nstream\n' + stream + b'\nendstream']
pdf=bytearray(b'%PDF-1.4\n'); offsets=[0]
for i,obj in enumerate(objects,1):
    offsets.append(len(pdf)); pdf.extend(f'{i} 0 obj\n'.encode()+obj+b'\nendobj\n')
start=len(pdf);pdf.extend(f'xref\n0 {len(offsets)}\n0000000000 65535 f \n'.encode())
for offset in offsets[1:]:pdf.extend(f'{offset:010d} 00000 n \n'.encode())
pdf.extend(f'trailer\n<< /Size {len(offsets)} /Root 1 0 R >>\nstartxref\n{start}\n%%EOF\n'.encode())
(out/'text-words.pdf').write_bytes(pdf)
print('Created PNG, scanned PDF, text PDF, DOCX, TXT and CSV fixtures.')
