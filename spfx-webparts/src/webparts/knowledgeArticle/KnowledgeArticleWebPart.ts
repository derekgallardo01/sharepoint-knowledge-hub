import * as React from "react";
import * as ReactDom from "react-dom";
import { Version } from "@microsoft/sp-core-library";
import {
  type IPropertyPaneConfiguration,
  PropertyPaneTextField,
  PropertyPaneToggle,
  PropertyPaneSlider,
  PropertyPaneChoiceGroup,
} from "@microsoft/sp-property-pane";
import { BaseClientSideWebPart } from "@microsoft/sp-webpart-base";

import { KnowledgeArticle } from "./components/KnowledgeArticle";
import { IKnowledgeArticleProps } from "./components/IKnowledgeArticleProps";

export interface IKnowledgeArticleWebPartProps {
  articleListName: string;
  showBreadcrumb: boolean;
  showRelatedArticles: boolean;
  showFeedback: boolean;
  relatedArticleCount: number;
  layoutStyle: "standard" | "wide" | "compact";
}

/**
 * KnowledgeArticleWebPart renders a full knowledge article page with
 * metadata sidebar, breadcrumb navigation, related articles, and feedback widget.
 *
 * Configuration:
 * - Article list name (defaults to "Knowledge Articles")
 * - Toggle breadcrumb, related articles, and feedback sections
 * - Layout style: standard, wide, or compact
 */
export default class KnowledgeArticleWebPart extends BaseClientSideWebPart<IKnowledgeArticleWebPartProps> {
  public render(): void {
    // Extract article ID from URL query string (?articleId=123)
    const urlParams = new URLSearchParams(window.location.search);
    const articleId = parseInt(urlParams.get("articleId") || "0", 10);

    const element: React.ReactElement<IKnowledgeArticleProps> = React.createElement(
      KnowledgeArticle,
      {
        context: this.context,
        articleId: articleId,
        articleListName: this.properties.articleListName,
        showBreadcrumb: this.properties.showBreadcrumb,
        showRelatedArticles: this.properties.showRelatedArticles,
        showFeedback: this.properties.showFeedback,
        relatedArticleCount: this.properties.relatedArticleCount,
        layoutStyle: this.properties.layoutStyle,
      }
    );

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
            description: "Configure the Knowledge Article web part settings.",
          },
          groups: [
            {
              groupName: "Data Source",
              groupFields: [
                PropertyPaneTextField("articleListName", {
                  label: "Article List Name",
                  description: "The name of the SharePoint list containing knowledge articles.",
                  value: this.properties.articleListName,
                }),
              ],
            },
            {
              groupName: "Display Options",
              groupFields: [
                PropertyPaneChoiceGroup("layoutStyle", {
                  label: "Layout Style",
                  options: [
                    { key: "standard", text: "Standard (sidebar + content)" },
                    { key: "wide", text: "Wide (full-width content)" },
                    { key: "compact", text: "Compact (condensed view)" },
                  ],
                }),
                PropertyPaneToggle("showBreadcrumb", {
                  label: "Show Breadcrumb Navigation",
                  onText: "Visible",
                  offText: "Hidden",
                }),
                PropertyPaneToggle("showRelatedArticles", {
                  label: "Show Related Articles",
                  onText: "Visible",
                  offText: "Hidden",
                }),
                PropertyPaneSlider("relatedArticleCount", {
                  label: "Number of Related Articles",
                  min: 1,
                  max: 10,
                  step: 1,
                  showValue: true,
                  disabled: !this.properties.showRelatedArticles,
                }),
                PropertyPaneToggle("showFeedback", {
                  label: "Show Feedback Widget",
                  onText: "Visible",
                  offText: "Hidden",
                }),
              ],
            },
          ],
        },
      ],
    };
  }
}
