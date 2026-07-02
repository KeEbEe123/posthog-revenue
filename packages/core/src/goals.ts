import type { Goal, MonthMetrics } from "./types.js";
import { monthKey } from "./metrics.js";

export interface GoalStatus {
  goal: Goal;
  /** The metric's current value for comparison. */
  current: number;
  met: boolean;
  overdue: boolean;
  /** 0..1+ progress toward target. */
  progress: number;
  /** Whether this goal should be surfaced on the chart. */
  visible: boolean;
}

function currentValue(goal: Goal, latest: MonthMetrics): number {
  switch (goal.metric) {
    case "mrr":
      return latest.mrr;
    case "arr":
      return latest.arr;
    case "gross":
      return latest.grossRevenue;
  }
}

/**
 * A goal is visible if it's still within range (not yet due) OR it's overdue
 * and unmet. In other words, hide only goals that are overdue AND already met.
 */
export function evaluateGoal(goal: Goal, latest: MonthMetrics): GoalStatus {
  const current = currentValue(goal, latest);
  const met = current >= goal.target;
  const overdue = monthKey(goal.dueDate) < latest.month;
  const progress = goal.target === 0 ? 1 : current / goal.target;
  const visible = !(overdue && met);
  return { goal, current, met, overdue, progress, visible };
}

export function visibleGoals(goals: Goal[], latest: MonthMetrics): GoalStatus[] {
  return goals.map((g) => evaluateGoal(g, latest)).filter((s) => s.visible);
}
