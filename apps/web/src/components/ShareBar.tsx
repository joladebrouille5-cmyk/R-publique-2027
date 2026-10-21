type Props = {
  /** Part en centièmes de point (0 à 10 000). */
  value: number;
  /** Valeur de l'axe la plus grande affichée (même échelle pour toutes les lignes d'un tableau). */
  max: number;
  /** Marge d'erreur à 95 %, en centièmes de point : intervalle tracé autour de la valeur. */
  margin?: number;
  /** La ligne est celle du joueur : barre dans la couleur d'accent, les autres en gris. */
  emphasis?: boolean;
};

/**
 * Barre horizontale d'une part (résultat, sondage). Purement visuelle : la valeur est
 * toujours écrite dans la cellule voisine du tableau, qui reste la vue de référence.
 */
export function ShareBar({ value, max, margin, emphasis = false }: Props) {
  const scale = (v: number) => `${Math.max(0, Math.min(100, (v / Math.max(max, 1)) * 100))}%`;
  return (
    <span aria-hidden="true" className="relative block h-3 w-full min-w-16">
      <span
        className={`absolute inset-y-0 left-0 rounded-r ${emphasis ? 'bg-republique-600 dark:bg-republique-500' : 'bg-slate-400 dark:bg-slate-500'}`}
        style={{ width: scale(value) }}
      />
      {margin !== undefined && margin > 0 && (
        <span
          className="absolute top-1/2 h-px -translate-y-1/2 bg-slate-900 dark:bg-slate-100"
          style={{
            left: scale(value - margin),
            width: `calc(${scale(value + margin)} - ${scale(value - margin)})`,
          }}
        />
      )}
    </span>
  );
}
