// mapshaper ne publie pas de déclarations TypeScript : seule l'API utilisée est décrite.
declare module 'mapshaper' {
  const mapshaper: {
    applyCommands(
      commands: string,
      input: Record<string, string | Uint8Array>,
    ): Promise<Record<string, string | Uint8Array>>;
  };
  export default mapshaper;
}
