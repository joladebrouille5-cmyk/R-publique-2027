import { Embedded } from '../components/Disclosure';
import { Drawer } from '../components/Drawer';
import { GAME_SCREENS } from '../screens/registry';
import { SECTION_SCREENS } from '../screens/sections';

// Panneau de la boîte de jeu (phase 25) : l'écran existant, intégré, dans un tiroir en carton qui
// glisse par-dessus le plateau (depuis le bas sur téléphone, de côté au bureau). Bouton « Fermer »,
// Échap ou un toucher sur le fond le referment ; le focus revient à ce qui l'a ouvert.

export function Panel({ screen, onClose }: { screen: string; onClose: () => void }) {
  const Screen = SECTION_SCREENS[screen];
  const label = GAME_SCREENS.find((s) => s.path === screen)?.label ?? screen;
  return (
    <Drawer title={label} onClose={onClose}>
      {Screen ? (
        <Embedded>
          <Screen />
        </Embedded>
      ) : (
        <p>Cet écran n’existe pas dans la boîte de jeu.</p>
      )}
    </Drawer>
  );
}
