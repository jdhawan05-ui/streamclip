"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard,
  Radio,
  Scissors,
  Share2,
  Settings,
  LogOut,
  Zap,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { auth } from "@/lib/utils";

const NAV = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/streams", label: "Live Streams", icon: Radio },
  { href: "/dashboard/clips", label: "Clips", icon: Scissors },
  { href: "/dashboard/socials", label: "Socials", icon: Share2 },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);

  function handleLogout() {
    auth.logout();
    router.push("/login");
  }

  const user = typeof window !== "undefined" ? auth.get() : null;

  return (
    <aside
      className={cn(
        "flex flex-col h-screen bg-[#0a0a0a] border-r border-white/5 transition-all duration-200 shrink-0",
        collapsed ? "w-[60px]" : "w-[220px]"
      )}
    >
      {/* Logo */}
      <div className={cn("flex items-center gap-2.5 px-4 h-16 border-b border-white/5", collapsed && "justify-center px-0")}>
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-red-600 shrink-0">
          <Zap className="w-4 h-4 text-white" fill="white" />
        </div>
        {!collapsed && (
          <span className="font-bold text-sm tracking-tight text-white">StreamClip</span>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-4 space-y-0.5 overflow-y-auto">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all group",
                active
                  ? "bg-white/8 text-white"
                  : "text-white/40 hover:text-white/80 hover:bg-white/4",
                collapsed && "justify-center px-0"
              )}
              title={collapsed ? label : undefined}
            >
              <Icon className={cn("w-4 h-4 shrink-0", active ? "text-white" : "text-white/40 group-hover:text-white/70")} />
              {!collapsed && <span>{label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Bottom */}
      <div className="px-2 pb-4 space-y-0.5 border-t border-white/5 pt-3">
        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className={cn(
            "flex items-center gap-3 px-3 py-2 w-full rounded-lg text-sm text-white/30 hover:text-white/60 hover:bg-white/4 transition-all",
            collapsed && "justify-center px-0"
          )}
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : (
            <>
              <ChevronLeft className="w-4 h-4" />
              <span>Collapse</span>
            </>
          )}
        </button>

        {/* User + logout */}
        {user && !collapsed && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg">
            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-red-500 to-orange-500 shrink-0 flex items-center justify-center">
              <span className="text-[10px] font-bold text-white uppercase">
                {user.username?.[0] ?? "U"}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-white/80 truncate">{user.username}</p>
            </div>
          </div>
        )}

        <button
          onClick={handleLogout}
          className={cn(
            "flex items-center gap-3 px-3 py-2 w-full rounded-lg text-sm text-white/30 hover:text-red-400 hover:bg-red-500/8 transition-all",
            collapsed && "justify-center px-0"
          )}
          title={collapsed ? "Sign out" : undefined}
        >
          <LogOut className="w-4 h-4" />
          {!collapsed && <span>Sign out</span>}
        </button>
      </div>
    </aside>
  );
}
