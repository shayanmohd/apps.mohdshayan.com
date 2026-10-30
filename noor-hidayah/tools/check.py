"""Check generated pages and local destinations without making network requests."""
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit, unquote
import json

SITE=Path(__file__).resolve().parents[1]
PAGES=['index.html','for-pilgrims.html','for-operators.html','about.html','contact.html','terms.html']
class Page(HTMLParser):
 def __init__(self,text):
  super().__init__();self.tags=[];self.ids=set();self.links=[];self.resources=[];self.feed(text)
 def handle_starttag(self,tag,attrs):
  a=dict(attrs);self.tags.append((tag,a))
  if 'id' in a:
   assert a['id'] not in self.ids, f"duplicate ID {a['id']}"
   self.ids.add(a['id'])
  if tag=='a':self.links.append(a.get('href',''))
  if tag in ['img','script','link']:
   attr='href' if tag=='link' else 'src'
   if attr in a and not (tag=='link' and a.get('rel')=='canonical'):self.resources.append(a[attr])
  if tag=='img':assert 'alt' in a and 'width' in a and 'height' in a, a

parsed={name:Page((SITE/name).read_text()) for name in PAGES}
for name,p in parsed.items():
 text=(SITE/name).read_text()
 assert '—' not in text and '–' not in text, name
 assert '8920463911' not in text.replace(' ','') and 'wa.me' not in text, name
 assert sum(tag=='h1' for tag,a in p.tags)==1, name
 assert not any(tag in ['script','iframe','form'] for tag,a in p.tags), name
 assert any(tag=='link' and a.get('rel')=='canonical' for tag,a in p.tags),name
 for resource in p.resources:
  u=urlsplit(resource);assert not u.scheme and not u.netloc,(name,resource)
  assert (SITE/u.path).is_file(),(name,resource)
 for href in p.links:
  u=urlsplit(href)
  if u.scheme or u.netloc:continue
  target=(SITE/unquote(u.path)) if u.path else SITE/name
  if target.is_dir():target=target/'index.html'
  assert target.is_file(),(name,href)
  if u.fragment:
   target_page=parsed.get(target.name) or Page(target.read_text())
   assert unquote(u.fragment) in target_page.ids,(name,href)
assert sum(tag=='section' for tag,a in parsed['index.html'].tags)==7
assert all(url.startswith('assets/') for p in parsed.values() for url in p.resources)
# The draft's source is stored explicitly; its wording is preserved by the renderer.
source=json.loads((SITE/'tools/terms-source.json').read_text())
assert len(source['sections'])==11
assert 'Draft for legal review. Not yet in force.' in (SITE/'terms.html').read_text()
assert '<meta name="robots" content="noindex">' in (SITE/'terms.html').read_text()
assert 'terms.html' not in (SITE/'sitemap.xml').read_text()
print('6 pages: links/fragments, local assets, one h1, 7 homepage sections, no script/form/analytics, no SOSA phone and no em/en dashes passed.')
