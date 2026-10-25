import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  images: {
    remotePatterns: [{ protocol: "https", hostname: "*.public.blob.vercel-storage.com" }],
  },
  experimental: {
    // Vercel recusa requisições acima de 4,5 MB; uploads ficam em MAX_UPLOAD_BYTES (4 MB, src/lib/upload.ts)
    serverActions: { bodySizeLimit: "4.5mb" },
    // O cache em disco do Turbopack não invalida o CSS que passa pelo loader do Tailwind:
    // a Vercel restaurava o cache e publicava o globals.css antigo. Sem ele, cada build compila
    // o CSS de novo. (No dev o cache fica ligado: desligado, o next/font quebra no Turbopack;
    // se o CSS parecer velho no dev, apague .next/dev e reinicie.)
    turbopackFileSystemCacheForBuild: false,
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
