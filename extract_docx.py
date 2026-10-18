import zipfile
import xml.etree.ElementTree as ET
import sys
import os

def extract_text_from_docx(docx_path):
    try:
        with zipfile.ZipFile(docx_path) as docx:
            xml_content = docx.read('word/document.xml')
            tree = ET.XML(xml_content)
            
            # The XML namespace for word processing ml
            WORD_NAMESPACE = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
            PARA = WORD_NAMESPACE + 'p'
            TEXT = WORD_NAMESPACE + 't'
            
            paragraphs = []
            for paragraph in tree.iter(PARA):
                texts = [node.text
                         for node in paragraph.iter(TEXT)
                         if node.text]
                if texts:
                    paragraphs.append(''.join(texts))
            
            return '\n'.join(paragraphs)
    except Exception as e:
        return f"Error reading {docx_path}: {e}"

if __name__ == '__main__':
    folder = sys.argv[1]
    for filename in os.listdir(folder):
        if filename.endswith('.docx'):
            print("=========================================")
            print(f"FILE: {filename}")
            print("=========================================")
            print(extract_text_from_docx(os.path.join(folder, filename)))
            print("\n")
