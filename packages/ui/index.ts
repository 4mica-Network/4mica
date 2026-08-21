export { Button, type ButtonProps } from "./components/button";
export { Card, type CardProps } from "./components/card";
export { Checkbox, type CheckboxProps } from "./components/checkbox";
export {
  ComboBox,
  type ComboBoxOption,
  type ComboBoxProps,
} from "./components/combo-box";
export {
  Dropdown,
  type DropdownProps,
  type Placement,
} from "./components/dropdown";
export {
  EmptyState,
  type EmptyStateAction,
  type EmptyStateProps,
} from "./components/empty-state";
export {
  InputField,
  type InputFieldProps,
  type RegisterLike,
} from "./components/input-field";
export { Link, type LinkProps } from "./components/link";
// `useModalA11y` is deliberately not re-exported, for the same reason as
// `useTabContext` below.
export { Modal, type ModalProps } from "./components/modal";
export { type Option, Select, type SelectProps } from "./components/select";
export {
  Spinner,
  type SpinnerProps,
  type SpinnerSize,
} from "./components/spinner";
export {
  Switch,
  type SwitchColors,
  type SwitchProps,
} from "./components/switch";
export { Tab, type TabProps } from "./components/tab";
// `useTabContext` is deliberately not re-exported: scripts/preserve-use-client
// marks any built chunk whose source names a `use*` identifier, so a hook in the
// barrel would stamp `"use client"` on dist/index.js and drag every server-safe
// export (Button, Link, cn) into the client graph.
export { TabGroup } from "./components/tab/TabGroup";
// `Tab` is already taken by the component, so the item type ships as `TabItem`.
export type {
  Tab as TabItem,
  TabGroupPlacement,
  TabsProps,
} from "./components/tab/type";
export { Tag, type TagProps } from "./components/tag";
export { Tooltip, type TooltipProps } from "./components/tooltip";
export { cn } from "./lib/cn";
export { type ComponentSize, getIconSize } from "./utils/getIconSize";
export { hexToRGBA } from "./utils/hexToRGB";
