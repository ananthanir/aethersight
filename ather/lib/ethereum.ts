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
  // return `https://eth-mainnet.g.alchemy.com/v2/${key}`;
  return `https://polygon-mainnet.g.alchemy.com/v2/${key}`;

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

// Check if address is a contract using eth_getCode
async function isContract(address: string): Promise<boolean> {
  const payload = {
    jsonrpc: "2.0",
    method: "eth_getCode",
    params: [address, "latest"],
    id: 1,
  };

  try {
    const res = await fetch(getAlchemyUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return false;
    const data = await res.json();
    const code = data?.result;
    // If code is "0x" or empty, it's an EOA; otherwise it's a contract
    return code && code !== "0x" && code.length > 2;
  } catch {
    return false;
  }
}

// Batch check multiple addresses for contract status
async function checkContractAddresses(addresses: string[]): Promise<Map<string, boolean>> {
  const results = new Map<string, boolean>();
  const uniqueAddresses = [...new Set(addresses)];
  
  // Process in parallel with concurrency limit
  const batchSize = 10;
  for (let i = 0; i < uniqueAddresses.length; i += batchSize) {
    const batch = uniqueAddresses.slice(i, i + batchSize);
    const checks = await Promise.all(batch.map(async (addr) => {
      const isContractAddr = await isContract(addr);
      return { addr, isContractAddr };
    }));
    for (const { addr, isContractAddr } of checks) {
      results.set(addr, isContractAddr);
    }
  }
  
  return results;
}

export type LinkItem = { from: string; to: string; hash?: string; gasPrice?: string; fromIsContract?: boolean; toIsContract?: boolean } | Record<string, string>;

export async function filterTransactions(data: any): Promise<string> {
  const transactions: any[] = data?.result?.transactions ?? [];
  const preliminaryLinks: Array<{ from: string; to: string; hash?: string; gasPrice?: string }> = [];
  
  for (const tx of transactions) {
    const fromAddr = tx?.from as string | undefined;
    const toAddr = tx?.to as string | undefined;
    const hash = (tx?.hash as string | undefined) ?? (tx?.transactionHash as string | undefined);
    const gasPrice = tx?.gasPrice as string | undefined;
    if (!fromAddr || !toAddr) continue;
    preliminaryLinks.push({ from: fromAddr, to: toAddr, hash, gasPrice });
  }

  // Collect all unique addresses
  const allAddresses = preliminaryLinks.flatMap(l => [l.from, l.to]);
  const contractMap = await checkContractAddresses(allAddresses);

  // Build final links with contract flags
  const filtered: Array<LinkItem> = preliminaryLinks.map(l => ({
    from: l.from,
    to: l.to,
    hash: l.hash,
    gasPrice: l.gasPrice,
    fromIsContract: contractMap.get(l.from) ?? false,
    toIsContract: contractMap.get(l.to) ?? false,
  }));

  return JSON.stringify(filtered);
}

export async function filterTransactionsRange(blocksData: any[]): Promise<string> {
  const preliminaryLinks: Array<{ from: string; to: string; hash?: string; gasPrice?: string }> = [];
  
  for (const block of blocksData) {
    const txs: any[] = block?.result?.transactions ?? [];
    if (!txs || txs.length === 0) continue;
    for (const tx of txs) {
      const fromAddr = tx?.from as string | undefined;
      const toAddr = tx?.to as string | undefined;
      const hash = (tx?.hash as string | undefined) ?? (tx?.transactionHash as string | undefined);
      const gasPrice = tx?.gasPrice as string | undefined;
      if (!fromAddr || !toAddr) continue;
      preliminaryLinks.push({ from: fromAddr, to: toAddr, hash, gasPrice });
    }
  }

  // Collect all unique addresses
  const allAddresses = preliminaryLinks.flatMap(l => [l.from, l.to]);
  const contractMap = await checkContractAddresses(allAddresses);

  // Build final links with contract flags
  const aggregated: Array<LinkItem> = preliminaryLinks.map(l => ({
    from: l.from,
    to: l.to,
    hash: l.hash,
    gasPrice: l.gasPrice,
    fromIsContract: contractMap.get(l.from) ?? false,
    toIsContract: contractMap.get(l.to) ?? false,
  }));

  return JSON.stringify(aggregated);
}
