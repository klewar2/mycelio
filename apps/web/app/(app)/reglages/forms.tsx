"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updatePassword, updateProfile, type ActionState } from "./actions";

const EMPTY: ActionState = { error: null, success: null };

function Submit({ children }: { children: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Enregistrement…" : children}
    </Button>
  );
}

function Feedback({ state }: { state: ActionState }) {
  if (state.error) {
    return (
      <p role="alert" className="text-destructive text-sm">
        {state.error}
      </p>
    );
  }
  if (state.success) {
    return (
      <p role="status" className="text-primary text-sm">
        {state.success}
      </p>
    );
  }
  return null;
}

export function ProfileForm({ displayName }: { displayName: string }) {
  const [state, action] = useActionState(updateProfile, EMPTY);

  return (
    <form action={action} className="surface-float space-y-4 p-5">
      <h2 className="font-display text-lg font-semibold">Identité</h2>
      <div className="space-y-2">
        <Label htmlFor="display_name">Nom affiché</Label>
        <Input id="display_name" name="display_name" defaultValue={displayName} required />
      </div>
      <Feedback state={state} />
      <Submit>Enregistrer</Submit>
    </form>
  );
}

export function PasswordForm() {
  const [state, action] = useActionState(updatePassword, EMPTY);

  return (
    <form action={action} className="surface-float space-y-4 p-5">
      <h2 className="font-display text-lg font-semibold">Mot de passe</h2>
      <div className="space-y-2">
        <Label htmlFor="password">Nouveau mot de passe</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirm">Confirmation</Label>
        <Input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
      </div>
      <Feedback state={state} />
      <Submit>Modifier</Submit>
    </form>
  );
}
