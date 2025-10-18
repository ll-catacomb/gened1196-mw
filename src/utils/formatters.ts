/**
 * Utility functions for formatting data
 */

/**
 * Formats milliseconds to MM:SS format
 * @param ms - Milliseconds to format
 * @returns Formatted time string (e.g., "02:30")
 */
export function formatMMSS(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * Checks if a string is a valid JSON response
 * @param contentType - Content-Type header value
 * @returns True if content type indicates JSON
 */
export function isJsonResponse(contentType: string): boolean {
  return contentType.includes("application/json");
}

/**
 * Safely extracts error message from various error types
 * @param error - Error object
 * @returns Error message string
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  return "Unknown error occurred";
}
