/**
 * GST Calculation Service
 * If buyer and seller are in the same state: split into CGST + SGST (half each)
 * If different states: IGST (full rate)
 */

export interface GSTResult {
  cgst: number;
  sgst: number;
  igst: number;
  totalTax: number;
}

export function calculateGST(
  taxableAmount: number,
  taxRate: number,
  isSameState: boolean
): GSTResult {
  const r = (n: number) => Math.round(n * 100) / 100;

  if (isSameState) {
    const halfRate = taxRate / 2;
    const cgst = r(taxableAmount * halfRate / 100);
    const sgst = r(taxableAmount * halfRate / 100);
    return { cgst, sgst, igst: 0, totalTax: r(cgst + sgst) };
  } else {
    const igst = r(taxableAmount * taxRate / 100);
    return { cgst: 0, sgst: 0, igst, totalTax: igst };
  }
}

export interface LineItemGSTInput {
  price: number;
  quantity: number;
  discountPct?: number;
  discountAmt?: number;
  taxRate: number;
  isSameState: boolean;
}

export interface LineItemGSTResult {
  taxableAmount: number;
  discountAmt: number;
  cgst: number;
  sgst: number;
  igst: number;
  cgstRate: number;
  sgstRate: number;
  igstRate: number;
  taxAmount: number;
  lineTotal: number;
}

export function calculateLineItemGST(input: LineItemGSTInput): LineItemGSTResult {
  const r = (n: number) => Math.round(n * 100) / 100;

  const grossAmount = r(input.price * input.quantity);
  const discountAmt = input.discountAmt != null
    ? r(input.discountAmt)
    : r(grossAmount * (input.discountPct ?? 0) / 100);

  const taxableAmount = r(grossAmount - discountAmt);
  const gst = calculateGST(taxableAmount, input.taxRate, input.isSameState);

  const cgstRate = input.isSameState ? input.taxRate / 2 : 0;
  const sgstRate = input.isSameState ? input.taxRate / 2 : 0;
  const igstRate = input.isSameState ? 0 : input.taxRate;

  return {
    taxableAmount,
    discountAmt,
    cgst: gst.cgst,
    sgst: gst.sgst,
    igst: gst.igst,
    cgstRate,
    sgstRate,
    igstRate,
    taxAmount: gst.totalTax,
    lineTotal: r(taxableAmount + gst.totalTax),
  };
}
