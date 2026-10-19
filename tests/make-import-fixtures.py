from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
from reportlab.pdfgen.canvas import Canvas
from reportlab.lib.utils import ImageReader
from reportlab.lib.pdfencrypt import StandardEncryption
import json

folder = Path(__file__).parent / 'fixtures' / 'imports'
folder.mkdir(parents=True, exist_ok=True)
words = ['curiosity', 'resilience', 'perspective', 'opportunity', 'knowledge', 'thoughtful', 'progress', 'achieve', 'confidence', 'consistent', 'recognize', 'subtle']
meanings = ['好奇心', '适应力', '观点', '机会', '知识', '体贴的', '进步', '实现', '信心', '一致的', '认出', '微妙的']
font = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 25)
cjk = ImageFont.truetype('C:/Windows/Fonts/simhei.ttf', 25)
image = Image.new('RGB', (850, 650), (240, 240, 235))
draw = ImageDraw.Draw(image)
for i, (word, meaning) in enumerate(zip(words, meanings)):
    y = 24 + i*48
    draw.text((38, y), word, font=font, fill=(70, 70, 70))
    draw.text((385, y), meaning, font=cjk, fill=(75, 75, 75))
image = image.rotate(1.8, expand=True, fillcolor=(240, 240, 235))
image.save(folder / 'mixed-vocabulary.png')
text = Canvas(str(folder / 'text.pdf'), pagesize=(595, 842))
for offset in (0, 6):
    text.setFont('Helvetica', 18)
    for i, word in enumerate(words[offset:offset+6]):
        text.drawString(60, 760-i*60, word)
    text.showPage()
text.save()
for filename, header in [('scan.pdf', False), ('hybrid.pdf', True)]:
    pdf = Canvas(str(folder / filename), pagesize=(595, 842))
    if header:
        pdf.setFont('Helvetica', 12)
        pdf.drawString(35, 800, 'Lesson one English vocabulary')
    pdf.drawImage(ImageReader(image), 25, 170, width=545, height=480, preserveAspectRatio=True)
    pdf.save()
secure = Canvas(str(folder / 'locked.pdf'), encrypt=StandardEncryption('test-password'))
secure.drawString(40, 750, 'Private vocabulary')
secure.save()
(folder / 'expected.json').write_text(json.dumps(words), encoding='utf-8')
print('Created synthetic text, scanned, hybrid and password-protected PDF fixtures.')
