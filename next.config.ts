import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
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
