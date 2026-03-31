import * as React from "react";
import { SPHttpClient } from "@microsoft/sp-http";
import styles from "./ContentSubmission.module.scss";
import {
  IContentSubmissionProps,
  IContentSubmissionState,
  ISubmissionFormData,
  IValidationErrors,
  DraftStatus,
} from "./IContentSubmissionProps";

/** Simple Markdown-to-HTML converter for preview (handles headings, bold, italic, lists, links). */
function markdownToHtml(md: string): string {
  let html = md
    // Headings
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    // Bold and italic
    .replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    // Links
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    // Unordered lists
    .replace(/^\- (.+)$/gm, "<li>$1</li>")
    // Line breaks
    .replace(/\n\n/g, "</p><p>")
    .replace(/\n/g, "<br/>");

  // Wrap list items
  html = html.replace(/(<li>.*?<\/li>)+/g, "<ul>$&</ul>");
  return `<p>${html}</p>`;
}

/**
 * ContentSubmission component provides a full article submission form with:
 * - Title, category (taxonomy), department, tags, audience fields
 * - Markdown body editor with live preview toggle
 * - File attachment area
 * - Draft auto-save to SharePoint list every N seconds
 * - Form validation (required fields, max lengths)
 * - Draft / Submit for Review buttons
 */
export class ContentSubmission extends React.Component<
  IContentSubmissionProps,
  IContentSubmissionState
> {
  private autoSaveTimer: ReturnType<typeof setInterval> | null = null;
  private fileInputRef: React.RefObject<HTMLInputElement>;

  constructor(props: IContentSubmissionProps) {
    super(props);

    this.fileInputRef = React.createRef<HTMLInputElement>();

    this.state = {
      formData: {
        title: "",
        body: "",
        categoryTermId: "",
        categoryLabel: "",
        department: "",
        tags: [],
        audience: "",
        attachments: [],
      },
      validationErrors: {},
      isSubmitting: false,
      draftStatus: "unsaved",
      draftItemId: null,
      lastSavedAt: null,
      showPreview: false,
      error: null,
      successMessage: null,
      categories: [],
      departments: [],
    };
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  public async componentDidMount(): Promise<void> {
    await this.loadTaxonomyData();
    this.startAutoSave();
  }

  public componentWillUnmount(): void {
    this.stopAutoSave();
  }

  // -----------------------------------------------------------------------
  // Taxonomy loading
  // -----------------------------------------------------------------------

  private async loadTaxonomyData(): Promise<void> {
    try {
      const siteUrl = this.props.context.pageContext.web.absoluteUrl;

      // Load categories from a SharePoint list or term store
      // Using a simplified approach that reads from a Categories list
      const categoriesUrl =
        `${siteUrl}/_api/web/lists/getbytitle('Categories')/items` +
        `?$select=Id,Title,TermId&$orderby=Title asc&$top=100`;

      const catResponse = await this.props.context.spHttpClient.get(
        categoriesUrl,
        SPHttpClient.configurations.v1,
        { headers: { Accept: "application/json;odata=nometadata" } }
      );

      if (catResponse.ok) {
        const catData = await catResponse.json();
        const categories = (catData.value || []).map(
          (item: { TermId: string; Title: string }) => ({
            termId: item.TermId || String(item.Title),
            label: item.Title,
          })
        );
        this.setState({ categories });
      }
    } catch {
      // Provide fallback categories if the list doesn't exist
      this.setState({
        categories: [
          { termId: "cat-policies", label: "Policies & Procedures" },
          { termId: "cat-technical", label: "Technical Documentation" },
          { termId: "cat-training", label: "Training & Onboarding" },
          { termId: "cat-faq", label: "FAQs & How-To Guides" },
        ],
      });
    }

    // Load departments
    this.setState({
      departments: [
        "Engineering",
        "Human Resources",
        "Finance",
        "Marketing",
        "Operations",
        "Legal",
        "IT",
        "Sales",
      ],
    });
  }

  // -----------------------------------------------------------------------
  // Auto-save
  // -----------------------------------------------------------------------

  private startAutoSave(): void {
    const intervalMs = this.props.autoSaveIntervalSeconds * 1000;
    this.autoSaveTimer = setInterval(() => {
      this.saveDraft();
    }, intervalMs);
  }

  private stopAutoSave(): void {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
  }

  private async saveDraft(): Promise<void> {
    const { formData, draftItemId, isSubmitting } = this.state;

    // Don't auto-save if submitting or if there's no content
    if (isSubmitting || (!formData.title && !formData.body)) return;

    this.setState({ draftStatus: "saving" as DraftStatus });

    try {
      const siteUrl = this.props.context.pageContext.web.absoluteUrl;
      const listApiBase = `${siteUrl}/_api/web/lists/getbytitle('${this.props.draftListName}')`;

      const body = {
        Title: formData.title || "(Untitled Draft)",
        KHBody: formData.body,
        KHCategoryTermId: formData.categoryTermId,
        KHCategory: formData.categoryLabel,
        KHDepartment: formData.department,
        KHTags: formData.tags.join(";"),
        KHAudience: formData.audience,
        KHStatus: "Draft",
      };

      if (draftItemId) {
        // Update existing draft
        await this.props.context.spHttpClient.post(
          `${listApiBase}/items(${draftItemId})`,
          SPHttpClient.configurations.v1,
          {
            headers: {
              Accept: "application/json;odata=nometadata",
              "Content-type": "application/json;odata=nometadata",
              "IF-MATCH": "*",
              "X-HTTP-Method": "MERGE",
            },
            body: JSON.stringify(body),
          }
        );
      } else {
        // Create new draft
        const response = await this.props.context.spHttpClient.post(
          `${listApiBase}/items`,
          SPHttpClient.configurations.v1,
          {
            headers: {
              Accept: "application/json;odata=nometadata",
              "Content-type": "application/json;odata=nometadata",
            },
            body: JSON.stringify(body),
          }
        );

        if (response.ok) {
          const data = await response.json();
          this.setState({ draftItemId: data.Id });
        }
      }

      this.setState({
        draftStatus: "saved" as DraftStatus,
        lastSavedAt: new Date(),
      });
    } catch (err) {
      console.error("[ContentSubmission] Auto-save failed:", err);
      this.setState({ draftStatus: "error" as DraftStatus });
    }
  }

  // -----------------------------------------------------------------------
  // Validation
  // -----------------------------------------------------------------------

  private validate(data: ISubmissionFormData): IValidationErrors {
    const errors: IValidationErrors = {};

    if (!data.title.trim()) {
      errors.title = "Title is required.";
    } else if (data.title.length > this.props.maxTitleLength) {
      errors.title = `Title must be ${this.props.maxTitleLength} characters or less.`;
    }

    if (!data.body.trim()) {
      errors.body = "Article body is required.";
    } else if (data.body.length > this.props.maxBodyLength) {
      errors.body = `Body must be ${this.props.maxBodyLength} characters or less.`;
    }

    if (!data.categoryTermId) {
      errors.categoryTermId = "Category is required.";
    }

    if (!data.department) {
      errors.department = "Department is required.";
    }

    return errors;
  }

  // -----------------------------------------------------------------------
  // Submission
  // -----------------------------------------------------------------------

  private handleSubmitForReview = async (): Promise<void> => {
    const { formData } = this.state;
    const errors = this.validate(formData);

    if (Object.keys(errors).length > 0) {
      this.setState({ validationErrors: errors });
      return;
    }

    this.setState({ isSubmitting: true, error: null, validationErrors: {} });

    try {
      const siteUrl = this.props.context.pageContext.web.absoluteUrl;
      const listApiBase = `${siteUrl}/_api/web/lists/getbytitle('${this.props.publishedListName}')`;

      const body = {
        Title: formData.title,
        KHBody: formData.body,
        KHCategoryTermId: formData.categoryTermId,
        KHCategory: formData.categoryLabel,
        KHDepartment: formData.department,
        KHTags: formData.tags.join(";"),
        KHAudience: formData.audience,
        KHStatus: "In Review",
        KHViewCount: 0,
      };

      const response = await this.props.context.spHttpClient.post(
        `${listApiBase}/items`,
        SPHttpClient.configurations.v1,
        {
          headers: {
            Accept: "application/json;odata=nometadata",
            "Content-type": "application/json;odata=nometadata",
          },
          body: JSON.stringify(body),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Submission failed (${response.status}): ${errorText}`);
      }

      const data = await response.json();
      const newItemId = data.Id;

      // Upload attachments if any
      if (formData.attachments.length > 0 && this.props.enableAttachments) {
        for (const file of formData.attachments) {
          const attachUrl =
            `${listApiBase}/items(${newItemId})/AttachmentFiles/add(FileName='${encodeURIComponent(file.name)}')`;

          const buffer = await file.arrayBuffer();
          await this.props.context.spHttpClient.post(
            attachUrl,
            SPHttpClient.configurations.v1,
            {
              headers: { Accept: "application/json;odata=nometadata" },
              body: buffer,
            }
          );
        }
      }

      // Clear the form
      this.setState({
        formData: {
          title: "",
          body: "",
          categoryTermId: "",
          categoryLabel: "",
          department: "",
          tags: [],
          audience: "",
          attachments: [],
        },
        draftItemId: null,
        draftStatus: "unsaved",
        successMessage: `Article "${formData.title}" has been submitted for review.`,
        isSubmitting: false,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "An unexpected error occurred.";
      this.setState({ error: message, isSubmitting: false });
    }
  };

  private handleSaveDraft = async (): Promise<void> => {
    await this.saveDraft();
  };

  // -----------------------------------------------------------------------
  // Field change handlers
  // -----------------------------------------------------------------------

  private handleFieldChange = (
    field: keyof ISubmissionFormData,
    value: string | string[] | File[]
  ): void => {
    this.setState((prev) => ({
      formData: { ...prev.formData, [field]: value },
      validationErrors: { ...prev.validationErrors, [field]: undefined },
      successMessage: null,
    }));
  };

  private handleCategoryChange = (termId: string): void => {
    const cat = this.state.categories.find((c) => c.termId === termId);
    this.setState((prev) => ({
      formData: {
        ...prev.formData,
        categoryTermId: termId,
        categoryLabel: cat ? cat.label : "",
      },
      validationErrors: { ...prev.validationErrors, categoryTermId: undefined },
    }));
  };

  private handleTagInput = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      const input = e.currentTarget;
      const tag = input.value.trim().replace(/,/g, "");
      if (tag && !this.state.formData.tags.includes(tag)) {
        this.handleFieldChange("tags", [...this.state.formData.tags, tag]);
      }
      input.value = "";
    }
  };

  private removeTag = (tag: string): void => {
    this.handleFieldChange(
      "tags",
      this.state.formData.tags.filter((t) => t !== tag)
    );
  };

  private handleFileSelect = (): void => {
    if (this.fileInputRef.current) {
      this.fileInputRef.current.click();
    }
  };

  private handleFilesChanged = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const files = e.target.files;
    if (files) {
      const newFiles = Array.from(files);
      this.handleFieldChange("attachments", [
        ...this.state.formData.attachments,
        ...newFiles,
      ]);
    }
  };

  private removeAttachment = (index: number): void => {
    const updated = [...this.state.formData.attachments];
    updated.splice(index, 1);
    this.handleFieldChange("attachments", updated);
  };

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  private renderDraftIndicator(): React.ReactElement {
    const { draftStatus, lastSavedAt } = this.state;

    const statusMap: Record<DraftStatus, { label: string; className: string }> = {
      unsaved: { label: "Unsaved", className: styles.draftUnsaved },
      saving: { label: "Saving...", className: styles.draftSaving },
      saved: { label: "Draft saved", className: styles.draftSaved },
      error: { label: "Save failed", className: styles.draftError },
    };

    const info = statusMap[draftStatus];

    return (
      <div className={styles.draftIndicator}>
        <span className={`${styles.draftDot} ${info.className}`} />
        <span className={styles.draftLabel}>{info.label}</span>
        {lastSavedAt && draftStatus === "saved" && (
          <span className={styles.draftTimestamp}>
            at {lastSavedAt.toLocaleTimeString()}
          </span>
        )}
      </div>
    );
  }

  public render(): React.ReactElement<IContentSubmissionProps> {
    const {
      formData,
      validationErrors,
      isSubmitting,
      showPreview,
      error,
      successMessage,
      categories,
      departments,
    } = this.state;

    return (
      <div className={styles.contentSubmission}>
        <div className={styles.header}>
          <h2 className={styles.title}>Submit New Article</h2>
          {this.renderDraftIndicator()}
        </div>

        {/* Success message */}
        {successMessage && (
          <div className={styles.successBanner} role="status">
            {successMessage}
            <button
              className={styles.dismissBtn}
              onClick={() => this.setState({ successMessage: null })}
              aria-label="Dismiss"
            >
              &times;
            </button>
          </div>
        )}

        {/* Error message */}
        {error && (
          <div className={styles.errorBanner} role="alert">
            <strong>Error:</strong> {error}
            <button
              className={styles.dismissBtn}
              onClick={() => this.setState({ error: null })}
              aria-label="Dismiss error"
            >
              &times;
            </button>
          </div>
        )}

        <form
          className={styles.form}
          onSubmit={(e) => e.preventDefault()}
          noValidate
        >
          {/* Title */}
          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel} htmlFor="cs-title">
              Title <span className={styles.required}>*</span>
            </label>
            <input
              id="cs-title"
              className={`${styles.textInput} ${validationErrors.title ? styles.inputError : ""}`}
              type="text"
              value={formData.title}
              onChange={(e) => this.handleFieldChange("title", e.target.value)}
              maxLength={this.props.maxTitleLength}
              placeholder="Enter article title..."
              aria-invalid={!!validationErrors.title}
              aria-describedby={validationErrors.title ? "cs-title-error" : undefined}
            />
            <div className={styles.fieldMeta}>
              <span className={styles.charCount}>
                {formData.title.length}/{this.props.maxTitleLength}
              </span>
              {validationErrors.title && (
                <span id="cs-title-error" className={styles.fieldError}>
                  {validationErrors.title}
                </span>
              )}
            </div>
          </div>

          {/* Category */}
          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel} htmlFor="cs-category">
              Category <span className={styles.required}>*</span>
            </label>
            <select
              id="cs-category"
              className={`${styles.selectInput} ${validationErrors.categoryTermId ? styles.inputError : ""}`}
              value={formData.categoryTermId}
              onChange={(e) => this.handleCategoryChange(e.target.value)}
              aria-invalid={!!validationErrors.categoryTermId}
            >
              <option value="">-- Select a category --</option>
              {categories.map((cat) => (
                <option key={cat.termId} value={cat.termId}>
                  {cat.label}
                </option>
              ))}
            </select>
            {validationErrors.categoryTermId && (
              <span className={styles.fieldError}>{validationErrors.categoryTermId}</span>
            )}
          </div>

          {/* Department */}
          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel} htmlFor="cs-department">
              Department <span className={styles.required}>*</span>
            </label>
            <select
              id="cs-department"
              className={`${styles.selectInput} ${validationErrors.department ? styles.inputError : ""}`}
              value={formData.department}
              onChange={(e) => this.handleFieldChange("department", e.target.value)}
              aria-invalid={!!validationErrors.department}
            >
              <option value="">-- Select a department --</option>
              {departments.map((dept) => (
                <option key={dept} value={dept}>
                  {dept}
                </option>
              ))}
            </select>
            {validationErrors.department && (
              <span className={styles.fieldError}>{validationErrors.department}</span>
            )}
          </div>

          {/* Tags */}
          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel} htmlFor="cs-tags">
              Tags
            </label>
            <div className={styles.tagContainer}>
              {formData.tags.map((tag) => (
                <span key={tag} className={styles.tag}>
                  {tag}
                  <button
                    type="button"
                    className={styles.tagRemove}
                    onClick={() => this.removeTag(tag)}
                    aria-label={`Remove tag ${tag}`}
                  >
                    &times;
                  </button>
                </span>
              ))}
              <input
                id="cs-tags"
                className={styles.tagInput}
                type="text"
                placeholder="Type a tag and press Enter..."
                onKeyDown={this.handleTagInput}
              />
            </div>
          </div>

          {/* Audience */}
          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel} htmlFor="cs-audience">
              Audience
            </label>
            <select
              id="cs-audience"
              className={styles.selectInput}
              value={formData.audience}
              onChange={(e) => this.handleFieldChange("audience", e.target.value)}
            >
              <option value="">-- All audiences --</option>
              <option value="All Employees">All Employees</option>
              <option value="Managers">Managers</option>
              <option value="Technical Staff">Technical Staff</option>
              <option value="New Hires">New Hires</option>
              <option value="Executives">Executives</option>
            </select>
          </div>

          {/* Body editor */}
          <div className={styles.fieldGroup}>
            <div className={styles.bodyHeader}>
              <label className={styles.fieldLabel} htmlFor="cs-body">
                Article Body <span className={styles.required}>*</span>
              </label>
              <button
                type="button"
                className={styles.previewToggle}
                onClick={() => this.setState((prev) => ({ showPreview: !prev.showPreview }))}
              >
                {showPreview ? "Edit" : "Preview"}
              </button>
            </div>

            {showPreview ? (
              <div
                className={styles.previewPane}
                dangerouslySetInnerHTML={{ __html: markdownToHtml(formData.body) }}
              />
            ) : (
              <textarea
                id="cs-body"
                className={`${styles.bodyTextarea} ${validationErrors.body ? styles.inputError : ""}`}
                value={formData.body}
                onChange={(e) => this.handleFieldChange("body", e.target.value)}
                maxLength={this.props.maxBodyLength}
                placeholder="Write your article using Markdown..."
                rows={16}
                aria-invalid={!!validationErrors.body}
              />
            )}

            <div className={styles.fieldMeta}>
              <span className={styles.charCount}>
                {formData.body.length}/{this.props.maxBodyLength}
              </span>
              <span className={styles.markdownHint}>
                Supports Markdown: **bold**, *italic*, # Heading, - list, [link](url)
              </span>
              {validationErrors.body && (
                <span className={styles.fieldError}>{validationErrors.body}</span>
              )}
            </div>
          </div>

          {/* Attachments */}
          {this.props.enableAttachments && (
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>Attachments</label>
              <div className={styles.attachmentArea}>
                <button
                  type="button"
                  className={styles.attachButton}
                  onClick={this.handleFileSelect}
                >
                  + Add Files
                </button>
                <input
                  ref={this.fileInputRef}
                  type="file"
                  multiple
                  className={styles.hiddenFileInput}
                  onChange={this.handleFilesChanged}
                  aria-hidden="true"
                  tabIndex={-1}
                />
                {formData.attachments.length > 0 && (
                  <ul className={styles.attachmentList}>
                    {formData.attachments.map((file, idx) => (
                      <li key={`${file.name}-${idx}`} className={styles.attachmentItem}>
                        <span className={styles.attachmentName}>{file.name}</span>
                        <span className={styles.attachmentSize}>
                          ({(file.size / 1024).toFixed(1)} KB)
                        </span>
                        <button
                          type="button"
                          className={styles.attachmentRemove}
                          onClick={() => this.removeAttachment(idx)}
                          aria-label={`Remove ${file.name}`}
                        >
                          &times;
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.draftButton}
              onClick={this.handleSaveDraft}
              disabled={isSubmitting}
            >
              Save Draft
            </button>
            <button
              type="button"
              className={styles.submitButton}
              onClick={this.handleSubmitForReview}
              disabled={isSubmitting}
            >
              {isSubmitting ? "Submitting..." : "Submit for Review"}
            </button>
          </div>
        </form>
      </div>
    );
  }
}

export default ContentSubmission;
