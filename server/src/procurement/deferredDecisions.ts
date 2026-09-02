import { LivePantryState } from "../agents/procurementOptions.js";

export interface DeferredDecision {
  item: string;
  chosen_at_tick: number;
  recheck_after_tick: number;
  facts_at_decision_time: Record<string, number | string>;
  reasoning: string;
  created_at?: string;
}

/**
 * In-memory & deterministic registry for deferred procurement decisions.
 * Guarantees that "wait" is a persisted system state, not an ephemeral LLM memory.
 */
export class DeferredDecisionStore {
  private static deferredMap = new Map<string, DeferredDecision>();

  static setDeferred(decision: DeferredDecision): void {
    const norm = decision.item.toLowerCase().trim().replace(/s$/, "");
    DeferredDecisionStore.deferredMap.set(norm, {
      ...decision,
      created_at: decision.created_at || new Date().toISOString(),
    });
  }

  static getDeferred(item: string): DeferredDecision | null {
    const norm = item.toLowerCase().trim().replace(/s$/, "");
    return DeferredDecisionStore.deferredMap.get(norm) || null;
  }

  static deleteDeferred(item: string): boolean {
    const norm = item.toLowerCase().trim().replace(/s$/, "");
    return DeferredDecisionStore.deferredMap.delete(norm);
  }

  static getAllDeferred(): DeferredDecision[] {
    return Array.from(DeferredDecisionStore.deferredMap.values());
  }

  static clearAll(): void {
    DeferredDecisionStore.deferredMap.clear();
  }
}

export interface DeferredCheckResult {
  forcedOverrides: Array<{ item: string; reason: string }>;
  dueRechecks: Array<{ item: string; previousDecision: DeferredDecision }>;
}

/**
 * Runs on every simulation tick BEFORE any LLM call. Pure, deterministic code.
 * - If currentTick < recheck_after_tick: skips silently (deferred wait in progress)
 * - If stock <= safetyFloor: forces deterministic procurement override
 * - If currentTick >= recheck_after_tick: triggers recheck for buyer agent with full prior context
 */
export function checkDeferredDecisions(
  live: LivePantryState,
  callbacks?: {
    onForceProcurement?: (item: string, reason: string) => Promise<void> | void;
    onRecheckBuyerAgent?: (item: string, previousDecision: DeferredDecision) => Promise<void> | void;
  }
): DeferredCheckResult {
  const result: DeferredCheckResult = {
    forcedOverrides: [],
    dueRechecks: [],
  };

  const all = DeferredDecisionStore.getAllDeferred();

  for (const decision of all) {
    const item = decision.item;
    const norm = item.toLowerCase().trim().replace(/s$/, "");
    const currentStock = live.stock[item] ?? live.stock[norm] ?? 0;
    const safetyFloor = live.safetyFloor[item] ?? live.safetyFloor[norm] ?? 0;

    // 1. If stock breached the safety floor, force immediate override without consulting LLM
    if (currentStock <= safetyFloor) {
      DeferredDecisionStore.deleteDeferred(item);
      const reason = `Deferred wait breached safety floor (${currentStock}u <= ${safetyFloor}u floor), forcing immediate buy_minimal`;
      result.forcedOverrides.push({ item, reason });
      if (callbacks?.onForceProcurement) {
        callbacks.onForceProcurement(item, reason);
      }
      continue;
    }

    // 2. If not due yet, continue waiting
    if (live.currentTick < decision.recheck_after_tick) {
      continue;
    }

    // 3. Recheck window reached: wake buyer agent with prior decision context
    DeferredDecisionStore.deleteDeferred(item);
    result.dueRechecks.push({ item, previousDecision: decision });
    if (callbacks?.onRecheckBuyerAgent) {
      callbacks.onRecheckBuyerAgent(item, decision);
    }
  }

  return result;
}
