import type { NextConfig } from "next";

// En GitHub Pages la app vive bajo /<repo>/; en `next dev` debe ser '' o `/` da 404.
const repoBase =
  process.env.GITHUB_PAGES_BASE_PATH ?? "/cv";

const nextConfig: NextConfig = {
  
  
  env: {
    // Mirrors basePath so client code (audio/asset URLs) can prefix correctly.
    NEXT_PUBLIC_BASE_PATH: process.env.NODE_ENV === "production" ? repoBase : "",
  },
  images: {
    unoptimized: true, // GitHub Pages no soporta la optimización de imágenes nativa de Next.js
  },
};

export default nextConfig;
