export type ReportStatus =
  | 'queued' // saved on device, waiting to send
  | 'uploading' // images in flight
  | 'committing' // all images uploaded, PUT /reports in flight
  | 'delivered' // server confirmed (201 or 200)
  | 'needs_attention'; // permanent failure; carries a human-readable reason

export interface LocalImage {
  /** UUID, also the tus upload ID. */
  id: string;
  /** Processed JPEG in app storage. */
  localPath: string;
  sizeBytes: number;
  width: number;
  height: number;
  uploadUrl?: string;
  /** Last offset confirmed by the server. */
  uploadedBytes: number;
  done: boolean;
}

export interface ReportError {
  kind: 'transient' | 'permanent';
  message: string;
  /** ISO 8601. */
  at: string;
}

export interface LocalReport {
  /** UUID generated at Submit; the idempotency key. */
  id: string;
  description: string;
  /** ISO 8601. */
  createdAt: string;
  /** Display order. */
  images: LocalImage[];
  status: ReportStatus;
  attempts: number;
  /** ISO 8601. */
  nextAttemptAt?: string;
  lastError?: ReportError;
  /** ISO 8601. */
  deliveredAt?: string;
}

/** The report-level fields the engine changes as delivery progresses. Saved as a whole. */
export type ReportState = Pick<
  LocalReport,
  'status' | 'attempts' | 'nextAttemptAt' | 'lastError' | 'deliveredAt'
>;

/** The image-level fields saved after every acknowledged chunk. */
export type ImageProgress = Pick<
  LocalImage,
  'uploadUrl' | 'uploadedBytes' | 'done'
>;
