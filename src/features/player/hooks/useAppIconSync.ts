import soniqMark from "@/assets/soniq-mark.png";
import { useEffect } from "react";
import { useTheme } from "next-themes";
import { usePlayerStore, type AccentVariant } from "../store/playerStore";

async function renderIconDataUrl(
  logoSrc: string,
  isLight: boolean,
  shouldInvert: boolean,
): Promise<string> {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  ctx.beginPath();
  if (typeof ctx.roundRect === "function") {
    ctx.roundRect(0, 0, 512, 512, 112);
  } else {
    ctx.rect(0, 0, 512, 512);
  }
  ctx.fillStyle = isLight ? "#f5f5f7" : "#0d0d10";
  ctx.fill();

  ctx.lineWidth = 2;
  ctx.strokeStyle = isLight ? "rgba(0, 0, 0, 0.08)" : "rgba(255, 255, 255, 0.08)";
  ctx.stroke();

  const img = new Image();
  img.crossOrigin = "anonymous";
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Failed to load branding logo for icon"));
    img.src = logoSrc;
  });

  if (isLight && shouldInvert) {
    ctx.filter = "invert(1)";
  }

  // the Soniq mark is square: centre it with the same breathing room as before
  ctx.drawImage(img, 106, 106, 300, 300);
  return canvas.toDataURL("image/png");
}

export function useAppIconSync() {
  const accentVariant = usePlayerStore((state) => state.accentVariant);
  const { theme, resolvedTheme } = useTheme();

  useEffect(() => {
    const isLight = (resolvedTheme || theme) === "light";
    const shouldInvert = true;
    const logoSrc = soniqMark;
    let active = true;

    void renderIconDataUrl(logoSrc, isLight, shouldInvert).then((dataUrl) => {
      if (!active || !dataUrl) return;

      if (window.linerElectron?.setAppIcon) {
        window.linerElectron.setAppIcon(dataUrl, {
          isDefault: accentVariant === "default",
        });
      }

      let favicon = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
      if (!favicon) {
        favicon = document.createElement("link");
        favicon.rel = "icon";
        document.head.appendChild(favicon);
      }
      favicon.href = dataUrl;
    });

    return () => {
      active = false;
    };
  }, [accentVariant, theme, resolvedTheme]);
}
