import type { Change, ColumnDef, Contract } from "./types.ts";

/**
 * ---------------------------------------------------------------------------
 * THE DIFFER
 *
 * Deterministic. The warehouse contract is the source of truth, and you do not
 * ask a model what changed in it -- you compute it. Same principle as pit-boss'
 * policy gate, applied one stage earlier: the model is for judgment, not for facts.
 * ---------------------------------------------------------------------------
 */

interface ParsedType { family: "NUMBER" | "VARCHAR" | "DATE" | "TIMESTAMP" | "FLOAT" | "BOOLEAN" | "OTHER"; p?: number; s?: number; }

export function parseType(t: string): ParsedType {
  const m = /^([A-Z_]+)\s*(?:\((\d+)(?:\s*,\s*(\d+))?\))?$/i.exec(t.trim());
  if (!m) return { family: "OTHER" };
  const fam = m[1]!.toUpperCase();
  const family = (["NUMBER","VARCHAR","DATE","TIMESTAMP","FLOAT","BOOLEAN"] as const)
    .find((f) => f === fam) ?? "OTHER";
  return { family, p: m[2] ? +m[2] : undefined, s: m[3] ? +m[3] : undefined };
}

/**
 * Widening means every value representable before is representable after.
 * Anything we cannot prove is widening is treated as narrowing -- the safe default,
 * because the cost of a wrong answer here is silent data loss in production.
 */
export function isWidening(beforeT: string, afterT: string): boolean {
  const a = parseType(beforeT), b = parseType(afterT);
  if (a.family !== b.family) return false;              // cross-family: never assume
  if (a.family === "NUMBER") {
    const ap = a.p ?? 38, as = a.s ?? 0, bp = b.p ?? 38, bs = b.s ?? 0;
    return bp >= ap && bs >= as && (bp - bs) >= (ap - as); // integral digits must not shrink
  }
  if (a.family === "VARCHAR") return (b.p ?? Infinity) >= (a.p ?? Infinity);
  return true;                                           // same family, no parameters
}

/** Name similarity for rename inference, when the warehouse gave us no hint. */
export function similarity(a: string, b: string): number {
  const x = a.toUpperCase(), y = b.toUpperCase();
  if (x === y) return 1;
  const long = x.length >= y.length ? x : y, short = x.length >= y.length ? y : x;
  if (long.startsWith(short)) return short.length / long.length;
  let i = 0; while (i < short.length && long[i] === short[i]) i++;
  return i / long.length;
}

export function diffContracts(before: Contract, after: Contract): Change[] {
  const out: Change[] = [];

  for (const [obj, afterObj] of Object.entries(after.objects)) {
    const beforeObj = before.objects[obj];
    if (!beforeObj) continue;                            // new objects break nothing
    const b = beforeObj.columns, a = afterObj.columns;

    const renamedFrom = new Set<string>();

    // 1. Explicit renames -- the warehouse's ALTER history told us. Confidence 1.0.
    for (const [name, def] of Object.entries(a)) {
      if (def.renamedFrom && b[def.renamedFrom]) {
        renamedFrom.add(def.renamedFrom);
        out.push({ object: obj, column: name, from: def.renamedFrom, cls: "RENAME_COLUMN",
          before: b[def.renamedFrom], after: def, confidence: 1, destructive: false,
          detail: `${def.renamedFrom} renamed to ${name} (confirmed by ALTER history)` });
      }
    }

    const gone = Object.keys(b).filter((c) => !(c in a) && !renamedFrom.has(c));
    const added = Object.keys(a).filter((c) => !(c in b) && !a[c]!.renamedFrom);

    // 2. Inferred renames: a drop and an add of the same type with a similar name.
    //    Emitted with sub-1.0 confidence so the policy can refuse to automate it.
    const pairedGone = new Set<string>(), pairedAdded = new Set<string>();
    for (const g of gone) {
      for (const n of added) {
        if (pairedAdded.has(n)) continue;
        const sim = similarity(g, n);
        if (b[g]!.type === a[n]!.type && sim >= 0.6) {
          pairedGone.add(g); pairedAdded.add(n);
          out.push({ object: obj, column: n, from: g, cls: "RENAME_COLUMN",
            before: b[g], after: a[n], confidence: Number((0.5 + sim * 0.4).toFixed(2)),
            destructive: false,
            detail: `${g} may have been renamed to ${n} (inferred, not confirmed)` });
          break;
        }
      }
    }

    for (const c of gone) if (!pairedGone.has(c))
      out.push({ object: obj, column: c, cls: "DROP_COLUMN", before: b[c], confidence: 1,
        destructive: true, detail: `${c} dropped` });

    for (const c of added) if (!pairedAdded.has(c))
      out.push({ object: obj, column: c, cls: "ADD_COLUMN", after: a[c], confidence: 1,
        destructive: false, detail: `${c} ${a[c]!.type} added` });

    // 3. Columns present in both: type and nullability.
    for (const [c, bd] of Object.entries(b)) {
      const ad: ColumnDef | undefined = a[c];
      if (!ad) continue;
      if (bd.type !== ad.type) {
        const widening = isWidening(bd.type, ad.type);
        out.push({ object: obj, column: c, cls: widening ? "RETYPE_WIDENING" : "RETYPE_NARROWING",
          before: bd, after: ad, confidence: 1, destructive: !widening,
          detail: `${c} ${bd.type} -> ${ad.type}${widening ? "" : " (values may not be representable)"}` });
      }
      if (bd.nullable !== ad.nullable) {
        const tighten = bd.nullable && !ad.nullable;
        out.push({ object: obj, column: c, cls: tighten ? "NULLABILITY_TIGHTEN" : "NULLABILITY_RELAX",
          before: bd, after: ad, confidence: 1, destructive: tighten,
          detail: `${c} ${bd.nullable ? "NULL" : "NOT NULL"} -> ${ad.nullable ? "NULL" : "NOT NULL"}` });
      }
    }
  }
  return out;
}

/** All column names a change touches -- including the old name of a rename. */
export function affectedColumns(c: Change): string[] {
  return c.from ? [c.from, c.column] : [c.column];
}
