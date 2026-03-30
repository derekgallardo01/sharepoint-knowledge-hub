import * as React from "react";
import * as ReactDom from "react-dom";
import { Version } from "@microsoft/sp-core-library";
import {
  type IPropertyPaneConfiguration,
  PropertyPaneTextField,
  PropertyPaneSlider,
  PropertyPaneChoiceGroup,
  PropertyPaneToggle,
} from "@microsoft/sp-property-pane";
import { BaseClientSideWebPart } from "@microsoft/sp-webpart-base";

import { FeaturedContent } from "./components/FeaturedContent";
import { IFeaturedContentProps } from "./components/IFeaturedContentProps";

export interface IFeaturedContentWebPartProps {
  contentSource: string;
  itemCount: number;
  layoutMode: "grid" | "carousel";
  showTrending: boolean;
  autoRotate: boolean;
  rotateInterval: number;
}

/**
 * FeaturedContentWebPart displays featured and trending content in
 * configurable carousel or grid layouts with category badges,
 * view counts, and animated transitions.
 */
export default class FeaturedContentWebPart extends BaseClientSideWebPart<IFeaturedContentWebPartProps> {
  public render(): void {
    const element: React.ReactElement<IFeaturedContentProps> = React.createElement(
      FeaturedContent,
      {
        context: this.context,
        contentSource: this.properties.contentSource,
        itemCount: this.properties.itemCount,
        layoutMode: this.properties.layoutMode,
        showTrending: this.properties.showTrending,
        autoRotate: this.properties.autoRotate,
        rotateInterval: this.properties.rotateInterval,
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
            description: "Configure featured content display options.",
          },
          groups: [
            {
              groupName: "Content Source",
              groupFields: [
                PropertyPaneTextField("contentSource", {
                  label: "Source List Name",
                  description:
                    "Name of the SharePoint list to pull featured content from.",
                }),
                PropertyPaneSlider("itemCount", {
                  label: "Number of Items",
                  min: 3,
                  max: 12,
                  step: 1,
                  showValue: true,
                }),
              ],
            },
            {
              groupName: "Layout",
              groupFields: [
                PropertyPaneChoiceGroup("layoutMode", {
                  label: "Layout Mode",
                  options: [
                    { key: "grid", text: "Grid (cards in rows)" },
                    { key: "carousel", text: "Carousel (rotating)" },
                  ],
                }),
                PropertyPaneToggle("showTrending", {
                  label: "Show Trending Tab",
                  onText: "Visible",
                  offText: "Hidden",
                }),
              ],
            },
            {
              groupName: "Carousel Settings",
              isCollapsed: true,
              groupFields: [
                PropertyPaneToggle("autoRotate", {
                  label: "Auto-Rotate Carousel",
                  onText: "Enabled",
                  offText: "Disabled",
                }),
                PropertyPaneSlider("rotateInterval", {
                  label: "Rotation Interval (seconds)",
                  min: 3,
                  max: 15,
                  step: 1,
                  showValue: true,
                  disabled: !this.properties.autoRotate,
                }),
              ],
            },
          ],
        },
      ],
    };
  }
}
