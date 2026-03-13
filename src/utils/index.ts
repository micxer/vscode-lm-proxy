/**
 * Generate a random ID string.
 * Used primarily when a unique identifier is needed.
 * @returns {string} 10-digit random alphanumeric string
 */
export function generateRandomId(): string {
  return Math.random().toString(36).substring(2, 12)
}
