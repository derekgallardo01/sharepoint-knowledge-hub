import * as React from "react";
import * as ReactDom from "react-dom";
import { Version } from "@microsoft/sp-core-library";
import {
  type IPropertyPaneConfiguration,
  PropertyPaneTextField,
  PropertyPaneToggle,
} from "@microsoft/sp-property-pane";
import { BaseClientSideWebPart } from "@microsoft/sp-webpart-base";

import { FaqAccordion } from "./components/FaqAccordion";
import { IFaqAccordionProps } from "./components/IFaqAccordionProps";

export interface IFaqAccordionWebPartProps {
  faqListName: string;
  defaultCategory: string;
  showSearch: boolean;
  showFeedback: boolean;
  expandFirst: boolean;
}

/**
 * FaqAccordionWebPart displays FAQ items in an interactive accordion
 * with category filtering, search, and per-item feedback.
 */
export default class FaqAccordionWebPart extends BaseClientSideWebPart<IFaqAccordionWebPartProps> {
  public render(): void {
    const element: React.ReactElement<IFaqAccordionProps> = React.createElement(
      FaqAccordion,
      {
        context: this.context,
        faqListName: this.properties.faqListName,
        defaultCategory: this.properties.defaultCategory,
        showSearch: this.properties.showSearch,
        showFeedback: this.properties.showFeedback,
        expandFirst: this.properties.expandFirst,
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
            description: "Configure the FAQ Accordion web part.",
          },
          groups: [
            {
              groupName: "Data Source",
              groupFields: [
                PropertyPaneTextField("faqListName", {
                  label: "FAQ List Name",
                  description: "The SharePoint list containing FAQ items.",
                }),
                PropertyPaneTextField("defaultCategory", {
                  label: "Default Category",
                  description:
                    "Optional. Pre-select a category on load. Leave blank for All.",
                }),
              ],
            },
            {
              groupName: "Display Options",
              groupFields: [
                PropertyPaneToggle("showSearch", {
                  label: "Show Search Filter",
                  onText: "Visible",
                  offText: "Hidden",
                }),
                PropertyPaneToggle("showFeedback", {
                  label: "Show Feedback Buttons",
                  onText: "Visible",
                  offText: "Hidden",
                }),
                PropertyPaneToggle("expandFirst", {
                  label: "Expand First Item",
                  onText: "Yes",
                  offText: "No",
                }),
              ],
            },
          ],
        },
      ],
    };
  }
}
