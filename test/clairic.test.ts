import { describe, expect, it } from "vitest";
import { extract } from "../src/system-one/clairic";
import { GATEWAY, mockAi } from "./helpers";

const fields = {
  invoice_number: { type: "text" },
  total: { type: "number", decimals: 2, unit: "USD" },
  contacts: { type: "list", items: "text" },
  po_number: { type: "text", instructions: "Purchase order number" },
  days_to_pay: { type: "estimate", min: 0, max: 120, step: 1 },
} as const;

const response = {
  model: "clairic",
  answers: {
    invoice_number: {
      type: "text",
      p_null: 0,
      span: [8, 16],
      guess: "INV-2291",
      confidence: 1,
      value: "INV-2291",
    },
    total: {
      type: "number",
      p_null: 0,
      guess: 1080,
      confidence: 0.99,
      value: 1080,
    },
    contacts: {
      type: "list",
      value: ["Dana Ruiz", "Priya Shah"],
      spans: [
        [120, 129],
        [131, 141],
      ],
    },
    po_number: {
      type: "text",
      p_null: 1,
      guess: "INV-2291",
      confidence: 0.99,
      value: null,
    },
    days_to_pay: { type: "estimate", value: 30, median: 30, p10: 21, p90: 38 },
  },
  truncated: false,
  usage: { input_tokens: 655, output_tokens: 0, passes: 3 },
};

describe("extract", () => {
  it("sends fields and reference date, returns typed answers", async () => {
    const { ai, run } = mockAi(response);
    const result = await extract(
      ai,
      { state: "Invoice INV-2291…", fields, referenceDate: "2026-10-26" },
      GATEWAY,
    );

    expect(run).toHaveBeenCalledWith(
      "@cf/cloudflare/clairic",
      {
        model: "clairic",
        state: "Invoice INV-2291…",
        fields,
        reference_date: "2026-10-26",
      },
      expect.anything(),
    );
    expect(result.answers.invoice_number.value).toBe("INV-2291");
    expect(result.answers.po_number.value).toBeNull();
    expect(result.answers.contacts.value).toEqual(["Dana Ruiz", "Priya Shah"]);
    expect(result.answers.days_to_pay.p90).toBe(38);
    expect(result.inputTokens).toBe(655);
  });

  it("rejects invalid field names before calling the API", async () => {
    const { ai, run } = mockAi(response);
    await expect(
      extract(
        ai,
        { state: "x", fields: { "bad name": { type: "text" } } },
        GATEWAY,
      ),
    ).rejects.toThrow(/Invalid Clairic field names: bad name/);
    expect(run).not.toHaveBeenCalled();
  });

  it("requires state or images", async () => {
    const { ai } = mockAi(response);
    await expect(extract(ai, { state: "  ", fields }, GATEWAY)).rejects.toThrow(
      /non-empty state/,
    );
  });
});
