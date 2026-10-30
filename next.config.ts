import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  devIndicators: false,
  images: {
    formats: ["image/avif", "image/webp"],
  },
  // Photos and the hero film rarely change; let browsers keep them for a week.
  async headers() {
    return [{ source: "/media/:file*", headers: [{ key: "Cache-Control", value: "public, max-age=604800, stale-while-revalidate=86400" }] }];
  },
  // PGlite (local dev database) loads its WASM and extensions from disk at
  // runtime, so it must not be bundled.
  serverExternalPackages: ["@electric-sql/pglite"],
  // Its WASM, data file and the btree_gist extension are read from disk.
  outputFileTracingIncludes: {
    "/**": [
      "./node_modules/@electric-sql/pglite/dist/pglite.wasm",
      "./node_modules/@electric-sql/pglite/dist/pglite.data",
      "./node_modules/@electric-sql/pglite/dist/initdb.wasm",
      "./node_modules/@electric-sql/pglite/dist/btree_gist.tar.gz",
    ],
  },
  partialPrefetching: true,
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
