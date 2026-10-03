import { DigestInput, ForecastInvoice, attendanceRate, buildDigest, collectionForecast, suggestAppreciation, weekStart } from './insight-rules';

const week = (over: Partial<DigestInput['thisWeek']> = {}): DigestInput['thisWeek'] => ({ attendance: { marked: 1000, present: 950, unjustified: 30 }, collected: 500000, marksEntered: 120, newApplications: 4, smsSent: 20, ...over });
const digest = (over: Partial<DigestInput> = {}): DigestInput => ({
  thisWeek: week(),
  lastWeek: week(),
  outstanding: 2000000,
  overdue: { count: 12, amount: 600000 },
  newlyOverdue: { count: 0, amount: 0 },
  repeatedAbsentees: [],
  stalledApplications: 0,
  classesWithoutMarks: [],
  pendingJustifications: 0,
  ...over,
});
const texts = (d: DigestInput) => buildDigest(d).map((l) => l.text);

describe('weekly summary', () => {
  it('reports the attendance rate and its trend', () => {
    expect(attendanceRate({ marked: 200, present: 190, unjustified: 5 })).toBe(95);
    expect(attendanceRate({ marked: 0, present: 0, unjustified: 0 })).toBeNull();
    expect(texts(digest())[0]).toBe('Taux de présence : 95 %, stable par rapport à la semaine précédente.');
    const drop = buildDigest(digest({ thisWeek: week({ attendance: { marked: 1000, present: 900, unjustified: 80 } }) }))[0];
    expect(drop.text).toContain('en baisse de 5 point(s)');
    expect(drop.tone).toBe('warning');
    expect(texts(digest({ thisWeek: week({ attendance: { marked: 0, present: 0, unjustified: 0 } }) }))[0]).toBe("Aucun appel n'a été enregistré cette semaine.");
  });

  it('names the pupils with repeated absences and counts pending justifications', () => {
    const lines = texts(
      digest({
        repeatedAbsentees: [
          { name: 'Awa Koné', className: '6ème A', absences: 4 },
          { name: 'Koffi Yao', className: '5ème B', absences: 3 },
        ],
        pendingJustifications: 1,
      }),
    );
    expect(lines).toContain('2 élèves ont au moins 3 absences non justifiées cette semaine : Awa Koné (6ème A, 4 absences), Koffi Yao (5ème B, 3 absences).');
    expect(lines).toContain('1 justificatif envoyé par un parent attend une réponse.');
  });

  it('compares the money collected and flags what became overdue', () => {
    const lines = buildDigest(digest({ thisWeek: week({ collected: 750000 }), newlyOverdue: { count: 3, amount: 225000 }, overdue: { count: 20, amount: 1500000 } }));
    const finance = lines.filter((l) => l.topic === 'finance');
    expect(finance[0].text).toBe('750 000 FCFA encaissés cette semaine (+250 000 FCFA par rapport à la semaine précédente).');
    expect(finance[1]).toEqual({ topic: 'finance', tone: 'warning', text: '3 factures sont passées en retard cette semaine, pour 225 000 FCFA.' });
    // More than half of what is left to collect is late: this is a warning.
    expect(finance[2]).toEqual({ topic: 'finance', tone: 'warning', text: 'Reste à encaisser : 2 000 000 FCFA, dont 1 500 000 FCFA en retard (20 factures).' });
  });

  it('mentions classes without marks and stalled applications only when there are some', () => {
    const quiet = buildDigest(digest({ thisWeek: week({ marksEntered: 0, newApplications: 0 }) }));
    expect(quiet.some((l) => l.topic === 'grades' || l.topic === 'admissions')).toBe(false);
    const lines = texts(digest({ classesWithoutMarks: ['6ème A'], stalledApplications: 2 }));
    expect(lines).toContain("1 classe n'a encore aucune note pour la période en cours : 6ème A.");
    expect(lines).toContain('2 dossiers sont sans suite depuis plus de 7 jours.');
  });
});

describe('collection forecast', () => {
  const now = new Date('2026-10-01T00:00:00Z');
  const day = (n: number) => new Date(now.getTime() + n * 86400000);
  const inv = (dueInDays: number, total: number, paid = 0, paidAfterDue: number | null = null, status = 'PENDING'): ForecastInvoice => ({
    totalAmount: total,
    paid,
    dueDate: day(dueInDays),
    lastPaidAt: paidAfterDue === null ? null : day(dueInDays + paidAfterDue),
    status,
  });

  it('sorts what is unpaid by age and applies prudent default rates without history', () => {
    const f = collectionForecast([inv(10, 100000), inv(-5, 100000, 40000), inv(-60, 50000), inv(-200, 80000), inv(-10, 30000, 30000, 2, 'PAID'), inv(-3, 99999, 0, null, 'CANCELLED')], now);
    expect(f.basis).toBe('default');
    expect(f.buckets.map((b) => [b.key, b.invoices, b.outstanding, b.rate, b.expected])).toEqual([
      ['notDue', 1, 100000, 0.9, 90000],
      ['late30', 1, 60000, 0.7, 42000],
      ['late90', 1, 50000, 0.45, 22500],
      ['older', 1, 80000, 0.2, 16000],
    ]);
    expect(f.outstanding).toBe(290000);
    expect(f.expected).toBe(170500);
    expect(f.atRisk).toBe(119500);
  });

  it("uses the school's own history once there is enough of it", () => {
    // 40 old invoices of 10 000: 20 paid on time, 10 paid 45 days late, 10 never paid.
    const history = [
      ...Array.from({ length: 20 }, () => inv(-300, 10000, 10000, -2, 'PAID')),
      ...Array.from({ length: 10 }, () => inv(-300, 10000, 10000, 45, 'PAID')),
      ...Array.from({ length: 10 }, () => inv(-300, 10000, 0, null, 'OVERDUE')),
    ];
    const f = collectionForecast([...history, inv(-10, 100000), inv(-50, 100000)], now);
    expect(f.basis).toBe('history');
    expect(f.historySize).toBe(40);
    const rate = (key: string) => f.buckets.find((b) => b.key === key)!.rate;
    // Not yet due: everything was exposed, 30 of 40 ended up paid.
    expect(rate('notDue')).toBe(0.75);
    // Already late: the 20 paid on time are out; of the 20 late ones, 10 were recovered.
    expect(rate('late30')).toBe(0.5);
    expect(rate('late90')).toBe(0.5);
    // More than 90 days late: only the 10 never paid remain.
    expect(rate('older')).toBe(0);
    expect(f.buckets.find((b) => b.key === 'late30')!.expected).toBe(50000);
  });
});

describe('appreciation suggestion', () => {
  const base = { previousAverage: null, unjustifiedAbsences: 0, strongest: null, weakest: null };

  it('follows the average', () => {
    expect(suggestAppreciation({ ...base, average: 16.5 })).toBe('Excellent trimestre. Félicitations, continuez ainsi.');
    expect(suggestAppreciation({ ...base, average: 11 })).toBe('Résultats satisfaisants dans l’ensemble. Poursuivez vos efforts.');
    expect(suggestAppreciation({ ...base, average: 7 })).toBe('Résultats très insuffisants. Un travail régulier et soutenu est indispensable.');
    expect(suggestAppreciation({ ...base, average: null })).toBeNull();
  });

  it('adds the trend, the subject to work on and the absences', () => {
    expect(suggestAppreciation({ average: 12.5, previousAverage: 10.8, unjustifiedAbsences: 4, strongest: { subject: 'Anglais', average: 16 }, weakest: { subject: 'Mathématiques', average: 8 } })).toBe(
      'Bon trimestre. Des progrès nets par rapport à la période précédente. Un effort est attendu en Mathématiques. Les absences non justifiées doivent cesser. Poursuivez vos efforts.',
    );
    expect(suggestAppreciation({ average: 9, previousAverage: 11, unjustifiedAbsences: 0, strongest: { subject: 'EPS', average: 15 }, weakest: { subject: 'Physique', average: 5 } })).toBe(
      'Résultats insuffisants. Les résultats sont en baisse par rapport à la période précédente. De bonnes dispositions en EPS, à étendre aux autres matières. Un travail régulier et soutenu est indispensable.',
    );
  });
});

describe('weekStart', () => {
  it('gives the Monday of the week', () => {
    expect(weekStart(new Date(2026, 9, 3, 15)).getDate()).toBe(28); // Saturday 3 October → Monday 28 September
    expect(weekStart(new Date(2026, 9, 5, 0, 30)).getDate()).toBe(5); // a Monday stays
    expect(weekStart(new Date(2026, 9, 4)).getDate()).toBe(28); // Sunday belongs to the week that started on Monday
  });
});
