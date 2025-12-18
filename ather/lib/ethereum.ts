import path from "path";
import fs from "fs/promises";

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function getAlchemyUrl(): string {
  const key = process.env.ALCHEMY_API_KEY;
  if (!key) {
    throw new HttpError(500, "ALCHEMY_API_KEY environment variable is required");
  }
  return `https://eth-mainnet.g.alchemy.com/v2/${key}`;
}

function getCacheFilePath(blockNumber: number) {
  // Store cache inside project root under ./data
  return path.join(process.cwd(), "data", `${blockNumber}.json`);
}

export async function loadBlockData(blockNumber: number): Promise<any> {
  const filename = getCacheFilePath(blockNumber);

  try {
    const contents = await fs.readFile(filename, "utf-8");
    return JSON.parse(contents);
  } catch (_) {
    // Cache miss, continue to fetch
  }

  const params = ["0x" + blockNumber.toString(16), true];
  const payload = {
    jsonrpc: "2.0",
    method: "eth_getBlockByNumber",
    params,
    id: 1,
  };

  let data: any;
  try {
    const res = await fetch(getAlchemyUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      throw new HttpError(500, `Network error: ${res.status} ${res.statusText}`);
    }
    data = await res.json();
  } catch (err: any) {
    if (err instanceof HttpError) throw err;
    throw new HttpError(500, `Network error: ${err?.message || String(err)}`);
  }

  if (data && data.error) {
    throw new HttpError(
      400,
      `Ethereum API error: ${data.error?.message || "Unknown error"}`
    );
  }

  if (!data || data.result == null) {
    throw new HttpError(
      404,
      `Block ${blockNumber} not found. Block may not exist yet or is invalid.`
    );
  }

  try {
    await fs.mkdir(path.dirname(filename), { recursive: true });
    await fs.writeFile(filename, JSON.stringify(data), "utf-8");
  } catch (_) {
    // Ignore cache write errors (e.g., read-only fs on some hosts)
  }

  return data;
}

export function filterTransactions(data: any): string {
  const transactions: any[] = data?.result?.transactions ?? [];
  const filtered: Array<Record<string, string>> = [];
  for (const tx of transactions) {
    const fromAddr = tx?.from;
    const toAddr = tx?.to;
    if (!fromAddr || !toAddr) continue;
    filtered.push({ [fromAddr]: toAddr });
  }
  return JSON.stringify(filtered);
}

export function filterTransactionsRange(blocksData: any[]): string {
  const aggregated: Array<Record<string, string>> = [];
  for (const block of blocksData) {
    const txs: any[] = block?.result?.transactions ?? [];
    if (!txs || txs.length === 0) continue;
    for (const tx of txs) {
      const fromAddr = tx?.from;
      const toAddr = tx?.to;
      if (!fromAddr || !toAddr) continue;
      aggregated.push({ [fromAddr]: toAddr });
    }
  }
  return JSON.stringify(aggregated);
}
