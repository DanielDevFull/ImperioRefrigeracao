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
    // a Vercel restaurava o cache e publicava o globals.css antigo (e o dev servia CSS velho
    // depois de reiniciar). Sem ele, cada build e cada início do dev compilam o CSS de novo.
    turbopackFileSystemCacheForBuild: false,
    turbopackFileSystemCacheForDev: false,
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
