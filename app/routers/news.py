"""Related news for a month, from Google News RSS search, cached on disk."""
from __future__ import annotations

import json
import re
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from email.utils import parsedate_to_datetime

from fastapi import APIRouter, HTTPException, Query

from app.config import settings

router = APIRouter()
CACHE = settings.root / "data" / "news"
RSS = "https://news.google.com/rss/search"


def fetch(month: str) -> list[dict]:
    y, m = int(month[:4]), int(month[5:7])
    ny, nm = (y + 1, 1) if m == 12 else (y, m + 1)
    q = f"philippines inflation after:{y}-{m:02d}-01 before:{ny}-{nm:02d}-01"
    params = urllib.parse.urlencode({"q": q, "hl": "en-PH", "gl": "PH", "ceid": "PH:en"})
    req = urllib.request.Request(f"{RSS}?{params}", headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=8) as r:
        root = ET.fromstring(r.read())
    rows = []
    for item in root.iter("item"):
        link, src = item.findtext("link", ""), item.find("source")
        if not link.startswith(("http://", "https://")):
            continue
        domain = (src.text or "") if src is not None else ""
        title = item.findtext("title", "")
        if domain and title.endswith(f" - {domain}"):
            title = title[: -len(domain) - 3]
        try:
            date = parsedate_to_datetime(item.findtext("pubDate", "")).strftime("%Y%m%d")
        except (TypeError, ValueError):
            date = ""
        # shortcut: RSS gives no image or snippet and links go through a Google redirect, so cards show headline and Read more only; switch to a paid news API if images and summaries matter
        rows.append({"url": link, "title": title, "domain": domain, "date": date, "image": "", "summary": ""})
        if len(rows) == 3:
            break
    return rows


@router.get("/news")
def news(month: str = Query(...)):
    if not re.fullmatch(r"\d{4}-(0[1-9]|1[0-2])-01", month):
        raise HTTPException(422, "month must look like YYYY-MM-01")
    path = CACHE / f"{month}.json"
    if path.exists():
        return {"data": json.loads(path.read_text("utf-8")), "meta": {"cache": "hit"}}
    try:
        rows = fetch(month)
    except Exception as e:  # shortcut: any feed failure returns no articles and is not cached; add retry/backoff if it fails often
        return {"data": [], "meta": {"error": str(e)[:200]}}
    if rows:  # an empty month is not cached, so it is retried next time
        CACHE.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(rows), "utf-8")
    return {"data": rows, "meta": {"cache": "miss"}}
