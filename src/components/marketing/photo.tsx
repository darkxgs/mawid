import Image from "next/image";
import { cn } from "@/components/ui";
import type { Photo as PhotoData } from "@/lib/media";

/** A photo that fills its box; the box keeps a quiet colour while it loads. */
export function Photo({
  photo,
  sizes,
  priority,
  className,
  imgClassName,
}: {
  photo: PhotoData;
  sizes: string;
  priority?: boolean;
  className?: string;
  imgClassName?: string;
}) {
  return (
    <div className={cn("relative overflow-hidden bg-[#d9d4cb]", className)}>
      <Image src={photo.src} alt={photo.alt} fill sizes={sizes} priority={priority} className={cn("object-cover", imgClassName)} />
    </div>
  );
}
