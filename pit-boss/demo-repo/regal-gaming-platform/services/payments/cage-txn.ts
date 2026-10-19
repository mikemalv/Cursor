import { tokenize } from "../../packages/tokenization/index.ts";

export interface CardPresentTxn {
  pan: string;
  amount: number;
  cageId: string;
  patronId: string;
}

const log = (level: string, msg: string, meta?: unknown) =>
  console.log(JSON.stringify({ level, msg, meta }));

export async function authorize(txn: CardPresentTxn) {
  const token = tokenize(txn.pan);
  log("info", "cage authorization requested", { token, amount: txn.amount, cageId: txn.cageId });

  try {
    const res = await postToProcessor({ token, amount: txn.amount });
    if (!res.approved) {
      // BUG: declined branch logs the full PAN. PCI-DSS violation.
      log("warn", "authorization declined", { pan: txn.pan, amount: txn.amount });
      return { approved: false };
    }
    return { approved: true, authCode: res.authCode };
  } catch (err) {
    // SECOND occurrence the obvious fix will miss -- the whole txn object is
    // serialized here, and it still contains the PAN.
    log("error", `processor error for txn ${JSON.stringify(txn)}`, { err: String(err) });
    throw err;
  }
}

async function postToProcessor(_: { token: string; amount: number }) {
  return { approved: true, authCode: "OK123" };
}
