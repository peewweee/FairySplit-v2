import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // There is no sign-in or sign-up page any more: "Clock me in" on the landing page
  // opens a popup instead. An old link or bookmark lands on the landing page, and
  // whatever was on its query (an invite code, a sign-in problem) goes with it.
  async redirects() {
    return [
      { source: "/login", destination: "/", permanent: false },
      { source: "/signup", destination: "/", permanent: false },
    ];
  },
};

export default nextConfig;
