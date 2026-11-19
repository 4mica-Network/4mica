import { registerStore } from "@stores/registry";
import reducer from "./reducer";
import watchers from "./saga";

registerStore("developer", reducer, watchers);

export * from "./actions";
export * from "./selector";
