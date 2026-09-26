import { analyzeTemplate, applyMappings, extractVariables, render, sanitizeTemplate } from './template-engine';

describe('document template engine', () => {
  it('replaces variables and escapes HTML in data (no injection through a student name)', () => {
    const { html, missing } = render('<p>{{student.firstName}} {{student.lastName}}</p>', {
      student: { firstName: '<img src=x onerror=alert(1)>', lastName: 'Koné' },
    });
    expect(html).toBe('<p>&lt;img src=x onerror=alert(1)&gt; Koné</p>');
    expect(missing).toEqual([]);
  });

  it('reports unknown variables instead of inventing values', () => {
    const { html, missing } = render('Né le {{student.dateOfBirth}} à {{student.placeOfBirth}}', { student: { dateOfBirth: '01/01/2012' } });
    expect(html).toBe('Né le 01/01/2012 à ');
    expect(missing).toEqual(['student.placeOfBirth']);
  });

  it('renders loops', () => {
    const { html } = render('<ul>{{#each grades}}<li>{{subject}}: {{average}}</li>{{/each}}</ul>', {
      grades: [{ subject: 'Maths', average: 14 }, { subject: 'Français', average: 12.5 }],
    });
    expect(html).toBe('<ul><li>Maths: 14</li><li>Français: 12.5</li></ul>');
  });

  it('strips scripts, event handlers and javascript: URLs from templates', () => {
    const dirty = '<p onclick="steal()">x</p><script>alert(1)</script><a href="javascript:alert(1)">l</a><iframe src="//evil"></iframe>';
    const clean = sanitizeTemplate(dirty);
    expect(clean).not.toMatch(/script|onclick|javascript:|iframe/i);
    expect(clean).toContain('<p>x</p>');
  });

  it('understands office-style placeholders and proposes known variables', () => {
    const result = analyzeTemplate('Je soussigné [Directeur] certifie que [Nom élève] [Prénom], matricule [Matricule], est inscrit en [Classe].', 'STUDENT');
    const map = Object.fromEntries(result.suggestions.map((s) => [s.placeholder, s.suggestion]));
    expect(map).toMatchObject({
      Directeur: 'school.directeur',
      'Nom élève': 'student.lastName',
      Prénom: 'student.firstName',
      Matricule: 'student.matricule',
      Classe: 'class.name',
    });
  });

  it('applies validated mappings', () => {
    const out = applyMappings('Élève : [Nom élève]', [{ placeholder: 'Nom élève', variable: 'student.lastName' }]);
    expect(out).toBe('Élève : {{student.lastName}}');
    expect(extractVariables(out)).toEqual(['student.lastName']);
  });

  it('flags variables outside the context dictionary', () => {
    expect(analyzeTemplate('{{staff.position}} {{student.matricule}}', 'STUDENT').unknown).toEqual(['staff.position']);
  });
});
