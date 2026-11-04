import { Lock } from 'lucide-react';

/** Mention d'un contenu verrouillé (phase 20) : il se consulte, il ne se choisit pas encore. */
export function LockNote({ condition }: { condition: string }) {
  return (
    <span className="flex items-center gap-1 text-xs font-semibold text-amber-800 dark:text-amber-300">
      <Lock aria-hidden="true" className="size-3.5 shrink-0" />
      Verrouillé : {condition.charAt(0).toLowerCase() + condition.slice(1)} pour le débloquer
    </span>
  );
}
