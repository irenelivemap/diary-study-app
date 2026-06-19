/**
 * Next.js configuration for the app build and runtime behavior.
 */
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
