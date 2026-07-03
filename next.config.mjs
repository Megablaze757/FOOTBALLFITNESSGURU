/** @type {import('next').NextConfig} */

// Base path for GitHub Pages project sites (https://user.github.io/<repo>/).
// The deploy workflow sets NEXT_PUBLIC_BASE_PATH=/<repo>. Empty for local dev,
// user/org root sites, and custom domains.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

const nextConfig = {
  output: "export", // fully static — runs on GitHub Pages (no Node server)
  images: { unoptimized: true },
  basePath,
  assetPrefix: basePath || undefined,
  trailingSlash: true,
  reactStrictMode: true,
};

export default nextConfig;
