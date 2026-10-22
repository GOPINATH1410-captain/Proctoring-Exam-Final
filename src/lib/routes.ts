import type { LinkProps } from "@tanstack/react-router";
import type { Role } from "./proctor-store";

/** Typed route target helper shared by nav bars and post-login redirects. */
export type AppRoute = NonNullable<LinkProps["to"]>;

export const homeFor = (role: Role): AppRoute =>
  role === "admin" ? "/admin" : role === "faculty" ? "/faculty" : "/student";
