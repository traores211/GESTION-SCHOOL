import { DEFAULT_PIECES, DossierState, assertTransition, isFileComplete, missingPieces, pathProgress, transitionsFor } from './workflow';

const pieces = (status: string) => DEFAULT_PIECES.map((p) => ({ label: p.label, required: p.required, status }));
const state = (over: Partial<DossierState> = {}): DossierState => ({
  status: 'CANDIDATURE',
  pieces: pieces('MANQUANT'),
  testScore: null,
  interviewDone: false,
  classId: null,
  studentId: null,
  ...over,
});
const move = (s: DossierState, to: string) => transitionsFor(s).find((t) => t.to === to);

describe('admission workflow', () => {
  it('only counts required pieces, and refused pieces as missing', () => {
    const s = state({ pieces: [...pieces('RECU').slice(0, 4), { label: 'Carnet', required: false, status: 'MANQUANT' }] });
    expect(isFileComplete(s)).toBe(true);
    s.pieces[1].status = 'REFUSE';
    expect(missingPieces(s).map((p) => p.label)).toEqual(["Bulletins de l'année précédente"]);
  });

  it('cannot validate a file while required pieces are missing, and says which ones', () => {
    const validate = move(state(), 'DOSSIER_COMPLET')!;
    expect(validate.allowed).toBe(false);
    expect(validate.blockedBy).toMatch(/4 pièces obligatoires manquantes : Extrait d'acte de naissance/);
    expect(move(state({ pieces: pieces('VALIDE') }), 'DOSSIER_COMPLET')!.allowed).toBe(true);
    expect(() => assertTransition(state(), 'DOSSIER_COMPLET')).toThrow(/manquantes/);
  });

  it('requires a test score before deciding after a test, and an interview report after an interview', () => {
    expect(move(state({ status: 'TEST' }), 'ADMIS')!.blockedBy).toMatch(/résultat du test/);
    expect(move(state({ status: 'TEST', testScore: 14 }), 'ADMIS')!.allowed).toBe(true);
    expect(move(state({ status: 'ENTRETIEN' }), 'ADMIS')!.allowed).toBe(false);
    expect(move(state({ status: 'ENTRETIEN', interviewDone: true }), 'ADMIS')!.allowed).toBe(true);
  });

  it('enrols only once a class is assigned, and confirms only once the student exists', () => {
    expect(move(state({ status: 'ADMIS' }), 'INSCRIPTION')!.blockedBy).toMatch(/Affectez d’abord une classe/);
    expect(move(state({ status: 'ADMIS', classId: 'c1' }), 'INSCRIPTION')!.allowed).toBe(true);
    expect(move(state({ status: 'INSCRIPTION' }), 'CONFIRME')!.allowed).toBe(false);
    expect(move(state({ status: 'INSCRIPTION', studentId: 's1' }), 'CONFIRME')!.allowed).toBe(true);
  });

  it('demands a reason to reject or to reopen, and refuses moves that skip steps', () => {
    expect(() => assertTransition(state({ status: 'ETUDE' }), 'REJETE')).toThrow(/motif/);
    expect(assertTransition(state({ status: 'ETUDE' }), 'REJETE', 'Niveau insuffisant').to).toBe('REJETE');
    expect(() => assertTransition(state({ status: 'REJETE' }), 'ETUDE')).toThrow(/motif/);
    expect(() => assertTransition(state(), 'ADMIS')).toThrow(/Passage impossible de « Candidature reçue » à « Admis »/);
    expect(() => assertTransition(state({ status: 'CONFIRME' }), 'REJETE')).toThrow(/dossier est clos/);
  });

  it('blocks admission while a piece is refused', () => {
    const s = state({ status: 'ETUDE', pieces: [...pieces('VALIDE').slice(0, 4), { label: 'Photo', required: true, status: 'REFUSE' }] });
    expect(move(s, 'ADMIS')!.blockedBy).toMatch(/Pièce refusée : Photo/);
  });

  it('places side steps on the main path for the progress bar', () => {
    expect(pathProgress('CANDIDATURE')).toBe(0);
    expect(pathProgress('DOSSIER_INCOMPLET')).toBe(0);
    expect(pathProgress('TEST')).toBe(pathProgress('ETUDE'));
    expect(pathProgress('CONFIRME')).toBe(5);
  });
});
