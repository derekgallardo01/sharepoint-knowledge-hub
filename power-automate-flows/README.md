# Power Automate Flows

This directory contains Power Automate flow definitions for the Knowledge Hub content management workflows.

## Flows

### Content Approval (`content-approval.json`)

Automates the knowledge article review and publishing approval process.

**Trigger:** When an article's status changes to "In Review" (or manually triggered).

**Workflow:**
1. Author submits article for review (sets status to "In Review")
2. Author's manager receives an approval request
3. If approved, technical articles (IT & Engineering) are routed to SME review
4. On final approval, the article status is set to "Published" and the author is notified
5. On rejection at any stage, the article returns to "Draft" with reviewer comments

**Required connections:**
- SharePoint Online
- Office 365 Users (for manager lookup)
- Approvals
- Office 365 Outlook

### Content Review Reminder (`content-review-reminder.json`)

Periodic flow that monitors article review dates and sends reminders/escalations.

**Trigger:** Weekly recurrence (every Monday at 9:00 AM ET).

**Workflow:**
1. Queries all published articles with a review date in the past
2. For articles within 14-day grace period: sends a reminder to the content author
3. For articles past the 14-day grace period: escalates to the author's manager
4. Sends a weekly summary to Knowledge Hub administrators

**Required connections:**
- SharePoint Online
- Office 365 Users (for manager lookup)
- Office 365 Outlook

## Import Instructions

These JSON files are flow definitions, not directly importable into Power Automate. Use them as implementation blueprints.

### Steps to Create

1. Open [Power Automate](https://make.powerautomate.com)
2. Navigate to **My flows** > **New flow** > **Automated cloud flow** (for content-approval) or **Scheduled cloud flow** (for review-reminder)
3. Build the flow following the step-by-step definitions in each JSON file
4. Replace placeholder values:
   - `{KnowledgeHubSiteUrl}` - Your Knowledge Hub SharePoint site URL
   - `{SMEReviewGroupEmail}` - Email of the SME review group
   - `{KnowledgeHubAdminEmail}` - Email of the KH admin group or distribution list
5. Configure connections for each connector used
6. Test with a sample article before enabling

### Configuration Notes

- The **Content Approval** flow uses the built-in Approvals connector, which requires the Approvals app to be installed in Teams for the best experience
- The **Review Reminder** flow's grace period (14 days) can be adjusted by changing the `addDays(utcNow(), -14)` expression
- Both flows reference the "Knowledge Articles" list; update the list name if your implementation uses a different name
- Email templates use HTML formatting; customize the branding to match your organization
