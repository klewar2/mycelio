"use client";

import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Bascule clair/sombre.
 *
 * Sans état React : le thème vit sur `<html>`, posé avant le premier rendu par ThemeScript, et
 * les deux icônes sont rendues puis départagées en CSS. Refléter l'état du DOM dans un état
 * React imposerait un effet au montage, donc un rendu en cascade et un risque de décalage
 * d'hydratation, pour rien.
 */
export function ThemeToggle({ className }: { className?: string }) {
  function toggle() {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    document.documentElement.style.colorScheme = next ? "dark" : "light";
    localStorage.setItem("mycelio-theme", next ? "dark" : "light");
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      className={className}
      aria-label="Changer de thème"
      title="Changer de thème"
    >
      <Sun className="hidden size-4 dark:block" />
      <Moon className="block size-4 dark:hidden" />
    </Button>
  );
}
