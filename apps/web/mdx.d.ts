declare module "*.mdx" {
  import type { FC } from "react";
  import type { MDXProps } from "mdx/types";

  const MDXComponent: FC<MDXProps>;
  export default MDXComponent;
}
