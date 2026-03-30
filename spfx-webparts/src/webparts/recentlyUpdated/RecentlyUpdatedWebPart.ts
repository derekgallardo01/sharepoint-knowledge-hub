import * as React from "react";
import * as ReactDom from "react-dom";
import { Version } from "@microsoft/sp-core-library";
import {
  type IPropertyPaneConfiguration,
  PropertyPaneSlider,
  PropertyPaneTextField,
  PropertyPaneChoiceGroup,
} from "@microsoft/sp-property-pane";
import { BaseClientSideWebPart } from "@microsoft/sp-webpart-base";

import { RecentlyUpdated } from "./components/RecentlyUpdated";
import { IRecentlyUpdatedProps } from "./components/IRecentlyUpdatedProps";

export interface IRecentlyUpdatedWebPartProps {
  itemCount: number;
  sourceLists: string;
  defaultTimeRange: "today" | "week" | "month";
  defaultViewMode: "compact" | "detailed";
}

/**
 * RecentlyUpdatedWebPart shows a timeline-style feed of recently
 * created and modified knowledge content with time range filters
 * and compact/detailed view toggle.
 */
export default class RecentlyUpdatedWebPart extends BaseClientSideWebPart<IRecentlyUpdatedWebPartProps> {
  public render(): void {
    const element: React.ReactElement<IRecentlyUpdatedProps> = React.createElement(
      RecentlyUpdated,
      {
        context: this.context,
        itemCount: this.properties.itemCount,
        sourceLists: this.properties.sourceLists
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        defaultTimeRange: this.properties.defaultTimeRange,
        defaultViewMode: this.properties.defaultViewMode,
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
            description: "Configure the Recently Updated feed.",
          },
          groups: [
            {
              groupName: "Data Source",
              groupFields: [
                PropertyPaneTextField("sourceLists", {
                  label: "Source Lists (comma-separated)",
                  description:
                    "Comma-separated list of SharePoint list names to monitor.",
                }),
                PropertyPaneSlider("itemCount", {
                  label: "Items Per Load",
                  min: 5,
                  max: 50,
                  step: 5,
                  showValue: true,
                }),
              ],
            },
            {
              groupName: "Display Defaults",
              groupFields: [
                PropertyPaneChoiceGroup("defaultTimeRange", {
                  label: "Default Time Range",
                  options: [
                    { key: "today", text: "Today" },
                    { key: "week", text: "This Week" },
                    { key: "month", text: "This Month" },
                  ],
                }),
                PropertyPaneChoiceGroup("defaultViewMode", {
                  label: "Default View",
                  options: [
                    { key: "compact", text: "Compact" },
                    { key: "detailed", text: "Detailed" },
                  ],
                }),
              ],
            },
          ],
        },
      ],
    };
  }
}
