/** What the app sends when it commits a report. */
export interface ReportInput {
  description: string;
  /** When the inspector tapped Submit on the device (ISO 8601). */
  createdAt: string;
  /** Upload IDs of the report's images, in display order. */
  imageIds: string[];
}

/** A report as the server holds it. */
export interface StoredReport extends ReportInput {
  /** Client-generated UUID: the idempotency key. */
  id: string;
  /** When the server first accepted it (ISO 8601). */
  receivedAt: string;
}
