"""Clean a saved ChatGPT page snapshot so it can be committed and shown to Droid.

A raw `copy(document.documentElement.outerHTML)` holds more than the test conversation: the
sidebar's chat titles, the account's name or email, and data inside <script> tags. This keeps
the page structure the adapter selectors need and removes:
- <script>, <style>, <noscript>, <svg>, <img>, <link>, <meta>, <iframe>, <template>
- the sidebar: <nav>, <aside>, and every <a> linking to a conversation (/c/...) or project (/g/...)
- any attribute, on any tag, whose value holds such a link (href on <area>, data-url, srcset, ...)
- inline style attributes, and data-* attributes holding account, conversation or user ids
- anything that looks like an email address (masked)
Then it reports what it removed, and exits 1 if any email or conversation link is left anywhere,
including in plain text, which it doesn't rewrite. Callers treat that as "don't use this page".

Usage: py sandbox_jobs/samples/clean_snapshot.py RAW.html CLEAN.html
"""

import re
import sys
from pathlib import Path

from bs4 import BeautifulSoup

EMAIL = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
DROP_TAGS = ["script", "style", "noscript", "svg", "img", "link", "meta", "iframe", "template"]
SIDEBAR_TAGS = ["nav", "aside"]
ID_ATTRS = re.compile(r"^data-.*(conversation|account|user|workspace|org|project|session)-?id", re.I)
# A conversation or project path, relative (/c/<id>) or on any host (https://chatgpt.com/g/<id>).
CONV_LINK = re.compile(r"(?:https?://[^\s\"'<>/]+|(?<![\w.]))/(?:c|g)/[A-Za-z0-9][\w-]*")


def clean(raw_html):
    soup = BeautifulSoup(raw_html, "html.parser")
    removed = {}
    for name in DROP_TAGS + SIDEBAR_TAGS:
        found = soup.find_all(name)
        removed[name] = len(found)
        for el in found:
            el.decompose()
    links = soup.find_all("a", href=re.compile(r"^/(c|g)/"))
    removed["conversation_links"] = len(links)
    for el in links:
        el.decompose()
    attrs = link_attrs = 0
    for el in soup.find_all(True):
        for k in list(el.attrs):
            value = el.attrs[k]
            value = " ".join(value) if isinstance(value, list) else str(value)
            if CONV_LINK.search(value):
                del el.attrs[k]
                link_attrs += 1
            elif k == "style" or ID_ATTRS.match(k):
                del el.attrs[k]
                attrs += 1
    removed["attributes"] = attrs
    removed["link_attributes"] = link_attrs
    html = str(soup)
    html, emails = EMAIL.subn("<email removed>", html)
    removed["emails"] = emails
    return html, removed


def main(src, dst):
    html, removed = clean(Path(src).read_text(encoding="utf-8"))
    Path(dst).write_text(html, encoding="utf-8")
    left_emails = len(EMAIL.findall(html))
    left_links = len(CONV_LINK.findall(html))
    print(f"removed: {removed}")
    print(f"size: {len(Path(src).read_text(encoding='utf-8')):,} -> {len(html):,} characters")
    print(f"left: {left_emails} email-like strings, {left_links} conversation links")
    return 0 if left_emails == 0 and left_links == 0 else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1], sys.argv[2]))
