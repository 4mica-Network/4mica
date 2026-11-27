import { registerStore } from "@stores/registry";
import reducer from "./reducer";
import watchers from "./saga";

registerStore("serviceAccount", reducer, watchers);

export * from "./actions";
export * from "./selector";
