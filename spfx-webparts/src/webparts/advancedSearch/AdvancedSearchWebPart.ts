import * as React from "react";
import * as ReactDom from "react-dom";
import { Version } from "@microsoft/sp-core-library";
import {
  type IPropertyPaneConfiguration,
  PropertyPaneSlider,
  PropertyPaneToggle,
  PropertyPaneTextField,
} from "@microsoft/sp-property-pane";
import { BaseClientSideWebPart } from "@microsoft/sp-webpart-base";

import { AdvancedSearch } from "./components/AdvancedSearch";
import { IAdvancedSearchProps } from "./components/IAdvancedSearchProps";

export interface IAdvancedSearchWebPartProps {
  resultsPerPage: number;
  showRefiners: boolean;
  showSuggestions: boolean;
  showSearchHistory: boolean;
  resultSourceId: string;
}

/**
 * AdvancedSearchWebPart provides an enterprise-grade search experience
 * for the Knowledge Hub with faceted refinement, typeahead suggestions,
 * paginated results with hit highlighting, and sort controls.
 */
export default class AdvancedSearchWebPart extends BaseClientSideWebPart<IAdvancedSearchWebPartProps> {
  public render(): void {
    // Check for pre-populated query from URL
    const urlParams = new URLSearchParams(window.location.search);
    const initialQuery = urlParams.get("q") || "";

    const element: React.ReactElement<IAdvancedSearchProps> = React.createElement(
      AdvancedSearch,
      {
        context: this.context,
        resultsPerPage: this.properties.resultsPerPage,
        showRefiners: this.properties.showRefiners,
        showSuggestions: this.properties.showSuggestions,
        showSearchHistory: this.properties.showSearchHistory,
        resultSourceId: this.properties.resultSourceId,
        initialQuery: initialQuery,
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
            description: "Configure search behavior and display options.",
          },
          groups: [
            {
              groupName: "Search Settings",
              groupFields: [
                PropertyPaneSlider("resultsPerPage", {
                  label: "Results Per Page",
                  min: 5,
                  max: 50,
                  step: 5,
                  showValue: true,
                }),
                PropertyPaneTextField("resultSourceId", {
                  label: "Result Source ID",
                  description:
                    "Optional. GUID of a custom result source to scope the search.",
                }),
              ],
            },
            {
              groupName: "Display Options",
              groupFields: [
                PropertyPaneToggle("showRefiners", {
                  label: "Show Refiner Panel",
                  onText: "Visible",
                  offText: "Hidden",
                }),
                PropertyPaneToggle("showSuggestions", {
                  label: "Show Search Suggestions",
                  onText: "Enabled",
                  offText: "Disabled",
                }),
                PropertyPaneToggle("showSearchHistory", {
                  label: "Show Recent Searches",
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
