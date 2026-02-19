import { NextRequest, NextResponse } from "next/server";
import {
  HttpError,
  loadBlockData,
  filterTransactionsRange,
} from "@/lib/ethereum";

export const runtime = "nodejs";

type BlockRangeRequest = {
  start_block: number;
  end_block: number;
};

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return NextResponse.json({}, { status: 204, headers: CORS_HEADERS });
}

export async function POST(req: NextRequest) {
  let payload: BlockRangeRequest;
  try {
    payload = (await req.json()) as BlockRangeRequest;
  } catch {
    return NextResponse.json(
      { status: "error", detail: "Invalid JSON body." },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  const { start_block, end_block } = payload || {} as BlockRangeRequest;

  if (
    !Number.isInteger(start_block) ||
    !Number.isInteger(end_block) ||
    start_block < 0 ||
    end_block < 0
  ) {
    return NextResponse.json(
      { status: "error", detail: "start_block and end_block must be non-negative integers" },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  if (start_block > end_block) {
    return NextResponse.json(
      { status: "error", detail: "start_block must be less than or equal to end_block" },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  try {
    const blocks: any[] = [];
    for (let bn = start_block; bn <= end_block; bn++) {
      const data = await loadBlockData(bn);
      blocks.push(data);
    }
    const links = filterTransactionsRange(blocks);
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
    console.error(
      `Unexpected error processing block range ${start_block}-${end_block}:`,
      err
    );
    return NextResponse.json(
      { status: "error", detail: `Unexpected error: ${err?.message || String(err)}` },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
