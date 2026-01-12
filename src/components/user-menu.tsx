"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useTheme } from "next-themes";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

import {
  BookOpenIcon,
  LogOutIcon,
  MoonIcon,
  PaletteIcon,
  SettingsIcon,
  SunIcon,
  UserIcon,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

export function UserMenu() {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [userName, setUserName] = React.useState<string | null>(null);
  const [userEmail, setUserEmail] = React.useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = React.useState<string | null>(null);

  React.useEffect(() => {
    let isMounted = true;

    async function loadUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!isMounted || !user) return;

      const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;
      const fullName = (metadata.full_name as string | undefined) ?? (metadata.name as string | undefined);
      const username = (metadata.username as string | undefined) ?? user.email ?? null;
      const avatar = (metadata.avatar_url as string | undefined) ?? null;

      setUserName(fullName ?? username ?? "Account");
      setUserEmail(username ?? null);
      setAvatarUrl(avatar);
    }

    loadUser();

    return () => {
      isMounted = false;
    };
  }, []);

  const appearanceLabel = theme === "dark" ? "Dark" : theme === "light" ? "Light" : "System";

  const handleLogout = async () => {
    await supabase.auth.signOut();

    try {
      window.localStorage.removeItem("sb-session");
    } catch {
      // ignore storage errors
    }

    router.push("/login");
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-9 w-9 rounded-full p-0">
          <Avatar className="size-8">
            {avatarUrl && <AvatarImage src={avatarUrl} alt={userName ?? "Account"} />}
            <AvatarFallback className="text-xs">{(userName ?? "?").slice(0, 1)}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" sideOffset={8} className="w-60">
        <DropdownMenuLabel className="flex items-center gap-2">
          <Avatar className="size-7">
            {avatarUrl && <AvatarImage src={avatarUrl} alt={userName ?? "Account"} />}
            <AvatarFallback>{(userName ?? "?").slice(0, 1)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="truncate">{userName ?? "Account"}</div>
            {userEmail && (
              <div className="truncate text-xs text-muted-foreground">{userEmail}</div>
            )}
          </div>
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        <DropdownMenuItem>
          <UserIcon className="mr-2 size-4" />
          Profile
        </DropdownMenuItem>

        <DropdownMenuItem asChild>
          <Link href="/settings">
            <SettingsIcon className="mr-2 size-4" />
            Settings
          </Link>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem>
          <PaletteIcon className="mr-2 size-4" />
          Theme color (Primary: green)
        </DropdownMenuItem>

        <DropdownMenuItem onClick={() => setTheme("light")}>
          <SunIcon className="mr-2 size-4" />
          Light
        </DropdownMenuItem>

        <DropdownMenuItem onClick={() => setTheme("dark")}>
          <MoonIcon className="mr-2 size-4" />
          Dark
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem asChild>
          <a
            href="https://ui.shadcn.com"
            target="_blank"
            rel="noreferrer"
          >
            <BookOpenIcon className="mr-2 size-4" />
            Documentation
          </a>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem onClick={handleLogout}>
          <LogOutIcon className="mr-2 size-4" />
          Log out
        </DropdownMenuItem>

        <div className="px-2 py-1 text-xs text-muted-foreground">Appearance: {appearanceLabel}</div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
