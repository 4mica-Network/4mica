import { cva } from "class-variance-authority";
import {
  Children,
  type HTMLAttributes,
  isValidElement,
  type ReactNode,
} from "react";
import { cn } from "../../lib/cn";

const stack = cva("relative w-full");

const stackItem = cva(
  "absolute top-0 left-0 w-full origin-top transition-transform duration-300 motion-reduce:transition-none",
);

export interface StackProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  children: ReactNode;
  direction?: "top" | "bottom";
  growth?: "down" | "up";
  offset?: number;
  depthFactor?: number;
  minScale?: number;
  className?: string;
  "data-testid"?: string;
}

export const Stack = ({
  children,
  direction = "top",
  growth = "down",
  offset = 8,
  depthFactor = 0.02,
  minScale = 0.8,
  className,
  ...props
}: StackProps) => {
  const elements = Children.toArray(children).filter(isValidElement);
  const ordered = direction === "top" ? [...elements].reverse() : elements;

  const prefix = props["data-testid"]
    ? `${props["data-testid"]}-stack`
    : "stack";

  return (
    <div
      {...props}
      className={cn(stack(), className)}
      data-testid={prefix}
      data-direction={direction}
      data-growth={growth}
    >
      {ordered.map((child, index) => {
        const scale = Math.max(1 - index * depthFactor, minScale);
        const translateY = (growth === "up" ? -1 : 1) * index * offset;

        return (
          <div
            key={child.key}
            className={stackItem()}
            style={{
              transform: `translateY(${translateY}px) scale(${scale})`,
              zIndex: ordered.length - index,
            }}
            data-testid={`${prefix}-item-${index}`}
            data-index={index}
            data-depth={index}
          >
            {child}
          </div>
        );
      })}
    </div>
  );
};

Stack.displayName = "Stack";
