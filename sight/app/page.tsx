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

    const parsedLinks: LinkMap[] = Array.isArray(linksPayload)
      ? linksPayload
      : typeof linksPayload === "string"
      ? JSON.parse(linksPayload)
      : [];

    if (!Array.isArray(parsedLinks) || parsedLinks.length === 0) {
      renderMessage("No transactions found for selection.", "#888");
      return;
    }

    const nodesMap = new Map<string, { id: string; group: "from" | "to" }>();
    const links: Array<{ source: string; target: string } & any> = [];

    parsedLinks.forEach((transaction) => {
      Object.entries(transaction).forEach(([from, to]) => {
        if (!from || !to) return;
        if (!nodesMap.has(from)) nodesMap.set(from, { id: from, group: "from" });
        if (!nodesMap.has(to)) nodesMap.set(to, { id: to, group: "to" });
        links.push({ source: from, target: to });
      });
    });

    const nodes = Array.from(nodesMap.values()) as Array<any>;
    if (nodes.length === 0) {
      renderMessage("No transaction nodes to display.", "#888");
      return;
    }

    svg.selectAll("*").remove();
    const root = svg.append("g");

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

    const tooltip = d3.select("body").append("div").attr("class", "tooltip").style("opacity", 0);

    nodeSelection
      .on("mouseover", (event: any, d: any) => {
        tooltip
          .transition()
          .duration(200)
          .style("display", "block")
          .style("opacity", 1)
          .style("background-color", "#555")
          .style("color", "#fff")
          .style("border-radius", "6px")
          .style("padding", "4px 3px")
          .style("width", "450px")
          .style("text-align", "center");

        tooltip
          .html(`Address: ${d.id}`)
          .style("left", `${event.pageX + 10}px`)
          .style("top", `${event.pageY - 28}px`);
      })
      .on("mouseout", () => {
        tooltip.transition().duration(500).style("opacity", 0).style("display", "none");
      })
      .on("click", (_: any, d: any) => {
        alert(`Address: ${d.id}`);
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
    <div className="h-screen w-screen">
      {/* Header */}
      <header className="fixed top-0 left-0 w-full flex justify-between items-center p-3 bg-gray-100 z-50 shadow">
        <div className="flex gap-2">
          <button
            type="button"
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
            onClick={() => fetchSingleBlock(blockNumber - 1)}
          >
            ← Previous
          </button>
          <button
            type="button"
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
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
            className="border border-gray-300 rounded px-3 py-2 text-base"
            value={""}
            onChange={() => {}}
            id="block-search"
          />
          <button
            type="button"
            className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
            onClick={() => {
              const input = (document.getElementById("block-search") as HTMLInputElement | null)?.value;
              const parsed = input ? Number(input) : NaN;
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
            className="border border-gray-300 rounded px-3 py-2 text-base"
            value={rangeStart}
            onChange={(e) => setRangeStart(e.target.value)}
            id="range-start"
          />
          <input
            type="number"
            placeholder="To Block"
            className="border border-gray-300 rounded px-3 py-2 text-base"
            value={rangeEnd}
            onChange={(e) => setRangeEnd(e.target.value)}
            id="range-end"
          />
          <button
            type="button"
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
            onClick={() => fetchRangeBlocks(rangeStart, rangeEnd)}
            id="range-fetch-btn"
          >
            Fetch Range
          </button>
        </div>
      </header>

      {/* Graph Container */}
      <div id="graph-container" className="absolute top-[60px] left-0 right-0 bottom-0 overflow-hidden">
        <svg ref={svgRef} id="graph" className="block" />
      </div>

      {/* Legend */}
      <div
        id="legend"
        className="fixed bottom-5 left-5 bg-white border border-gray-300 p-3 rounded shadow"
      >
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