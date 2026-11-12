"""Video provider adapters: pick an embeddable player from a URL, no code changes per provider."""

import re
from urllib.parse import parse_qs, urlparse

_YT_ID = re.compile(r"^[A-Za-z0-9_-]{6,20}$")


def _youtube(url):
    p = urlparse(url)
    host = p.netloc.lower().removeprefix("www.").removeprefix("m.")
    vid = None
    if host == "youtu.be":
        vid = p.path.lstrip("/").split("/")[0]
    elif host in ("youtube.com", "youtube-nocookie.com"):
        if p.path == "/watch":
            vid = parse_qs(p.query).get("v", [None])[0]
        elif p.path.startswith(("/embed/", "/live/", "/shorts/")):
            vid = p.path.split("/")[2]
    if vid and _YT_ID.match(vid):
        return {
            "provider": "youtube",
            "video_id": vid,
            "embed_url": f"https://www.youtube-nocookie.com/embed/{vid}?rel=0&modestbranding=1",
            "thumbnail_url": f"https://i.ytimg.com/vi/{vid}/hqdefault.jpg",
        }
    return None


def _vimeo(url):
    p = urlparse(url)
    if p.netloc.lower().removeprefix("www.") in ("vimeo.com", "player.vimeo.com"):
        m = re.search(r"/(\d{5,12})", p.path)
        if m:
            return {"provider": "vimeo", "video_id": m.group(1), "embed_url": f"https://player.vimeo.com/video/{m.group(1)}"}
    return None


def _bunny(url):
    p = urlparse(url)
    if p.netloc.lower() in ("iframe.mediadelivery.net", "player.mediadelivery.net"):
        return {"provider": "bunny", "video_id": p.path.strip("/"), "embed_url": url}
    return None


def _direct(url):
    if urlparse(url).path.lower().endswith((".mp4", ".webm", ".m3u8")):
        return {"provider": "file", "video_id": None, "embed_url": url}
    return None


ADAPTERS = [_youtube, _vimeo, _bunny, _direct]


def resolve_video(url):
    if not url:
        return None
    for adapter in ADAPTERS:
        result = adapter(url)
        if result:
            result.setdefault("thumbnail_url", None)
            return result
    return {"provider": "link", "video_id": None, "embed_url": None, "thumbnail_url": None, "url": url}


def detect_meeting_platform(url):
    host = urlparse(url or "").netloc.lower()
    for needle, name in (("zoom.", "Zoom"), ("meet.google.", "Google Meet"), ("teams.", "Microsoft Teams"),
                         ("webex.", "Webex"), ("whereby.", "Whereby"), ("jit.si", "Jitsi")):
        if needle in host:
            return name
    return "Online meeting"
