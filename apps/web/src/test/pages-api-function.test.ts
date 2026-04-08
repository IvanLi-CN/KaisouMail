import { describe, expect, it, vi } from "vitest";

import { onRequest } from "../../functions/api/[[path]]";

describe("Pages same-origin API proxy", () => {
  it("forwards requests to the API service binding without rewriting them", async () => {
    const fetchMock = vi.fn(async (request: Request) => {
      expect(request.url).toBe(
        "https://km.707979.xyz/api/mailboxes/ensure?address=test%40example.com",
      );
      expect(request.method).toBe("POST");
      expect(request.headers.get("cookie")).toBe("session=abc");
      await expect(request.clone().json()).resolves.toEqual({
        address: "test@example.com",
      });

      return new Response(JSON.stringify({ ok: true }), {
        status: 201,
        headers: {
          "content-type": "application/json",
          "x-proxied-by": "pages-function",
        },
      });
    });

    const response = await onRequest({
      request: new Request(
        "https://km.707979.xyz/api/mailboxes/ensure?address=test%40example.com",
        {
          method: "POST",
          headers: {
            cookie: "session=abc",
            "content-type": "application/json",
          },
          body: JSON.stringify({ address: "test@example.com" }),
        },
      ),
      env: {
        API: {
          fetch: fetchMock,
        },
      },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(201);
    expect(response.headers.get("x-proxied-by")).toBe("pages-function");
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it("preserves raw and binary responses from the API binding", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const response = await onRequest({
      request: new Request("https://cfm.707979.xyz/api/messages/msg/raw"),
      env: {
        API: {
          fetch: vi.fn(
            async () =>
              new Response(bytes, {
                headers: {
                  "content-type": "application/octet-stream",
                },
              }),
          ),
        },
      },
    });

    expect(Array.from(new Uint8Array(await response.arrayBuffer()))).toEqual([
      1, 2, 3, 4,
    ]);
    expect(response.headers.get("content-type")).toBe(
      "application/octet-stream",
    );
  });

  it("fails closed on Cloudflare Pages preview hostnames", async () => {
    const fetchMock = vi.fn();
    const response = await onRequest({
      request: new Request(
        "https://same-origin-api-reapply.kaisoumail.pages.dev/api/version",
      ),
      env: {
        API: {
          fetch: fetchMock,
        },
      },
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: "Preview Pages same-origin API is disabled",
    });
  });
});
