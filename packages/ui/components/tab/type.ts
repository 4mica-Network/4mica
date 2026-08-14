import type * as React from "react";

export type TabGroupPlacement = "left" | "center" | "right";

export interface Tab {
  id: string;
  label: string;
  content?: React.ReactNode | (() => React.ReactNode);
  disabled?: boolean;
}

type CommonProps = {
  tabs: Tab[];
  tabGroupPlacement?: TabGroupPlacement;
  wrapperClassName?: string;
  contentClassName?: string;
  renderContent?: (tab: Tab) => React.ReactNode;
};

type ControlledProps = {
  activeTab: string;
  onTabChange: (tabId: string) => void;
  defaultActiveTab?: never;
};

type UncontrolledProps = {
  defaultActiveTab?: string;
  onTabChange?: (tabId: string) => void;
  activeTab?: never;
};

export type TabsProps = CommonProps & (ControlledProps | UncontrolledProps);
