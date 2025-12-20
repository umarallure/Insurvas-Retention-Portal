"use client";

import Link from "next/link";
import { useRouter } from "next/router";

import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
} from "@/components/ui/navigation-menu";

function navItemClass(active: boolean) {
  return (
    "px-3 py-2 text-sm rounded-md transition-colors " +
    (active
      ? "bg-muted text-foreground"
      : "text-muted-foreground hover:bg-muted/50 hover:text-foreground")
  );
}

export function SettingsShell({
  children,
  title = "Settings",
}: {
  children: React.ReactNode;
  title?: string;
}) {
  const router = useRouter();
  const path = router.asPath;

  const isActive = (href: string) => path === href;

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-6 lg:py-12">
      <div className="mb-4">
        <h1 className="text-xl font-semibold">{title}</h1>
      </div>

      <div className="mb-6">
        <NavigationMenu>
          <NavigationMenuList className="gap-1">
            <NavigationMenuItem>
              <NavigationMenuLink asChild className={navItemClass(isActive("/settings"))}>
                <Link href="/settings">General</Link>
              </NavigationMenuLink>
            </NavigationMenuItem>
            <NavigationMenuItem>
              <NavigationMenuLink
                asChild
                className={navItemClass(isActive("/settings/notifications"))}
              >
                <Link href="/settings/notifications">Notifications</Link>
              </NavigationMenuLink>
            </NavigationMenuItem>
            <NavigationMenuItem>
              <NavigationMenuLink asChild className={navItemClass(isActive("/settings/security"))}>
                <Link href="/settings/security">Security</Link>
              </NavigationMenuLink>
            </NavigationMenuItem>
          </NavigationMenuList>
        </NavigationMenu>
      </div>

      <div className="flex flex-col gap-4 sm:gap-6 lg:gap-12 w-full lg:max-w-2xl mx-auto">
        {children}
      </div>
    </div>
  );
}
