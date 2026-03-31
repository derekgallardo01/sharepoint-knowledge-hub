import * as React from "react";
import * as ReactDom from "react-dom";
import { Version } from "@microsoft/sp-core-library";
import {
  type IPropertyPaneConfiguration,
  PropertyPaneTextField,
  PropertyPaneToggle,
  PropertyPaneSlider,
} from "@microsoft/sp-property-pane";
import { BaseClientSideWebPart } from "@microsoft/sp-webpart-base";

import { ContentSubmission } from "./components/ContentSubmission";
import { IContentSubmissionProps } from "./components/IContentSubmissionProps";

export interface IContentSubmissionWebPartProps {
  draftListName: string;
  publishedListName: string;
  autoSaveIntervalSeconds: number;
  maxTitleLength: number;
  maxBodyLength: number;
  enableAttachments: boolean;
}

/**
 * ContentSubmissionWebPart provides an article submission form for the
 * Knowledge Hub. Authors can compose articles with metadata, preview
 * Markdown, attach files, and submit for review. Drafts are auto-saved
 * to a dedicated SharePoint list.
 *
 * Configuration:
 * - Draft and published list names
 * - Auto-save interval (seconds)
 * - Title and body character limits
 * - Enable/disable attachments
 */
export default class ContentSubmissionWebPart extends BaseClientSideWebPart<IContentSubmissionWebPartProps> {
  public render(): void {
    const element: React.ReactElement<IContentSubmissionProps> =
      React.createElement(ContentSubmission, {
        context: this.context,
        draftListName: this.properties.draftListName,
        publishedListName: this.properties.publishedListName,
        autoSaveIntervalSeconds: this.properties.autoSaveIntervalSeconds,
        maxTitleLength: this.properties.maxTitleLength,
        maxBodyLength: this.properties.maxBodyLength,
        enableAttachments: this.properties.enableAttachments,
      });

    ReactDom.render(element, this.domElement);
  }

  protected onDispose(): void {
    ReactDom.unmountComponentAtNode(this.domElement);
  }

  protected get dataVersion(): Version {
    return Version.parse("1.0");
  }

  protected getPropertyPaneConfiguration(): IPropertyPaneConfiguration {
    return {
      pages: [
        {
          header: {
            description:
              "Configure the Content Submission web part for article authoring and review workflows.",
          },
          groups: [
            {
              groupName: "Data Source",
              groupFields: [
                PropertyPaneTextField("draftListName", {
                  label: "Draft List Name",
                  description:
                    "SharePoint list where drafts are auto-saved.",
                  value: this.properties.draftListName,
                }),
                PropertyPaneTextField("publishedListName", {
                  label: "Published List Name",
                  description:
                    "SharePoint list where submitted articles are stored.",
                  value: this.properties.publishedListName,
                }),
              ],
            },
            {
              groupName: "Editor Settings",
              groupFields: [
                PropertyPaneSlider("autoSaveIntervalSeconds", {
                  label: "Auto-Save Interval (seconds)",
                  min: 10,
                  max: 120,
                  step: 5,
                  showValue: true,
                }),
                PropertyPaneSlider("maxTitleLength", {
                  label: "Max Title Length",
                  min: 50,
                  max: 500,
                  step: 50,
                  showValue: true,
                }),
                PropertyPaneSlider("maxBodyLength", {
                  label: "Max Body Length",
                  min: 5000,
                  max: 100000,
                  step: 5000,
                  showValue: true,
                }),
                PropertyPaneToggle("enableAttachments", {
                  label: "Enable File Attachments",
                  onText: "Enabled",
                  offText: "Disabled",
                }),
              ],
            },
          ],
        },
      ],
    };
  }
}
