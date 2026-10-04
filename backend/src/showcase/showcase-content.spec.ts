import { cleanDraft, previewOf, splitDraft, upcomingEvents } from './showcase-content';

describe('showcase draft', () => {
  it('keeps only the fields the showcase has', () => {
    expect(cleanDraft({ tagline: 'Savoir et rigueur', primaryColor: '#0a7d3b', isActive: false, organisationId: 'x' })).toEqual({ tagline: 'Savoir et rigueur', primaryColor: '#0a7d3b' });
  });

  it('splits a draft between the identity columns and the content', () => {
    const { settings, content } = splitDraft({ tagline: 'Nouveau', history: 'Fondé en 1998' }, { values: 'Travail', history: 'Ancien' });
    expect(settings).toEqual({ tagline: 'Nouveau' });
    expect(content).toEqual({ values: 'Travail', history: 'Fondé en 1998' });
  });

  it('previews the draft over the published page without touching the rest', () => {
    const published = { name: 'École ABC', tagline: 'Ancien', city: 'Abidjan' };
    const preview = previewOf(published, { values: 'Travail' }, { tagline: 'Nouveau', directorMessage: 'Bienvenue' });
    expect(preview).toMatchObject({ name: 'École ABC', tagline: 'Nouveau', city: 'Abidjan', content: { values: 'Travail', directorMessage: 'Bienvenue' } });
    expect(published.tagline).toBe('Ancien');
  });

  it('shows the published page when there is no draft', () => {
    expect(previewOf({ tagline: 'Publié' }, { values: 'V' }, null)).toEqual({ tagline: 'Publié', content: { values: 'V' } });
  });

  it('lists coming events, the nearest first, and drops past ones', () => {
    const today = new Date(2026, 9, 4, 15, 0);
    const events = [{ title: 'Passé', date: '2026-09-01' }, { title: 'Loin', date: '2026-12-20' }, { title: 'Proche', date: '2026-10-10' }, { title: "Aujourd'hui", date: '2026-10-04T08:00:00' }];
    expect(upcomingEvents(events, today).map((e) => e.title)).toEqual(["Aujourd'hui", 'Proche', 'Loin']);
    expect(upcomingEvents(undefined, today)).toEqual([]);
  });
});
