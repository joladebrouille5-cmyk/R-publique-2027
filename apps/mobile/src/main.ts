import { setApiTransport } from '../../web/src/api/client';
import { mountApp } from '../../web/src/app';
import { setPlatform } from '../../web/src/platform';
import { requestPersistentStorage, startLocalBackend } from './backend';
import { readEmbeddedGeo } from './geo-files';
import { useRappels } from '../../web/src/stores/rappels';
import { onAppActiveChange, reminders, saveOrShareFile } from './native';

// Entrée de l'application Android (phase 8) : le moteur tourne sur l'appareil, les parties
// sont enregistrées dans IndexedDB ; aucune connexion réseau n'est nécessaire ni effectuée.

function showStartupError(root: HTMLElement, error: unknown) {
  const box = document.createElement('div');
  box.setAttribute('role', 'alert');
  box.style.cssText = 'max-width:40rem;margin:2rem auto;padding:1rem;font-family:system-ui;';
  const title = document.createElement('h1');
  title.textContent = 'L’application n’a pas pu démarrer';
  title.style.cssText = 'font-size:1.25rem;font-weight:700;margin-bottom:.5rem;';
  const detail = document.createElement('p');
  detail.textContent = `Le stockage local ou le moteur est indisponible : ${
    error instanceof Error ? error.message : String(error)
  }. Aucune partie n’a été modifiée.`;
  box.append(title, detail);
  root.replaceChildren(box);
}

async function start() {
  const root = document.getElementById('root')!;
  try {
    const backend = await startLocalBackend(globalThis.indexedDB, readEmbeddedGeo);
    setApiTransport(backend.transport);
    setPlatform({
      kind: 'local',
      saveFile: saveOrShareFile,
      storageNotice: await requestPersistentStorage(navigator.storage),
      // Son (phase 19) : la musique se coupe quand l'application passe en arrière-plan.
      onActiveChange: onAppActiveChange,
      // Phase 20 : rappel quotidien du défi du jour, reprogrammé à chaque ouverture.
      reminders,
    });
    mountApp(root);
    const { actif, heure } = useRappels.getState();
    if (actif) void reminders.schedule(heure).catch(() => undefined);
  } catch (error) {
    showStartupError(root, error);
  }
}

void start();
