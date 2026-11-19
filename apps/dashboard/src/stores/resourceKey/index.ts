import { registerStore } from "@stores/registry";
import reducer from "./reducer";
import watchers from "./saga";

registerStore("resourceKey", reducer, watchers);

export * from "./actions";
export * from "./selector";
