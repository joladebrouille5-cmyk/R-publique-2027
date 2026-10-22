import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
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
  it('rassemble toutes les attributions dans les crédits', async () => {
    show();
    const credits = await screen.findByRole('region', { name: 'Crédits et mentions légales' });
    const text = credits.textContent ?? '';
    // Sources du jeu de règles et des données importées, chacune avec son lien.
    for (const source of Object.values(RULESET.sources)) expect(text).toContain(source.titre);
    for (const source of [
      ...RULESET.personnalites.sources,
      ...RULESET.mediasReels.sources,
      ...RULESET.economieReelle.sources,
      ...RULESET.assemblee.sources,
      ...RULESET.legislatives2024.sources,
    ]) {
      const link = within(credits).getByRole('link', { name: source.titre });
      expect(link).toHaveAttribute('href', source.url);
      expect(text).toContain(source.licence);
    }
    // Cartographie : référentiel géographique et bibliothèque de rendu.
    for (const source of manifest.sources) {
      expect(
        await within(credits).findByRole('link', {
          name: `${source.producteur} — ${source.titre}`,
        }),
      ).toBeInTheDocument();
      expect(text).toContain(source.licence);
    }
    expect(within(credits).getByRole('link', { name: 'MapLibre GL JS' })).toBeInTheDocument();
    // Photos des personnalités : auteur et licence, ou motif de l'absence.
    for (const p of RULESET.personnalites.personnalites) {
      if (p.photo) {
        expect(text).toContain(p.photo.auteur);
        expect(text).toContain(p.photo.licence);
      } else expect(text).toContain(p.photoAbsente!);
    }
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
    expect(within(appearance).getByRole('combobox', { name: 'Thème' })).toBeInTheDocument();
    const about = screen.getByRole('region', { name: 'À propos' });
    expect(
      await within(about).findByText(`${RULESET.libelle} (${RULESET.version})`),
    ).toBeInTheDocument();
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
