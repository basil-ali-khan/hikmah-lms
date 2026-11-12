"use client";

import { Play } from "lucide-react";
import { useState } from "react";

import type { Video } from "@/lib/types";

/**
 * Provider-agnostic player. Nothing loads until the student taps play (saves data on mobile),
 * and embeds use privacy-friendly hosts (youtube-nocookie).
 */
export function VideoPlayer({ video, title }: { video: Video; title: string }) {
  const [playing, setPlaying] = useState(false);
  if (!video) return null;

  if (video.provider === "link" || !video.embed_url) {
    return (
      <a href={video.url} target="_blank" rel="noopener noreferrer" className="flex aspect-video w-full items-center justify-center bg-ink text-white underline">
        Open video in a new tab
      </a>
    );
  }

  if (!playing) {
    return (
      <button
        type="button"
        onClick={() => setPlaying(true)}
        className="group relative flex aspect-video w-full items-center justify-center overflow-hidden bg-ink"
        aria-label={`Play video: ${title}`}
      >
        {video.thumbnail_url && (
          // eslint-disable-next-line @next/next/no-img-element -- provider thumbnail, already sized
          <img src={video.thumbnail_url} alt="" className="absolute inset-0 size-full object-cover opacity-60" loading="lazy" />
        )}
        <span className="relative flex size-16 items-center justify-center rounded-full bg-accent shadow-lg transition-transform group-hover:scale-105">
          <Play className="ml-1 size-7 fill-ink text-ink" aria-hidden />
        </span>
        <span className="absolute bottom-3 left-3 rounded bg-black/60 px-2 py-1 text-xs text-white">Tap to play</span>
      </button>
    );
  }

  if (video.provider === "file") {
    return <video src={video.embed_url} controls autoPlay playsInline className="aspect-video w-full bg-black" />;
  }

  const src = video.embed_url + (video.embed_url.includes("?") ? "&" : "?") + "autoplay=1";
  return (
    <iframe
      src={src}
      title={title}
      className="aspect-video w-full bg-black"
      allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
      allowFullScreen
      referrerPolicy="strict-origin-when-cross-origin"
    />
  );
}
