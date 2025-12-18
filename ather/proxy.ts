import { NextRequest, NextResponse } from "next/server";

function corsHeaders(origin?: string): HeadersInit {
  // Allow all origins by default; customize if needed
  const allowOrigin = "*";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  };
}

export default function proxy(req: NextRequest) {
  const headers = corsHeaders(req.headers.get("origin") || undefined);

  // Preflight request
  if (req.method === "OPTIONS") {
    return new NextResponse(null, { status: 204, headers });
  }

  const res = NextResponse.next();
  Object.entries(headers).forEach(([k, v]) => res.headers.set(k, v));
  return res;
}

export const config = {
  matcher: "/api/:path*",
};