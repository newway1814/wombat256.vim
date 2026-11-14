"""Split markdown documents into chunks at their headings."""

import re
from dataclasses import dataclass
from pathlib import Path

MAX_CHARS = 1500
HEADING = re.compile(r"^(#{1,3})\s+(.*)$")


@dataclass(frozen=True)
class Chunk:
    id: str  # "<doc_id>#<n>"
    doc_id: str
    doc_title: str
    heading: str
    text: str

    def for_embedding(self) -> str:
        """What gets embedded: the document title and heading give the body its context."""
        return f"{self.doc_title}\n{self.heading}\n{self.text}"


def _split_long(body: str) -> list[str]:
    if len(body) <= MAX_CHARS:
        return [body]
    parts, current = [], ""
    for para in body.split("\n\n"):
        if current and len(current) + len(para) + 2 > MAX_CHARS:
            parts.append(current)
            current = para
        else:
            current = f"{current}\n\n{para}" if current else para
    if current:
        parts.append(current)
    return parts


def chunk_markdown(text: str, doc_id: str) -> list[Chunk]:
    """The H1 is the document title; each H2/H3 section becomes one chunk (or more if long).

    Text before the first H2 (scope lines, dates) becomes an "Overview" chunk.
    """
    title = doc_id
    sections: list[tuple[str, list[str]]] = [("Overview", [])]
    for line in text.splitlines():
        m = HEADING.match(line)
        if m and len(m.group(1)) == 1:
            title = m.group(2).strip()
        elif m:
            sections.append((m.group(2).strip(), []))
        else:
            sections[-1][1].append(line)

    chunks: list[Chunk] = []
    for heading, lines in sections:
        body = "\n".join(lines).strip()
        if not body:
            continue
        for part in _split_long(body):
            chunks.append(Chunk(f"{doc_id}#{len(chunks) + 1}", doc_id, title, heading, part))
    return chunks


def chunk_directory(*dirs: Path) -> list[Chunk]:
    chunks: list[Chunk] = []
    for d in dirs:
        for path in sorted(d.glob("*.md")):
            chunks.extend(chunk_markdown(path.read_text(encoding="utf-8"), path.stem))
    return chunks
