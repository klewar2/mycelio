"use client";

import { useCallback, useState } from "react";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { ROLES_ASCENDING, ROLE_HINTS, ROLE_LABELS } from "@/lib/auth/permissions";
import { useServerAction } from "@/lib/use-server-action";
import { createAccount } from "./actions";

export function CreateAccountDialog() {
  const [open, setOpen] = useState(false);
  const onSuccess = useCallback(() => setOpen(false), []);
  const { state, pending, run } = useServerAction(createAccount, { onSuccess });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <UserPlus className="size-4" />
          Créer un compte
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <form action={run}>
          <DialogHeader>
            <DialogTitle>Créer un compte</DialogTitle>
            <DialogDescription>
              Choisis le mot de passe et transmets-le à la personne. Elle pourra le changer
              depuis ses réglages.
            </DialogDescription>
          </DialogHeader>

          <div className="my-5 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-email">Adresse e-mail</Label>
              <Input id="new-email" name="email" type="email" required autoComplete="off" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="new-name">Nom affiché</Label>
              <Input id="new-name" name="display_name" required autoComplete="off" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="new-password">Mot de passe</Label>
              <Input
                id="new-password"
                name="password"
                type="text"
                minLength={8}
                required
                autoComplete="off"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="new-role">Rôle</Label>
              <Select name="role" defaultValue="ecriture">
                <SelectTrigger id="new-role" className="w-full">
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
              {/* Trois rôles tiennent en trois lignes : autant les donner à lire plutôt que
                  d'envoyer l'administrateur les deviner depuis la matrice. */}
              <dl className="text-muted-foreground space-y-0.5 text-xs">
                {ROLES_ASCENDING.map((role) => (
                  <div key={role} className="flex gap-1.5">
                    <dt className="text-foreground shrink-0 font-medium">
                      {ROLE_LABELS[role]}
                    </dt>
                    <dd>{ROLE_HINTS[role]}</dd>
                  </div>
                ))}
              </dl>
            </div>

            {state.error ? (
              <p role="alert" className="text-destructive text-sm">
                {state.error}
              </p>
            ) : null}
          </div>

          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Création…" : "Créer le compte"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
