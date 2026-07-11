import Image from "next/image";
import { produceEmoji } from "@/lib/produce";
import { cn } from "@/lib/utils";

/**
 * Renders a product's photo when available, otherwise a tinted emoji tile so
 * the catalog always looks alive without relying on remote images.
 *
 * - Pass `size` for a fixed square thumbnail (default).
 * - Pass `fill` for a responsive thumbnail that fills its parent. The parent
 *   must establish its own size or aspect ratio.
 */
export function ProductThumb({
  name,
  imageUrl,
  size = 96,
  fill = false,
  className,
}: {
  name: string;
  imageUrl?: string;
  size?: number;
  fill?: boolean;
  className?: string;
}) {
  const radius = size >= 80 ? "rounded-xl" : "rounded-lg";
  const sharedClass = cn(
    "shrink-0 object-cover",
    fill && "h-full w-full",
    radius,
    className
  );

  if (imageUrl) {
    if (fill) {
      return <Image src={imageUrl} alt={name} fill sizes="(max-width: 768px) 96px, 20vw" className={sharedClass} />;
    }
    return (
      <Image
        src={imageUrl}
        alt={name}
        width={size}
        height={size}
        sizes={`${size}px`}
        className={sharedClass}
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <div
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden bg-raised",
        radius,
        className
      )}
      style={fill ? undefined : { width: size, height: size, fontSize: Math.round(size * 0.5) }}
    >
      <span className={cn(fill && "text-[4rem]")}>{produceEmoji(name)}</span>
    </div>
  );
}
