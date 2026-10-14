"use client";

import "./Button.css";

const VARIANT_CLASS = {
  primary: "be-btn--primary",
  outline: "be-btn--outline",
  ghost: "be-btn--ghost",
};

const SIZE_CLASS = {
  sm: "be-btn--sm",
  md: "be-btn--md",
};

export function Button({
  variant = "primary",
  size = "md",
  as: Tag = "button",
  className = "",
  children,
  ...rest
}) {
  const classes = ["be-btn", VARIANT_CLASS[variant] || VARIANT_CLASS.primary, SIZE_CLASS[size] || SIZE_CLASS.md, className]
    .filter(Boolean)
    .join(" ");

  return (
    <Tag className={classes} {...rest}>
      {children}
    </Tag>
  );
}
