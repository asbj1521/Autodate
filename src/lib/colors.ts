/**
 * The two availability colours, as raw "r, g, b" so callers can vary opacity
 * in rgba(). Shared by the calendar cells and the legend that explains them,
 * which is the whole point: a legend that drifts from the grid is worse than
 * no legend.
 */

/** The accent (coral/orange): people who are genuinely free. */
export const ACCENT_RGB = "249, 115, 22";

/** Amber: free only if they take time off work or school. */
export const AMBER_RGB = "245, 158, 11";
