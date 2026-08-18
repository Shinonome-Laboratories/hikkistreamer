import { useEffect, useRef, useState } from "react";
import type { Banner } from "../../shared/types";

interface BannerStripProps {
  banners: Banner[];
}

/**
 * Random banner strip shown above the video. Picks ONE banner per page load
 * (ref-guarded so later list updates never re-randomize what's on screen).
 * Renders nothing when there are no banners.
 */
export function BannerStrip({ banners }: BannerStripProps) {
  const pickedRef = useRef(false);
  const [chosen, setChosen] = useState<Banner | null>(null);

  useEffect(() => {
    if (pickedRef.current || banners.length === 0) {
      return;
    }
    pickedRef.current = true;
    setChosen(banners[Math.floor(Math.random() * banners.length)]);
  }, [banners]);

  if (!chosen) {
    return null;
  }

  return (
    <div className="w-full shrink-0 overflow-hidden bg-background py-2">
      <img src={chosen.url} alt="Banner" className="h-24 w-full object-contain" />
    </div>
  );
}
