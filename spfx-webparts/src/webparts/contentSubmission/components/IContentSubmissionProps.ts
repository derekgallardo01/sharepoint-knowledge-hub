import { WebPartContext } from "@microsoft/sp-webpart-base";

/**
 * Metadata fields for a content submission form.
 */
export interface ISubmissionFormData {
  /** Article title. Required, max length defined by property. */
  title: string;
  /** Article body content (Markdown supported). */
  body: string;
  /** Taxonomy term ID for the selected category. */
  categoryTermId: string;
  /** Display name of the selected category. */
  categoryLabel: string;
  /** Department string value. */
  department: string;
  /** Tags as a multi-value array. */
  tags: string[];
  /** Target audience for the article. */
  audience: string;
  /** File attachments (File objects pending upload). */
  attachments: File[];
}

/**
 * Validation errors keyed by field name.
 */
export type IValidationErrors = Partial<Record<keyof ISubmissionFormData, string>>;

/**
 * Draft status for auto-save tracking.
 */
export type DraftStatus = "unsaved" | "saving" | "saved" | "error";

/**
 * Props for the ContentSubmission React component.
 */
export interface IContentSubmissionProps {
  /** SPFx web part context. */
  context: WebPartContext;
  /** SharePoint list name for storing draft articles. */
  draftListName: string;
  /** SharePoint list name for published articles. */
  publishedListName: string;
  /** Auto-save interval in seconds. */
  autoSaveIntervalSeconds: number;
  /** Maximum allowed title length. */
  maxTitleLength: number;
  /** Maximum allowed body length. */
  maxBodyLength: number;
  /** Whether file attachments are enabled. */
  enableAttachments: boolean;
}

/**
 * Internal state for the ContentSubmission component.
 */
export interface IContentSubmissionState {
  /** Current form data. */
  formData: ISubmissionFormData;
  /** Validation errors for each field. */
  validationErrors: IValidationErrors;
  /** Whether the form is currently being submitted. */
  isSubmitting: boolean;
  /** Draft save status. */
  draftStatus: DraftStatus;
  /** ID of the saved draft item in SharePoint (null if new). */
  draftItemId: number | null;
  /** Last auto-save timestamp. */
  lastSavedAt: Date | null;
  /** Whether the markdown preview is shown. */
  showPreview: boolean;
  /** Global error message. */
  error: string | null;
  /** Success message after submission. */
  successMessage: string | null;
  /** Available categories loaded from taxonomy. */
  categories: { termId: string; label: string }[];
  /** Available departments loaded from taxonomy. */
  departments: string[];
}
