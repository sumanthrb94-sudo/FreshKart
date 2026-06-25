import { produceEmoji } from "@/lib/produce";
import { cn } from "@/lib/utils";

/**
 * Renders a product's photo when available, otherwise a tinted emoji tile so
 * the catalog always looks alive without relying on remote images.
 */
export function ProductThumb({
  name,
  imageUrl,
  size = 96,
  className,
}: {
  name: string;
  imageUrl?: string;
  size?: number;
  className?: string;
}) {
  const radius = size >= 80 ? "rounded-xl" : "rounded-lg";
  if (imageUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={imageUrl}
        alt={name}
        width={size}
        height={size}
        className={cn("shrink-0 object-cover", radius, className)}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center bg-raised",
        radius,
        className
      )}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.5) }}
    >
      <span>{produceEmoji(name)}</span>
    </div>
  );
}
