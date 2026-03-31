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

import { AnalyticsDashboard } from "./components/AnalyticsDashboard";
import { IAnalyticsDashboardProps } from "./components/IAnalyticsDashboardProps";

export interface IAnalyticsDashboardWebPartProps {
  dateRange: number;
  articleCount: number;
  chartType: "bar" | "horizontal" | "donut";
  articleListName: string;
  faqListName: string;
  showTopArticles: boolean;
  showSearchTerms: boolean;
  showContentFreshness: boolean;
  showAuthorContributions: boolean;
  showCategoryDistribution: boolean;
}

/**
 * AnalyticsDashboardWebPart renders a knowledge hub analytics view showing:
 * - Top 10 most viewed articles
 * - Popular search terms
 * - Content freshness (articles past review date)
 * - Author contributions
 * - Category distribution
 *
 * Uses pure CSS bar charts -- no external charting library required.
 */
export default class AnalyticsDashboardWebPart extends BaseClientSideWebPart<IAnalyticsDashboardWebPartProps> {
  public render(): void {
    const element: React.ReactElement<IAnalyticsDashboardProps> =
      React.createElement(AnalyticsDashboard, {
        context: this.context,
        dateRange: this.properties.dateRange,
        articleCount: this.properties.articleCount,
        chartType: this.properties.chartType,
        articleListName: this.properties.articleListName,
        faqListName: this.properties.faqListName,
        showTopArticles: this.properties.showTopArticles,
        showSearchTerms: this.properties.showSearchTerms,
        showContentFreshness: this.properties.showContentFreshness,
        showAuthorContributions: this.properties.showAuthorContributions,
        showCategoryDistribution: this.properties.showCategoryDistribution,
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
              "Configure the Analytics Dashboard to display knowledge hub usage metrics.",
          },
          groups: [
            {
              groupName: "Data Source",
              groupFields: [
                PropertyPaneTextField("articleListName", {
                  label: "Article List Name",
                  description:
                    "The SharePoint list containing knowledge articles.",
                }),
                PropertyPaneTextField("faqListName", {
                  label: "FAQ List Name",
                  description: "The SharePoint list containing FAQ items.",
                }),
              ],
            },
            {
              groupName: "Display Settings",
              groupFields: [
                PropertyPaneSlider("dateRange", {
                  label: "Date Range (days)",
                  min: 7,
                  max: 365,
                  step: 7,
                  showValue: true,
                }),
                PropertyPaneSlider("articleCount", {
                  label: "Top Articles Count",
                  min: 5,
                  max: 25,
                  step: 1,
                  showValue: true,
                }),
                PropertyPaneChoiceGroup("chartType", {
                  label: "Chart Style",
                  options: [
                    { key: "bar", text: "Vertical Bar" },
                    { key: "horizontal", text: "Horizontal Bar" },
                    { key: "donut", text: "Donut (category only)" },
                  ],
                }),
              ],
            },
            {
              groupName: "Sections",
              groupFields: [
                PropertyPaneToggle("showTopArticles", {
                  label: "Show Top Articles",
                  onText: "Visible",
                  offText: "Hidden",
                }),
                PropertyPaneToggle("showSearchTerms", {
                  label: "Show Search Terms",
                  onText: "Visible",
                  offText: "Hidden",
                }),
                PropertyPaneToggle("showContentFreshness", {
                  label: "Show Content Freshness",
                  onText: "Visible",
                  offText: "Hidden",
                }),
                PropertyPaneToggle("showAuthorContributions", {
                  label: "Show Author Contributions",
                  onText: "Visible",
                  offText: "Hidden",
                }),
                PropertyPaneToggle("showCategoryDistribution", {
                  label: "Show Category Distribution",
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
