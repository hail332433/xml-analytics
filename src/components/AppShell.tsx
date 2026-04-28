import { Link, Outlet, useLocation } from "@tanstack/react-router";
import { useFiscalStore } from "@/store/fiscal-store";
import { FileBox, Upload, LayoutDashboard, FileText, ShieldCheck, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { to: "/upload", label: "Upload XML", icon: Upload },
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/notas", label: "Notas", icon: FileText },
  { to: "/auditoria", label: "Auditoria", icon: ShieldCheck },
  { to: "/divergencias", label: "Divergências", icon: AlertTriangle },
] as const;

export default function AppShell() {
  const dashboard = useFiscalStore((s) => s.dashboard);
  const hasData = !!dashboard;
  const location = useLocation();

  return (
    <div className="min-h-screen flex bg-background">
      <aside className="w-64 shrink-0 bg-sidebar text-sidebar-foreground border-r border-sidebar-border flex flex-col">
        <div className="px-5 py-5 border-b border-sidebar-border">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-xl bg-primary grid place-items-center shadow-sm">
              <FileBox className="size-5 text-primary-foreground" />
            </div>
            <div className="leading-tight">
              <div className="font-semibold text-sm tracking-tight text-foreground">Extrator Fiscal</div>
              <div className="text-[11px] text-muted-foreground">80K+ NF-e</div>
            </div>
          </div>
        </div>
        <nav className="p-3 flex-1 space-y-1">
          {items.map((it) => {
            const disabled = it.to !== "/upload" && !hasData;
            const isActive = location.pathname === it.to;
            return (
              <Link
                key={it.to}
                to={it.to}
                onClick={(e) => {
                  if (disabled) e.preventDefault();
                }}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-sidebar-foreground hover:bg-secondary",
                  disabled && "opacity-40 cursor-not-allowed hover:bg-transparent",
                )}
              >
                <it.icon className="size-4" />
                <span>{it.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="px-5 py-4 border-t border-sidebar-border text-[11px] text-muted-foreground">
          NF-e 4.00 · SPED Fiscal
        </div>
      </aside>
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
