import { NextResponse } from "next/server";
import { HttpError, loadBlockData, filterTransactions } from "@/lib/ethereum";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  context: { params: { blockNumber: string } }
) {
  const raw = context.params.blockNumber;
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) {
    return NextResponse.json(
      { status: "error", detail: "Invalid block number." },
      { status: 400 }
    );
  }

  try {
    const data = await loadBlockData(n);
    const links = filterTransactions(data);
    return NextResponse.json({ status: "success", links }, { status: 200 });
  } catch (err: any) {
    if (err instanceof HttpError) {
      return NextResponse.json(
        { status: "error", detail: err.message },
        { status: err.status }
      );
    }
    console.error(`Unexpected error processing block ${n}:`, err);
    return NextResponse.json(
      { status: "error", detail: `Unexpected error: ${err?.message || String(err)}` },
      { status: 500 }
    );
  }
}
