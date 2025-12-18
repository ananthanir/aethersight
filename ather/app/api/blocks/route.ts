import { NextResponse } from "next/server";
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

export async function POST(req: Request) {
  let payload: BlockRangeRequest;
  try {
    payload = (await req.json()) as BlockRangeRequest;
  } catch {
    return NextResponse.json(
      { status: "error", detail: "Invalid JSON body." },
      { status: 400 }
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
      { status: 400 }
    );
  }

  if (start_block > end_block) {
    return NextResponse.json(
      { status: "error", detail: "start_block must be less than or equal to end_block" },
      { status: 400 }
    );
  }

  try {
    const blocks: any[] = [];
    for (let bn = start_block; bn <= end_block; bn++) {
      const data = await loadBlockData(bn);
      blocks.push(data);
    }
    const links = filterTransactionsRange(blocks);
    return NextResponse.json({ status: "success", links }, { status: 200 });
  } catch (err: any) {
    if (err instanceof HttpError) {
      return NextResponse.json(
        { status: "error", detail: err.message },
        { status: err.status }
      );
    }
    console.error(
      `Unexpected error processing block range ${start_block}-${end_block}:`,
      err
    );
    return NextResponse.json(
      { status: "error", detail: `Unexpected error: ${err?.message || String(err)}` },
      { status: 500 }
    );
  }
}
