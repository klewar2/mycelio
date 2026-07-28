"use client";

import { useCallback, useState } from "react";
import { KeyRound, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ROLES_ASCENDING, ROLE_LABELS } from "@/lib/auth/permissions";
import { useServerAction } from "@/lib/use-server-action";
import type { Tables } from "@/types/database";
import { deleteAccount, resetPassword, setActive, setRole } from "./actions";

export type AccountRow = Tables<"profiles"> & { email: string | null };

function RoleSelect({ row, disabled }: { row: AccountRow; disabled: boolean }) {
  const { pending, run } = useServerAction(setRole);

  return (
    <Select
      value={row.role}
      disabled={disabled || pending}
      onValueChange={(role) => {
        const fd = new FormData();
        fd.set("user_id", row.id);
        fd.set("role", role);
        run(fd);
      }}
    >
      <SelectTrigger className="h-9 w-36" aria-label={`Rôle de ${row.display_name}`}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {ROLES_ASCENDING.map((role) => (
          <SelectItem key={role} value={role}>
            {ROLE_LABELS[role]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function ActiveSwitch({ row, disabled }: { row: AccountRow; disabled: boolean }) {
  const { pending, run } = useServerAction(setActive);

  return (
    <Switch
      checked={row.is_active}
      disabled={disabled || pending}
      aria-label={`Activation de ${row.display_name}`}
      onCheckedChange={(checked) => {
        const fd = new FormData();
        fd.set("user_id", row.id);
        fd.set("is_active", String(checked));
        run(fd);
      }}
    />
  );
}

function ResetPasswordDialog({ row }: { row: AccountRow }) {
  const [open, setOpen] = useState(false);
  const onSuccess = useCallback(() => setOpen(false), []);
  const { state, pending, run } = useServerAction(resetPassword, { onSuccess });

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen(true)}
        aria-label={`Redéfinir le mot de passe de ${row.display_name}`}
      >
        <KeyRound className="size-4" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <form action={run}>
            <input type="hidden" name="user_id" value={row.id} />
            <DialogHeader>
              <DialogTitle>Redéfinir le mot de passe</DialogTitle>
              <DialogDescription>
                Pour {row.display_name}. Aucun e-mail n&apos;est envoyé : transmets-le toi-même.
              </DialogDescription>
            </DialogHeader>

            <div className="my-5 space-y-2">
              <Label htmlFor={`pwd-${row.id}`}>Nouveau mot de passe</Label>
              <Input
                id={`pwd-${row.id}`}
                name="password"
                type="text"
                minLength={8}
                required
                autoComplete="off"
              />
              {state.error ? (
                <p role="alert" className="text-destructive text-sm">
                  {state.error}
                </p>
              ) : null}
            </div>

            <DialogFooter>
              <Button type="submit" disabled={pending}>
                {pending ? "…" : "Redéfinir"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function DeleteButton({ row, disabled }: { row: AccountRow; disabled: boolean }) {
  const { run } = useServerAction(deleteAccount);

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          disabled={disabled}
          aria-label={`Supprimer ${row.display_name}`}
        >
          <Trash2 className="size-4" style={{ color: "var(--warn-solid)" }} />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Supprimer {row.display_name} ?</AlertDialogTitle>
          <AlertDialogDescription>
            Le compte et son profil sont supprimés définitivement. Les relevés associés le seront
            aussi, quand le carnet existera.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Annuler</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              const fd = new FormData();
              fd.set("user_id", row.id);
              run(fd);
            }}
          >
            Supprimer
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function AccountsTable({
  rows,
  currentUserId,
}: {
  rows: AccountRow[];
  currentUserId: string;
}) {
  if (rows.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        Aucun compte pour l&apos;instant. Crée le premier.
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {rows.map((row) => {
        const isSelf = row.id === currentUserId;
        return (
          <li
            key={row.id}
            className="surface-float flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-foreground truncate font-medium">{row.display_name}</p>
                {isSelf ? (
                  <Badge variant="outline" className="text-[0.625rem]">
                    toi
                  </Badge>
                ) : null}
                {!row.is_active ? (
                  <Badge variant="outline" style={{ color: "var(--destructive)" }}>
                    désactivé
                  </Badge>
                ) : null}
              </div>
              <p data-numeric className="text-muted-foreground mt-1 truncate text-xs">
                {row.email ?? "—"} · créé le{" "}
                {new Date(row.created_at).toLocaleDateString("fr-FR")}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Personne ne modifie son propre rôle ni sa propre activation : on le grise ici,
                  et la base le refuse de toute façon. */}
              <RoleSelect row={row} disabled={isSelf} />
              <ActiveSwitch row={row} disabled={isSelf} />
              <ResetPasswordDialog row={row} />
              <DeleteButton row={row} disabled={isSelf} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
