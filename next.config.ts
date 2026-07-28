import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // unpdf (wraps pdf.js) and mammoth don't bundle cleanly for the server
  // runtime (dynamic requires / large assets) — keep them as real Node
  // dependencies instead of trying to bundle them.
  serverExternalPackages: ["unpdf", "mammoth"],
};

export default nextConfig;
