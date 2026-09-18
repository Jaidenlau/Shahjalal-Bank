import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The floating dev badge sits over page content and would be visible on the
  // projector. Off in every mode.
  devIndicators: false,
  // Nothing in this build may reach the network at runtime: the venue may have
  // no usable internet.
  images: { unoptimized: true },
  eslint: { ignoreDuringBuilds: false },
  typescript: { ignoreBuildErrors: false },
};

export default nextConfig;
