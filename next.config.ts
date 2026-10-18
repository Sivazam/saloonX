import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // NOTE: do NOT set typescript.ignoreBuildErrors — it masks real regressions
  // (a prior commit shipped 4 broken legacy routes that crashed tsc but the
  // build still passed). The app's src/ is type-clean; examples/ is excluded
  // in tsconfig.json so its socket.io reference snippets don't gate the build.
  reactStrictMode: false,
};

export default nextConfig;
