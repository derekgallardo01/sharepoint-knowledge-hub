import { WebPartContext } from "@microsoft/sp-webpart-base";
import { SPHttpClient, SPHttpClientResponse } from "@microsoft/sp-http";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Types of notifications the Knowledge Hub can generate. */
export type NotificationType =
  | "new_article"
  | "review_request"
  | "feedback_received"
  | "article_published"
  | "article_updated";

/** A single notification record. */
export interface INotification {
  id: number;
  /** Type of notification event. */
  type: NotificationType;
  /** Human-readable notification title. */
  title: string;
  /** Notification body/description. */
  message: string;
  /** URL to navigate to when the notification is clicked. */
  actionUrl: string;
  /** Whether the notification has been read. */
  isRead: boolean;
  /** ISO timestamp when the notification was created. */
  created: string;
  /** ID of the related article (if applicable). */
  relatedArticleId: number | null;
  /** Category the notification belongs to. */
  category: string;
}

/** User notification preferences. */
export interface INotificationPreferences {
  /** Categories the user is subscribed to for new article alerts. */
  subscribedCategories: string[];
  /** Whether to receive review request notifications. */
  reviewRequests: boolean;
  /** Whether to receive feedback notifications on authored articles. */
  feedbackAlerts: boolean;
  /** Whether to receive notifications for article updates in subscribed categories. */
  articleUpdates: boolean;
}

/** Response shape for paginated notification queries. */
export interface INotificationResponse {
  notifications: INotification[];
  totalCount: number;
  unreadCount: number;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * NotificationService manages in-app notifications for the Knowledge Hub.
 *
 * Uses a "Notifications" SharePoint list as the backend store. Each user
 * receives notifications based on their subscribed categories and role
 * (author, reviewer, reader).
 *
 * Capabilities:
 * - Fetch notifications for the current user (paginated)
 * - Mark notifications as read/unread
 * - Get/update notification preferences
 * - Create notifications (for use by flows or other web parts)
 * - Get unread count for the notification bell badge
 *
 * List schema assumptions:
 * - List: "Notifications"
 * - Fields: Title, KHMessage, KHType, KHActionUrl, KHIsRead (Yes/No),
 *   KHRelatedArticleId, KHCategory, KHTargetUserId
 *
 * - List: "Notification Preferences"
 * - Fields: Title (user email), KHSubscribedCategories (multi-line text,
 *   semicolon-delimited), KHReviewRequests (Yes/No), KHFeedbackAlerts
 *   (Yes/No), KHArticleUpdates (Yes/No)
 */
export class NotificationService {
  private context: WebPartContext;
  private static readonly NOTIFICATIONS_LIST = "Notifications";
  private static readonly PREFERENCES_LIST = "Notification Preferences";
  private static readonly LIST_API = "/_api/web/lists/getbytitle";

  /** In-memory cache for unread count to avoid excessive API calls. */
  private unreadCountCache: { count: number; timestamp: number } | null = null;
  private static readonly UNREAD_CACHE_TTL = 60_000; // 1 minute

  constructor(context: WebPartContext) {
    this.context = context;
  }

  // -----------------------------------------------------------------------
  // Notifications CRUD
  // -----------------------------------------------------------------------

  /**
   * Retrieve notifications for the current user, sorted newest first.
   *
   * @param top - Maximum number of notifications to return.
   * @param skip - Number of notifications to skip (pagination).
   * @param unreadOnly - When true, only unread notifications are returned.
   * @returns Paginated notification response with unread count.
   */
  public async getNotifications(
    top: number = 20,
    skip: number = 0,
    unreadOnly: boolean = false
  ): Promise<INotificationResponse> {
    const userId = this.context.pageContext.legacyPageContext?.userId;
    if (!userId) {
      return { notifications: [], totalCount: 0, unreadCount: 0 };
    }

    let filter = `KHTargetUserId eq ${userId}`;
    if (unreadOnly) {
      filter += " and KHIsRead eq 0";
    }

    const countUrl =
      `${this.siteUrl}${NotificationService.LIST_API}('${NotificationService.NOTIFICATIONS_LIST}')` +
      `/ItemCount`;

    const itemsUrl =
      `${this.siteUrl}${NotificationService.LIST_API}('${NotificationService.NOTIFICATIONS_LIST}')` +
      `/items?$select=Id,Title,KHMessage,KHType,KHActionUrl,KHIsRead,Created,KHRelatedArticleId,KHCategory` +
      `&$filter=${encodeURIComponent(filter)}` +
      `&$orderby=Created desc` +
      `&$top=${top}&$skip=${skip}`;

    try {
      const [itemsResponse, unreadCount] = await Promise.all([
        this.get(itemsUrl),
        this.getUnreadCount(),
      ]);

      const data = await itemsResponse.json();
      const items: Array<Record<string, unknown>> = data.value || [];

      const notifications: INotification[] = items.map((item) => ({
        id: item.Id as number,
        type: (item.KHType as NotificationType) || "new_article",
        title: (item.Title as string) || "",
        message: (item.KHMessage as string) || "",
        actionUrl: (item.KHActionUrl as string) || "",
        isRead: !!(item.KHIsRead as boolean),
        created: (item.Created as string) || "",
        relatedArticleId: (item.KHRelatedArticleId as number) || null,
        category: (item.KHCategory as string) || "",
      }));

      return {
        notifications,
        totalCount: items.length, // Approximate; full count requires separate query
        unreadCount,
      };
    } catch (error) {
      console.error("[NotificationService] getNotifications failed:", error);
      return { notifications: [], totalCount: 0, unreadCount: 0 };
    }
  }

  /**
   * Get the count of unread notifications for the current user.
   * Uses a short-lived in-memory cache to reduce API calls.
   */
  public async getUnreadCount(): Promise<number> {
    // Check cache
    if (
      this.unreadCountCache &&
      Date.now() - this.unreadCountCache.timestamp < NotificationService.UNREAD_CACHE_TTL
    ) {
      return this.unreadCountCache.count;
    }

    const userId = this.context.pageContext.legacyPageContext?.userId;
    if (!userId) return 0;

    const filter = `KHTargetUserId eq ${userId} and KHIsRead eq 0`;
    const url =
      `${this.siteUrl}${NotificationService.LIST_API}('${NotificationService.NOTIFICATIONS_LIST}')` +
      `/items?$select=Id&$filter=${encodeURIComponent(filter)}&$top=100`;

    try {
      const response = await this.get(url);
      const data = await response.json();
      const count = (data.value || []).length;

      this.unreadCountCache = { count, timestamp: Date.now() };
      return count;
    } catch (error) {
      console.error("[NotificationService] getUnreadCount failed:", error);
      return 0;
    }
  }

  /**
   * Mark a single notification as read.
   *
   * @param notificationId - The SharePoint list item ID.
   */
  public async markAsRead(notificationId: number): Promise<void> {
    const url =
      `${this.siteUrl}${NotificationService.LIST_API}('${NotificationService.NOTIFICATIONS_LIST}')` +
      `/items(${notificationId})`;

    try {
      await this.patch(url, { KHIsRead: true });
      this.invalidateUnreadCache();
    } catch (error) {
      console.error(`[NotificationService] markAsRead(${notificationId}) failed:`, error);
      throw error;
    }
  }

  /**
   * Mark a single notification as unread.
   *
   * @param notificationId - The SharePoint list item ID.
   */
  public async markAsUnread(notificationId: number): Promise<void> {
    const url =
      `${this.siteUrl}${NotificationService.LIST_API}('${NotificationService.NOTIFICATIONS_LIST}')` +
      `/items(${notificationId})`;

    try {
      await this.patch(url, { KHIsRead: false });
      this.invalidateUnreadCache();
    } catch (error) {
      console.error(`[NotificationService] markAsUnread(${notificationId}) failed:`, error);
      throw error;
    }
  }

  /**
   * Mark all notifications for the current user as read.
   */
  public async markAllAsRead(): Promise<void> {
    const userId = this.context.pageContext.legacyPageContext?.userId;
    if (!userId) return;

    const filter = `KHTargetUserId eq ${userId} and KHIsRead eq 0`;
    const url =
      `${this.siteUrl}${NotificationService.LIST_API}('${NotificationService.NOTIFICATIONS_LIST}')` +
      `/items?$select=Id&$filter=${encodeURIComponent(filter)}&$top=500`;

    try {
      const response = await this.get(url);
      const data = await response.json();
      const items: Array<{ Id: number }> = data.value || [];

      // Batch update all unread items
      const updatePromises = items.map((item) => {
        const updateUrl =
          `${this.siteUrl}${NotificationService.LIST_API}('${NotificationService.NOTIFICATIONS_LIST}')` +
          `/items(${item.Id})`;
        return this.patch(updateUrl, { KHIsRead: true });
      });

      await Promise.all(updatePromises);
      this.invalidateUnreadCache();
    } catch (error) {
      console.error("[NotificationService] markAllAsRead failed:", error);
      throw error;
    }
  }

  /**
   * Create a new notification. Typically called by Power Automate flows
   * or other web parts when events occur.
   *
   * @param targetUserId - SharePoint user ID of the recipient.
   * @param type - Notification type.
   * @param title - Notification title.
   * @param message - Notification body text.
   * @param actionUrl - URL to navigate to on click.
   * @param category - Related category.
   * @param relatedArticleId - Related article ID (optional).
   */
  public async createNotification(
    targetUserId: number,
    type: NotificationType,
    title: string,
    message: string,
    actionUrl: string,
    category: string = "",
    relatedArticleId: number | null = null
  ): Promise<void> {
    const url =
      `${this.siteUrl}${NotificationService.LIST_API}('${NotificationService.NOTIFICATIONS_LIST}')/items`;

    const body: Record<string, unknown> = {
      Title: title,
      KHMessage: message,
      KHType: type,
      KHActionUrl: actionUrl,
      KHIsRead: false,
      KHCategory: category,
      KHTargetUserId: targetUserId,
    };

    if (relatedArticleId !== null) {
      body.KHRelatedArticleId = relatedArticleId;
    }

    try {
      await this.post(url, body);
    } catch (error) {
      console.error("[NotificationService] createNotification failed:", error);
      throw error;
    }
  }

  // -----------------------------------------------------------------------
  // Preferences
  // -----------------------------------------------------------------------

  /**
   * Get notification preferences for the current user.
   * Returns default preferences if none have been saved.
   */
  public async getPreferences(): Promise<INotificationPreferences> {
    const userEmail = this.context.pageContext.user?.email;
    if (!userEmail) {
      return this.defaultPreferences();
    }

    const filter = `Title eq '${userEmail}'`;
    const url =
      `${this.siteUrl}${NotificationService.LIST_API}('${NotificationService.PREFERENCES_LIST}')` +
      `/items?$select=Id,Title,KHSubscribedCategories,KHReviewRequests,KHFeedbackAlerts,KHArticleUpdates` +
      `&$filter=${encodeURIComponent(filter)}&$top=1`;

    try {
      const response = await this.get(url);
      const data = await response.json();
      const items: Array<Record<string, unknown>> = data.value || [];

      if (items.length === 0) {
        return this.defaultPreferences();
      }

      const item = items[0];
      return {
        subscribedCategories: ((item.KHSubscribedCategories as string) || "")
          .split(";")
          .filter(Boolean),
        reviewRequests: !!(item.KHReviewRequests as boolean),
        feedbackAlerts: !!(item.KHFeedbackAlerts as boolean),
        articleUpdates: !!(item.KHArticleUpdates as boolean),
      };
    } catch (error) {
      console.error("[NotificationService] getPreferences failed:", error);
      return this.defaultPreferences();
    }
  }

  /**
   * Save notification preferences for the current user.
   * Creates the preferences record if it does not exist.
   *
   * @param preferences - The notification preferences to save.
   */
  public async savePreferences(preferences: INotificationPreferences): Promise<void> {
    const userEmail = this.context.pageContext.user?.email;
    if (!userEmail) return;

    const body: Record<string, unknown> = {
      Title: userEmail,
      KHSubscribedCategories: preferences.subscribedCategories.join(";"),
      KHReviewRequests: preferences.reviewRequests,
      KHFeedbackAlerts: preferences.feedbackAlerts,
      KHArticleUpdates: preferences.articleUpdates,
    };

    // Check if preferences record already exists
    const filter = `Title eq '${userEmail}'`;
    const checkUrl =
      `${this.siteUrl}${NotificationService.LIST_API}('${NotificationService.PREFERENCES_LIST}')` +
      `/items?$select=Id&$filter=${encodeURIComponent(filter)}&$top=1`;

    try {
      const checkResponse = await this.get(checkUrl);
      const checkData = await checkResponse.json();
      const existing: Array<{ Id: number }> = checkData.value || [];

      if (existing.length > 0) {
        // Update existing
        const updateUrl =
          `${this.siteUrl}${NotificationService.LIST_API}('${NotificationService.PREFERENCES_LIST}')` +
          `/items(${existing[0].Id})`;
        await this.patch(updateUrl, body);
      } else {
        // Create new
        const createUrl =
          `${this.siteUrl}${NotificationService.LIST_API}('${NotificationService.PREFERENCES_LIST}')/items`;
        await this.post(createUrl, body);
      }
    } catch (error) {
      console.error("[NotificationService] savePreferences failed:", error);
      throw error;
    }
  }

  // -----------------------------------------------------------------------
  // Notification icon helpers
  // -----------------------------------------------------------------------

  /**
   * Get a Fluent UI icon name for a notification type.
   */
  public static getIconForType(type: NotificationType): string {
    switch (type) {
      case "new_article":
        return "Document";
      case "review_request":
        return "ReviewRequestSolid";
      case "feedback_received":
        return "Feedback";
      case "article_published":
        return "PublishContent";
      case "article_updated":
        return "PageEdit";
      default:
        return "Ringer";
    }
  }

  /**
   * Get a human-readable label for a notification type.
   */
  public static getLabelForType(type: NotificationType): string {
    switch (type) {
      case "new_article":
        return "New Article";
      case "review_request":
        return "Review Request";
      case "feedback_received":
        return "Feedback Received";
      case "article_published":
        return "Article Published";
      case "article_updated":
        return "Article Updated";
      default:
        return "Notification";
    }
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  private get siteUrl(): string {
    return this.context.pageContext.web.absoluteUrl;
  }

  private defaultPreferences(): INotificationPreferences {
    return {
      subscribedCategories: [],
      reviewRequests: true,
      feedbackAlerts: true,
      articleUpdates: false,
    };
  }

  private invalidateUnreadCache(): void {
    this.unreadCountCache = null;
  }

  private async get(url: string): Promise<SPHttpClientResponse> {
    const response = await this.context.spHttpClient.get(
      url,
      SPHttpClient.configurations.v1,
      {
        headers: {
          Accept: "application/json;odata=nometadata",
          "odata-version": "",
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`GET ${url} failed (${response.status}): ${errorText}`);
    }

    return response;
  }

  private async post(
    url: string,
    body: Record<string, unknown>
  ): Promise<SPHttpClientResponse> {
    const response = await this.context.spHttpClient.post(
      url,
      SPHttpClient.configurations.v1,
      {
        headers: {
          Accept: "application/json;odata=nometadata",
          "Content-type": "application/json;odata=nometadata",
          "odata-version": "",
        },
        body: JSON.stringify(body),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`POST ${url} failed (${response.status}): ${errorText}`);
    }

    return response;
  }

  private async patch(
    url: string,
    body: Record<string, unknown>
  ): Promise<void> {
    const response = await this.context.spHttpClient.post(
      url,
      SPHttpClient.configurations.v1,
      {
        headers: {
          Accept: "application/json;odata=nometadata",
          "Content-type": "application/json;odata=nometadata",
          "odata-version": "",
          "IF-MATCH": "*",
          "X-HTTP-Method": "MERGE",
        },
        body: JSON.stringify(body),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`PATCH ${url} failed (${response.status}): ${errorText}`);
    }
  }
}
