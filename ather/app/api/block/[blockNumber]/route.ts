import { NextRequest, NextResponse } from "next/server";
import { HttpError, loadBlockData, filterTransactions } from "@/lib/ethereum";

export const runtime = "nodejs";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return NextResponse.json({}, { status: 204, headers: CORS_HEADERS });
}

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ blockNumber: string }> }
) {
  const { blockNumber: raw } = await context.params;
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) {
    return NextResponse.json(
      { status: "error", detail: "Invalid block number." },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  try {
    const data = await loadBlockData(n);
    const links = filterTransactions(data);
    return NextResponse.json(
      { status: "success", links },
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (err: any) {
    if (err instanceof HttpError) {
      return NextResponse.json(
        { status: "error", detail: err.message },
        { status: err.status, headers: CORS_HEADERS }
      );
    }
    console.error(`Unexpected error processing block ${n}:`, err);
    return NextResponse.json(
      { status: "error", detail: `Unexpected error: ${err?.message || String(err)}` },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
