/** Formatting helpers for tool descriptions and tool output. */
export const fmt = {
  /** Trims every line, keeping line breaks. For multi-line descriptions written as template literals. */
  trim: (str: string): string =>
    str
      .trim()
      .split("\n")
      .map((line) => line.trim())
      .join("\n"),

  /** Collapses a multi-line template literal into one line. */
  oneLine: (str: string): string =>
    str
      .trim()
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .join(" "),

  /** Compact JSON for the model: indentation costs tokens and adds nothing. */
  json: (value: unknown): string => JSON.stringify(value),
} as const;
