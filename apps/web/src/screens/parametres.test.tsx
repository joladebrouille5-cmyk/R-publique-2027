import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { useThemeStore } from '../stores/theme';
import { healthHandler, mockApi, renderRoute, RULESET, rulesetHandler } from '../test/utils';

// Paramètres (phase 11) : toutes les attributions (données, licences, photos, logos) sont
// rassemblées dans « Crédits et mentions légales ».

const manifest = Object.values(
  import.meta.glob('../../../../packages/data-import/demo/cog-2026/manifest.json', {
    eager: true,
    import: 'default',
  }),
)[0] as { sources: { titre: string; producteur: string; licence: string }[] };

function show() {
  mockApi({
    'GET /api/health': healthHandler,
    'GET /api/rulesets/courant': rulesetHandler,
    'GET /api/geo/manifeste': () => ({ body: manifest }),
  });
  renderRoute('/parametres');
}

describe('paramètres', () => {
  // Section volumineuse (plusieurs centaines de liens depuis la phase 14) : délai explicite, la
  // suite complète tournant en parallèle.
  it('rassemble toutes les attributions dans les crédits', { timeout: 30_000 }, async () => {
    show();
    const credits = await screen.findByRole('region', { name: 'Crédits et mentions légales' });
    // Liens lus directement dans le DOM (une requête par rôle parcourt tout l'arbre à chaque
    // appel) ; la cartographie attend le manifeste géographique, chargé à part.
    const linksOf = () =>
      new Map(
        [...credits.querySelectorAll('a')].map((a) => [a.textContent, a.getAttribute('href')]),
      );
    await waitFor(() => {
      const loaded = linksOf();
      for (const source of manifest.sources)
        expect(loaded.has(`${source.producteur} — ${source.titre}`)).toBe(true);
    });
    const links = linksOf();
    const text = credits.textContent ?? '';
    // Sources du jeu de règles et des données importées, chacune avec son lien.
    for (const source of Object.values(RULESET.sources)) expect(text).toContain(source.titre);
    for (const source of [
      ...RULESET.personnalites.sources,
      ...RULESET.figures.sources,
      ...RULESET.mediasReels.sources,
      ...RULESET.economieReelle.sources,
      ...RULESET.assemblee.sources,
      ...RULESET.legislatives2024.sources,
    ]) {
      expect(links.get(source.titre)).toBe(source.url);
      expect(text).toContain(source.licence);
    }
    // Cartographie : référentiel géographique et bibliothèque de rendu.
    for (const source of manifest.sources) expect(text).toContain(source.licence);
    expect(links.has('MapLibre GL JS')).toBe(true);
    // Photos des personnalités : auteur et licence, ou motif de l'absence.
    for (const p of RULESET.personnalites.personnalites) {
      if (p.photo) {
        expect(text).toContain(p.photo.auteur);
        expect(text).toContain(p.photo.licence);
      } else expect(text).toContain(p.photoAbsente!);
    }
    // Personnalités nominables au gouvernement : photo, révision de l'article, compétence.
    for (const f of RULESET.figures.figures) {
      if (f.photo) {
        expect(text).toContain(f.photo.auteur);
        expect(text).toContain(f.photo.licence);
      } else expect(text).toContain(f.photoAbsente!);
      expect(text).toContain(f.notoriete.motif);
    }
    expect(text).toContain(RULESET.figures.decision);
    // Personnalités de la sélection écartées à l'import, chacune avec son motif (phase 14).
    for (const e of RULESET.figures.ecartees)
      expect(text).toContain(`${e.prenom} ${e.nom} : ${e.motif}`);
    expect(text).toContain(RULESET.quinquennat.equipe.note);
    // Logos des médias : auteur et licence, ou motif de l'absence.
    for (const o of RULESET.mediasReels.organes) {
      if (o.logo) {
        expect(text).toContain(o.logo.auteur);
        expect(text).toContain(o.logo.licence);
      } else expect(text).toContain(o.logoAbsent!);
    }
    // Choix motivé d'une photo libre, candidatures déclarées non intégrées.
    expect(text).toMatch(/Librairie Mollat.+Parlement européen/);
    for (const n of RULESET.personnalites.nonIntegrees)
      expect(text).toContain(`${n.prenom} ${n.nom}`);
    // Médias mesurés mais non retenus, émissions écartées.
    for (const e of RULESET.mediasReels.exclus) expect(text).toContain(`${e.libelle} : ${e.motif}`);
    for (const e of RULESET.mediasReels.emissionsNonRetenues)
      expect(text).toContain(`${e.titre} : ${e.motif}`);
    // Notes de méthode et mentions légales.
    expect(text).toContain(RULESET.modele.note);
    expect(text).toContain(RULESET.prestations.note);
    expect(text).toContain('aucun propos ni aucune citation ne leur est attribué');
  });

  it('propose le thème et indique les versions', async () => {
    show();
    const appearance = await screen.findByRole('region', { name: 'Apparence' });
    // Phase 22 : trois tuiles (Clair, Soirée, Système) au lieu d'une liste déroulante.
    const choice = within(appearance).getByRole('radiogroup', { name: 'Thème' });
    expect(
      within(choice)
        .getAllByRole('radio')
        .map((r) => r.getAttribute('value')),
    ).toEqual(['clair', 'sombre', 'systeme']);
    await userEvent.click(within(choice).getByRole('radio', { name: /Soirée/ }));
    expect(useThemeStore.getState().theme).toBe('sombre');
    await userEvent.click(within(choice).getByRole('radio', { name: /Système/ }));
    expect(useThemeStore.getState().theme).toBe('systeme');
    const about = screen.getByRole('region', { name: 'À propos' });
    expect(
      await within(about).findByText(`${RULESET.libelle} (${RULESET.version})`),
    ).toBeInTheDocument();
  });

  it('range les crédits par catégorie et les filtre', { timeout: 30_000 }, async () => {
    show();
    const credits = await screen.findByRole('region', { name: 'Crédits et mentions légales' });
    // Catégories dépliables, avec leur nombre d'entrées ; les mentions légales ouvertes.
    const legal = within(credits).getByText('Mentions légales').closest('details')!;
    expect(legal).toHaveAttribute('open');
    const photos = within(credits)
      .getByText(/^Photos des personnalités/)
      .closest('details')!;
    expect(photos).not.toHaveAttribute('open');
    expect(within(credits).getByText(/^Photos des personnalités/).textContent).toMatch(/\(\d+\)$/);
    // Les catégories restent des titres de niveau 3 (navigation par titres).
    expect(
      within(credits).getByRole('heading', {
        level: 3,
        name: /^Photos des personnalités \(\d+\)$/,
      }),
    ).toBeInTheDocument();
    // Polices embarquées (phase 22).
    expect(credits.textContent).toMatch(/Anybody.+SIL Open Font License 1\.1/);

    // Filtrer : les catégories qui répondent s'ouvrent, les entrées qui ne répondent pas se cachent.
    const filter = within(credits).getByRole('searchbox', { name: 'Filtrer les crédits' });
    const status = within(credits).getByRole('status');
    expect(status).toBeEmptyDOMElement();
    await userEvent.type(filter, 'Atkinson');
    expect(status).toHaveTextContent(/^\d+ crédits? trouvés?\.$/);
    const fonts = within(credits)
      .getByText(/^Polices/)
      .closest('details')!;
    expect(fonts).toHaveAttribute('open');
    expect(within(fonts).getByRole('link', { name: 'Atkinson Hyperlegible Next' })).toBeVisible();
    expect(photos).not.toBeVisible();
    await userEvent.clear(filter);
    await userEvent.type(filter, 'zzzz');
    expect(within(credits).getByText('Aucun crédit ne correspond à « zzzz ».')).toBeInTheDocument();
    await userEvent.clear(filter);
    expect(photos).toBeVisible();
  });

  it('s’ouvre depuis l’en-tête de l’application', async () => {
    show();
    const header = await screen.findByRole('banner');
    expect(within(header).getByRole('link', { name: 'Paramètres' })).toHaveAttribute(
      'href',
      '/parametres',
    );
  });
});
