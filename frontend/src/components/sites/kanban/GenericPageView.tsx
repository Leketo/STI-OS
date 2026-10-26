import React from "react";
import { type LucideIcon } from "lucide-react";

interface GenericPageViewProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  badge?: string;
  children?: React.ReactNode;
}

export function GenericPageView({
  title,
  description,
  icon: Icon,
  badge,
  children,
}: GenericPageViewProps) {
  return (
    <div className="flex flex-1 flex-col overflow-y-auto bg-background p-6">
      {/* Title Header */}
      <div className="flex items-center justify-between border-b border-border pb-4 mb-6">
        <div className="flex items-center gap-3">
          {Icon && (
            <div className="flex size-9 items-center justify-center rounded-lg bg-muted text-foreground">
              <Icon className="size-5" />
            </div>
          )}
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight text-foreground">{title}</h1>
              {badge && (
                <span className="inline-flex rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold text-secondary-foreground">
                  {badge}
                </span>
              )}
            </div>
            {description && (
              <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
            )}
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      {children ? (
        children
      ) : (
        <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-border p-12 text-center">
          <div className="max-w-sm space-y-2">
            <h3 className="text-sm font-semibold text-foreground">Sin datos de ejemplo en {title}</h3>
            <p className="text-xs text-muted-foreground">
              Esta sección no tiene funciones activas en la demostración.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
