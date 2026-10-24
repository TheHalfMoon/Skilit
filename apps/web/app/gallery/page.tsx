"use client";

import Link from "next/link";

import { SessionAccessBanner } from "../../components/session-access-banner";
import { flowExplorerHref } from "../../lib/gallery-flow-navigation";
import { sessionRequest } from "../../lib/browser-session";

import { useState } from "react";

interface ProductView {
  uri: string;
  title: string;
  versionCount: number;
  artifactCount: number;
}

interface VersionView {
  uri: string;
  productId: string;
  versionNo: number;
  artifactCount: number;
}

interface AgentFailure {
  code: string;
  message: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function asProducts(value: unknown): ProductView[] | null {
  const record = asRecord(value);
  const products = record === null ? null : record.products;
  if (!Array.isArray(products)) return null;
  const out: ProductView[] = [];
  for (const entry of products) {
    const item = asRecord(entry);
    if (
      item === null ||
      typeof item.uri !== "string" ||
      typeof item.title !== "string" ||
      typeof item.versionCount !== "number" ||
      typeof item.artifactCount !== "number"
    ) {
      return null;
    }
    out.push(item as unknown as ProductView);
  }
  return out;
}

function asVersions(value: unknown): VersionView[] | null {
  const record = asRecord(value);
  const versions = record === null ? null : record.versions;
  if (!Array.isArray(versions)) return null;
  const out: VersionView[] = [];
  for (const entry of versions) {
    const item = asRecord(entry);
    if (
      item === null ||
      typeof item.uri !== "string" ||
      typeof item.productId !== "string" ||
      typeof item.versionNo !== "number" ||
      typeof item.artifactCount !== "number"
    ) {
      return null;
    }
    out.push(item as unknown as VersionView);
  }
  return out;
}

function cursorOf(payload: unknown): string | null {
  const record = asRecord(payload);
  if (record === null) return null;
  const cursor = record.cursor;
  return typeof cursor === "string" && cursor !== "" ? cursor : null;
}

export default function GalleryPage() {
    const [filter, setFilter] = useState("");
  const [productId, setProductId] = useState("");
  const [products, setProducts] = useState<ProductView[] | null>(null);
  const [productsCursor, setProductsCursor] = useState<string | null>(null);
  const [versions, setVersions] = useState<VersionView[] | null>(null);
  const [versionsCursor, setVersionsCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<AgentFailure | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function readFailure(payload: unknown, fallback: string): AgentFailure {
    const record = asRecord(payload);
    const error = record === null ? null : asRecord(record.error);
    if (error !== null && typeof error.code === "string" && typeof error.message === "string") {
      return { code: error.code, message: error.message };
    }
    return { code: "UNKNOWN", message: fallback };
  }

  async function callJson(
    label: string,
    path: string,
    init: RequestInit,
    onOk: (result: Record<string, unknown>, payload: Record<string, unknown>) => void,
  ): Promise<void> {
    setBusy(label);
    setFailure(null);
    setNotice(null);
    try {
      const response = await sessionRequest(path, init);
      const payload: unknown = await response.json();
      if (!response.ok) {
        setFailure(readFailure(payload, `${label} failed with HTTP ${response.status}.`));
        return;
      }
      const record = asRecord(payload);
      const result = record === null ? null : asRecord(record.result);
      if (result === null || record === null) {
        setFailure({ code: "UNKNOWN", message: `${label} returned an unrecognized shape.` });
        return;
      }
      onOk(result, record);
    } catch {
      setFailure({ code: "UNKNOWN", message: `${label} could not reach the server.` });
    } finally {
      setBusy(null);
    }
  }

  async function listProducts(cursor?: string): Promise<void> {
    const params = new URLSearchParams();
    params.set("limit", "20");
    if (cursor !== undefined && cursor !== "") params.set("cursor", cursor);
    await callJson("List products", `/api/v1/products?${params.toString()}`, {}, (result, payload) => {
      const list = asProducts(result);
      if (list === null) {
        setFailure({ code: "UNKNOWN", message: "List products returned an unrecognized shape." });
        return;
      }
      setProducts((previous) => (cursor === undefined ? list : [...(previous ?? []), ...list]));
      setProductsCursor(cursorOf(payload));
      setNotice(`Listed ${list.length} product(s).`);
    });
  }

  async function inspectVersions(target?: string, cursor?: string): Promise<void> {
    const id = (target ?? productId).trim();
    if (id === "") {
      setFailure({ code: "UNKNOWN", message: "Enter a product ID before inspecting versions." });
      return;
    }
    const params = new URLSearchParams();
    params.set("limit", "20");
    if (cursor !== undefined && cursor !== "") params.set("cursor", cursor);
    await callJson("Inspect versions", `/api/v1/products/${encodeURIComponent(id)}/versions?${params.toString()}`, {}, (result, payload) => {
      const list = asVersions(result);
      if (list === null) {
        setFailure({ code: "UNKNOWN", message: "Inspect versions returned an unrecognized shape." });
        return;
      }
      setProductId(id);
      setVersions((previous) => (cursor === undefined ? list : [...(previous ?? []), ...list]));
      setVersionsCursor(cursorOf(payload));
      setNotice(`Listed ${list.length} version(s) for product ${id}.`);
    });
  }

  const visibleProducts = (products ?? []).filter((product) =>
    filter.trim() === "" ? true : product.title.toLowerCase().includes(filter.trim().toLowerCase()),
  );

  return (
    <main>
      <h1>Product gallery</h1>
      <p>
        Actor-scoped products and versions over the qualified gallery reads.
        Fully-withheld corpora read as empty; unknown products read as empty.
      </p>
      <SessionAccessBanner />
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void listProducts();
        }}
      >
        <label htmlFor="gallery-filter">Filter products</label>
        <input
          id="gallery-filter"
          type="search"
          autoComplete="off"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        />
        <button type="submit">List products</button>
      </form>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setVersions(null);
          setVersionsCursor(null);
          void inspectVersions();
        }}
      >
        <label htmlFor="gallery-product">Product ID</label>
        <input
          id="gallery-product"
          type="text"
          autoComplete="off"
          value={productId}
          onChange={(event) => setProductId(event.target.value)}
        />
        <button type="submit">Inspect versions</button>
      </form>
      <div aria-live="polite">
        {busy !== null ? <p>Working: {busy}.</p> : null}
        {notice !== null ? <p>{notice}</p> : null}
      </div>
      {failure !== null ? (
        <p role="alert">
          {failure.code}: {failure.message}
        </p>
      ) : null}
      <section aria-label="Products">
        <h2>Products</h2>
        {products === null ? <p>No products listed yet.</p> : null}
        {products !== null && products.length === 0 ? <p>No products in this workspace.</p> : null}
        {products !== null && visibleProducts.length === 0 && products.length > 0 ? (
          <p>No products match this filter.</p>
        ) : null}
        <ol>
          {visibleProducts.map((product) => (
            <li key={product.uri}>
              <span>
                {product.title} (versions {product.versionCount}, artifacts {product.artifactCount})
              </span>{" "}
              <span>{product.uri}</span>{" "}
              <button type="button" onClick={() => void inspectVersions(product.uri.replace("skilit://product/", ""))}>
                Inspect versions
              </button>
            </li>
          ))}
        </ol>
        {productsCursor !== null ? (
          <button type="button" onClick={() => void listProducts(productsCursor)}>
            More products
          </button>
        ) : null}
      </section>
      <section aria-label="Versions">
        <h2>Versions</h2>
        {versions === null ? <p>No versions listed yet.</p> : null}
        {versions !== null && versions.length === 0 ? <p>No versions in this product.</p> : null}
        <ul>
          {(versions ?? []).map((version) => {
            const href = flowExplorerHref(version.uri);
            return (
              <li key={version.uri}>
                <span>
                  v{version.versionNo} (artifacts {version.artifactCount})
                </span>{" "}
                <span>{version.uri}</span>{" "}
                {href !== null ? (
                  <Link href={href} aria-label={`Explore flows for version ${version.versionNo}`}>
                    Explore flows
                  </Link>
                ) : null}
              </li>
            );
          })}
        </ul>
        {versionsCursor !== null ? (
          <button type="button" onClick={() => void inspectVersions(productId, versionsCursor)}>
            More versions
          </button>
        ) : null}
      </section>
      <p>
        Provenance: observed gallery reads with reproducible pagination; artifact
        inspection with per-item rights stays with the flow player and search
        surfaces.
      </p>
    </main>
  );
}
