"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import * as d3 from "d3";

type LinkMap = Record<string, string>;

function getApiBase(): string {
  const envBase = process.env.NEXT_PUBLIC_ATHER_API_BASE;
  if (envBase && envBase.length > 0) return envBase;
  // Always target the deployed API by default
  return "https://aethersight-api.vercel.app";
}

async function requestJSON(url: string, options?: RequestInit): Promise<any> {
  const res = await fetch(url, options);
  let payload: any = null;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }
  if (!res.ok) {
    const message = payload?.detail ?? `HTTP ${res.status}: ${res.statusText}`;
    throw new Error(message);
  }
  return payload;
}

export default function Page() {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [blockNumber, setBlockNumber] = useState<number>(24041818);
  const [label, setLabel] = useState<string>("Block Number: N/A");
  const [rangeStart, setRangeStart] = useState<string>("");
  const [rangeEnd, setRangeEnd] = useState<string>("");
  const apiBase = useMemo(() => getApiBase(), []);
  const [graphLinks, setGraphLinks] = useState<Array<{ from: string; to: string; hash?: string }>>([]);
  const [selectedAddress, setSelectedAddress] = useState<string | null>(null);
  const [searchValue, setSearchValue] = useState<string>("");
    function shortHexLabel(value: string | undefined, kind: "tx" | "addr") {
      if (!value || typeof value !== "string") return `N/A (${kind})`;
      const core = value.startsWith("0x") ? value.slice(2) : value;
      const first4 = core.slice(0, 4);
      return `0x${first4}... (${kind})`;
    }

    function copyToClipboard(text?: string) {
      if (!text) return;
      try {
        navigator.clipboard?.writeText(text);
      } catch (_) {
        // noop
      }
    }

  // Hard-disable page scrollbars to prevent overflow during D3 interactions
  useEffect(() => {
    if (typeof window === "undefined") return;
    const html = document.documentElement;
    const body = document.body;
    const prevHtmlOverflow = html.style.overflow;
    const prevBodyOverflow = body.style.overflow;
    const prevBodyMargin = body.style.margin;
    const prevBodyMaxW = body.style.maxWidth;
    const prevBodyMaxH = body.style.maxHeight;
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    body.style.margin = "0";
    body.style.maxWidth = "100vw";
    body.style.maxHeight = "100vh";
    return () => {
      html.style.overflow = prevHtmlOverflow;
      body.style.overflow = prevBodyOverflow;
      body.style.margin = prevBodyMargin;
      body.style.maxWidth = prevBodyMaxW;
      body.style.maxHeight = prevBodyMaxH;
    };
  }, []);

  const width = useMemo(() => (typeof window !== "undefined" ? window.innerWidth : 1200), []);
  const height = useMemo(() => (typeof window !== "undefined" ? window.innerHeight - 60 : 800), []);

  useEffect(() => {
    // Resolve initial block number on client
    let bn = 24041818;
    try {
      const stored = Number(localStorage.getItem("currentBlockNumber"));
      // Treat 0 or invalid as unset and fall back to default
      if (!Number.isNaN(stored) && stored >= 1) {
        bn = stored;
      } else {
        localStorage.setItem("currentBlockNumber", String(bn));
      }
    } catch {
      // ignore localStorage errors
    }

    setBlockNumber(bn);
    setRangeStart(String(bn));
    setRangeEnd(String(bn + 1));
    setLabel(`Block Number: ${bn}`);
    if (typeof window !== "undefined") {
      // quick visibility for debugging
      // eslint-disable-next-line no-console
      console.debug("Using API base:", apiBase, "Initial block:", bn);
    }
    fetchSingleBlock(bn);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function storeBlockNumber(value: number) {
    if (!Number.isFinite(value)) return false;
    setBlockNumber(value);
    if (typeof window !== "undefined") {
      localStorage.setItem("currentBlockNumber", String(value));
    }
    return true;
  }

  function renderMessage(text: string, color = "#666", fontSize = "18px") {
    const svg = d3.select(svgRef.current);
    if (!svgRef.current) return;
    svg.selectAll("*").remove();
    svg.attr("width", width).attr("height", height);
    d3.selectAll(".tooltip").remove();

    svg
      .append("text")
      .attr("x", width / 2)
      .attr("y", height / 2)
      .attr("text-anchor", "middle")
      .style("font-size", fontSize)
      .style("fill", color)
      .text(text);
  }

  function renderGraph(linksPayload: string | LinkMap[]) {
    const svg = d3.select(svgRef.current);
    if (!svgRef.current) return;

    svg.attr("width", width).attr("height", height);
    d3.selectAll(".tooltip").remove();

    const parsedLinks: any[] = Array.isArray(linksPayload)
      ? linksPayload
      : typeof linksPayload === "string"
      ? JSON.parse(linksPayload)
      : [];

    const normalized: Array<{ from: string; to: string; hash?: string }> = [];

    if (!Array.isArray(parsedLinks) || parsedLinks.length === 0) {
      renderMessage("No transactions found for selection.", "#888");
      return;
    }

    const nodesMap = new Map<string, { id: string; group: "from" | "to" }>();
    const links: Array<{ source: string; target: string } & any> = [];

    parsedLinks.forEach((item) => {
      // New shape: { from, to, hash? }
      if (item && typeof item === "object" && "from" in item && "to" in item) {
        const from = String(item.from);
        const to = String(item.to);
        if (!nodesMap.has(from)) nodesMap.set(from, { id: from, group: "from" });
        if (!nodesMap.has(to)) nodesMap.set(to, { id: to, group: "to" });
        links.push({ source: from, target: to, hash: item.hash });
        normalized.push({ from, to, hash: item.hash });
        return;
      }
      // Legacy shape: { fromAddr: toAddr }
      Object.entries(item ?? {}).forEach(([from, to]) => {
        const fromStr = String(from);
        const toStr = String(to);
        if (!fromStr || !toStr) return;
        if (!nodesMap.has(fromStr)) nodesMap.set(fromStr, { id: fromStr, group: "from" });
        if (!nodesMap.has(toStr)) nodesMap.set(toStr, { id: toStr, group: "to" });
        links.push({ source: fromStr, target: toStr });
        normalized.push({ from: fromStr, to: toStr });
      });
    });

    // Store normalized links for overlay use
    setGraphLinks(normalized);

    const nodes = Array.from(nodesMap.values()) as Array<any>;
    if (nodes.length === 0) {
      renderMessage("No transaction nodes to display.", "#888");
      return;
    }

    svg.selectAll("*").remove();
    const root = svg.append("g");
    // Ensure a white background for the SVG area
    root
      .append("rect")
      .attr("width", width)
      .attr("height", height)
      .attr("fill", "#ffffff");

    svg.on(".zoom", null);
    const zoomBehaviour = d3
      .zoom()
      .scaleExtent([0.1, 10])
      .on("zoom", (event: any) => {
        root.attr("transform", event.transform);
      });
    svg.call(zoomBehaviour as any);

    const color = d3.scaleOrdinal<string>().domain(["from", "to"]).range(["blue", "green"]);

    const linkSelection = root
      .append("g")
      .selectAll("line")
      .data(links)
      .enter()
      .append("line")
      .attr("stroke", "#999")
      .attr("stroke-opacity", 0.6)
      .attr("stroke-width", 1);

    const nodeSelection = root
      .append("g")
      .selectAll("circle")
      .data(nodes)
      .enter()
      .append("circle")
      .attr("r", 6)
      .attr("fill", (d: any) => color(d.group))
      .attr("stroke-width", 1.5);

    // Remove tooltip creation; no hover effects

    nodeSelection.on("click", (_: any, d: any) => {
      setSelectedAddress(String(d.id));
    });

    const simulation = d3
      .forceSimulation(nodes)
      .force("link", d3.forceLink(links).id((d: any) => d.id))
      .force("charge", d3.forceManyBody())
      .force("x", d3.forceX(width / 2).strength(0.1))
      .force("y", d3.forceY(height / 2).strength(0.1));

    const dragBehaviour = (d3 as any)
      .drag()
      .on("start", (event: any, d: any) => {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on("drag", (event: any, d: any) => {
        d.fx = event.x;
        d.fy = event.y;
      })
      .on("end", (event: any, d: any) => {
        if (!event.active) simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
      });

    (nodeSelection as any).call(dragBehaviour);

    simulation.on("tick", () => {
      linkSelection
        .attr("x1", (d: any) => d.source.x)
        .attr("y1", (d: any) => d.source.y)
        .attr("x2", (d: any) => d.target.x)
        .attr("y2", (d: any) => d.target.y);

      nodeSelection.attr("cx", (d: any) => d.x).attr("cy", (d: any) => d.y);
    });
  }

  function fetchSingleBlock(value: number) {
    const parsed = Number(value);
    if (Number.isNaN(parsed) || parsed < 0) {
      alert("Block number must be a non-negative integer.");
      return;
    }

    storeBlockNumber(parsed);
    setLabel(`Block Number: ${parsed}`);
    if (!rangeStart) setRangeStart(String(parsed));
    if (!rangeEnd) setRangeEnd(String(parsed + 1));
    renderMessage(`Loading block ${parsed}...`);
    requestJSON(`${apiBase}/api/block/${parsed}`)
      .then((data) => {
        if (!data || data.status !== "success" || typeof data.links === "undefined") {
          throw new Error("Unexpected response from server.");
        }
        renderGraph(data.links);
      })
      .catch((error) => handleError(`block ${parsed}`, error));
  }

  function fetchRangeBlocks(start: string, end: string) {
    const startBlock = Number(start);
    const endBlock = Number(end);

    if (Number.isNaN(startBlock) || Number.isNaN(endBlock)) {
      alert("Both range fields must be valid block numbers.");
      return;
    }
    if (startBlock < 0 || endBlock < 0) {
      alert("Block range must be non-negative.");
      return;
    }
    if (startBlock > endBlock) {
      alert("From block must be less than or equal to To block.");
      return;
    }

    setRangeStart(String(startBlock));
    setRangeEnd(String(endBlock));
    storeBlockNumber(startBlock);
    setLabel(`Block Range: ${startBlock} - ${endBlock}`);
    renderMessage(`Loading blocks ${startBlock} - ${endBlock}...`);
    requestJSON(`${apiBase}/api/blocks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ start_block: startBlock, end_block: endBlock }),
    })
      .then((data) => {
        if (!data || data.status !== "success" || typeof data.links === "undefined") {
          throw new Error("Unexpected response from server.");
        }
        renderGraph(data.links);
      })
      .catch((error) => handleError(`blocks ${startBlock}-${endBlock}`, error));
  }

  function handleError(context: string, error: any) {
    console.error(`Error fetching ${context}:`, error);
    renderMessage(`Error: ${error.message}`, "#ff6b6b", "16px");
    alert(`Error loading ${context}: ${error.message}`);
  }

  return (
    <div className="h-screen w-screen overflow-hidden bg-white text-gray-900">
      {/* Header */}
      <header className="fixed top-0 left-0 w-full flex justify-between items-center p-3 bg-white border-b border-gray-200 z-50 shadow-sm">
        <div className="flex gap-2">
          <button
            type="button"
            className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 shadow-sm"
            onClick={() => fetchSingleBlock(blockNumber - 1)}
          >
            ← Previous
          </button>
          <button
            type="button"
            className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 shadow-sm"
            onClick={() => fetchSingleBlock(blockNumber + 1)}
          >
            Next →
          </button>
        </div>
        <div id="block-info" className="text-lg font-bold text-gray-800">
          <span id="current-block" className="text-blue-600">
            {label}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="number"
            placeholder="Search Block Number"
            className="border border-gray-300 rounded-md px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 shadow-sm"
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const parsed = Number(searchValue);
                if (Number.isNaN(parsed)) {
                  alert("Please enter a valid block number.");
                  return;
                }
                fetchSingleBlock(parsed);
              }
            }}
            id="block-search"
          />
          <button
            type="button"
            className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 shadow-sm"
            onClick={() => {
              const parsed = Number(searchValue);
              if (Number.isNaN(parsed)) {
                alert("Please enter a valid block number.");
                return;
              }
              fetchSingleBlock(parsed);
            }}
            id="search-btn"
          >
            Search
          </button>
          <input
            type="number"
            placeholder="From Block"
            className="border border-gray-300 rounded-md px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 shadow-sm"
            value={rangeStart}
            onChange={(e) => setRangeStart(e.target.value)}
            id="range-start"
          />
          <input
            type="number"
            placeholder="To Block"
            className="border border-gray-300 rounded-md px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 shadow-sm"
            value={rangeEnd}
            onChange={(e) => setRangeEnd(e.target.value)}
            id="range-end"
          />
          <button
            type="button"
            className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 shadow-sm"
            onClick={() => fetchRangeBlocks(rangeStart, rangeEnd)}
            id="range-fetch-btn"
          >
            Fetch Range
          </button>
        </div>
      </header>

      {/* Overlay: address + transactions */}
      <div className="fixed top-24 left-6 z-[1000] w-[400px] max-h-[55vh] overflow-hidden">
        <div className="rounded-xl border border-blue-300 bg-blue-600/25 backdrop-blur-md shadow-lg">
          <div className="px-4 py-3 border-b border-blue-200/40 flex items-center justify-between">
            <div>
              {!selectedAddress && (
                <>
                  <div className="text-sm font-semibold text-blue-900">Selection</div>
                  <div className="text-[11px] text-blue-900/80">Click a node to update</div>
                </>
              )}
            </div>
            {/* Copy button removed */}
          </div>
          <div className="p-4 overflow-auto" style={{ maxHeight: "46vh" }}>
            {selectedAddress ? (
              <div>
                <div className="text-xs text-gray-800 font-bold mb-1">Address</div>
                <div className="text-xs font-mono text-gray-900 mb-3 inline-flex items-center gap-2">
                  <a
                    href={`https://etherscan.io/address/${selectedAddress}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-2 py-1 rounded-md bg-white/70 border border-blue-200 hover:bg-white/90 hover:underline"
                    title={selectedAddress || undefined}
                  >
                    {shortHexLabel(selectedAddress, "addr")}
                  </a>
                </div>

                <div className="text-xs text-gray-800 font-bold mb-1">Outgoing (from)</div>
                <ul className="space-y-1">
                  {graphLinks
                    .filter((l) => l.from === selectedAddress)
                    .slice(0, 50)
                    .map((l, i) => (
                      <li
                        key={`out-${i}`}
                        className="text-[11px] flex items-center gap-2 text-gray-900"
                      >
                        {l.hash ? (
                          <a
                            href={`https://etherscan.io/tx/${l.hash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-2 py-0.5 rounded bg-white/70 border border-blue-200 hover:bg-white/90 hover:underline"
                            title={l.hash}
                          >
                            {shortHexLabel(l.hash, "tx")}
                          </a>
                        ) : (
                          <span className="px-2 py-0.5 rounded bg-white/70 border border-blue-200">{shortHexLabel(undefined, "tx")}</span>
                        )}
                        <span className="text-gray-700">→</span>
                        {l.to ? (
                          <a
                            href={`https://etherscan.io/address/${l.to}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-2 py-0.5 rounded bg-white/70 border border-blue-200 hover:bg-white/90 hover:underline"
                            title={l.to}
                          >
                            {shortHexLabel(l.to, "addr")}
                          </a>
                        ) : (
                          <span className="px-2 py-0.5 rounded bg-white/70 border border-blue-200">{shortHexLabel(undefined, "addr")}</span>
                        )}
                      </li>
                    ))}
                </ul>

                <div className="text-xs text-gray-800 font-bold mt-3 mb-1">Incoming (to)</div>
                <ul className="space-y-1">
                  {graphLinks
                    .filter((l) => l.to === selectedAddress)
                    .slice(0, 50)
                    .map((l, i) => (
                      <li
                        key={`in-${i}`}
                        className="text-[11px] flex items-center gap-2 text-gray-900"
                      >
                        {l.hash ? (
                          <a
                            href={`https://etherscan.io/tx/${l.hash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-2 py-0.5 rounded bg-white/70 border border-blue-200 hover:bg-white/90 hover:underline"
                            title={l.hash}
                          >
                            {shortHexLabel(l.hash, "tx")}
                          </a>
                        ) : (
                          <span className="px-2 py-0.5 rounded bg-white/70 border border-blue-200">{shortHexLabel(undefined, "tx")}</span>
                        )}
                        <span className="text-gray-700">←</span>
                        {l.from ? (
                          <a
                            href={`https://etherscan.io/address/${l.from}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-2 py-0.5 rounded bg-white/70 border border-blue-200 hover:bg-white/90 hover:underline"
                            title={l.from}
                          >
                            {shortHexLabel(l.from, "addr")}
                          </a>
                        ) : (
                          <span className="px-2 py-0.5 rounded bg-white/70 border border-blue-200">{shortHexLabel(undefined, "addr")}</span>
                        )}
                      </li>
                    ))}
                </ul>
              </div>
            ) : (
              <div className="text-xs text-gray-700">Click a node to view its transactions.</div>
            )}
          </div>
        </div>
      </div>

      {/* Graph Container */}
      <div id="graph-container" className="fixed top-[60px] left-0 right-0 bottom-0 overflow-hidden bg-white">
        <svg
          ref={svgRef}
          id="graph"
          className="block"
          style={{ backgroundColor: "white", overflow: "hidden" }}
        />
      </div>

      {/* Legend */}
      <div id="legend" className="fixed bottom-5 left-5 bg-white/95 backdrop-blur border border-gray-200 p-3 rounded-md shadow-sm">
        <div className="flex items-center mb-2">
          <svg className="w-5 h-5 mr-2" viewBox="0 0 20 20">
            <circle cx="10" cy="10" r="5" fill="blue" />
          </svg>
          <span className="whitespace-nowrap mr-2">From Address</span>
        </div>
        <div className="flex items-center">
          <svg className="w-5 h-5 mr-2" viewBox="0 0 20 20">
            <circle cx="10" cy="10" r="5" fill="green" />
          </svg>
          <span className="whitespace-nowrap mr-2">To Address</span>
        </div>
      </div>
    </div>
  );
}