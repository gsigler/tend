import { TendError } from "../services/errors";

const VALID_SPACE_TYPES = ["raised_bed", "tray", "container", "row_bed", "shelf", "hardening_area"] as const;
const VALID_LAYOUT_MODES = ["square_foot_grid", "rows", "cell_grid", "none"] as const;
const VALID_SOURCE_TYPES = ["seed", "start"] as const;
const VALID_STAGES = ["planned", "seeded_indoors", "seedling", "hardening_off", "direct_sown", "transplanted", "producing", "finished", "failed"] as const;
const VALID_HEALTH = ["healthy", "watch", "stressed", "pest_issue", "diseased", "dead"] as const;
const VALID_TASK_TYPES = ["seed_start", "transplant", "check", "harvest", "maintenance", "other"] as const;
const VALID_PRIORITIES = ["low", "medium", "high"] as const;
const VALID_EVENT_TYPES = ["created", "seeded", "transplanted", "observed", "harvested", "task_completed", "health_changed", "stage_changed", "note"] as const;
const VALID_SUN_LEVELS = ["full_sun", "part_sun", "shade"] as const;

function validateEnum(value: string, validValues: readonly string[], label: string): void {
  if (!validValues.includes(value)) {
    throw new TendError("INVALID_INPUT", `Invalid ${label}: "${value}". Valid values: ${validValues.join(", ")}`);
  }
}

export function validateSpaceType(v: string) { validateEnum(v, VALID_SPACE_TYPES, "space type"); }
export function validateLayoutMode(v: string) { validateEnum(v, VALID_LAYOUT_MODES, "layout mode"); }
export function validateSourceType(v: string) { validateEnum(v, VALID_SOURCE_TYPES, "source type"); }
export function validateStage(v: string) { validateEnum(v, VALID_STAGES, "stage"); }
export function validateTaskType(v: string) { validateEnum(v, VALID_TASK_TYPES, "task type"); }
export function validatePriority(v: string) { validateEnum(v, VALID_PRIORITIES, "priority"); }
export function validateEventType(v: string) { validateEnum(v, VALID_EVENT_TYPES, "event type"); }
export function validateSun(v: string) { validateEnum(v, VALID_SUN_LEVELS, "sun level"); }
