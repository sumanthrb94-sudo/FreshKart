"use client";

import { useEffect, useState } from "react";
import { X, ZoomIn, ZoomOut } from "lucide-react";
import { cn } from "@/lib/utils";

/** Full-screen image viewer: click to zoom in/out (pan via native scroll
 *  when zoomed past the viewport), close via the X, backdrop click, or
 *  Escape. Pair with `useImageLightbox()` rather than rendering directly. */
function ImageLightbox({
  src,
  alt,
  onClose,
}: {
  src: string;
  alt: string;
  onClose: () => void;
}) {
  const [zoomed, setZoomed] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/90 animate-fade"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={alt || "Image preview"}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
      >
        <X className="h-5 w-5" />
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setZoomed((z) => !z);
        }}
        aria-label={zoomed ? "Zoom out" : "Zoom in"}
        className="absolute left-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
      >
        {zoomed ? <ZoomOut className="h-5 w-5" /> : <ZoomIn className="h-5 w-5" />}
      </button>

      <div
        className={cn(
          "h-full w-full",
          zoomed ? "overflow-auto" : "flex items-center justify-center overflow-hidden p-6"
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          onClick={(e) => {
            e.stopPropagation();
            setZoomed((z) => !z);
          }}
          className={cn(
            zoomed
              ? "m-auto max-w-none cursor-zoom-out"
              : "max-h-full max-w-full cursor-zoom-in object-contain"
          )}
        />
      </div>

      {alt && !zoomed && (
        <p className="pointer-events-none absolute inset-x-0 bottom-4 text-center text-xs text-white/70">
          {alt}
        </p>
      )}
    </div>
  );
}

/** `const lightbox = useImageLightbox(); <img onClick={() => lightbox.open(url, name)} />
 *  {lightbox.node}` — one hook call per screen covers every thumbnail on it. */
export function useImageLightbox() {
  const [state, setState] = useState<{ src: string; alt: string } | null>(null);

  return {
    open: (src: string, alt = "") => setState({ src, alt }),
    close: () => setState(null),
    node: state && <ImageLightbox src={state.src} alt={state.alt} onClose={() => setState(null)} />,
  };
}
