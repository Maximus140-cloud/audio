import type { NextConfig } from "next";
// @ts-expect-error next-pwa doesn't provide types out of the box
import withPWAInit from "next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
  skipWaiting: true,
  cacheStartUrl: true,
  dynamicStartUrl: false,
});

const nextConfig: NextConfig = {
  serverExternalPackages: ["pdf-parse", "epub2", "node-edge-tts", "ws"],
  turbopack: {},
};

export default withPWA(nextConfig);
